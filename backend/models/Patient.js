
const mongoose = require('mongoose');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Per-visit snapshot.
// One patient has ONE permanent record (and one permanent QR token). The inline
// clinical fields on the Patient document always describe the CURRENT visit;
// when a new visit starts, the previous one is archived into `visits` below so
// earlier treatment / clinical history is never overwritten.
// ---------------------------------------------------------------------------
const visitSchema = new mongoose.Schema({
  visitId: { type: String, required: true },
  queueNumber: { type: Number },
  chiefComplaint: { type: String, default: null },
  symptoms: { type: String, default: null },
  arrivalTime: { type: Date, default: Date.now },
  status: { type: String, default: 'Registered' },

  statusHistory: {
    type: [
      {
        status: { type: String },
        changedBy: { type: String, default: null },
        changedByRole: { type: String, default: null },
        reason: { type: String, default: null },
        location: { type: String, default: null },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    default: []
  },

  vitalSigns: {
    spO2: Number,
    respiratoryRate: Number,
    heartRate: Number,
    systolicBP: Number,
    diastolicBP: Number,
    gcs: Number,
    painScore: Number,
    temperature: Number,
    glucose: Number
  },

  triageCategory: { type: Number, default: null },
  triageColor: { type: String, default: null },
  aiTriageCategory: { type: Number },
  aiTriageColor: { type: String },
  nurseOverride: { type: Boolean, default: false },
  nurseOverrideReason: { type: String },
  triagedBy: { type: String },
  triageTimestamp: { type: Date },

  triageHistory: {
    type: [
      {
        category: Number,
        color: String,
        suggestedCategory: { type: Number, default: null },
        suggestedColor: { type: String, default: null },
        overridden: { type: Boolean, default: false },
        reason: { type: String, default: null },
        by: { type: String, default: null },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    default: []
  },

  assignedDoctor: { type: String, default: null },
  assignedLocation: { type: String, default: null },

  queueOverride: {
    reason: { type: String, default: null },
    patientId: { type: String, default: null },
    visitId: { type: String, default: null },
    clinicianId: { type: String, default: null },
    clinicianName: { type: String, default: null },
    timestamp: { type: Date, default: null }
  },

  queueOverrideHistory: {
    type: [
      {
        reason: { type: String, default: null },
        patientId: { type: String, default: null },
        visitId: { type: String, default: null },
        clinicianId: { type: String, default: null },
        clinicianName: { type: String, default: null },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    default: []
  },
  treatment: {
    provisionalDiagnosis: String,
    clinicalNotes: String,
    treatmentGiven: String,
    disposition: String,
    dispositionReason: String,
    treatedBy: String,
    treatmentStartTime: Date,
    treatmentEndTime: Date
  },

  archivedAt: { type: Date, default: Date.now }
}, { _id: true });

const patientSchema = new mongoose.Schema({
  patientId: {
    type: String,
    required: true,
    unique: true
  },

  // One permanent Patient ID per person. `user` links this profile to the
  // patient's login account (role = 'patient'); it stays null for walk-in
  // registrations made by staff.
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
    sparse: true
  },

  // QR identification
  qrToken: {
    type: String,
    unique: true,
    sparse: true,
    default: () => crypto.randomBytes(32).toString('hex')
  },

  qrCreatedAt: {
    type: Date,
    default: Date.now
  },

  // Allows staff to revoke a leaked/expired QR token without deleting the record.
  qrRevoked: {
    type: Boolean,
    default: false
  },

  qrRevokedAt: {
    type: Date,
    default: null
  },

  // Patient consent: when false the public tracking page hides the patient name.
  shareNamePublicly: {
    type: Boolean,
    default: true
  },

  queueNumber: {
    type: Number
  },

  name: {
    type: String,
    required: true
  },

  // Optional — no longer collected during patient self-registration.
  // icNumber: {
  //   type: String,
  //   default: null
  // },

  // Normalised fingerprint of name + date of birth + mobile number.
  // Used to detect duplicate registrations and (via the unique index) to make
  // simultaneous duplicate registrations race-safe.
  dedupeKey: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
    default: null
  },

  dateOfBirth: {
    type: Date,
    required: true
  },

  gender: {
    type: String,
    enum: ['Male', 'Female'],
    required: true
  },

  contactNumber: {
    type: String,
    required: true
  },

  bloodType: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  },

  chiefComplaint: {
    type: String,
    required: true
  },

  // Free-text description of the patient's current symptoms (current visit).
  symptoms: {
    type: String,
    default: null
  },

  arrivalTime: {
    type: Date,
    default: Date.now
  },

  // -------------------------------------------------------------------------
  // Visit tracking. `currentVisitId` identifies the inline (active) visit;
  // `visits` holds archived previous visits (newest last). `visitCount` is the
  // running number used to generate the next unique Visit ID.
  // -------------------------------------------------------------------------
  currentVisitId: {
    type: String,
    default: null
  },

  visitCount: {
    type: Number,
    default: 1
  },

  visits: {
    type: [visitSchema],
    default: []
  },

  status: {
    type: String,
    enum: [
      'Registered',
      'Vitals Taken',
      'Triaged',
      'In Treatment',
      'Discharged',
      'Admitted',
      'Referred'
    ],
    default: 'Registered'
  },

  // Immutable audit trail of every clinical workflow status change.
  // Records who performed the change, their role, and when it happened.
  statusHistory: {
    type: [
      {
        status: { type: String, required: true },
        changedBy: { type: String, default: null },
        changedByRole: { type: String, default: null },
        reason: { type: String, default: null },
        location: { type: String, default: null },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    default: []
  },

  vitalSigns: {
    spO2: Number,
    respiratoryRate: Number,
    heartRate: Number,
    systolicBP: Number,
    diastolicBP: Number,
    gcs: Number,
    painScore: Number,
    temperature: Number,
    glucose: Number
  },

  triageCategory: {
    type: Number,
    min: 1,
    max: 3,
    default: null
  },

  triageColor: {
    type: String,
    enum: ['Red', 'Yellow', 'Green'],
    default: null
  },

  aiTriageCategory: {
    type: Number,
    min: 1,
    max: 3
  },

  aiTriageColor: {
    type: String,
    enum: ['Red', 'Yellow', 'Green']
  },

  nurseOverride: {
    type: Boolean,
    default: false
  },

  nurseOverrideReason: {
    type: String
  },

  triagedBy: {
    type: String
  },

  triageTimestamp: {
    type: Date
  },

  // Audit trail of every triage decision (confirm or override)
  triageHistory: {
    type: [
      {
        category: { type: Number, min: 1, max: 3 },
        color: { type: String, enum: ['Red', 'Yellow', 'Green'] },
        suggestedCategory: { type: Number, min: 1, max: 3, default: null },
        suggestedColor: { type: String, enum: ['Red', 'Yellow', 'Green'], default: null },
        overridden: { type: Boolean, default: false },
        reason: { type: String, default: null },
        by: { type: String, default: null },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    default: []
  },

  // Longitudinal medical history (allergies, conditions, medications, surgeries)
  medicalHistory: {
    type: [
      {
        allergies: { type: String, default: null },
        chronicConditions: { type: String, default: null },
        currentMedications: { type: String, default: null },
        pastSurgeries: { type: String, default: null },
        familyHistory: { type: String, default: null },
        notes: { type: String, default: null },
        recordedBy: { type: String, default: null },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    default: []
  },

  assignedDoctor: {
    type: String,
    default: null
  },

  assignedLocation: {
    type: String,
    enum: ['Resuscitation Zone', 'ED Bed', 'Waiting Area'],
    default: null
  },

  queueOverride: {
    reason: { type: String, default: null },
    patientId: { type: String, default: null },
    visitId: { type: String, default: null },
    clinicianId: { type: String, default: null },
    clinicianName: { type: String, default: null },
    timestamp: { type: Date, default: null }
  },

  queueOverrideHistory: {
    type: [
      {
        reason: { type: String, default: null },
        patientId: { type: String, default: null },
        visitId: { type: String, default: null },
        clinicianId: { type: String, default: null },
        clinicianName: { type: String, default: null },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    default: []
  },
  treatment: {
    provisionalDiagnosis: String,
    clinicalNotes: String,
    treatmentGiven: String,
    disposition: {
      type: String,
      enum: ['Discharge', 'Admit', 'Referral']
    },
    dispositionReason: String,
    treatedBy: String,
    treatmentStartTime: Date,
    treatmentEndTime: Date
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('Patient', patientSchema);
