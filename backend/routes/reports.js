const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { verifyToken, requireMedicalStaff, requirePatient } = require('../middleware/auth');

// Reusable formatting helpers
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDateOnly = (d) => (d ? new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const nil = (v) => (v === undefined || v === null || v === '' ? '—' : String(v));
const colorLabel = { 1: 'Category 1 — Red (Critical)', 2: 'Category 2 — Yellow (Semi-Critical)', 3: 'Category 3 — Green (Non-Critical)' };

function sectionTitle(doc, title) {
  doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11).fillColor('#1C3D6E').text(title);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#cbd5e1').stroke();
  doc.moveDown(0.3).font('Helvetica').fontSize(9).fillColor('#1f2937');
}

function keyValue(doc, label, value) {
  doc.font('Helvetica').fontSize(9)
    .fillColor('#6b7280').text(label, { continued: true, width: 150 })
    .fillColor('#111827').text(nil(value));
}

// Helper to render a complete visit report into a PDFDocument
function renderVisitReport(doc, patient, visit) {
  // Header
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#1C3D6E').text('CareFlowAI Hospital');
  doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('Emergency Department — Patient Visit Report');
  doc.moveDown(0.3);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#1C3D6E').stroke();
  doc.moveDown(0.8);

  // Patient Info
  sectionTitle(doc, 'Patient Information');
  keyValue(doc, 'Patient ID', patient.patientId);
  keyValue(doc, 'Name', patient.name);
  if (patient.icNumber) keyValue(doc, 'IC / ID Number', patient.icNumber);
  keyValue(doc, 'Date of Birth', fmtDateOnly(patient.dateOfBirth));
  keyValue(doc, 'Gender', patient.gender);
  if (patient.bloodType) keyValue(doc, 'Blood Type', patient.bloodType);
  keyValue(doc, 'Contact', patient.contactNumber);

  // Visit Info
  sectionTitle(doc, 'Visit Details');
  keyValue(doc, 'Visit ID', visit.visitId);
  if (visit.queueNumber) keyValue(doc, 'Queue Number', `Q${visit.queueNumber}`);
  keyValue(doc, 'Arrival Time', fmtDate(visit.arrivalTime));
  keyValue(doc, 'Status', visit.status);
  if (visit.assignedLocation) keyValue(doc, 'Location', visit.assignedLocation);
  keyValue(doc, 'Chief Complaint', visit.chiefComplaint);
  if (visit.symptoms) keyValue(doc, 'Symptoms', visit.symptoms);

  // Vitals
  const vitals = visit.vitalSigns;
  if (vitals && (vitals.heartRate != null || vitals.spO2 != null)) {
    sectionTitle(doc, 'Vital Signs');
    if (vitals.spO2 != null) keyValue(doc, 'SpO2', `${vitals.spO2}%`);
    if (vitals.heartRate != null) keyValue(doc, 'Heart Rate', `${vitals.heartRate} bpm`);
    if (vitals.systolicBP != null && vitals.diastolicBP != null) keyValue(doc, 'Blood Pressure', `${vitals.systolicBP}/${vitals.diastolicBP} mmHg`);
    if (vitals.respiratoryRate != null) keyValue(doc, 'Respiratory Rate', `${vitals.respiratoryRate}/min`);
    if (vitals.temperature != null) keyValue(doc, 'Temperature', `${vitals.temperature}°C`);
    if (vitals.painScore != null) keyValue(doc, 'Pain Score', `${vitals.painScore}/10`);
    if (vitals.gcs != null) keyValue(doc, 'GCS', `${vitals.gcs}/15`);
  }

  // Triage
  if (visit.triageCategory != null) {
    sectionTitle(doc, 'Triage Assessment');
    keyValue(doc, 'Triage Category', colorLabel[visit.triageCategory] || `Category ${visit.triageCategory}`);
    if (visit.triagedBy) keyValue(doc, 'Triaged By', visit.triagedBy);
    if (visit.triageTimestamp) keyValue(doc, 'Triage Time', fmtDate(visit.triageTimestamp));
    if (visit.nurseOverride) keyValue(doc, 'Override Reason', visit.nurseOverrideReason || 'Clinical judgment');
  }

  // Treatment & Disposition
  const treatment = visit.treatment;
  if (treatment && (treatment.provisionalDiagnosis || treatment.treatmentGiven || treatment.disposition)) {
    sectionTitle(doc, 'Diagnosis & Treatment');
    if (treatment.provisionalDiagnosis) keyValue(doc, 'Provisional Diagnosis', treatment.provisionalDiagnosis);
    if (treatment.treatmentGiven) keyValue(doc, 'Treatment Given', treatment.treatmentGiven);
    if (treatment.clinicalNotes) keyValue(doc, 'Clinical Notes', treatment.clinicalNotes);
    if (treatment.disposition) keyValue(doc, 'Final Disposition', treatment.disposition);
    if (treatment.dispositionReason) keyValue(doc, 'Disposition Reason', treatment.dispositionReason);
    if (treatment.treatedBy) keyValue(doc, 'Treated By', treatment.treatedBy);
    if (treatment.treatmentStartTime) keyValue(doc, 'Treatment Start', fmtDate(treatment.treatmentStartTime));
    if (treatment.treatmentEndTime) keyValue(doc, 'Treatment End', fmtDate(treatment.treatmentEndTime));
  }

  // Status History
  if (Array.isArray(visit.statusHistory) && visit.statusHistory.length > 0) {
    sectionTitle(doc, 'Status History & Audit Trail');
    visit.statusHistory.forEach((entry, idx) => {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1f2937')
        .text(`${idx + 1}. ${entry.status}  —  ${fmtDate(entry.timestamp)}`);
      doc.font('Helvetica').fontSize(8).fillColor('#4b5563');
      const details = [];
      if (entry.changedBy) details.push(`By: ${entry.changedBy} (${entry.changedByRole || 'Staff'})`);
      if (entry.location) details.push(`Location: ${entry.location}`);
      if (entry.reason) details.push(`Note: ${entry.reason}`);
      if (details.length) {
        doc.text(`   ${details.join(' · ')}`);
      }
      doc.moveDown(0.2);
    });
  }

  // Footer
  doc.moveDown(1);
  doc.font('Helvetica').fontSize(8).fillColor('#9ca3af')
    .text(`Generated on ${fmtDate(new Date())} · CareFlowAI Patient Care System`, { align: 'center' });
}

