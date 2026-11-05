const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true
    },

    patientName: {
      type: String
    },

    patientNumber: {
      type: String
    },

    parameter: {
      type: String
    },

    message: {
      type: String
    },

    severity: {
      type: String,
      enum: ['critical', 'warning', 'info'],
      default: 'critical'
    },

    status: {
      type: String,
      enum: ['active', 'resolved'],
      default: 'active'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Alert', alertSchema);
