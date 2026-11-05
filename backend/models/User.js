const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true
    },

    // Optional for users who sign up via Google OAuth only.
    password: {
      type: String,
      default: null
    },

    role: {
      type: String,
      enum: ['admin', 'clinician', 'patient'],
      required: true
    },

    name: {
      type: String,
      required: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },

    phone: {
      type: String,
      default: ''
    },

    // Collected for patient accounts (role = 'patient').
    dateOfBirth: {
      type: Date,
      default: null
    },

    // One-to-one link to the patient's permanent hospital profile.
    // Staff/admin accounts leave this null.
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      default: null,
      index: true,
      sparse: true
    },

    // Firebase / Google OAuth UID link
    googleUid: {
      type: String,
      default: null,
      sparse: true,
      index: true
    },

    authProvider: {
      type: String,
      enum: ['local', 'google', 'both'],
      default: 'local'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