// GET /api/reports/patient/me/visits/:visitId — authenticated patient downloads a specific visit report
router.get('/patient/me/visits/:visitId', verifyToken, requirePatient, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('patient');
    const patient = user?.patient ? await Patient.findById(user.patient) : null;

    if (!patient) return res.status(404).json({ message: 'No patient record linked to this account.' });

    const { visitId } = req.params;
    let targetVisit = null;

    // Check current active visit
    if (patient.currentVisitId === visitId) {
      targetVisit = {
        visitId: patient.currentVisitId,
        queueNumber: patient.queueNumber,
        chiefComplaint: patient.chiefComplaint,
        symptoms: patient.symptoms,
        arrivalTime: patient.arrivalTime,
        status: patient.status,
        statusHistory: patient.statusHistory,
        vitalSigns: patient.vitalSigns,
        triageCategory: patient.triageCategory,
        triageColor: patient.triageColor,
        nurseOverride: patient.nurseOverride,
        nurseOverrideReason: patient.nurseOverrideReason,
        triagedBy: patient.triagedBy,
        triageTimestamp: patient.triageTimestamp,
        assignedDoctor: patient.assignedDoctor,
        assignedLocation: patient.assignedLocation,
        treatment: patient.treatment
      };
    } else {
      // Check archived visits
      const found = (patient.visits || []).find((v) => v.visitId === visitId);
      if (found) {
        targetVisit = found.toObject ? found.toObject() : found;
      }
    }

    if (!targetVisit) {
      return res.status(404).json({ message: `Visit '${visitId}' not found for your account.` });
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="visit-report-${patient.patientId}-${visitId}.pdf"`
    );
    doc.pipe(res);
    renderVisitReport(doc, patient, targetVisit);
    doc.end();
  } catch (error) {
    console.error('Visit PDF error:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to generate visit report' });
  }
});

// GET /api/reports/patient/:id/visits/:visitId — medical staff downloads a specific visit report
router.get('/patient/:id/visits/:visitId', verifyToken, requireMedicalStaff, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const { visitId } = req.params;
    let targetVisit = null;

    if (patient.currentVisitId === visitId) {
      targetVisit = {
        visitId: patient.currentVisitId,
        queueNumber: patient.queueNumber,
        chiefComplaint: patient.chiefComplaint,
        symptoms: patient.symptoms,
        arrivalTime: patient.arrivalTime,
        status: patient.status,
        statusHistory: patient.statusHistory,
        vitalSigns: patient.vitalSigns,
        triageCategory: patient.triageCategory,
        triageColor: patient.triageColor,
        nurseOverride: patient.nurseOverride,
        nurseOverrideReason: patient.nurseOverrideReason,
        triagedBy: patient.triagedBy,
        triageTimestamp: patient.triageTimestamp,
        assignedDoctor: patient.assignedDoctor,
        assignedLocation: patient.assignedLocation,
        treatment: patient.treatment
      };
    } else {
      const found = (patient.visits || []).find((v) => v.visitId === visitId);
      if (found) {
        targetVisit = found.toObject ? found.toObject() : found;
      }
    }

    if (!targetVisit) {
      return res.status(404).json({ message: `Visit '${visitId}' not found for patient.` });
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="visit-report-${patient.patientId}-${visitId}.pdf"`
    );
    doc.pipe(res);
    renderVisitReport(doc, patient, targetVisit);
    doc.end();
  } catch (error) {
    console.error('Staff visit PDF error:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to generate visit report' });
  }
});

