
const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const crypto = require('crypto');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { classifyTriage } = require('../utils/triageEngine');
const { evaluateCriticalVitals } = require('../utils/alertRules');
const { sseHandler, notifyUpdate } = require('../utils/events');
const { buildDedupeKey } = require('../utils/patientIdentity');
const {
  verifyToken,
  requireAdmin,
  requireMedicalStaff,
  requirePatient
} = require('../middleware/auth');
const Alert = require('../models/Alert');

// =====================================================
// LIVE SERVER-SENT EVENTS (SSE) STREAM
// =====================================================
router.get('/live', sseHandler);

// Clinical workflow statuses that mean the current visit is finished.
const TERMINAL_STATUSES = ['Discharged', 'Admitted', 'Referred'];

const isVisitClosed = (status) => TERMINAL_STATUSES.includes(status);

// Helper: remove the private QR token from patient responses.
const hideQrToken = (patient) => {
  if (!patient) return patient;

  const data = patient.toObject ? patient.toObject() : { ...patient };
  delete data.qrToken;
  return data;
};

// ---------------------------------------------------------------------------
// Visit helpers — one permanent Patient ID, many visits.
// The inline clinical fields always describe the CURRENT visit. When a new
// visit starts the previous one is snapshotted into `visits[]` so earlier
// complaints / vitals / triage / treatment are never overwritten.
// ---------------------------------------------------------------------------

const plainTreatment = (treatment) =>
  treatment ? (treatment.toObject ? treatment.toObject() : { ...treatment }) : undefined;

const plainVitals = (vitals) =>
  vitals ? (vitals.toObject ? vitals.toObject() : { ...vitals }) : undefined;

const plainList = (list) =>
  Array.isArray(list) ? list.map((item) => (item.toObject ? item.toObject() : { ...item })) : [];

function snapshotCurrentVisit(patient) {
  return {
    visitId: patient.currentVisitId,
    queueNumber: patient.queueNumber,
    chiefComplaint: patient.chiefComplaint,
    symptoms: patient.symptoms,
    arrivalTime: patient.arrivalTime,
    status: patient.status,
    statusHistory: plainList(patient.statusHistory),
    vitalSigns: plainVitals(patient.vitalSigns),
    triageCategory: patient.triageCategory,
    triageColor: patient.triageColor,
    aiTriageCategory: patient.aiTriageCategory,
    aiTriageColor: patient.aiTriageColor,
    nurseOverride: patient.nurseOverride,
    nurseOverrideReason: patient.nurseOverrideReason,
    triagedBy: patient.triagedBy,
    triageTimestamp: patient.triageTimestamp,
    triageHistory: plainList(patient.triageHistory),
    assignedDoctor: patient.assignedDoctor,
    assignedLocation: patient.assignedLocation,
    queueOverride: patient.queueOverride ? (patient.queueOverride.toObject ? patient.queueOverride.toObject() : { ...patient.queueOverride }) : undefined,
    queueOverrideHistory: plainList(patient.queueOverrideHistory),
    treatment: plainTreatment(patient.treatment),
    archivedAt: new Date()
  };
}

// Begin a fresh visit on the (current) patient document.
function startNewVisit(patient, data, { queueNumber, changedBy, changedByRole }) {
  const now = new Date();

  if (patient.currentVisitId) {
    patient.visits.push(snapshotCurrentVisit(patient));
    patient.visitCount = (patient.visitCount || 1) + 1;
  } else {
    patient.visitCount = 1;
  }

  patient.currentVisitId = `${patient.patientId}-V${patient.visitCount}`;
  patient.queueNumber = queueNumber;
  patient.chiefComplaint = data.chiefComplaint;
  patient.symptoms = data.symptoms || null;
  patient.arrivalTime = now;
  patient.status = 'Registered';
  patient.queueOverride = null;
  patient.queueOverrideHistory = [];

  patient.statusHistory = [
    {
      status: 'Registered',
      changedBy: changedBy || null,
      changedByRole: changedByRole || null,
      reason: data.reason || 'Visit registered',
      location: null,
      timestamp: now
    }
  ];

  // Reset per-visit clinical data so the new visit starts blank.
  patient.vitalSigns = undefined;
  patient.triageCategory = null;
  patient.triageColor = null;
  patient.aiTriageCategory = undefined;
  patient.aiTriageColor = undefined;
  patient.nurseOverride = false;
  patient.nurseOverrideReason = undefined;
  patient.triagedBy = undefined;
  patient.triageTimestamp = undefined;
  patient.triageHistory = [];
  patient.assignedDoctor = data.assignedDoctor || null;
  patient.assignedLocation = null;
  patient.treatment = undefined;

  return patient;
}

async function generatePatientId() {
  const last = await Patient.findOne({ patientId: /^P\d+$/ })
    .sort({ patientId: -1 })
    .select('patientId')
    .lean();

  const numeric = last?.patientId?.match(/^P(\d+)$/)?.[1];
  const next = (numeric ? Number(numeric) : 0) + 1;

  return `P${String(next).padStart(6, '0')}`;
}

async function generateQueueNumber() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todayCount = await Patient.countDocuments({
    arrivalTime: { $gte: startOfDay }
  });

  return todayCount + 1;
}

