// ============================================
// CONFIGURABLE CRITICAL-VITALS ALERT RULES
// ============================================
// These thresholds trigger the Emergency Alert System independently of the
// triage engine. Edit the numbers below to change what is considered critical.

const CRITICAL_RULES = [
  {
    parameter: 'SpO2',
    check: (v) => v.spO2 != null && v.spO2 < 90,
    message: (v) => `Critical hypoxia — SpO2 ${v.spO2}%`
  },
  {
    parameter: 'Heart Rate',
    check: (v) => v.heartRate != null && (v.heartRate > 150 || v.heartRate < 40),
    message: (v) => `Dangerous heart rate — ${v.heartRate} bpm`
  },
  {
    parameter: 'Systolic BP',
    check: (v) => v.systolicBP != null && (v.systolicBP <= 80 || v.systolicBP > 220),
    message: (v) => `Critical blood pressure — SBP ${v.systolicBP} mmHg`
  },
  {
    parameter: 'Respiratory Rate',
    check: (v) => v.respiratoryRate != null && (v.respiratoryRate > 30 || v.respiratoryRate < 8),
    message: (v) => `Critical respiratory distress — RR ${v.respiratoryRate}/min`
  },
  {
    parameter: 'GCS',
    check: (v) => v.gcs != null && v.gcs <= 8,
    message: (v) => `Severe altered consciousness — GCS ${v.gcs}/15`
  },
  {
    parameter: 'Temperature',
    check: (v) => v.temperature != null && (v.temperature <= 34 || v.temperature >= 41),
    message: (v) => `Critical temperature — ${v.temperature}°C`
  }
];

// Returns an array of { parameter, severity, message } for vitals that breach
// a critical rule. Returns [] when the patient is stable.
function evaluateCriticalVitals(vitals = {}) {
  return CRITICAL_RULES
    .filter((rule) => rule.check(vitals))
    .map((rule) => ({
      parameter: rule.parameter,
      severity: 'critical',
      message: rule.message(vitals)
    }));
}

module.exports = { evaluateCriticalVitals, CRITICAL_RULES };