import { useState, useEffect, useRef, useMemo } from 'react';
import { getPatients, updatePatient, downloadVisitReport, downloadPatientVisitReport, recordQueueOverride } from '../services/api';
import {
  LayoutDashboard, Clock, Activity, Users, AlertCircle, MapPin,
  LogOut, User, Stethoscope, Moon, Sun, QrCode, FileDown, Loader2,
  Download, Printer, X
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import VitalsFormModal from './VitalsFormModal';
import TreatmentFormModal from './TreatmentFormModal';
import QRScanner from './QRScanner';
import careFlowAILogo from '../assets/CareFlowAI-Logo.png';

function formatDate(dateVal) {
  if (!dateVal) return '—';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(dateVal) {
  if (!dateVal) return '—';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function computeAge(dob) {
  if (!dob) return '—';
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function getTriageBadgeColor(category) {
  const colors = {
    1: 'bg-red-100 text-red-800 border-red-300',
    2: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    3: 'bg-green-100 text-green-800 border-green-300',
  };
  return colors[category] || 'bg-gray-100 text-gray-800 border-gray-300';
}

function getTriageLabel(category) {
  const labels = {
    1: 'Cat 1 — Critical',
    2: 'Cat 2 — Semi-Critical',
    3: 'Cat 3 — Non-Critical',
  };
  return labels[category] || 'Not triaged';
}

function getStatusColor(status) {
  const colors = {
    Registered: 'bg-purple-100 text-purple-800',
    'Vitals Taken': 'bg-indigo-100 text-indigo-800',
    Triaged: 'bg-orange-100 text-orange-800',
    'In Treatment': 'bg-blue-100 text-blue-800',
    Discharged: 'bg-green-100 text-green-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

function PatientCard({
  patient,
  showActions,
  onTakeVitals,
  onStartTreatment,
  onCompleteTreatment,
  onDownloadPdf,
  onShowQr,
  downloadingId
}) {
  return (
    <div className="bg-white rounded-2xl shadow hover:shadow-md transition-shadow border border-slate-100">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-gray-800 leading-tight">{patient.name}</h3>
            <div className="flex items-center gap-2 mt-0.5 text-xs font-mono">
              <span className="text-gray-500 font-semibold">{patient.patientId}</span>
              {patient.visitId && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-blue-900 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    Visit: {patient.visitId}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {patient.queueNumber != null && (
              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-bold">
                Q{patient.queueNumber}
              </span>
            )}
            {patient.triageCategory && (
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getTriageBadgeColor(patient.triageCategory)}`}>
                Cat {patient.triageCategory}
              </span>
            )}
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(patient.status)}`}>
              {patient.status}
            </span>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
          <div>
            <span className="text-gray-400">Visit Date</span>
            <span className="ml-2 font-medium text-gray-700">{formatDate(patient.arrivalTime)}</span>
          </div>
          <div>
            <span className="text-gray-400">Arrival Time</span>
            <span className="ml-2 font-medium text-gray-700">{formatTime(patient.arrivalTime)}</span>
          </div>
          <div>
            <span className="text-gray-400">Age</span>
            <span className="ml-2 font-medium text-gray-700">{computeAge(patient.dateOfBirth)} yrs</span>
          </div>
          <div>
            <span className="text-gray-400">Phone</span>
            <span className="ml-2 font-medium text-gray-700">{patient.contactNumber || '—'}</span>
          </div>
          {patient.assignedLocation && (
            <div className="flex items-center gap-1 col-span-2">
              <MapPin size={11} className="text-blue-500 flex-shrink-0" />
              <span className="font-medium text-blue-700">{patient.assignedLocation}</span>
            </div>
          )}
        </div>

        {/* Chief Complaint / Reason for Visit */}
        <div className="bg-gray-50 rounded-xl px-3 py-2 mb-3">
          <p className="text-xs text-gray-400 mb-0.5">Chief Complaint / Reason for Visit</p>
          <p className="text-xs font-medium text-gray-700">{patient.chiefComplaint || '—'}</p>
        </div>

        {/* Triage details */}
        {patient.triageCategory && (
          <div className="mb-3">
            <p className="text-xs font-medium text-gray-700">{getTriageLabel(patient.triageCategory)}</p>
          </div>
        )}

        {/* Vitals */}
        {patient.vitalSigns?.heartRate && (
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {[
              { label: 'SpO₂',  value: patient.vitalSigns.spO2 != null ? `${patient.vitalSigns.spO2}%` : null },
              { label: 'HR',    value: patient.vitalSigns.heartRate != null ? `${patient.vitalSigns.heartRate} bpm` : null },
              { label: 'BP',    value: (patient.vitalSigns.systolicBP != null && patient.vitalSigns.diastolicBP != null) ? `${patient.vitalSigns.systolicBP}/${patient.vitalSigns.diastolicBP}` : null },
              { label: 'Temp',  value: patient.vitalSigns.temperature != null ? `${patient.vitalSigns.temperature}°C` : null },
              { label: 'RR',    value: patient.vitalSigns.respiratoryRate != null ? `${patient.vitalSigns.respiratoryRate}/min` : null },
              { label: 'GCS',   value: patient.vitalSigns.gcs != null ? `${patient.vitalSigns.gcs}/15` : null },
            ].filter(v => v.value !== null).map(v => (
              <div key={v.label} className="bg-blue-50 rounded-lg px-2 py-1.5 text-center">
                <p className="text-xs text-gray-400 leading-none mb-0.5">{v.label}</p>
                <p className="text-xs font-bold text-gray-800">{v.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Primary Action Button (Workflow Step) */}
        {showActions && (
          <div className="mt-1">
            {patient.status === 'Registered' && (
              <button
                onClick={() => onTakeVitals(patient)}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-xl text-sm font-semibold transition shadow-sm"
              >
                Take Vitals
              </button>
            )}
            {patient.status === 'Triaged' && (
              <button
                onClick={() => onStartTreatment(patient)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold transition shadow-sm"
              >
                Start Treatment
              </button>
            )}
            {patient.status === 'In Treatment' && (
              <button
                onClick={() => onCompleteTreatment(patient)}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-semibold transition shadow-sm"
              >
                Complete Treatment
              </button>
            )}
          </div>
        )}

        {/* ── Secondary Actions Below Patient: Download PDF & Patient QR ── */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDownloadPdf(patient)}
            disabled={downloadingId === patient._id}
            title="Download Patient Visit PDF Report"
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-900 text-xs font-semibold transition disabled:opacity-50"
          >
            {downloadingId === patient._id ? (
              <Loader2 size={13} className="animate-spin text-blue-900" />
            ) : (
              <FileDown size={14} />
            )}
            <span>{downloadingId === patient._id ? 'Generating…' : 'Download PDF'}</span>
          </button>

          <button
            type="button"
            onClick={() => onShowQr(patient)}
            title="View, Download & Print Patient QR Code"
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
          >
            <QrCode size={14} className="text-slate-600" />
            <span>Patient QR</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function PatientQrModal({ patient, onClose }) {
  const qrRef = useRef(null);
  const qrToken = patient.qrToken || patient.patientId || patient._id;
  const qrUrl = `${window.location.origin}/scan/${qrToken}`;

  const handleDownloadPng = () => {
    try {
      const svg = qrRef.current?.querySelector('svg');
      if (!svg) return;
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      canvas.width = 400;
      canvas.height = 400;
      img.onload = () => {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 400, 400);
        ctx.drawImage(img, 20, 20, 360, 360);
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `CareFlowAI-QR-${patient.patientId || 'Patient'}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      };
      img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
    } catch (err) {
      console.error('QR PNG export error:', err);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=500,height=600');
    if (!printWindow) return;
    const svgHtml = qrRef.current?.innerHTML || '';
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Patient QR Card - ${patient.name}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; padding: 30px; }
            .card { border: 2px solid #1C3D6E; border-radius: 16px; padding: 24px; max-width: 320px; margin: 0 auto; }
            h2 { margin: 0 0 4px; color: #1C3D6E; font-size: 18px; }
            .subtitle { font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 16px; letter-spacing: 1px; }
            .patient-name { font-size: 18px; font-weight: bold; margin-top: 14px; color: #0f172a; }
            .patient-id { font-family: monospace; font-size: 14px; color: #1e40af; font-weight: bold; margin-top: 4px; }
            .info { font-size: 12px; color: #475569; margin-top: 8px; }
            .footer { font-size: 10px; color: #94a3b8; margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>CAREFLOW HOSPITAL</h2>
            <div class="subtitle">Emergency Identification Card</div>
            <div>${svgHtml}</div>
            <div class="patient-name">${patient.name}</div>
            <div class="patient-id">ID: ${patient.patientId}</div>
            <div class="info">Permanent identification code for all hospital visits</div>
            <div class="footer">Scan to retrieve medical file · CareFlowAI</div>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#1C3D6E] text-white">
          <div className="flex items-center gap-2">
            <QrCode size={18} />
            <h3 className="text-sm font-bold tracking-wide">Patient QR Code</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 text-center">
          <h4 className="text-lg font-bold text-gray-800">{patient.name}</h4>
          <p className="text-xs font-mono font-semibold text-blue-900 mt-0.5">
            Patient ID: {patient.patientId}
          </p>

          <div
            ref={qrRef}
            className="my-5 inline-block rounded-2xl border-2 border-slate-200 bg-white p-3 shadow-inner"
          >
            <QRCodeSVG
              value={qrUrl}
              size={180}
              level="H"
              includeMargin={true}
            />
          </div>

          <p className="text-xs text-slate-500 mb-5">
            Permanent identification QR. Works across all visits.
          </p>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleDownloadPng}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
            >
              <Download size={14} />
              <span>Download PNG</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-blue-900/30 bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-semibold transition"
            >
              <Printer size={14} />
              <span>Print Card</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QueueOverrideModal({
  selectedPatient,
  earlierPatient,
  onConfirm,
  onClose,
  isSubmitting
}) {
  const [selectedReason, setSelectedReason] = useState('');
  const [otherText, setOtherText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const REASONS = [
    'Serious patient condition',
    'Emergency symptoms',
    'Abnormal vital signs',
    'Clinician judgment',
    'Other'
  ];

  const handleConfirm = () => {
    if (!selectedReason) {
      setErrorMsg('Please select a mandatory reason to proceed.');
      return;
    }
    if (selectedReason === 'Other' && !otherText.trim()) {
      setErrorMsg('Please specify the clinical reason.');
      return;
    }
    setErrorMsg('');
    onConfirm({
      reason: selectedReason,
      notes: selectedReason === 'Other' ? otherText.trim() : ''
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-amber-500 text-white">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            <h3 className="text-sm font-bold tracking-wide">Queue Out-of-Order Selection</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1 text-white/80 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {/* Out of order notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-950 leading-relaxed">
            <p className="font-semibold text-amber-900 mb-1">Earlier patient is still waiting in queue:</p>
            <p className="text-gray-700">
              <span className="font-bold text-gray-900">{earlierPatient.name}</span>{' '}
              <span className="font-mono text-gray-500">({earlierPatient.patientId || 'ID'}{earlierPatient.queueNumber ? ` · Q${earlierPatient.queueNumber}` : ''})</span> is next in queue order.
            </p>
            <p className="text-gray-700 mt-1">
              You selected <span className="font-bold text-gray-900">{selectedPatient.name}</span>{' '}
              <span className="font-mono text-gray-500">({selectedPatient.patientId || 'ID'}{selectedPatient.queueNumber ? ` · Q${selectedPatient.queueNumber}` : ''})</span>.
            </p>
          </div>

          <p className="text-xs font-bold text-gray-700 mb-2">
            Select mandatory reason for queue override:
          </p>

          {/* Radio choices */}
          <div className="space-y-2 mb-3">
            {REASONS.map((r) => (
              <label
                key={r}
                className={`flex items-center gap-3 p-2.5 rounded-xl border text-xs font-medium cursor-pointer transition ${
                  selectedReason === r
                    ? 'border-amber-500 bg-amber-50/70 text-amber-950 font-semibold shadow-xs'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="queueOverrideReason"
                  value={r}
                  checked={selectedReason === r}
                  onChange={() => {
                    setSelectedReason(r);
                    setErrorMsg('');
                  }}
                  className="text-amber-600 focus:ring-amber-500"
                />
                <span>{r}</span>
              </label>
            ))}
          </div>

          {/* Specific note input when Other is selected */}
          {selectedReason === 'Other' && (
            <div className="mb-3">
              <input
                type="text"
                placeholder="Enter specific clinical reason…"
                value={otherText}
                onChange={(e) => {
                  setOtherText(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                className="w-full text-xs px-3 py-2 border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                autoFocus
              />
            </div>
          )}

          {errorMsg && (
            <p className="text-xs text-red-600 font-medium mb-3">{errorMsg}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting || !selectedReason || (selectedReason === 'Other' && !otherText.trim())}
              className="flex-1 py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <span>Confirm & Take Vitals</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ label }) {
  return (
    <div className="col-span-2 bg-white rounded-2xl shadow p-14 text-center">
      <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <AlertCircle className="text-gray-400" size={26} />
      </div>
      <p className="text-gray-500 font-medium">No patients in {label}</p>
    </div>
  );
}

export default function ClinicianDashboard() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [overviewSort, setOverviewSort] = useState('arrival_desc');
  const [vitalsModalPatient, setVitalsModalPatient] = useState(null);
  const [queueOverrideState, setQueueOverrideState] = useState(null);
  const [treatmentModalPatient, setTreatmentModalPatient] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [qrModalPatient, setQrModalPatient] = useState(null);
  const [downloadingId, setDownloadingId] = useState('');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('medivision-dark') === 'true');

  useEffect(() => {
    fetchPatients();
    const interval = setInterval(fetchPatients, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem('medivision-dark', darkMode);
  }, [darkMode]);

  const fetchPatients = async () => {
    try {
      const response = await getPatients();
      setPatients(response.data);
    } catch (error) {
      console.error('Error fetching patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartTreatment = async (patient) => {
    const docId = patient.patientDocId || patient._id;
    setTreatmentModalPatient(patient);
    try {
      await updatePatient(docId, {
        status: 'In Treatment',
        visitId: patient.visitId
      });
      await fetchPatients();
    } catch (error) {
      console.error('Error starting treatment:', error);
    }
  };

  const handleDownloadPdf = async (patient) => {
    const docId = patient.patientDocId || patient._id;
    const visitId = patient.visitId;
    if (!docId) return;
    setDownloadingId(patient._id);
    try {
      const res = visitId
        ? await downloadPatientVisitReport(docId, visitId)
        : await downloadVisitReport(docId);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `visit-report-${patient.patientId || 'patient'}-${visitId || 'current'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF error:', err);
      alert('Failed to generate visit PDF report. Please try again.');
    } finally {
      setDownloadingId('');
    }
  };

  const handleTakeVitalsClick = (patient) => {
    const nextPatient = waitingVisits[0];
    if (!nextPatient || nextPatient._id === patient._id) {
      setVitalsModalPatient(patient);
    } else {
      setQueueOverrideState({
        selectedPatient: patient,
        earlierPatient: nextPatient,
        isSubmitting: false
      });
    }
  };

  const handleConfirmQueueOverride = async ({ reason, notes }) => {
    if (!queueOverrideState?.selectedPatient) return;
    const patientToOpen = queueOverrideState.selectedPatient;
    const docId = patientToOpen.patientDocId || patientToOpen._id;
    setQueueOverrideState(prev => ({ ...prev, isSubmitting: true }));
    try {
      await recordQueueOverride(docId, {
        reason,
        notes,
        visitId: patientToOpen.visitId
      });
      await fetchPatients();
      setQueueOverrideState(null);
      setVitalsModalPatient(patientToOpen);
    } catch (err) {
      console.error('Queue override error:', err);
      alert(err.response?.data?.message || 'Failed to record queue override. Please try again.');
      setQueueOverrideState(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  // Multiple visits by same patient: flatten into separate visit cards
  const allVisits = useMemo(() => {
    const list = [];
    const seenVisitIds = new Set();

    patients.forEach((p) => {
      // 1. Current Active Visit
      if (p.currentVisitId) {
        seenVisitIds.add(`${p._id}_${p.currentVisitId}`);
        list.push({
          ...p,
          _id: `${p._id}_${p.currentVisitId}`,
          patientDocId: p._id,
          patientId: p.patientId,
          name: p.name,
          dateOfBirth: p.dateOfBirth,
          contactNumber: p.contactNumber,
          gender: p.gender,
          qrToken: p.qrToken,
          assignedLocation: p.assignedLocation,
          assignedDoctor: p.assignedDoctor,
          visitId: p.currentVisitId,
          queueNumber: p.queueNumber,
          chiefComplaint: p.chiefComplaint,
          symptoms: p.symptoms,
          arrivalTime: p.arrivalTime,
          status: p.status,
          vitalSigns: p.vitalSigns,
          triageCategory: p.triageCategory,
          triageColor: p.triageColor,
          treatment: p.treatment,
          statusHistory: p.statusHistory,
          isCurrentVisit: true,
        });
      } else if (!p.visits || p.visits.length === 0) {
        list.push({
          ...p,
          _id: p._id,
          patientDocId: p._id,
          visitId: p.patientId || p._id,
          isCurrentVisit: true,
        });
      }

      // 2. Separate previous visits for the same patient
      if (Array.isArray(p.visits)) {
        p.visits.forEach((v) => {
          if (!v.visitId) return;
          const key = `${p._id}_${v.visitId}`;
          if (seenVisitIds.has(key)) return;
          seenVisitIds.add(key);

          list.push({
            _id: key,
            patientDocId: p._id,
            patientId: p.patientId,
            name: p.name,
            dateOfBirth: p.dateOfBirth,
            contactNumber: p.contactNumber,
            gender: p.gender,
            qrToken: p.qrToken,
            assignedLocation: v.assignedLocation || p.assignedLocation,
            assignedDoctor: v.assignedDoctor || p.assignedDoctor,
            visitId: v.visitId,
            queueNumber: v.queueNumber,
            chiefComplaint: v.chiefComplaint,
            symptoms: v.symptoms,
            arrivalTime: v.arrivalTime,
            status: v.status,
            vitalSigns: v.vitalSigns,
            triageCategory: v.triageCategory,
            triageColor: v.triageColor,
            treatment: v.treatment,
            statusHistory: v.statusHistory,
            queueOverride: v.queueOverride,
            isCurrentVisit: false,
          });
        });
      }
    });

    return list;
  }, [patients]);

  const waitingVisits = useMemo(() => {
    return [...allVisits.filter(p => p.status === 'Registered')].sort((a, b) => {
      const qA = a.queueNumber != null ? Number(a.queueNumber) : Infinity;
      const qB = b.queueNumber != null ? Number(b.queueNumber) : Infinity;
      if (qA !== qB) return qA - qB;
      return new Date(a.arrivalTime || 0) - new Date(b.arrivalTime || 0);
    });
  }, [allVisits]);

  const triagedVisits = useMemo(() => {
    return allVisits.filter(p => p.status === 'Triaged');
  }, [allVisits]);

  const inTreatmentVisits = useMemo(() => {
    return allVisits.filter(p => p.status === 'In Treatment');
  }, [allVisits]);

  const overviewVisits = useMemo(() => {
    const base = allVisits.filter(p => p.status !== 'Discharged');
    switch (overviewSort) {
      case 'arrival_asc':   return [...base].sort((a, b) => new Date(a.arrivalTime) - new Date(b.arrivalTime));
      case 'name_asc':      return [...base].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      case 'name_desc':     return [...base].sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      case 'triage_asc':    return [...base].sort((a, b) => (a.triageCategory ?? 99) - (b.triageCategory ?? 99));
      case 'status':        return [...base].sort((a, b) => (a.status || '').localeCompare(b.status || ''));
      case 'arrival_desc':
      default:              return [...base].sort((a, b) => new Date(b.arrivalTime) - new Date(a.arrivalTime));
    }
  }, [allVisits, overviewSort]);

  const doctorName = (() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      const name = u?.name || u?.username || 'Clinician';
      return name.startsWith('Dr.') ? name : `Dr. ${name}`;
    } catch { return 'Clinician'; }
  })();

  const navItems = [
    { key: 'overview',   label: 'Overview',   icon: <LayoutDashboard size={20} /> },
    { key: 'waiting',    label: 'Waiting',     icon: <Clock size={20} />,       count: waitingVisits.length },
    { key: 'triaged',    label: 'Triaged',     icon: <Activity size={20} />,    count: triagedVisits.length },
    { key: 'treatment',  label: 'Treatment',   icon: <Stethoscope size={20} />, count: inTreatmentVisits.length },
  ];

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'dark-mode bg-gray-900' : 'bg-[#f0f4f8]'}`}>
        <div className="text-center">
          <Activity className="animate-spin mx-auto mb-4 text-blue-600" size={48} />
          <p className="text-gray-600">Loading patients...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark-mode bg-gray-900' : 'bg-[#f0f4f8]'}`}>

      {/* ── Sidebar ── */}
      <aside className="w-32 flex-shrink-0 flex flex-col items-center py-6 gap-3 min-h-screen" style={{ backgroundColor: '#1C3D6E' }}>
        <div className="flex flex-col items-center mb-5">
          <img src={careFlowAILogo} alt="CareFlowAI Logo" className="w-20 h-20 rounded-2xl object-cover shadow" />
        </div>
        {navItems.map(item => (
          <button
            key={item.key}
            onClick={() => setActiveTab(item.key)}
            className={`relative flex flex-col items-center gap-1 px-3 py-3 rounded-full w-28 text-white transition-all duration-150 ${
              activeTab === item.key ? 'bg-white/25 font-semibold shadow-inner' : 'hover:bg-white/10'
            }`}
          >
            {item.icon}
            <span className="text-xs text-center leading-tight">{item.label}</span>
            {item.count > 0 && (
              <span className="absolute top-1 right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {item.count}
              </span>
            )}
          </button>
        ))}
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* ── Navbar ── */}
        <header className="flex items-center justify-between px-6 py-3 shadow-md" style={{ backgroundColor: '#1C3D6E' }}>
          <h1 className="text-white font-semibold text-base tracking-wide">Smart Patient Flow Platform</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowScanner(true)}
              title="Scan Patient QR Code"
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 rounded-full px-4 py-2 text-white text-sm font-medium transition shadow-sm select-none"
            >
              <QrCode size={16} />
              <span>Scan Patient QR</span>
            </button>
            <button
              onClick={() => setDarkMode(prev => !prev)}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="flex items-center justify-center bg-white/15 hover:bg-white/25 rounded-full w-9 h-9 text-white transition"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="flex items-center gap-2 bg-white/15 rounded-full px-4 py-2 text-white text-sm select-none">
              <User size={15} />
              <span>{doctorName}</span>
            </div>
            <button
              onClick={() => { localStorage.clear(); window.location.href = '/'; }}
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 rounded-full px-4 py-2 text-white text-sm transition"
            >
              <LogOut size={15} />
              <span>Log Out</span>
            </button>
          </div>
        </header>

        {/* ── Tab content ── */}
        <main className="flex-1 p-6 overflow-auto">

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
                <button onClick={() => setActiveTab('waiting')} className="bg-white rounded-2xl shadow p-5 text-left hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Waiting for Vitals</p>
                      <p className="text-3xl font-bold text-yellow-600">{waitingVisits.length}</p>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-2"><Clock className="text-yellow-500" size={36} /></div>
                  </div>
                </button>
                <button onClick={() => setActiveTab('triaged')} className="bg-white rounded-2xl shadow p-5 text-left hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Triaged</p>
                      <p className="text-3xl font-bold text-purple-600">{triagedVisits.length}</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-2"><Activity className="text-purple-500" size={36} /></div>
                  </div>
                </button>
                <button onClick={() => setActiveTab('treatment')} className="bg-white rounded-2xl shadow p-5 text-left hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">In Treatment</p>
                      <p className="text-3xl font-bold text-blue-600">{inTreatmentVisits.length}</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-2"><Stethoscope className="text-blue-500" size={36} /></div>
                  </div>
                </button>
              </div>

              {/* Patient cards — all non-discharged, no actions */}
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-gray-700">
                  All Active Patients
                  <span className="ml-2 text-sm font-normal text-gray-400">({overviewVisits.length})</span>
                </h2>
                <select
                  value={overviewSort}
                  onChange={e => setOverviewSort(e.target.value)}
                  className="text-xs border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer shadow-sm"
                >
                  <option value="arrival_desc">Latest Arrival First</option>
                  <option value="arrival_asc">Earliest Arrival First</option>
                  <option value="triage_asc">Triage Severity (Critical First)</option>
                  <option value="status">Status (A–Z)</option>
                  <option value="name_asc">Name (A–Z)</option>
                  <option value="name_desc">Name (Z–A)</option>
                </select>
              </div>
              {overviewVisits.length === 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <EmptyState label="queue" />
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {overviewVisits.map(patient => (
                    <PatientCard
                      key={patient._id}
                      patient={patient}
                      showActions={false}
                      onDownloadPdf={handleDownloadPdf}
                      onShowQr={setQrModalPatient}
                      downloadingId={downloadingId}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── WAITING FOR VITALS ── */}
          {activeTab === 'waiting' && (
            <>
              <h2 className="text-base font-bold text-gray-700 mb-4">Waiting for Vitals <span className="text-yellow-600">({waitingVisits.length})</span></h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {waitingVisits.length === 0
                  ? <EmptyState label="waiting queue" />
                  : waitingVisits.map(patient => (
                      <PatientCard
                        key={patient._id}
                        patient={patient}
                        showActions={true}
                        onTakeVitals={handleTakeVitalsClick}
                        onDownloadPdf={handleDownloadPdf}
                        onShowQr={setQrModalPatient}
                        downloadingId={downloadingId}
                      />
                    ))
                }
              </div>
            </>
          )}

          {/* ── TRIAGED ── */}
          {activeTab === 'triaged' && (
            <>
              <h2 className="text-base font-bold text-gray-700 mb-4">Triaged <span className="text-purple-600">({triagedVisits.length})</span></h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {triagedVisits.length === 0
                  ? <EmptyState label="triaged queue" />
                  : triagedVisits.map(patient => (
                      <PatientCard
                        key={patient._id}
                        patient={patient}
                        showActions={true}
                        onStartTreatment={handleStartTreatment}
                        onDownloadPdf={handleDownloadPdf}
                        onShowQr={setQrModalPatient}
                        downloadingId={downloadingId}
                      />
                    ))
                }
              </div>
            </>
          )}

          {/* ── IN TREATMENT ── */}
          {activeTab === 'treatment' && (
            <>
              <h2 className="text-base font-bold text-gray-700 mb-4">In Treatment <span className="text-blue-600">({inTreatmentVisits.length})</span></h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {inTreatmentVisits.length === 0
                  ? <EmptyState label="treatment" />
                  : inTreatmentVisits.map(patient => (
                      <PatientCard
                        key={patient._id}
                        patient={patient}
                        showActions={true}
                        onCompleteTreatment={setTreatmentModalPatient}
                        onDownloadPdf={handleDownloadPdf}
                        onShowQr={setQrModalPatient}
                        downloadingId={downloadingId}
                      />
                    ))
                }
              </div>
            </>
          )}

        </main>
      </div>

      {/* QR Scanner Camera Modal */}
      {showScanner && (
        <QRScanner
          onScan={(token) => {
            setShowScanner(false);
            window.location.href = `/scan/${token}`;
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Out-of-Order Queue Selection Confirmation Modal */}
      {queueOverrideState && (
        <QueueOverrideModal
          selectedPatient={queueOverrideState.selectedPatient}
          earlierPatient={queueOverrideState.earlierPatient}
          isSubmitting={queueOverrideState.isSubmitting}
          onConfirm={handleConfirmQueueOverride}
          onClose={() => setQueueOverrideState(null)}
        />
      )}

      {/* Patient Permanent QR View & Print Modal */}
      {qrModalPatient && (
        <PatientQrModal
          patient={qrModalPatient}
          onClose={() => setQrModalPatient(null)}
        />
      )}

      {/* Vitals Modal */}
      {vitalsModalPatient && (
        <VitalsFormModal
          patient={vitalsModalPatient}
          onClose={() => setVitalsModalPatient(null)}
          onVitalsSubmitted={() => { setVitalsModalPatient(null); fetchPatients(); }}
        />
      )}

      {/* Treatment Modal */}
      {treatmentModalPatient && (
        <TreatmentFormModal
          patient={treatmentModalPatient}
          onClose={() => setTreatmentModalPatient(null)}
          onTreatmentCompleted={() => { setTreatmentModalPatient(null); fetchPatients(); }}
        />
      )}
    </div>
  );
}