// Find the patient profile belonging to a signed-in patient, linking an
// existing matching record where it is safe to do so.
//
// Linking is only ever done for an AUTHENTICATED patient account — matching
// name/dob/mobile on a public form is never enough to reach old records.
async function resolvePatientForUser(user) {
  if (!user) return null;

  // 1. Already linked?
  if (user.patient) {
    const linked = await Patient.findById(user.patient);
    if (linked) return linked;
  }

  // 2. Try to claim an unclaimed profile with the same verified identity.
  const key = buildDedupeKey(user.name, user.dateOfBirth, user.phone);

  if (key) {
    const candidate = await Patient.findOne({ dedupeKey: key, user: null });

    if (candidate) {
      candidate.user = user._id;
      await candidate.save();

      user.patient = candidate._id;
      await user.save();

      return candidate;
    }
  }

  return null;
}

const selfView = (patient) => {
  const data = patient.toObject ? patient.toObject() : { ...patient };
  // The patient may see their own QR token (used for their dashboard QR).
  return data;
};

const currentVisitView = (patient) => ({
  visitId: patient.currentVisitId,
  queueNumber: patient.queueNumber,
  chiefComplaint: patient.chiefComplaint,
  symptoms: patient.symptoms,
  arrivalTime: patient.arrivalTime,
  status: patient.status,
  statusHistory: plainList(patient.statusHistory),
  vitalSigns: plainVitals(patient.vitalSigns),
  triageCategory: patient.triageCategory,
  triageColor: patient.triageColor,
  assignedDoctor: patient.assignedDoctor,
  assignedLocation: patient.assignedLocation,
  treatment: plainTreatment(patient.treatment),
  updatedAt: patient.updatedAt || (patient.statusHistory?.length ? patient.statusHistory[patient.statusHistory.length - 1].timestamp : patient.arrivalTime)
});

