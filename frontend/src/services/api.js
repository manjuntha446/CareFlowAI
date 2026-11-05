import axios from 'axios';

// Base API URL. Empty in development (requests go through the Vite proxy);
// set VITE_API_URL to the deployed backend origin in production, e.g.
// VITE_API_URL=https://careflowai-backend.onrender.com
const RAW_API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const API = axios.create({
  baseURL: `${RAW_API_URL}/api`
});

// Base API URL (used for the Server-Sent Events stream, which is not axios-based)
export const API_BASE_URL = RAW_API_URL;

// Automatically attach JWT token
// Automatically attach JWT token
API.interceptors.request.use((config) => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const token = window.sessionStorage.getItem('token');

      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch (error) {
    console.error('Token access error:', error);
  }

  return config;
});
// ===============================
// AUTHENTICATION APIs
// ===============================
export const login = (credentials) =>
  API.post('/auth/login', credentials);

export const googleLogin = (idToken) =>
  API.post('/auth/google', { idToken });

export const register = (userData) =>
  API.post('/auth/register', userData);

// ===============================
// USER MANAGEMENT APIs
// ===============================

export const getUsers = () =>
  API.get('/users');

export const createUser = (userData) =>
  API.post('/users', userData);

export const deleteUser = (id) =>
  API.delete(`/users/${id}`);

// ===============================
// PATIENT APIs
// ===============================

export const getPatients = () =>
  API.get('/patients');

export const getPatient = (id) =>
  API.get(`/patients/${id}`);

// Full patient record including triage/medical history (staff only)
export const getPatientHistory = (id) =>
  API.get(`/patients/${id}/record`);

// Patient's QR tracking token, for rendering / downloading the QR (staff only)
export const getPatientQrToken = (id) =>
  API.get(`/patients/${id}/qr-token`);

export const createPatient = (data) =>
  API.post('/patients', data);

export const updatePatient = (id, data) =>
  API.patch(`/patients/${id}`, data);

export const deletePatient = (id) =>
  API.delete(`/patients/${id}`);

// Public QR tracking (no authentication) — returns approved fields only
export const getTrackingInfo = (token) =>
  API.get(`/patients/track/${encodeURIComponent(token)}`);

// Revoke / reissue a patient's public QR tracking link (staff only)
export const revokePatientQr = (id) =>
  API.post(`/patients/${id}/revoke-qr`);

export const reissuePatientQr = (id) =>
  API.post(`/patients/${id}/reissue-qr`);

// ===============================
// VISIT APIs (one patient → many visits)
// ===============================

// Every visit (current + archived) across all patients — staff monitoring.
export const getAllVisits = () =>
  API.get('/patients/visits/all');

// Start a new hospital visit for an existing patient (clinician only).
// Keeps the same permanent Patient ID and QR code.
export const createVisit = (patientId, data = {}) =>
  API.post(`/patients/${patientId}/visits`, data);

// ===============================
// PATIENT SELF-SERVICE APIs (role = patient)
// ===============================

// The signed-in patient's own profile, current visit and archived visits.
// The backend resolves the record from the JWT — no patient id is supplied.
export const getMyProfile = () =>
  API.get('/patients/me');

// Register a new hospital visit for the signed-in patient. Only visit-specific
// data is sent; personal details come from the authenticated profile.
export const createMyVisit = (data) =>
  API.post('/patients/me/visits', data);

// Download the signed-in patient's own summary PDF.
export const downloadMySummary = () =>
  API.get('/reports/patient/me/summary', { responseType: 'blob' });

export const getStats = () =>
  API.get('/patients/stats/overview');

export const getAdvancedStats = () =>
  API.get('/patients/stats/advanced');

// ===============================
// QUEUE APIs
// ===============================

// Public queue lookup by patient identifier (Mongo id or P000123) — used by
// the patient waiting screen.
export const getQueuePosition = (patientId) =>
  API.get(`/patients/queue?patientId=${encodeURIComponent(patientId)}`);

// Prioritized live queue board with wait times
export const getQueueBoard = () =>
  API.get('/patients/queue/board');

// Identify a patient by scanning their QR token (staff only)
export const getPatientByQr = (token) =>
  API.get(`/patients/qr/${encodeURIComponent(token)}`);

// Record out-of-order queue selection override (staff only)
export const recordQueueOverride = (patientId, data) =>
  API.post(`/patients/${patientId}/queue-override`, data);

// ===============================
// VITALS APIs
// ===============================

export const submitVitals = (patientId, vitals) =>
  API.post(`/patients/${patientId}/vitals`, vitals);

// ===============================
// TRIAGE APIs
// ===============================

export const confirmTriage = (patientId, data) =>
  API.post(`/patients/${patientId}/triage-confirm`, data);

// ===============================
// PDF REPORT APIs
// ===============================

export const downloadVisitReport = (patientId) =>
  API.get(`/reports/patient/${patientId}`, { responseType: 'blob' });

export const downloadDischargeSummary = (patientId) =>
  API.get(`/reports/patient/${patientId}/discharge`, { responseType: 'blob' });

// Authenticated patient downloads their own specific visit report
export const downloadMyVisitReport = (visitId) =>
  API.get(`/reports/patient/me/visits/${encodeURIComponent(visitId)}`, { responseType: 'blob' });

// Medical staff downloads a specific visit report for a patient
export const downloadPatientVisitReport = (patientId, visitId) =>
  API.get(`/reports/patient/${patientId}/visits/${encodeURIComponent(visitId)}`, { responseType: 'blob' });

// ===============================
// AI PREDICTION API
// ===============================

export const predictAI = (patientId, vitals) =>
  API.post('/ai/predict', { patientId, vitals });

export default API;
