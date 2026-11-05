import { useState } from 'react';
import { updatePatient } from '../services/api';
import { Stethoscope, X, XCircle, Loader2 } from 'lucide-react';

// Maps the recorded disposition to the clinical workflow status.
const DISPOSITION_TO_STATUS = {
  Discharge: 'Discharged',
  Admit: 'Admitted',
  Referral: 'Referred',
};

export default function TreatmentFormModal({
  patient,
  onClose,
  onTreatmentCompleted,
}) {
  const [form, setForm] = useState({
    provisionalDiagnosis: patient?.treatment?.provisionalDiagnosis || '',
    treatmentGiven: patient?.treatment?.treatmentGiven || '',
    clinicalNotes: patient?.treatment?.clinicalNotes || '',
    disposition: patient?.treatment?.disposition || '',
    dispositionReason: patient?.treatment?.dispositionReason || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.disposition) {
      setError('Please select a disposition (Discharge, Admit or Referral).');
      return;
    }

    setLoading(true);

    try {
      const storedUser = localStorage.getItem('user');
      const currentUser = storedUser ? JSON.parse(storedUser) : {};
      const performedBy =
        currentUser.name || currentUser.username || 'Clinician';

      const targetDocId = patient.patientDocId || patient._id;
      await updatePatient(targetDocId, {
        treatment: {
          provisionalDiagnosis: form.provisionalDiagnosis.trim(),
          treatmentGiven: form.treatmentGiven.trim(),
          clinicalNotes: form.clinicalNotes.trim(),
          disposition: form.disposition,
          dispositionReason: form.dispositionReason.trim(),
          treatedBy: performedBy,
        },
        status: DISPOSITION_TO_STATUS[form.disposition],
        reason: form.dispositionReason.trim() || null,
        performedBy,
        visitId: patient.visitId,
      });

      onTreatmentCompleted();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Failed to save the treatment record. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            <Stethoscope size={20} className="text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-800">
                Record Diagnosis & Treatment
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
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
              <XCircle size={18} />
              {error}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Chief Complaint:</strong> {patient.chiefComplaint || '—'}
            </p>
          </div>

          <div>
            <label className={labelClass}>Provisional Diagnosis</label>
            <input
              type="text"
              name="provisionalDiagnosis"
              value={form.provisionalDiagnosis}
              onChange={handleChange}
              className={inputClass}
              placeholder="e.g. Acute viral illness"
            />
          </div>

          <div>
            <label className={labelClass}>Treatment Given</label>
            <textarea
              name="treatmentGiven"
              value={form.treatmentGiven}
              onChange={handleChange}
              rows="2"
              className={`${inputClass} resize-none`}
              placeholder="Medication, procedures or interventions provided"
            />
          </div>

          <div>
            <label className={labelClass}>Clinical Notes</label>
            <textarea
              name="clinicalNotes"
              value={form.clinicalNotes}
              onChange={handleChange}
              rows="3"
              className={`${inputClass} resize-none`}
              placeholder="Observations, progress and follow-up instructions"
            />
          </div>

          <div>
            <label className={labelClass}>Disposition *</label>
            <select
              name="disposition"
              required
              value={form.disposition}
              onChange={handleChange}
              className={inputClass}
            >
              <option value="">Select disposition</option>
              <option value="Discharge">Discharged</option>
              <option value="Admit">Admitted</option>
              <option value="Referral">Referred</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Disposition Reason</label>
            <textarea
              name="dispositionReason"
              value={form.dispositionReason}
              onChange={handleChange}
              rows="2"
              className={`${inputClass} resize-none`}
              placeholder="Reason for the chosen disposition"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg font-semibold hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={18} className="animate-spin" /> Saving…
                </span>
              ) : (
                'Save Treatment Record'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