// =====================================================
// GET ALL PATIENTS (staff dashboards)
// =====================================================
router.get('/', verifyToken, requireMedicalStaff, async (req, res) => {
  try {
    const patients = await Patient.find()
      .select('-qrToken')
      .sort({ arrivalTime: -1 });

    res.json(patients);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// =====================================================
// GET STATISTICS
// =====================================================
router.get('/stats/overview', async (req, res) => {
  try {
    const totalPatients = await Patient.countDocuments();
    const registered = await Patient.countDocuments({ status: 'Registered' });
    const vitalsTaken = await Patient.countDocuments({ status: 'Vitals Taken' });
    const triaged = await Patient.countDocuments({ status: 'Triaged' });
    const inTreatment = await Patient.countDocuments({ status: 'In Treatment' });
    const discharged = await Patient.countDocuments({ status: 'Discharged' });

    const triageStats = await Patient.aggregate([
      { $match: { triageCategory: { $ne: null } } },
      {
        $group: {
          _id: '$triageCategory',
          count: { $sum: 1 }
        }
      }
    ]);

    // Average triage time: arrivalTime to triageTimestamp
    const triageTimeAgg = await Patient.aggregate([
      {
        $match: {
          triageTimestamp: { $ne: null },
          arrivalTime: { $ne: null }
        }
      },
      {
        $project: {
          d: {
            $divide: [
              { $subtract: ['$triageTimestamp', '$arrivalTime'] },
              60000
            ]
          }
        }
      },
      { $group: { _id: null, avg: { $avg: '$d' } } }
    ]);

    // Average waiting time
    const waitingTimeAgg = await Patient.aggregate([
      {
        $match: {
          triageTimestamp: { $ne: null },
          'treatment.treatmentStartTime': { $ne: null }
        }
      },
      {
        $project: {
          d: {
            $divide: [
              {
                $subtract: [
                  '$treatment.treatmentStartTime',
                  '$triageTimestamp'
                ]
              },
              60000
            ]
          }
        }
      },
      { $group: { _id: null, avg: { $avg: '$d' } } }
    ]);

    // Average consultation time
    const consultTimeAgg = await Patient.aggregate([
      {
        $match: {
          'treatment.treatmentStartTime': { $ne: null },
          'treatment.treatmentEndTime': { $ne: null }
        }
      },
      {
        $project: {
          d: {
            $divide: [
              {
                $subtract: [
                  '$treatment.treatmentEndTime',
                  '$treatment.treatmentStartTime'
                ]
              },
              60000
            ]
          }
        }
      },
      { $group: { _id: null, avg: { $avg: '$d' } } }
    ]);

    const edCongestion = await Patient.countDocuments({
      status: { $ne: 'Discharged' }
    });

    const activeFilter = {
      status: { $ne: 'Discharged' },
      'treatment.disposition': {
        $nin: ['Discharge', 'Admit', 'Referral']
      }
    };

    const resusOccupied = await Patient.countDocuments({
      triageCategory: 1,
      ...activeFilter
    });

    const edBedOccupied = await Patient.countDocuments({
      triageCategory: 2,
      ...activeFilter
    });

    const waitingOccupied = await Patient.countDocuments({
      $or: [
        { triageCategory: 3 },
        { status: 'Registered' }
      ],
      ...activeFilter
    });

    // Average length of stay
    const losAgg = await Patient.aggregate([
      {
        $match: {
          'treatment.treatmentEndTime': { $ne: null },
          arrivalTime: { $ne: null }
        }
      },
      {
        $project: {
          d: {
            $divide: [
              {
                $subtract: [
                  '$treatment.treatmentEndTime',
                  '$arrivalTime'
                ]
              },
              60000
            ]
          }
        }
      },
      { $group: { _id: null, avg: { $avg: '$d' } } }
    ]);

    const round1 = (value) =>
      value != null ? Math.round(value * 10) / 10 : null;

    res.json({
      totalPatients,
      registered,
      vitalsTaken,
      triaged,
      inTreatment,
      discharged,
      triageStats,
      averageTriageTime: round1(triageTimeAgg[0]?.avg),
      averageWaitingTime: round1(waitingTimeAgg[0]?.avg),
      averageConsultationTime: round1(consultTimeAgg[0]?.avg),
      averageLOS: round1(losAgg[0]?.avg),
      edCongestion,
      resusOccupied,
      edBedOccupied,
      waitingOccupied
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// =====================================================
// GET ADVANCED ANALYTICS (DAILY TREND + DOCTOR WORKLOAD)
// =====================================================
router.get('/stats/advanced', async (req, res) => {
  try {
    // Build a 14-day window ending today (inclusive).
    const dailyTrend = [];
    const now = new Date();

    for (let i = 13; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - i);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const [admissions, discharges, emergencies] = await Promise.all([
        Patient.countDocuments({ arrivalTime: { $gte: dayStart, $lt: dayEnd } }),
        Patient.countDocuments({
          'treatment.treatmentEndTime': { $gte: dayStart, $lt: dayEnd }
        }),
        Patient.countDocuments({
          arrivalTime: { $gte: dayStart, $lt: dayEnd },
          triageCategory: 1
        })
      ]);

      dailyTrend.push({
        date: dayStart.toISOString().slice(0, 10),
        label: dayStart.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }),
        admissions,
        discharges,
        emergencies
      });
    }

    // Per-doctor workload: patients whose treatment was completed by that doctor.
    const doctorWorkload = await Patient.aggregate([
      {
        $match: {
          'treatment.treatedBy': { $ne: null, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$treatment.treatedBy',
          patients: { $sum: 1 }
        }
      },
      { $sort: { patients: -1 } }
    ]);

    res.json({
      dailyTrend,
      doctorWorkload: doctorWorkload.map((d) => ({
        doctor: d._id,
        patients: d.patients
      }))
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// =====================================================
// GET QUEUE POSITION
// =====================================================
router.get('/queue', async (req, res) => {
  try {
    const { patientId, icNumber } = req.query;

    const query = patientId
      ? {
          $or: [
            ...(mongoose.Types.ObjectId.isValid(patientId)
              ? [{ _id: patientId }]
              : []),
            { patientId }
          ],
          status: { $in: ['Registered', 'Vitals Taken', 'Triaged'] }
        }
      : {
          icNumber,
          status: { $in: ['Registered', 'Vitals Taken', 'Triaged'] }
        };

    if (!patientId && !icNumber) {
      return res.status(400).json({
        message: 'A patient identifier is required'
      });
    }

    const patient = await Patient.findOne(query).sort({ arrivalTime: -1 });

    if (!patient) {
      return res.status(404).json({
        message: 'No active registration found for this patient'
      });
    }

    const position = await Patient.countDocuments({
      status: 'Registered',
      arrivalTime: { $lte: patient.arrivalTime }
    });

    const totalWaiting = await Patient.countDocuments({
      status: 'Registered'
    });

    res.json({
      ...hideQrToken(patient),
      position,
      totalWaiting
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// =====================================================
// LIVE QUEUE BOARD - PRIORITIZED, WITH WAIT TIMES
// =====================================================
router.get('/queue/board', async (req, res) => {
  try {
    const activeStatuses = ['Registered', 'Vitals Taken', 'Triaged', 'In Treatment'];
    const patients = await Patient.find({ status: { $in: activeStatuses } }).select('-qrToken');

    const now = Date.now();

    const board = patients.map((p) => {
      const triagePriority = p.triageCategory ?? 99;
      const elapsed = p.arrivalTime
        ? Math.max(0, now - new Date(p.arrivalTime).getTime())
        : null;

      // Heuristic estimated wait (minutes) based on triage priority.
      const estimatedWaitMinutes =
        triagePriority === 1 ? 0 : triagePriority === 2 ? 30 : 60;

      return {
        _id: p._id,
        patientId: p.patientId,
        name: p.name,
        queueNumber: p.queueNumber,
        status: p.status,
        triageCategory: p.triageCategory,
        triageColor: p.triageColor,
        assignedLocation: p.assignedLocation,
        arrivalTime: p.arrivalTime,
        waitingMinutes: elapsed != null ? Math.round(elapsed / 60000) : null,
        estimatedWaitMinutes
      };
    });

    // Emergency-first: sort by triage priority (Cat 1 first), then arrival time.
    board.sort((a, b) => {
      const pa = a.triageCategory ?? 99;
      const pb = b.triageCategory ?? 99;
      if (pa !== pb) return pa - pb;
      return new Date(a.arrivalTime) - new Date(b.arrivalTime);
    });

    // Assign dynamic queue positions based on the sorted order.
    board.forEach((p, i) => {
      p.position = i + 1;
    });

    res.json({ count: board.length, patients: board });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// =====================================================
// ALL VISITS (staff monitoring) — one patient, many visits
// =====================================================
router.get('/visits/all', verifyToken, requireMedicalStaff, async (req, res) => {
  try {
    const patients = await Patient.find()
      .select('-qrToken')
      .sort({ updatedAt: -1 });

    const visits = patients.map((patient) => ({
      _id: patient._id,
      patientId: patient.patientId,
      name: patient.name,
      currentVisit: {
        visitId: patient.currentVisitId,
        queueNumber: patient.queueNumber,
        chiefComplaint: patient.chiefComplaint,
        symptoms: patient.symptoms,
        arrivalTime: patient.arrivalTime,
        status: patient.status,
        triageCategory: patient.triageCategory,
        triageColor: patient.triageColor,
        assignedDoctor: patient.assignedDoctor,
        treatment: plainTreatment(patient.treatment)
      },
      previousVisits: (patient.visits || [])
        .slice()
        .reverse()
        .map((v) => (v.toObject ? v.toObject() : { ...v })),
      visitCount: (patient.visits?.length || 0) + (patient.currentVisitId ? 1 : 0)
    }));

    res.json({ count: visits.length, patients: visits });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// =====================================================
// PATIENT'S OWN RECORD (authenticated patient only)
// =====================================================
router.get('/me', verifyToken, requirePatient, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const patient = await resolvePatientForUser(user);

    if (!patient) {
      // No hospital profile yet — the patient still needs to register a visit.
      return res.json({
        profile: null,
        currentVisit: null,
        visits: [],
        account: {
          name: user.name,
          email: user.email,
          phone: user.phone,
          dateOfBirth: user.dateOfBirth
        }
      });
    }

    res.json({
      profile: selfView(patient),
      currentVisit: currentVisitView(patient),
      visits: (patient.visits || [])
        .slice()
        .reverse()
        .map((v) => (v.toObject ? v.toObject() : { ...v })),
      account: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        dateOfBirth: user.dateOfBirth
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// =====================================================
// START A NEW HOSPITAL VISIT (authenticated patient only)
// Reuses the same permanent Patient ID / QR code across every visit.
// =====================================================
router.post('/me/visits', verifyToken, requirePatient, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const { chiefComplaint, symptoms, gender, assignedDoctor } = req.body;

    if (!chiefComplaint || !String(chiefComplaint).trim()) {
      return res.status(400).json({ message: 'Chief complaint is required' });
    }

    let patient = await resolvePatientForUser(user);

    // ---- First visit: create the permanent patient profile ----
    if (!patient) {
      const resolvedGender = gender || user.gender;

      if (!['Male', 'Female'].includes(resolvedGender)) {
        return res.status(400).json({
          message: 'Gender is required to create your patient record'
        });
      }

      const patientId = await generatePatientId();
      const dedupeKey = buildDedupeKey(user.name, user.dateOfBirth, user.phone);
      const queueNumber = await generateQueueNumber();

      try {
        patient = new Patient({
          patientId,
          name: user.name,
          dateOfBirth: user.dateOfBirth,
          gender: resolvedGender,
          contactNumber: user.phone,
          chiefComplaint: String(chiefComplaint).trim(),
          symptoms: symptoms || null,
          dedupeKey,
          user: user._id,
          status: 'Registered'
        });

        startNewVisit(patient, {
          chiefComplaint: String(chiefComplaint).trim(),
          symptoms,
          assignedDoctor,
          reason: 'Self-registered visit'
        }, {
          queueNumber,
          changedBy: user.name,
          changedByRole: 'patient'
        });

        await patient.save();

        user.patient = patient._id;
        await user.save();
      } catch (error) {
        // Race-safe duplicate handling via the unique dedupeKey index.
        if (error?.code === 11000 && dedupeKey) {
          const existing = await Patient.findOne({ dedupeKey });

          if (existing) {
            if (!existing.user) {
              existing.user = user._id;
              await existing.save();
              user.patient = existing._id;
              await user.save();
            }

            if (existing.user?.toString() !== user._id.toString()) {
              return res.status(409).json({
                message:
                  'A hospital record already exists for these details. Please ask staff to link your account.'
              });
            }

            patient = existing;
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    // ---- Existing profile: guard against concurrent active visits ----
    if (patient.currentVisitId && !isVisitClosed(patient.status)) {
      return res.status(409).json({
        message:
          'You already have an active visit. Please complete it before registering a new one.'
      });
    }

    // Fill in gender later if it was missing from the profile.
    if (!patient.gender && gender) {
      patient.gender = gender;
    }

    // Start the new visit (archives the previous one into visits[]).
    const queueNumber = await generateQueueNumber();

    startNewVisit(patient, {
      chiefComplaint: String(chiefComplaint).trim(),
      symptoms,
      assignedDoctor,
      reason: 'Self-registered visit'
    }, {
      queueNumber,
      changedBy: user.name,
      changedByRole: 'patient'
    });

    await patient.save();

    notifyUpdate();

    return res.status(201).json({
      message: 'Visit registered successfully',
      patient: hideQrToken(patient),
      visitId: patient.currentVisitId,
      queueNumber: patient.queueNumber,
      patientId: patient.patientId
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// =====================================================
// GET PATIENT BY QR / IDENTIFIER - AUTHORIZED STAFF ONLY
// Keep this route BEFORE /:id
// =====================================================
router.get('/qr/:token', verifyToken, async (req, res) => {
  try {
    const role = req.user?.role;

    if (!['admin', 'clinician'].includes(role)) {
      return res.status(403).json({
        message: 'Access denied. Only authorized staff can scan patient QR codes.'
      });
    }

    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        message: 'QR token is required'
      });
    }

    const isObjectId = mongoose.Types.ObjectId.isValid(token);
    const patient = await Patient.findOne({
      $or: [
        { qrToken: token },
        { patientId: token },
        ...(isObjectId ? [{ _id: token }] : [])
      ]
    });

    if (!patient) {
      return res.status(404).json({
        message: 'Patient not found. Invalid QR code.'
      });
    }

    res.json({
      message: 'Patient identified successfully',
      patient: hideQrToken(patient)
    });

  } catch (error) {
    console.error('QR scan error:', error);

    res.status(500).json({
      message: 'Failed to identify patient',
      error: error.message
    });
  }
});

// =====================================================
// PUBLIC MOBILE TRACKING (no authentication, limited fields)
// =====================================================
router.get('/track/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const isObjectId = mongoose.Types.ObjectId.isValid(token);

    const patient = await Patient.findOne({
      $or: [
        { qrToken: token },
        { patientId: token },
        ...(isObjectId ? [{ _id: token }] : [])
      ]
    });

    if (!patient || patient.qrRevoked) {
      return res.status(404).json({ message: 'Tracking link is invalid' });
    }

    // Only non-confidential information is ever returned here.
    res.json({
      patient: {
        patientId: patient.patientId,
        name: patient.shareNamePublicly ? patient.name : null,
        queueNumber: patient.queueNumber,
        status: patient.status,
        assignedLocation: patient.assignedLocation,
        arrivalTime: patient.arrivalTime,
        disposition: patient.treatment?.disposition || null,
        vitals: patient.vitalSigns || null,
        statusHistory: plainList(patient.statusHistory)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// =====================================================
// FULL PATIENT RECORD (staff only) — used by the QR scan view
// =====================================================
router.get('/:id/record', verifyToken, requireMedicalStaff, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const data = hideQrToken(patient);
    data.currentVisitId = patient.currentVisitId;
    data.previousVisits = (patient.visits || [])
      .slice()
      .reverse()
      .map((v) => (v.toObject ? v.toObject() : { ...v }));

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// =====================================================
// PATIENT QR TOKEN (staff only) — for rendering / downloading the QR
// =====================================================
router.get('/:id/qr-token', verifyToken, requireMedicalStaff, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    if (!patient.qrToken) {
      patient.qrToken = crypto.randomBytes(32).toString('hex');
      patient.qrCreatedAt = new Date();
      await patient.save();
    }

    res.json({
      patientId: patient.patientId,
      qrToken: patient.qrToken,
      revoked: Boolean(patient.qrRevoked)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// =====================================================
// START A NEW VISIT FOR AN EXISTING PATIENT (medical staff only)
// =====================================================
router.post('/:id/visits', verifyToken, requireMedicalStaff, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    if (patient.currentVisitId && !isVisitClosed(patient.status)) {
      return res.status(409).json({
        message: 'Patient already has an active visit. Complete it first.'
      });
    }

    const { chiefComplaint, symptoms, assignedDoctor } = req.body;

    if (!chiefComplaint || !String(chiefComplaint).trim()) {
      return res.status(400).json({ message: 'Chief complaint is required' });
    }

    const queueNumber = await generateQueueNumber();

    startNewVisit(patient, {
      chiefComplaint: String(chiefComplaint).trim(),
      symptoms,
      assignedDoctor,
      reason: 'Re-registered by clinician'
    }, {
      queueNumber,
      changedBy: req.user?.username || 'Staff',
      changedByRole: req.user?.role
    });

    await patient.save();

    notifyUpdate();

    res.status(201).json({
      message: 'New visit started',
      patient: hideQrToken(patient),
      visitId: patient.currentVisitId,
      queueNumber: patient.queueNumber
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// =====================================================
// REVOKE / REISSUE PUBLIC QR TRACKING LINK (staff only)
// =====================================================
router.post('/:id/revoke-qr', verifyToken, requireMedicalStaff, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    patient.qrRevoked = true;
    patient.qrRevokedAt = new Date();
    await patient.save();

    res.json({ message: 'Public tracking link revoked', revoked: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/reissue-qr', verifyToken, requireMedicalStaff, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    patient.qrToken = crypto.randomBytes(32).toString('hex');
    patient.qrCreatedAt = new Date();
    patient.qrRevoked = false;
    patient.qrRevokedAt = null;
    await patient.save();

    res.json({
      message: 'A new tracking link was issued',
      qrToken: patient.qrToken
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// =====================================================
// GET PATIENT BY MONGODB ID
// =====================================================
router.get('/:id', async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res.status(404).json({
        message: 'Patient not found'
      });
    }

    // Ensure patient has a qrToken
    if (!patient.qrToken) {
      patient.qrToken = crypto.randomBytes(32).toString('hex');
      patient.qrCreatedAt = new Date();
      await patient.save();
    }

    // Include qrToken so the patient waiting screen can render the QR code
    // (qrToken is intentionally excluded from this public response — see hideQrToken)
    res.json(hideQrToken(patient));

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// =====================================================
// REGISTER NEW PATIENT (check-in / walk-in)
// =====================================================
router.post('/', async (req, res) => {
  try {
    const { name, dateOfBirth, gender, contactNumber, chiefComplaint } = req.body;

    if (!name || !dateOfBirth || !gender || !contactNumber || !chiefComplaint) {
      return res.status(400).json({
        message:
          'Name, date of birth, gender, contact number and chief complaint are required'
      });
    }

    const dedupeKey = buildDedupeKey(name, dateOfBirth, contactNumber);

    // Duplicate detection is a safety check, NOT proof of identity: when we
    // find a match we return the existing record instead of silently creating
    // a second profile.
    if (dedupeKey) {
      const existing = await Patient.findOne({ dedupeKey });

      if (existing) {
        return res.status(200).json({
          patient: hideQrToken(existing),
          duplicate: true,
          message:
            'A matching patient record already exists and has been retrieved.'
        });
      }
    }

    const patientId = await generatePatientId();
    const queueNumber = await generateQueueNumber();

    const patient = new Patient({
      patientId,
      name,
      icNumber: req.body.icNumber,
      dateOfBirth,
      gender,
      contactNumber,
      chiefComplaint,
      symptoms: req.body.symptoms || null,
      bloodType: req.body.bloodType,
      dedupeKey,
      status: 'Registered'
    });

    startNewVisit(patient, {
      chiefComplaint,
      symptoms: req.body.symptoms,
      assignedDoctor: req.body.assignedDoctor,
      reason: 'Registered at check-in'
    }, {
      queueNumber,
      changedBy: req.body.performedBy || null,
      changedByRole: 'staff'
    });

    const newPatient = await patient.save();

    notifyUpdate();

    // Return the QR token only in the registration response.
    res.status(201).json({
      patient: newPatient.toObject(),
      duplicate: false,
      message: 'Patient registered successfully'
    });

  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: 'A patient with these details already exists.'
      });
    }

    res.status(400).json({ message: error.message });
  }
});

// =====================================================
// RECORD OUT-OF-ORDER QUEUE SELECTION OVERRIDE
// =====================================================
router.post('/:id/queue-override', verifyToken, requireMedicalStaff, async (req, res) => {
  try {
    const { reason, notes } = req.body || {};
    const allowedReasons = [
      'Serious patient condition',
      'Emergency symptoms',
      'Abnormal vital signs',
      'Clinician judgment',
      'Other'
    ];

    if (!reason || !allowedReasons.includes(reason)) {
      return res.status(400).json({
        message: 'A mandatory reason is required: Serious patient condition, Emergency symptoms, Abnormal vital signs, Clinician judgment, or Other.'
      });
    }

    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const clinicianUser = await User.findById(req.user.id).select('name username role');
    const clinicianName = clinicianUser?.name || clinicianUser?.username || 'Clinician';
    const clinicianId = req.user.id || clinicianUser?._id?.toString() || null;

    const fullReason = (reason === 'Other' && notes && notes.trim())
      ? ('Other: ' + notes.trim())
      : reason;

    const timestamp = new Date();
    const targetVisitId = req.body?.visitId || patient.currentVisitId || null;

    const overrideRecord = {
      reason: fullReason,
      patientId: patient.patientId || patient._id.toString(),
      visitId: targetVisitId,
      clinicianId: clinicianId,
      clinicianName: clinicianName,
      timestamp: timestamp
    };

    patient.queueOverride = overrideRecord;
    patient.queueOverrideHistory = patient.queueOverrideHistory || [];
    patient.queueOverrideHistory.push(overrideRecord);

    patient.statusHistory = patient.statusHistory || [];
    patient.statusHistory.push({
      status: patient.status || 'Registered',
      changedBy: clinicianName,
      changedByRole: req.user.role || 'clinician',
      reason: 'Queue out-of-order override: ' + fullReason,
      location: patient.assignedLocation || null,
      timestamp: timestamp
    });

    const savedPatient = await patient.save();
    notifyUpdate();

    return res.json({
      success: true,
      message: 'Queue override recorded successfully',
      override: overrideRecord,
      patient: hideQrToken(savedPatient)
    });
  } catch (error) {
    console.error('Error recording queue override:', error);
    return res.status(500).json({ message: 'Failed to record queue override' });
  }
});

// =====================================================
// SUBMIT VITALS AND GET AI TRIAGE RECOMMENDATION
// =====================================================
router.post('/:id/vitals', verifyToken, requireMedicalStaff, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res.status(404).json({
        message: 'Patient not found'
      });
    }

    const visitId = req.body.visitId;
    let targetVisit = null;
    if (visitId && patient.currentVisitId !== visitId) {
      targetVisit = (patient.visits || []).find(v => v.visitId === visitId || v._id.toString() === visitId);
    }

    const activeStatus = targetVisit ? targetVisit.status : patient.status;
    if (activeStatus !== 'Registered') {
      return res.status(400).json({
        message: 'Vitals can only be submitted for Registered visits'
      });
    }

    const vitalsObj = {
      spO2: req.body.spO2,
      respiratoryRate: req.body.respiratoryRate,
      heartRate: req.body.heartRate,
      systolicBP: req.body.systolicBP,
      diastolicBP: req.body.diastolicBP,
      gcs: req.body.gcs,
      painScore: req.body.painScore,
      temperature: req.body.temperature,
      glucose: req.body.glucose
    };

    const triageResult = classifyTriage(vitalsObj);
    const performer = req.body.performedBy || req.user?.username || 'Clinician';
    const now = new Date();

    if (targetVisit) {
      targetVisit.vitalSigns = vitalsObj;
      targetVisit.aiTriageCategory = triageResult.category;
      targetVisit.aiTriageColor = triageResult.color;
      targetVisit.status = 'Vitals Taken';
      targetVisit.statusHistory = targetVisit.statusHistory || [];
      targetVisit.statusHistory.push({
        status: 'Vitals Taken',
        changedBy: performer,
        changedByRole: req.user?.role || 'clinician',
        reason: `Vital signs recorded for visit ${visitId}`,
        location: targetVisit.assignedLocation,
        timestamp: now
      });
      patient.statusHistory = patient.statusHistory || [];
      patient.statusHistory.push({
        status: 'Vitals Taken',
        changedBy: performer,
        changedByRole: req.user?.role || 'clinician',
        reason: `Vital signs recorded for visit ${visitId}`,
        location: targetVisit.assignedLocation,
        timestamp: now
      });
    } else {
      patient.vitalSigns = vitalsObj;
      patient.aiTriageCategory = triageResult.category;
      patient.aiTriageColor = triageResult.color;
      patient.status = 'Vitals Taken';
      patient.statusHistory = patient.statusHistory || [];
      patient.statusHistory.push({
        status: 'Vitals Taken',
        changedBy: performer,
        changedByRole: req.user?.role || 'clinician',
        reason: 'Vital signs recorded',
        location: patient.assignedLocation,
        timestamp: now
      });
    }

    // Emergency Alert System: create alerts for critical vital signs.
    const criticalAlerts = evaluateCriticalVitals(patient.vitalSigns);

    if (criticalAlerts.length > 0) {
      await Alert.deleteMany({ patientId: patient._id, status: 'active' });
      await Alert.insertMany(
        criticalAlerts.map((a) => ({
          patientId: patient._id,
          patientName: patient.name,
          patientNumber: patient.patientId,
          parameter: a.parameter,
          message: a.message,
          severity: 'critical'
        }))
      );
    }

    const updatedPatient = await patient.save();

    res.json({
      patient: hideQrToken(updatedPatient),
      triageResult
    });
    notifyUpdate();

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// =====================================================
// CONFIRM OR OVERRIDE TRIAGE
// =====================================================
router.post('/:id/triage-confirm', verifyToken, requireMedicalStaff, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res.status(404).json({
        message: 'Patient not found'
      });
    }

    const visitId = req.body.visitId;
    let targetVisit = null;
    if (visitId && patient.currentVisitId !== visitId) {
      targetVisit = (patient.visits || []).find(v => v.visitId === visitId || v._id.toString() === visitId);
    }

    const activeStatus = targetVisit ? targetVisit.status : patient.status;
    if (
      activeStatus !== 'Registered' &&
      activeStatus !== 'Vitals Taken'
    ) {
      return res.status(400).json({
        message: 'Triage can only be confirmed for visits with vitals taken'
      });
    }

    if (!patient.vitalSigns || !patient.vitalSigns.heartRate) {
      return res.status(400).json({
        message: 'Vitals must be recorded before confirming triage'
      });
    }

    const colorMap = {
      1: 'Red',
      2: 'Yellow',
      3: 'Green'
    };

    const confirmedCategory = Number(req.body.confirmedCategory);

    if (![1, 2, 3].includes(confirmedCategory)) {
      return res.status(400).json({
        message: 'Confirmed category must be 1, 2, or 3'
      });
    }

    // Suggested category: explicit request value, else the stored AI result
    const suggestedCategory =
      req.body.suggestedCategory != null
        ? Number(req.body.suggestedCategory)
        : (patient.aiTriageCategory != null ? patient.aiTriageCategory : null);

    const isOverride =
      suggestedCategory != null && confirmedCategory !== suggestedCategory;

    const overrideReason =
      req.body.overrideReason && String(req.body.overrideReason).trim();

    if (isOverride && !overrideReason) {
      return res.status(400).json({
        message: 'A reason is required when overriding the triage suggestion.'
      });
    }

    const locationMap = {
      1: 'Resuscitation Zone',
      2: 'ED Bed',
      3: 'Waiting Area'
    };
    const assignedLoc = locationMap[confirmedCategory];
    const triagedBy = req.body.triagedBy || req.user?.username || 'Clinician';
    const now = new Date();

    if (targetVisit) {
      targetVisit.triageCategory = confirmedCategory;
      targetVisit.triageColor = colorMap[confirmedCategory];
      targetVisit.nurseOverride = isOverride;
      targetVisit.nurseOverrideReason = isOverride ? overrideReason : null;
      targetVisit.triagedBy = triagedBy;
      targetVisit.triageTimestamp = now;
      targetVisit.status = 'Triaged';
      targetVisit.assignedLocation = assignedLoc;
      targetVisit.triageHistory = targetVisit.triageHistory || [];
      targetVisit.triageHistory.push({
        category: confirmedCategory,
        color: colorMap[confirmedCategory],
        suggestedCategory,
        suggestedColor: colorMap[suggestedCategory] || null,
        overridden: isOverride,
        reason: isOverride ? overrideReason : null,
        by: triagedBy,
        timestamp: now
      });
      targetVisit.statusHistory = targetVisit.statusHistory || [];
      targetVisit.statusHistory.push({
        status: 'Triaged',
        changedBy: triagedBy,
        changedByRole: req.user?.role || 'clinician',
        reason: isOverride
          ? `Triage overridden to Category ${confirmedCategory} for visit ${visitId}`
          : `Triage confirmed Category ${confirmedCategory} for visit ${visitId}`,
        location: assignedLoc,
        timestamp: now
      });
    } else {
      patient.triageCategory = confirmedCategory;
      patient.triageColor = colorMap[confirmedCategory];
      patient.nurseOverride = isOverride;
      patient.nurseOverrideReason = isOverride ? overrideReason : null;
      patient.triagedBy = triagedBy;
      patient.triageTimestamp = now;
      patient.status = 'Triaged';
      patient.assignedLocation = assignedLoc;
      patient.triageHistory = patient.triageHistory || [];
      patient.triageHistory.push({
        category: confirmedCategory,
        color: colorMap[confirmedCategory],
        suggestedCategory,
        suggestedColor: colorMap[suggestedCategory] || null,
        overridden: isOverride,
        reason: isOverride ? overrideReason : null,
        by: triagedBy,
        timestamp: now
      });
      patient.statusHistory = patient.statusHistory || [];
      patient.statusHistory.push({
        status: 'Triaged',
        changedBy: triagedBy,
        changedByRole: req.user?.role || 'clinician',
        reason: isOverride
          ? `Triage overridden to Category ${confirmedCategory}`
          : `Triage confirmed Category ${confirmedCategory}`,
        location: assignedLoc,
        timestamp: now
      });
    }

    const updatedPatient = await patient.save();

    notifyUpdate();
    res.json(hideQrToken(updatedPatient));

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// =====================================================
// UPDATE PATIENT (clinical workflow — medical staff only)
// =====================================================
router.patch('/:id', verifyToken, requireMedicalStaff, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res.status(404).json({
        message: 'Patient not found'
      });
    }

    const visitId = req.body.visitId;
    let targetVisit = null;
    if (visitId && patient.currentVisitId !== visitId) {
      targetVisit = (patient.visits || []).find(v => v.visitId === visitId || v._id.toString() === visitId);
    }

    if (targetVisit) {
      const performer = req.body.performedBy || req.user?.username || 'Clinician';
      if (req.body.status) {
        targetVisit.status = req.body.status;
        if (req.body.status === 'In Treatment') {
          targetVisit.treatment = targetVisit.treatment || {};
          if (!targetVisit.treatment.treatmentStartTime) targetVisit.treatment.treatmentStartTime = new Date();
        }
      }
      if (req.body.treatment && typeof req.body.treatment === 'object') {
        targetVisit.treatment = {
          ...(targetVisit.treatment ? (targetVisit.treatment.toObject ? targetVisit.treatment.toObject() : targetVisit.treatment) : {}),
          ...req.body.treatment,
          treatedBy: req.body.treatment.treatedBy || performer
        };
        if (req.body.treatment.disposition && !targetVisit.treatment.treatmentEndTime) {
          targetVisit.treatment.treatmentEndTime = new Date();
        }
      }
      if (req.body.assignedDoctor) targetVisit.assignedDoctor = req.body.assignedDoctor;
      if (req.body.assignedLocation) targetVisit.assignedLocation = req.body.assignedLocation;
      targetVisit.statusHistory = targetVisit.statusHistory || [];
      targetVisit.statusHistory.push({
        status: targetVisit.status,
        changedBy: performer,
        changedByRole: req.user?.role || 'clinician',
        reason: req.body.reason || `Updated for visit ${visitId}`,
        location: targetVisit.assignedLocation,
        timestamp: new Date()
      });
      const updatedPatient = await patient.save();
      notifyUpdate();
      return res.json(hideQrToken(updatedPatient));
    }

    const previousStatus = patient.status;

    // Do not allow clients to change QR identification fields.
    const allowedFields = [
      'name',
      'icNumber',
      'dateOfBirth',
      'gender',
      'contactNumber',
      'bloodType',
      'chiefComplaint',
      'symptoms',
      'status',
      'vitalSigns',
      'triageCategory',
      'triageColor',
      'aiTriageCategory',
      'aiTriageColor',
      'nurseOverride',
      'nurseOverrideReason',
      'triagedBy',
      'triageTimestamp',
      'assignedDoctor',
      'assignedLocation'
    ];

    allowedFields.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        patient[key] = req.body[key];
      }
    });

    const performer =
      req.body.performedBy || req.user?.username || 'Clinician';

    // Treatment / diagnosis / notes / disposition recording.
    if (req.body.treatment && typeof req.body.treatment === 'object') {
      const existing = plainTreatment(patient.treatment) || {};
      const incoming = req.body.treatment;

      patient.treatment = {
        ...existing,
        ...incoming,
        treatedBy: incoming.treatedBy || existing.treatedBy || performer
      };

      if (incoming.disposition && !patient.treatment.treatmentEndTime) {
        patient.treatment.treatmentEndTime = new Date();
      }
    }

    // Status transitions update timestamps + the immutable audit trail.
    if (req.body.status && req.body.status !== previousStatus) {
      if (req.body.status === 'In Treatment') {
        patient.treatment = {
          ...(plainTreatment(patient.treatment) || {}),
          treatmentStartTime:
            patient.treatment?.treatmentStartTime || new Date(),
          treatedBy:
            patient.treatment?.treatedBy ||
            patient.assignedDoctor ||
            performer
        };
      }

      if (TERMINAL_STATUSES.includes(req.body.status)) {
        patient.treatment = {
          ...(plainTreatment(patient.treatment) || {}),
          treatmentEndTime: new Date(),
          treatedBy: patient.treatment?.treatedBy || performer
        };
      }

      patient.statusHistory = patient.statusHistory || [];
      patient.statusHistory.push({
        status: req.body.status,
        changedBy: performer,
        changedByRole: req.user?.role || 'clinician',
        reason: req.body.reason || null,
        location: patient.assignedLocation,
        timestamp: new Date()
      });
    }

    const updatedPatient = await patient.save();

    notifyUpdate();
    res.json(hideQrToken(updatedPatient));

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// =====================================================
// DELETE PATIENT (admin only)
// =====================================================
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      return res.status(404).json({
        message: 'Patient not found'
      });
    }

    await patient.deleteOne();

    notifyUpdate();
    res.json({
      message: 'Patient deleted'
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
