/**
 * MTC (Malaysia Triage Category) Triage Engine
 *
 * Evaluates patient vital signs against MTC thresholds and returns
 * the worst-case triage category (1 = Red/Critical, 2 = Yellow/Semi-Critical, 3 = Green/Non-Critical).
 *
 * The overall category is determined by the single worst parameter —
 * if any vital sign hits Cat 1, the patient is Cat 1.
 */

const COLOR_MAP = { 1: 'Red', 2: 'Yellow', 3: 'Green' };

function classifyTriage(vitals) {
  const {
    spO2,
    respiratoryRate,
    heartRate,
    systolicBP,
    diastolicBP,
    gcs,
    painScore,
    temperature,
    glucose
  } = vitals;

  const findings = [];

  // SpO2 (Oxygen Saturation)
  if (spO2 != null) {
    if (spO2 < 95) {
      findings.push({ parameter: 'SpO2', category: 1, color: 'Red', reason: `SpO2 ${spO2}% is below 95% — critical hypoxia` });
    } else {
      findings.push({ parameter: 'SpO2', category: 3, color: 'Green', reason: `SpO2 ${spO2}% is normal` });
    }
  }

  // Respiratory Rate
  if (respiratoryRate != null) {
    if (respiratoryRate > 25 || respiratoryRate < 10) {
      findings.push({ parameter: 'Respiratory Rate', category: 1, color: 'Red', reason: `RR ${respiratoryRate}/min is critically abnormal` });
    } else if (respiratoryRate >= 20) {
      findings.push({ parameter: 'Respiratory Rate', category: 2, color: 'Yellow', reason: `RR ${respiratoryRate}/min is elevated (20-25 range)` });
    } else {
      findings.push({ parameter: 'Respiratory Rate', category: 3, color: 'Green', reason: `RR ${respiratoryRate}/min is normal` });
    }
  }

  // Systolic Blood Pressure
  if (systolicBP != null) {
    if (systolicBP > 220 || systolicBP <= 90) {
      const reason = systolicBP <= 90
        ? `SBP ${systolicBP} mmHg — possible shock`
        : `SBP ${systolicBP} mmHg — hypertensive crisis`;
      findings.push({ parameter: 'Systolic BP', category: 1, color: 'Red', reason });
    } else if (systolicBP < 100 || systolicBP > 160) {
      const reason = systolicBP < 100
        ? `SBP ${systolicBP} mmHg — hypotension`
        : `SBP ${systolicBP} mmHg — elevated`;
      findings.push({ parameter: 'Systolic BP', category: 2, color: 'Yellow', reason });
    } else {
      findings.push({ parameter: 'Systolic BP', category: 3, color: 'Green', reason: `SBP ${systolicBP} mmHg is normal` });
    }
  }

  // Heart Rate
  if (heartRate != null) {
    if (heartRate > 150 || heartRate < 40) {
      findings.push({ parameter: 'Heart Rate', category: 1, color: 'Red', reason: `HR ${heartRate} bpm is critically abnormal` });
    } else if (heartRate > 100 || heartRate < 60) {
      findings.push({ parameter: 'Heart Rate', category: 2, color: 'Yellow', reason: `HR ${heartRate} bpm is abnormal` });
    } else {
      findings.push({ parameter: 'Heart Rate', category: 3, color: 'Green', reason: `HR ${heartRate} bpm is normal` });
    }
  }

  // GCS (Glasgow Coma Scale)
  if (gcs != null) {
    if (gcs <= 13) {
      findings.push({ parameter: 'GCS', category: 1, color: 'Red', reason: `GCS ${gcs}/15 — altered consciousness` });
    } else if (gcs === 14) {
      findings.push({ parameter: 'GCS', category: 2, color: 'Yellow', reason: `GCS ${gcs}/15 — mildly reduced` });
    } else {
      findings.push({ parameter: 'GCS', category: 3, color: 'Green', reason: `GCS ${gcs}/15 — fully alert` });
    }
  }

  // Temperature
  if (temperature != null) {
    // Fever with shock signs = Cat 1
    const hasShockSigns = (systolicBP != null && systolicBP <= 90) || (heartRate != null && heartRate > 150);
    if (temperature >= 40 && hasShockSigns) {
      findings.push({ parameter: 'Temperature', category: 1, color: 'Red', reason: `Temp ${temperature}°C with signs of shock — possible sepsis` });
    } else if (temperature > 40) {
      findings.push({ parameter: 'Temperature', category: 2, color: 'Yellow', reason: `Temp ${temperature}°C — high grade fever` });
    } else if (temperature < 35) {
      findings.push({ parameter: 'Temperature', category: 2, color: 'Yellow', reason: `Temp ${temperature}°C — hypothermia` });
    } else if (temperature >= 38) {
      findings.push({ parameter: 'Temperature', category: 2, color: 'Yellow', reason: `Temp ${temperature}°C — fever` });
    } else {
      findings.push({ parameter: 'Temperature', category: 3, color: 'Green', reason: `Temp ${temperature}°C is normal` });
    }
  }

  // Pain Score
  if (painScore != null) {
    if (painScore >= 8) {
      findings.push({ parameter: 'Pain Score', category: 2, color: 'Yellow', reason: `Pain ${painScore}/10 — severe pain` });
    } else if (painScore >= 4) {
      findings.push({ parameter: 'Pain Score', category: 3, color: 'Green', reason: `Pain ${painScore}/10 — moderate` });
    } else {
      findings.push({ parameter: 'Pain Score', category: 3, color: 'Green', reason: `Pain ${painScore}/10 — mild` });
    }
  }

  // Glucose (optional)
  if (glucose != null) {
    if (glucose < 3.0) {
      findings.push({ parameter: 'Glucose', category: 1, color: 'Red', reason: `Glucose ${glucose} mmol/L — severe hypoglycemia` });
    } else if (glucose < 4.0 || glucose > 11.0) {
      findings.push({ parameter: 'Glucose', category: 2, color: 'Yellow', reason: `Glucose ${glucose} mmol/L — abnormal` });
    } else {
      findings.push({ parameter: 'Glucose', category: 3, color: 'Green', reason: `Glucose ${glucose} mmol/L is normal` });
    }
  }

  // Overall category = worst (lowest number) across all findings
  const overallCategory = findings.length > 0
    ? Math.min(...findings.map(f => f.category))
    : 3;

  return {
    category: overallCategory,
    color: COLOR_MAP[overallCategory],
    findings,
    criticalFindings: findings.filter(f => f.category === 1),
    warningFindings: findings.filter(f => f.category === 2),
    timestamp: new Date()
  };
}

module.exports = { classifyTriage };