// GET /api/reports/patient/me/summary — the authenticated patient's OWN summary.
// A patient may only ever download their own record (resolved from their token).
router.get('/patient/me/summary', verifyToken, requirePatient, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('patient');
    const patient = user?.patient ? await Patient.findById(user.patient) : null;

    if (!patient) return res.status(404).json({ message: 'No patient record is linked to this account.' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="patient-summary-${patient.patientId}.pdf"`);
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(20).fillColor('#1C3D6E').text('CareFlowAI Hospital');
    doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('Patient Summary');
    doc.moveDown(0.3);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#1C3D6E').stroke();
    doc.moveDown(0.8);

    sectionTitle(doc, 'Patient Information');
    keyValue(doc, 'Patient ID', patient.patientId);
    keyValue(doc, 'Name', patient.name);
    keyValue(doc, 'Date of Birth', fmtDateOnly(patient.dateOfBirth));
    keyValue(doc, 'Gender', patient.gender);
    keyValue(doc, 'Contact', patient.contactNumber);
    keyValue(doc, 'Blood Type', patient.bloodType);
    keyValue(doc, 'Current Status', patient.status);

    // Current visit (may already be closed).
    sectionTitle(doc, 'Current Visit');
    keyValue(doc, 'Visit ID', patient.currentVisitId);
    keyValue(doc, 'Arrival Time', fmtDate(patient.arrivalTime));
    keyValue(doc, 'Chief Complaint', patient.chiefComplaint);
    keyValue(doc, 'Disposition', patient.treatment?.disposition);

    if (patient.treatment) {
      sectionTitle(doc, 'Treatment');
      keyValue(doc, 'Provisional Diagnosis', patient.treatment.provisionalDiagnosis);
      keyValue(doc, 'Treatment Given', patient.treatment.treatmentGiven);
      keyValue(doc, 'Treated By', patient.treatment.treatedBy);
      keyValue(doc, 'Disposition Reason', patient.treatment.dispositionReason);
    }

    // Archived previous visits.
    const previous = (patient.visits || []).slice().reverse();
    if (previous.length) {
      sectionTitle(doc, 'Previous Visits');
      previous.forEach((v) => {
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#1f2937').text(`${v.visitId}  ·  ${fmtDate(v.arrivalTime)}`);
        doc.font('Helvetica').fontSize(9).fillColor('#374151');
        doc.text(`Chief Complaint: ${nil(v.chiefComplaint)}`);
        doc.text(`Status: ${nil(v.status)}   Disposition: ${nil(v.treatment?.disposition)}`);
        doc.moveDown(0.3);
      });
    }

    doc.moveDown(1).fontSize(8).fillColor('#9ca3af')
      .text(`Generated ${fmtDate(new Date())} · CareFlowAI Patient Portal`);

    doc.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/reports/patient/:id — comprehensive visit report
router.get('/patient/:id', verifyToken, requireMedicalStaff, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="visit-report-${patient.patientId}.pdf"`);
    doc.pipe(res);

    // Header
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#1C3D6E').text('CareFlowAI Hospital');
    doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('Emergency Department — Patient Visit Report');
    doc.moveDown(0.3);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#1C3D6E').stroke();
    doc.moveDown(0.8);

    // Patient identity
    sectionTitle(doc, 'Patient Information');
    keyValue(doc, 'Patient ID', patient.patientId);
    keyValue(doc, 'Name', patient.name);
    keyValue(doc, 'IC Number', patient.icNumber);
    keyValue(doc, 'Date of Birth', fmtDateOnly(patient.dateOfBirth));
    keyValue(doc, 'Gender', patient.gender);
    keyValue(doc, 'Blood Type', patient.bloodType);
    keyValue(doc, 'Contact', patient.contactNumber);
    keyValue(doc, 'Arrival Time', fmtDate(patient.arrivalTime));
    keyValue(doc, 'Status', patient.status);
    keyValue(doc, 'Chief Complaint', patient.chiefComplaint);

    // Vitals
    if (patient.vitalSigns && patient.vitalSigns.heartRate) {
      const v = patient.vitalSigns;
      sectionTitle(doc, 'Vital Signs');
      keyValue(doc, 'SpO2', v.spO2 != null ? `${v.spO2}%` : null);
      keyValue(doc, 'Heart Rate', v.heartRate != null ? `${v.heartRate} bpm` : null);
      keyValue(doc, 'Blood Pressure', (v.systolicBP != null && v.diastolicBP != null) ? `${v.systolicBP}/${v.diastolicBP}` : null);
      keyValue(doc, 'Respiratory Rate', v.respiratoryRate != null ? `${v.respiratoryRate}/min` : null);
      keyValue(doc, 'Temperature', v.temperature != null ? `${v.temperature}°C` : null);
      keyValue(doc, 'GCS', v.gcs != null ? `${v.gcs}/15` : null);
    }

    // Triage
    sectionTitle(doc, 'Triage Assessment');
    keyValue(doc, 'Final Triage', patient.triageCategory ? colorLabel[patient.triageCategory] : 'Not triaged');
    keyValue(doc, 'Triaged By', patient.triagedBy);
    keyValue(doc, 'Triage Time', fmtDate(patient.triageTimestamp));

    if (patient.triageHistory && patient.triageHistory.length) {
      doc.moveDown(0.3);
      patient.triageHistory.forEach((t, i) => {
        doc.font('Helvetica').fontSize(8.5).fillColor('#374151')
          .text(`  ${i + 1}. ${colorLabel[t.category] || 'Category ' + t.category}${t.overridden ? ' (overridden — ' + nil(t.reason) + ')' : ''} · ${fmtDate(t.timestamp)}`);
      });
    }

    // Treatment
    if (
      patient.treatment &&
      (patient.treatment.provisionalDiagnosis ||
        patient.treatment.treatmentGiven ||
        patient.treatment.clinicalNotes ||
        patient.treatment.disposition)
    ) {
      sectionTitle(doc, 'Diagnosis & Treatment');
      keyValue(doc, 'Provisional Diagnosis', patient.treatment.provisionalDiagnosis);
      keyValue(doc, 'Treatment Given', patient.treatment.treatmentGiven);
      keyValue(doc, 'Clinical Notes', patient.treatment.clinicalNotes);
      keyValue(doc, 'Disposition', patient.treatment.disposition);
      keyValue(doc, 'Disposition Reason', patient.treatment.dispositionReason);
      keyValue(doc, 'Treated By', patient.treatment.treatedBy);
    }

    // Medical history
    if (patient.medicalHistory && patient.medicalHistory.length) {
      sectionTitle(doc, 'Medical History');
      patient.medicalHistory.forEach((m) => {
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text(`Entry recorded ${fmtDate(m.timestamp)} by ${nil(m.recordedBy)}`);
        keyValue(doc, '  Allergies', m.allergies);
        keyValue(doc, '  Chronic Conditions', m.chronicConditions);
        keyValue(doc, '  Current Medications', m.currentMedications);
        keyValue(doc, '  Past Surgeries', m.pastSurgeries);
        keyValue(doc, '  Family History', m.familyHistory);
        keyValue(doc, '  Notes', m.notes);
        doc.moveDown(0.3);
      });
    }

    doc.moveDown(1);
    doc.font('Helvetica').fontSize(8).fillColor('#9ca3af')
      .text(`Generated on ${new Date().toLocaleString('en-MY')} · CareFlowAI Emergency Department`);

    doc.end();
  } catch (error) {
    console.error('PDF report error:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to generate report' });
  }
});

