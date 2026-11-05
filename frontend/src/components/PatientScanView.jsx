import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getPatientByQr,
  getPatientHistory,
  updatePatient,
  downloadVisitReport,
  downloadDischargeSummary
} from '../services/api';
import {
  Activity, HeartPulse, Stethoscope, ClipboardList, FileText, FileDown,
  AlertCircle, ArrowLeft, LogOut, QrCode, CheckCircle2, PlayCircle
} from 'lucide-react';
import VitalsFormModal from './VitalsFormModal';
import TreatmentFormModal from './TreatmentFormModal';

export default function PatientScanView() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [patient, setPatient] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [showTreatmentModal, setShowTreatmentModal] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const patientRes = await getPatientByQr(token);
      const foundPatient = patientRes.data.patient;
      const historyRes = await getPatientHistory(foundPatient._id);

      setPatient(foundPatient);
      setHistory(historyRes.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load patient details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const handleStartTreatment = async () => {
    if (!patient?._id) return;
    try {
      await updatePatient(patient._id, { status: 'In Treatment' });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start treatment');
    }
  };

  const downloadPdf = async (kind) => {
    if (!patient?._id) return;
    setDownloading(kind);
    setError('');
    try {
      const res = kind === 'discharge'
        ? await downloadDischargeSummary(patient._id)
        : await downloadVisitReport(patient._id);

      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kind === 'discharge' ? 'discharge-summary' : 'visit-report'}-${patient.patientId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download PDF. Please try again.');
    } finally {
      setDownloading('');
    }
  };

  const formatDate = (d) =>
    d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const dashboardPath = (() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return user?.role === 'admin' ? '/admin' : '/clinician';
    } catch {
      return '/clinician';
    }
  })();

  return (
    <div className="min-h-screen bg-[#f0f4f8]">

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 shadow-md" style={{ backgroundColor: '#1C3D6E' }}>
        <div className="flex items-center gap-3 text-white">
          <QrCode size={20} />
          <h1 className="font-semibold text-base tracking-wide">Scanned Patient Record</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(dashboardPath)}
            className="flex items-center gap-2 bg-white/15 hover:bg-white/25 rounded-full px-4 py-2 text-white text-sm transition"
          >
            <ArrowLeft size={15} />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => { localStorage.clear(); window.location.href = '/'; }}
            className="flex items-center gap-2 bg-white/15 hover:bg-white/25 rounded-full px-4 py-2 text-white text-sm transition"
          >
            <LogOut size={15} />
            <span>Log Out</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">

        {loading && (
          <div className="text-center py-20">
            <Activity className="animate-spin mx-auto mb-4 text-blue-600" size={44} />
            <p className="text-gray-500">Loading patient details...</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-2xl mb-5">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!loading && history && (
          <div className="space-y-5">

            {/* Identity banner */}
            <div className="bg-white rounded-2xl shadow p-6 border border-slate-100">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">{history.name}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Patient ID: <span className="font-mono font-semibold text-slate-700">{history.patientId}</span>
                    {history.currentVisitId && (
                      <span className="ml-3 text-xs bg-slate-100 text-slate-700 font-mono px-2 py-0.5 rounded-full">
                        Active Visit: {history.currentVisitId}
                      </span>
                    )}
                    {history.queueNumber && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                        Q{history.queueNumber}
                      </span>
                    )}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                  {history.status}
                </span>
              </div>

              {/* Action buttons */}
              <div className="mt-5 flex flex-wrap gap-2.5 pt-4 border-t border-slate-100">
                {history.status === 'Registered' && (
                  <button
                    onClick={() => setShowVitalsModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition shadow-sm"
                  >
                    <Activity size={16} /> Take Vitals
                  </button>
                )}

                {history.status === 'Triaged' && (
                  <button
                    onClick={handleStartTreatment}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition shadow-sm"
                  >
                    <PlayCircle size={16} /> Start Treatment
                  </button>
                )}

                {history.status === 'In Treatment' && (
                  <button
                    onClick={() => setShowTreatmentModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition shadow-sm"
                  >
                    <CheckCircle2 size={16} /> Complete / Update Treatment
                  </button>
                )}

                <button
                  onClick={() => downloadPdf('visit')}
                  disabled={downloading === 'visit'}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl text-sm font-medium hover:bg-blue-800 transition disabled:opacity-50"
                >
                  <FileDown size={15} /> {downloading === 'visit' ? 'Preparing…' : 'Visit Report (PDF)'}
                </button>
                <button
                  onClick={() => downloadPdf('discharge')}
                  disabled={downloading === 'discharge'}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition disabled:opacity-50"
                >
                  <FileDown size={15} /> {downloading === 'discharge' ? 'Preparing…' : 'Discharge Summary (PDF)'}
                </button>
              </div>
            </div>

            {/* Patient information */}
            <div className="bg-white rounded-2xl shadow p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <ClipboardList size={16} className="text-blue-600" /> Patient Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                <InfoRow label="IC Number" value={history.icNumber} />
                <InfoRow label="Date of Birth" value={history.dateOfBirth ? new Date(history.dateOfBirth).toLocaleDateString() : '—'} />
                <InfoRow label="Gender" value={history.gender} />
                <InfoRow label="Blood Type" value={history.bloodType} />
                <InfoRow label="Contact" value={history.contactNumber} />
                <InfoRow label="Arrival" value={formatDate(history.arrivalTime)} />
                <InfoRow label="Chief Complaint" value={history.chiefComplaint} />
                <InfoRow label="Triage Category" value={history.triageCategory ? `Cat ${history.triageCategory} (${history.triageColor})` : '—'} />
              </div>
            </div>

            {/* Latest vitals */}
            {history.vitalSigns?.heartRate && (
              <div className="bg-white rounded-2xl shadow p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <Activity size={16} className="text-purple-600" /> Latest Vitals
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { l: 'SpO₂', v: history.vitalSigns.spO2 != null ? `${history.vitalSigns.spO2}%` : null },
                    { l: 'Heart Rate', v: history.vitalSigns.heartRate != null ? `${history.vitalSigns.heartRate} bpm` : null },
                    { l: 'Blood Pressure', v: (history.vitalSigns.systolicBP != null && history.vitalSigns.diastolicBP != null) ? `${history.vitalSigns.systolicBP}/${history.vitalSigns.diastolicBP}` : null },
                    { l: 'Respiratory Rate', v: history.vitalSigns.respiratoryRate != null ? `${history.vitalSigns.respiratoryRate}/min` : null },
                    { l: 'Temperature', v: history.vitalSigns.temperature != null ? `${history.vitalSigns.temperature}°C` : null },
                    { l: 'GCS', v: history.vitalSigns.gcs != null ? `${history.vitalSigns.gcs}/15` : null }
                  ].filter(x => x.v !== null).map(x => (
                    <div key={x.l} className="bg-blue-50 rounded-lg px-3 py-2 text-center">
                      <p className="text-[11px] text-gray-400 leading-none mb-1">{x.l}</p>
                      <p className="text-sm font-bold text-gray-800">{x.v}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Triage history */}
            {history.triageHistory?.length > 0 && (
              <div className="bg-white rounded-2xl shadow p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <HeartPulse size={16} className="text-red-500" /> Triage History
                </h3>
                <div className="space-y-2">
                  {history.triageHistory.map((t, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          Category {t.category} — {t.color}
                          {t.overridden && <span className="ml-2 text-xs text-orange-600 font-semibold">(overridden)</span>}
                        </p>
                        {t.reason && <p className="text-xs text-gray-500 mt-0.5">Reason: {t.reason}</p>}
                      </div>
                      <div className="text-right">
                        {t.by && <p className="text-xs text-gray-500">{t.by}</p>}
                        <p className="text-xs text-gray-400">{formatDate(t.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Treatment */}
            {history.treatment && (
              <div className="bg-white rounded-2xl shadow p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <Stethoscope size={16} className="text-green-600" /> Treatment &amp; Disposition
                </h3>
                <InfoRow label="Provisional Diagnosis" value={history.treatment.provisionalDiagnosis} />
                <InfoRow label="Treatment Given" value={history.treatment.treatmentGiven} />
                <InfoRow label="Clinical Notes" value={history.treatment.clinicalNotes} />
                <InfoRow label="Disposition" value={history.treatment.disposition} />
                <InfoRow label="Disposition Reason" value={history.treatment.dispositionReason} />
                <InfoRow label="Treated By" value={history.treatment.treatedBy} />
              </div>
            )}

            {/* Previous visits (read-only) */}
            <div className="bg-white rounded-2xl shadow p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <ClipboardList size={16} className="text-blue-600" /> Previous Visits ({history.previousVisits?.length || 0})
              </h3>
              {history.previousVisits?.length > 0 ? (
                <div className="space-y-3">
                  {history.previousVisits.map((visit, i) => (
                    <div key={visit.visitId || i} className="bg-gray-50 rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="font-semibold text-sm text-gray-800">{visit.visitId}</span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                          {visit.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {formatDate(visit.arrivalTime)}
                        {visit.triageCategory ? ` · Cat ${visit.triageCategory} (${visit.triageColor})` : ''}
                      </p>
                      {visit.chiefComplaint && (
                        <p className="text-sm text-gray-600 mt-2">
                          <span className="text-gray-400">Complaint: </span>{visit.chiefComplaint}
                        </p>
                      )}
                      {visit.treatment?.provisionalDiagnosis && (
                        <p className="text-sm text-gray-600 mt-1">
                          <span className="text-gray-400">Diagnosis: </span>{visit.treatment.provisionalDiagnosis}
                        </p>
                      )}
                      {visit.treatment?.treatmentGiven && (
                        <p className="text-sm text-gray-600 mt-1">
                          <span className="text-gray-400">Treatment: </span>{visit.treatment.treatmentGiven}
                        </p>
                      )}
                      {visit.treatment?.disposition && (
                        <p className="text-sm text-gray-600 mt-1">
                          <span className="text-gray-400">Disposition: </span>{visit.treatment.disposition}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No previous visits on record.</p>
              )}
            </div>

            {/* Medical history */}
            <div className="bg-white rounded-2xl shadow p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <FileText size={16} className="text-amber-600" /> Recorded Medical History
              </h3>
              {history.medicalHistory?.length > 0 ? (
                <div className="space-y-3">
                  {history.medicalHistory.map((m, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg px-4 py-3">
                      <InfoRow label="Allergies" value={m.allergies} />
                      <InfoRow label="Chronic Conditions" value={m.chronicConditions} />
                      <InfoRow label="Current Medications" value={m.currentMedications} />
                      <InfoRow label="Past Surgeries" value={m.pastSurgeries} />
                      <InfoRow label="Family History" value={m.familyHistory} />
                      <InfoRow label="Notes" value={m.notes} />
                      <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
                        <span>{m.recordedBy ? `Recorded by ${m.recordedBy}` : ''}</span>
                        <span>{formatDate(m.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No recorded medical history yet.</p>
              )}
            </div>

          </div>
        )}
      </main>

      {/* Vitals Modal */}
      {showVitalsModal && history && (
        <VitalsFormModal
          patient={history}
          onClose={() => setShowVitalsModal(false)}
          onVitalsSubmitted={() => {
            setShowVitalsModal(false);
            load();
          }}
        />
      )}

      {/* Treatment Modal */}
      {showTreatmentModal && history && (
        <TreatmentFormModal
          patient={history}
          onClose={() => setShowTreatmentModal(false)}
          onTreatmentCompleted={() => {
            setShowTreatmentModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-700 text-right">{value || '—'}</span>
    </div>
  );
}
