const express = require('express');
const router = express.Router();
const axios = require('axios');
const Patient = require('../models/Patient');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'https://localhost:5001';

function computeAge(dob) {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// POST /api/ai/predict
router.post('/predict', async (req, res) => {
  try {
    const { patientId, vitals } = req.body;

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const age = computeAge(patient.dateOfBirth);
    const gender = patient.gender === 'Male' ? 1 : 0;

    const payload = {
      age,
      gender,
      systolic_bp: vitals.systolicBP,
      diastolic_bp: vitals.diastolicBP,
      heart_rate: vitals.heartRate,
      resp_rate: vitals.respiratoryRate,
      spo2: vitals.spO2,
      pain_score: vitals.painScore,
      temperature: vitals.temperature
    };

    const aiResponse = await axios.post(`${AI_SERVICE_URL}/predict`, payload, {
      timeout: 15000
    });

    res.json({
      aiPrediction: aiResponse.data,
      mappedFeatures: {
        age,
        gender: patient.gender
      }
    });
  } catch (error) {
    console.error('AI prediction error:', error.message);

    res.status(200).json({
      aiPrediction: null,
      error: 'AI service unavailable — using rule-based triage only',
      details: error.message
    });
  }
});

module.exports = router;
