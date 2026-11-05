import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';

import { getTrackingInfo, API_BASE_URL } from '../services/api';
import careFlowAILogo from '../assets/CareFlowAI-Logo.png';

import {
  Clock,
  Activity,
  CheckCircle,
  MapPin,
  AlertCircle,
  Heart,
  Loader2,
  QrCode
} from 'lucide-react';

// ============================================
// CONSTANTS
// ============================================

const POLL_INTERVAL_MS = 10000;

// The clinical workflow steps shown on the mobile journey tracker.
const JOURNEY_STEPS = [
  { label: 'Registered', status: 'Registered' },
  { label: 'Vitals Taken', status: 'Vitals Taken' },
  { label: 'Triaged', status: 'Triaged' },
  { label: 'In Treatment', status: 'In Treatment' },
  { label: 'Disposition', status: null }
];

// ============================================
// HELPERS
// ============================================

function formatDateTime(dateString) {
  if (!dateString) return '—';

  return new Date(dateString).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTime(dateString) {
  if (!dateString) return null;

  return new Date(dateString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function statusBadgeStyle(status) {
  const styles = {
    Registered: 'bg-purple-100 text-purple-700',
    'Vitals Taken': 'bg-indigo-100 text-indigo-700',
    Triaged: 'bg-orange-100 text-orange-700',
    'In Treatment': 'bg-blue-100 text-blue-700',
    Discharged: 'bg-green-100 text-green-700',
    Admitted: 'bg-blue-100 text-blue-700',
    Referred: 'bg-amber-100 text-amber-700'
  };

  return styles[status] || 'bg-gray-100 text-gray-600';
}

function journeyStepState(stepStatus, currentStatus, history) {
  // Terminal dispositions complete the final step.
  if (stepStatus === null) {
    return ['Discharged', 'Admitted', 'Referred'].includes(currentStatus)
      ? 'completed'
      : 'pending';
  }

  const reached = (history || []).some((h) => h.status === stepStatus);

  if (reached) return 'completed';

  return 'pending';
}

// ============================================
// SUB-COMPONENTS
// ============================================

function InfoRow({ label, value, icon: Icon }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-gray-500 flex items-center gap-2 text-sm">
        {Icon && <Icon size={15} className="text-blue-500" />}
        {label}
      </span>
      <span className="font-medium text-gray-800 text-sm text-right">
        {value}
      </span>
    </div>
  );
}

function Timeline({ history }) {
  if (!history || history.length === 0) {
    return (
      <p className="text-sm text-gray-500">No status updates yet.</p>
    );
  }

  // Most recent first.
  const ordered = [...history].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  return (
    <ol className="relative border-l border-gray-200 ml-2 space-y-4">
      {ordered.map((entry, index) => (
        <li key={index} className="ml-5">
          <span
            className={`absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white ${
              index === 0 ? 'bg-blue-500' : 'bg-gray-300'
            }`}
          />
          <p className="text-sm font-semibold text-gray-800">
            {entry.status}
          </p>
          <p className="text-xs text-gray-500">
            {formatDateTime(entry.timestamp)}
            {entry.changedBy ? ` • ${entry.changedBy}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}

function VitalsGrid({ vitals }) {
  if (!vitals) return null;

  const items = [
    { label: 'Heart Rate', value: vitals.heartRate, unit: 'bpm' },
    { label: 'SpO₂', value: vitals.spO2, unit: '%' },
    { label: 'Resp. Rate', value: vitals.respiratoryRate, unit: '/min' },
    {
      label: 'BP',
      value:
        vitals.systolicBP != null && vitals.diastolicBP != null
          ? `${vitals.systolicBP}/${vitals.diastolicBP}`
          : null,
      unit: 'mmHg'
    },
    { label: 'Temperature', value: vitals.temperature, unit: '°C' },
    { label: 'GCS', value: vitals.gcs, unit: '' },
    { label: 'Pain', value: vitals.painScore, unit: '/10' },
    { label: 'Glucose', value: vitals.glucose, unit: 'mmol/L' }
  ].filter((item) => item.value != null && item.value !== '');

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <div key={item.label} className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">{item.label}</p>
          <p className="text-lg font-bold text-gray-800">
            {item.value}
            {item.unit ? (
              <span className="text-xs font-normal text-gray-500 ml-1">
                {item.unit}
              </span>
            ) : null}
          </p>
        </div>
      ))}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function PatientTracking() {
  const { token } = useParams();

  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const hasDataRef = useRef(false);

  const fetchTracking = useCallback(async ({ silent = false } = {}) => {
    if (!token) return;

    if (!silent) setLoading(true);

    try {
      const response = await getTrackingInfo(token);
      setPatient(response.data.patient);
      hasDataRef.current = true;
      setLastUpdated(new Date());
      setError('');
    } catch (err) {
      // Only surface the error when we have nothing meaningful to show yet.
      if (!silent || !hasDataRef.current) {
        setError(
          err.response?.data?.message ||
            'Unable to load tracking information.'
        );
        hasDataRef.current = false;
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token]);

  // Initial load + automatic polling so every clinician update appears here.
  useEffect(() => {
    fetchTracking();

    const interval = setInterval(
      () => fetchTracking({ silent: true }),
      POLL_INTERVAL_MS
    );

    return () => clearInterval(interval);
  }, [fetchTracking]);

  // Also listen for server-sent "changed" pings (harmless if unavailable).
  useEffect(() => {
    if (!API_BASE_URL) return undefined;

    let source;

    try {
      source = new EventSource(`${API_BASE_URL}/api/patients/live`);
      // The backend broadcasts a named "queue-updated" event (no patient data).
      source.addEventListener('queue-updated', () =>
        fetchTracking({ silent: true })
      );
    } catch {
      // SSE unsupported — polling still covers it.
    }

    return () => source?.close();
  }, [fetchTracking]);

  // ============================================
  // LOADING
  // ============================================

  if (loading && !patient) {
    return (
      <div className="min-h-screen bg-[#1C3D6E] flex flex-col items-center justify-center p-6">
        <Loader2 className="animate-spin text-blue-300 mb-4" size={44} />
        <p className="text-white">Loading your tracking information...</p>
      </div>
    );
  }

  // ============================================
  // ERROR
  // ============================================

  if (!patient) {
    return (
      <div className="min-h-screen bg-[#1C3D6E] flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="text-white/60 mb-4" size={48} />
        <h1 className="text-white text-lg font-semibold mb-2">
          Tracking unavailable
        </h1>
        <p className="text-white/70 text-sm max-w-xs">
          {error || 'This tracking link is invalid or has expired.'}
        </p>
      </div>
    );
  }

  const isTerminal = ['Discharged', 'Admitted', 'Referred'].includes(
    patient.status
  );

  return (
    <div className="min-h-screen bg-[#1C3D6E]">
      {/* HEADER */}
      <header className="px-4 pt-6 pb-8 text-center">
        <img
          src={careFlowAILogo}
          alt="CareFlowAI Logo"
          className="w-14 h-14 rounded-2xl object-cover shadow-lg mx-auto"
        />

        <h1 className="text-lg font-bold text-white mt-3">
          CareFlowAI Patient Tracking
        </h1>

        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-white/90 text-sm">
            Live — updates automatically
          </span>
        </div>

        <div className="bg-white/15 rounded-2xl px-6 py-3 mt-5 inline-flex items-center gap-3">
          <span className="text-white/80 text-sm">Queue Number</span>
          <span className="text-3xl font-extrabold text-white">
            {patient.queueNumber ?? '—'}
          </span>
        </div>
      </header>

      {/* CONTENT */}
      <main className="bg-gray-50 rounded-t-3xl min-h-[60vh] px-4 pt-6 pb-10 space-y-5">

        {/* STATUS SUMMARY */}
        <section className="bg-white rounded-2xl shadow-sm p-5">
          {patient.name ? (
            <h2 className="text-xl font-bold text-gray-800">
              {patient.name}
            </h2>
          ) : (
            <h2 className="text-xl font-bold text-gray-800">
              Patient Tracking
            </h2>
          )}

          <p className="text-sm text-gray-500 mb-4">
            Patient ID: {patient.patientId}
          </p>

          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Current Status</span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${statusBadgeStyle(
                patient.status
              )}`}
            >
              {patient.status}
            </span>
          </div>

          <div className="mt-3 divide-y divide-gray-100">
            <InfoRow
              label="Registered"
              value={formatDateTime(patient.arrivalTime)}
              icon={Clock}
            />
            {patient.assignedLocation && (
              <InfoRow
                label="Location"
                value={patient.assignedLocation}
                icon={MapPin}
              />
            )}
            {patient.disposition && (
              <InfoRow
                label="Disposition"
                value={patient.disposition}
                icon={CheckCircle}
              />
            )}
          </div>
        </section>

        {/* JOURNEY */}
        <section className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">
            Your Journey
          </h3>

          <div className="space-y-3">
            {JOURNEY_STEPS.map((step) => {
              const state = journeyStepState(
                step.status,
                patient.status,
                patient.statusHistory
              );

              return (
                <div key={step.label} className="flex items-center gap-3">
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center ${
                      state === 'completed'
                        ? 'bg-green-100 text-green-600'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {state === 'completed' ? (
                      <CheckCircle size={16} />
                    ) : (
                      <Clock size={16} />
                    )}
                  </div>

                  <span
                    className={`text-sm ${
                      state === 'completed'
                        ? 'text-gray-800 font-medium'
                        : 'text-gray-400'
                    }`}
                  >
                    {step.label}
                  </span>

                  {step.status === null && isTerminal && (
                    <span className="ml-auto text-xs font-semibold text-green-600">
                      {patient.status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* VITALS */}
        {patient.vitals &&
          Object.values(patient.vitals).some((v) => v != null) && (
            <section className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Heart size={18} className="text-red-500" />
                Latest Vitals
              </h3>

              <VitalsGrid vitals={patient.vitals} />
            </section>
          )}

        {/* STATUS HISTORY */}
        <section className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Activity size={18} className="text-blue-500" />
            Status History
          </h3>

          <Timeline history={patient.statusHistory} />
        </section>

        {/* PRIVACY FOOTER */}
        <div className="flex items-start gap-2 text-xs text-gray-400 px-1">
          <QrCode size={14} className="mt-0.5 shrink-0" />
          <p>
            This page shows limited, non-confidential information. For
            medical details, please speak with hospital staff.
          </p>
        </div>

        {lastUpdated && (
          <p className="text-center text-xs text-gray-400">
            Last updated {formatTime(lastUpdated)}
          </p>
        )}

        <button
          type="button"
          onClick={() => fetchTracking()}
          className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-100 transition"
        >
          Refresh Now
        </button>
      </main>
    </div>
  );
}
