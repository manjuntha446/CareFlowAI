import { useState } from 'react';
import { submitVitals, confirmTriage, predictAI } from '../services/api';
import { Activity, CheckCircle, AlertTriangle, XCircle, X, Brain } from 'lucide-react';

export default function VitalsFormModal({ patient, onClose, onVitalsSubmitted }) {
  const [vitals, setVitals] = useState({
    spO2: '',
    respiratoryRate: '',
    heartRate: '',
    systolicBP: '',
    diastolicBP: '',
    gcs: '15',
    painScore: '',
    temperature: '',
    glucose: ''
  });
  const [step, setStep] = useState('vitals'); // 'vitals' | 'recommendation'
  const [triageResult, setTriageResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');

  const handleVitalChange = (e) => {
    const { name, value } = e.target;
    setVitals({ ...vitals, [name]: value });
  };

  // Step 1: Submit vitals and get recommendations
  const handleSubmitVitals = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Convert string values to numbers, omit empty fields
      const vitalsData = {};
      Object.entries(vitals).forEach(([key, value]) => {
        if (value !== '' && value !== null) {
          vitalsData[key] = Number(value);
        }
      });

      // Record who captured the vitals (used by the status audit trail).
      const storedUser = localStorage.getItem('user');
      const currentUser = storedUser ? JSON.parse(storedUser) : {};
      const performedBy = currentUser.name || currentUser.username || 'Unknown';

      const targetDocId = patient.patientDocId || patient._id;
      const response = await submitVitals(targetDocId, {
        ...vitalsData,
        performedBy,
        visitId: patient.visitId
      });
      setTriageResult(response.data.triageResult);
      setStep('recommendation');

      // Fire AI prediction in background (non-blocking)
      setAiLoading(true);
      setAiError('');
      try {
        const aiResponse = await predictAI(patient.patientDocId || patient._id, vitalsData);
        if (aiResponse.data.aiPrediction) {
          setAiResult(aiResponse.data);
        } else {
          setAiError(aiResponse.data.error || 'AI service unavailable');
        }
      } catch (aiErr) {
        setAiError('AI prediction unavailable');
      } finally {
        setAiLoading(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit vitals');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Clinician chooses a category — confirm or override the suggestion
  const handleChooseCategory = (category) => {
    const suggested = triageResult?.category ?? null;
    setSelectedCategory(category);
    setError('');

    // Confirming the suggestion needs no reason
    if (suggested == null || category === suggested) {
      handleConfirmCategory(category, false, '');
      return;
    }

    // Overriding requires a reason before submitting
    setOverrideReason('');
  };

  const handleConfirmCategory = async (category, isOverride, reason) => {
    setLoading(true);
    setError('');

    if (isOverride && !reason.trim()) {
      setError('Please provide a reason for overriding the suggested triage category.');
      setLoading(false);
      return;
    }

    try {
      const storedUser = localStorage.getItem('user');
      const user = storedUser ? JSON.parse(storedUser) : {};

      const targetDocId = patient.patientDocId || patient._id;
      await confirmTriage(targetDocId, {
        confirmedCategory: category,
        suggestedCategory: triageResult?.category ?? null,
        overrideReason: isOverride ? reason.trim() : undefined,
        triagedBy: user.name || user.username || 'Unknown',
        visitId: patient.visitId
      });
      onVitalsSubmitted();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to confirm triage');
    } finally {
      setLoading(false);
    }
  };

  const getFindingIcon = (category) => {
    if (category === 1) return <XCircle size={16} className="text-red-500 flex-shrink-0" />;
    if (category === 2) return <AlertTriangle size={16} className="text-yellow-600 flex-shrink-0" />;
    return <CheckCircle size={16} className="text-green-500 flex-shrink-0" />;
  };

  const suggestedCategory = triageResult?.category ?? null;
  const suggestedColor = { 1: 'Red', 2: 'Yellow', 3: 'Green' }[suggestedCategory] || null;
  const isOverriding =
    selectedCategory != null && selectedCategory !== suggestedCategory;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              {step === 'vitals' ? 'Record Vital Signs' : 'Triage Assessment'}
            </h2>
            <div className="text-sm text-gray-500 mt-1 flex flex-wrap items-center gap-1.5">
              <span>Patient: <strong className="text-gray-800">{patient.name}</strong></span>
              <span>•</span>
              <span className="font-mono text-xs">ID: {patient.patientId}</span>
              {patient.visitId && (
                <>
                  <span>•</span>
                  <span className="font-mono text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    Visit: {patient.visitId}
                  </span>
                </>
              )}
            </div>
          </div>
          {step === 'vitals' && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <X size={20} className="text-gray-500" />
            </button>
          )}
        </div>

        <div className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
              <XCircle size={18} />
              {error}
            </div>
          )}

          {/* STEP 1: Vitals Input */}
          {step === 'vitals' && (
            <form onSubmit={handleSubmitVitals} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Chief Complaint:</strong> {patient.chiefComplaint}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SpO2 (%) *</label>
                  <input
                    type="number"
                    name="spO2"
                    required
                    min="0"
                    max="100"
                    value={vitals.spO2}
                    onChange={handleVitalChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="98"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Respiratory Rate (/min) *</label>
                  <input
                    type="number"
                    name="respiratoryRate"
                    required
                    min="0"
                    max="60"
                    value={vitals.respiratoryRate}
                    onChange={handleVitalChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="16"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Heart Rate (bpm) *</label>
                  <input
                    type="number"
                    name="heartRate"
                    required
                    min="0"
                    max="300"
                    value={vitals.heartRate}
                    onChange={handleVitalChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="72"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Systolic BP (mmHg) *</label>
                  <input
                    type="number"
                    name="systolicBP"
                    required
                    min="0"
                    max="300"
                    value={vitals.systolicBP}
                    onChange={handleVitalChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="120"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Diastolic BP (mmHg) *</label>
                  <input
                    type="number"
                    name="diastolicBP"
                    required
                    min="0"
                    max="200"
                    value={vitals.diastolicBP}
                    onChange={handleVitalChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="80"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">GCS (3-15) *</label>
                  <input
                    type="number"
                    name="gcs"
                    required
                    min="3"
                    max="15"
                    value={vitals.gcs}
                    onChange={handleVitalChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="15"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pain Score (0-10) *</label>
                  <input
                    type="number"
                    name="painScore"
                    required
                    min="0"
                    max="10"
                    value={vitals.painScore}
                    onChange={handleVitalChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temperature (°C) *</label>
                  <input
                    type="number"
                    name="temperature"
                    required
                    step="0.1"
                    min="30"
                    max="45"
                    value={vitals.temperature}
                    onChange={handleVitalChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="36.5"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Glucose (mmol/L) — Optional</label>
                  <input
                    type="number"
                    name="glucose"
                    step="0.1"
                    min="0"
                    max="50"
                    value={vitals.glucose}
                    onChange={handleVitalChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="5.5"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed mt-4"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Activity className="animate-spin" size={18} />
                    Analysing Vitals...
                  </span>
                ) : (
                  'Submit Vitals & Get AI Recommendation'
                )}
              </button>
            </form>
          )}

          {/* STEP 2: Triage Assessment */}
          {step === 'recommendation' && triageResult && (
            <div className="space-y-4">

              {/* Vital Signs Analysis */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={16} className="text-blue-600" />
                  <h3 className="text-sm font-semibold text-gray-700">Vital Signs Analysis</h3>
                </div>
                <div className="space-y-2">
                  {triageResult.findings.map((finding, index) => (
                    <div key={index} className="flex items-start gap-2 text-sm">
                      {getFindingIcon(finding.category)}
                      <span className="text-gray-700">
                        <strong>{finding.parameter}:</strong> {finding.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Critical findings highlight */}
              {triageResult.criticalFindings.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-red-800 mb-1">
                    Critical Findings ({triageResult.criticalFindings.length})
                  </p>
                  {triageResult.criticalFindings.map((f, i) => (
                    <p key={i} className="text-sm text-red-700">{f.reason}</p>
                  ))}
                </div>
              )}

              {/* AI Risk Assessment */}
              {aiLoading && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center gap-2 text-blue-700">
                    <Activity className="animate-spin" size={18} />
                    <span className="text-sm font-medium">Running AI risk assessment...</span>
                  </div>
                </div>
              )}

              {aiResult && aiResult.aiPrediction && (
                <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain size={16} className="text-purple-600" />
                    <h3 className="text-sm font-semibold text-gray-700">AI Risk Assessment</h3>
                  </div>

                  {/* Probability Bars */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-600 w-24">Critical</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${aiResult.aiPrediction.red_risk}%`, backgroundColor: '#EF4444' }}
                        />
                      </div>
                      <span className="text-xs font-bold text-gray-700 w-12 text-right">
                        {aiResult.aiPrediction.red_risk}%
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-600 w-24">Semi-Critical</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${aiResult.aiPrediction.yellow_risk}%`, backgroundColor: '#EAB308' }}
                        />
                      </div>
                      <span className="text-xs font-bold text-gray-700 w-12 text-right">
                        {aiResult.aiPrediction.yellow_risk}%
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-600 w-24">Non-Critical</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${aiResult.aiPrediction.green_risk}%`, backgroundColor: '#22C55E' }}
                        />
                      </div>
                      <span className="text-xs font-bold text-gray-700 w-12 text-right">
                        {aiResult.aiPrediction.green_risk}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {aiError && !aiLoading && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">{aiError}</p>
                </div>
              )}

              {/* Suggested Triage */}
              <div className={`border rounded-xl p-4 flex items-center justify-between ${
                suggestedColor === 'Red' ? 'bg-red-50 border-red-200'
                : suggestedColor === 'Yellow' ? 'bg-yellow-50 border-yellow-200'
                : 'bg-gray-50 border-gray-200'
              }`}>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Suggested Triage Category
                  </p>
                  <p className="text-lg font-bold text-gray-800">
                    {suggestedCategory ? `Category ${suggestedCategory} — ${suggestedColor}` : 'No suggestion available'}
                  </p>
                </div>
                <Brain size={22} className="text-gray-500" />
              </div>

              {/* Clinician Decision */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">
                  Confirm or override the suggestion
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleChooseCategory(1)}
                    disabled={loading}
                    className="flex-1 bg-red-500 text-white py-3 rounded-lg font-semibold hover:bg-red-600 transition disabled:opacity-50"
                  >
                    {loading ? '...' : 'Cat 1 - Critical'}
                  </button>
                  <button
                    onClick={() => handleChooseCategory(2)}
                    disabled={loading}
                    className="flex-1 bg-yellow-400 text-yellow-900 py-3 rounded-lg font-semibold hover:bg-yellow-500 transition disabled:opacity-50"
                  >
                    {loading ? '...' : 'Cat 2 - Semi-Critical'}
                  </button>
                  <button
                    onClick={() => handleChooseCategory(3)}
                    disabled={loading}
                    className="flex-1 bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition disabled:opacity-50"
                  >
                    {loading ? '...' : 'Cat 3 - Non-Critical'}
                  </button>
                </div>

                {isOverriding && (
                  <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <p className="text-sm font-semibold text-orange-800 mb-2">
                      Override reason (required)
                    </p>
                    <textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      rows="2"
                      className="w-full px-3 py-2 border border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-200 focus:border-transparent"
                      placeholder="e.g. Clinical judgement suggests higher acuity despite stable vitals"
                    />
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleConfirmCategory(selectedCategory, true, overrideReason)}
                        disabled={loading || !overrideReason.trim()}
                        className="flex-1 bg-orange-500 text-white py-2 rounded-lg font-semibold hover:bg-orange-600 transition disabled:opacity-50"
                      >
                        {loading ? 'Saving...' : 'Confirm Override'}
                      </button>
                      <button
                        onClick={() => { setSelectedCategory(null); setOverrideReason(''); }}
                        className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