// GET /api/reports/patient/:id/discharge — discharge summary
router.get('/patient/:id/discharge', verifyToken, requireMedicalStaff, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="discharge-summary-${patient.patientId}.pdf"`);
    doc.pipe(res);

    // Header
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#1C3D6E').text('CareFlowAI Hospital');
    doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('Emergency Department — Discharge Summary');
    doc.moveDown(0.3);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#1C3D6E').stroke();
    doc.moveDown(0.8);

    sectionTitle(doc, 'Patient Information');
    keyValue(doc, 'Patient ID', patient.patientId);
    keyValue(doc, 'Name', patient.name);
    keyValue(doc, 'IC Number', patient.icNumber);
    keyValue(doc, 'Gender', patient.gender);
    keyValue(doc, 'Blood Type', patient.bloodType);
    keyValue(doc, 'Arrival Time', fmtDate(patient.arrivalTime));
    keyValue(doc, 'Chief Complaint', patient.chiefComplaint);

    sectionTitle(doc, 'Final Diagnosis & Treatment');
    keyValue(doc, 'Provisional Diagnosis', patient.treatment?.provisionalDiagnosis);
    keyValue(doc, 'Treatment Given', patient.treatment?.treatmentGiven);
    keyValue(doc, 'Disposition', patient.treatment?.disposition);
    keyValue(doc, 'Disposition Reason', patient.treatment?.dispositionReason);
    keyValue(doc, 'Treated By', patient.treatment?.treatedBy);
    keyValue(doc, 'Treatment Start', fmtDate(patient.treatment?.treatmentStartTime));
    keyValue(doc, 'Discharge Time', fmtDate(patient.treatment?.treatmentEndTime));

    // Follow-up / advice
    sectionTitle(doc, 'Discharge Advice');
    doc.font('Helvetica').fontSize(9).fillColor('#111827')
      .text('Please return to the Emergency Department immediately if symptoms worsen or new symptoms appear.');
    doc.moveDown(0.3);
    doc.text('Continue any prescribed medications as advised by the treating doctor and attend follow-up appointments as scheduled.');

    if (patient.medicalHistory && patient.medicalHistory.length) {
      const latest = patient.medicalHistory[patient.medicalHistory.length - 1];
      sectionTitle(doc, 'Relevant Medical History');
      keyValue(doc, 'Allergies', latest.allergies);
      keyValue(doc, 'Chronic Conditions', latest.chronicConditions);
      keyValue(doc, 'Current Medications', latest.currentMedications);
    }

    doc.moveDown(1);
    doc.font('Helvetica').fontSize(8).fillColor('#9ca3af')
      .text(`Generated on ${new Date().toLocaleString('en-MY')} · CareFlowAI Emergency Department`);

    doc.end();
  } catch (error) {
    console.error('PDF discharge summary error:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to generate discharge summary' });
  }
});

module.exports = router;
