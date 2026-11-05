import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  getMyProfile,
  downloadMySummary,
  downloadMyVisitReport,
  API_BASE_URL,
} from '../services/api';
import {
  HeartPulse,
  LogOut,
  Loader2,
  AlertCircle,
  Download,
  PlusCircle,
  Clock,
  Activity,
  FileText,
  QrCode,
  Printer,
  CheckCircle2,
  Circle,
  ChevronRight,
  ShieldCheck,
  Stethoscope,
  Radio,
  FileDown,
  Calendar,
  Users,
  Check,
  Bed,
  Flag,
  Bell,
  User,
  ArrowRight,
} from 'lucide-react';

const CLOSED_STATUSES = ['Discharged', 'Admitted', 'Referred'];

const STATUS_STYLES = {
  Registered: 'bg-slate-100 text-slate-700 border-slate-200',
  'Vitals Taken': 'bg-sky-100 text-sky-800 border-sky-200',
  Triaged: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'In Treatment': 'bg-amber-100 text-amber-900 border-amber-200',
  Discharged: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Admitted: 'bg-blue-100 text-blue-800 border-blue-200',
  Referred: 'bg-purple-100 text-purple-800 border-purple-200',
};

const VISIT_STAGES = [
  { id: 'Registered', label: 'Registered', desc: 'Patient checked into queue', icon: User },
  { id: 'Vitals Taken', label: 'Vitals Taken', desc: 'Physiological markers recorded', icon: Activity },
  { id: 'Triaged', label: 'Triaged', desc: 'Acuity prioritized by clinical rules & AI', icon: Stethoscope },
  { id: 'In Treatment', label: 'In Treatment', desc: 'Under physician consultation', icon: Bed },
  { id: 'Outcome', label: 'Final Outcome', desc: 'Discharged / Admitted / Referred', icon: Flag },
];

const formatDateDisplay = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }); // e.g. "02 Nov 2026"
};

const formatTimeDisplay = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }); // e.g. "06:54 PM"
};

const formatDateTimeDisplay = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const d = formatDateDisplay(date);
  const t = formatTimeDisplay(date);
  return `${d}, ${t}`; // e.g. "02 Nov 2026, 07:18 PM"
};

const StatusBadge = ({ status }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
      STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 border-slate-200'
    }`}
  >
    <span className="h-1.5 w-1.5 rounded-full bg-current" />
    {status || '—'}
  </span>
);

export default function PatientDashboard() {
  const navigate = useNavigate();
  const qrRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [account, setAccount] = useState(null);
  const [profile, setProfile] = useState(null);
  const [currentVisit, setCurrentVisit] = useState(null);
  const [visits, setVisits] = useState([]);
  const [downloadingSummary, setDownloadingSummary] = useState(false);
  const [downloadingVisitId, setDownloadingVisitId] = useState('');
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await getMyProfile();
      setAccount(response.data?.account || null);
      setProfile(response.data?.profile || null);
      setCurrentVisit(response.data?.currentVisit || null);
      setVisits(response.data?.visits || []);
      setLastRefreshed(new Date());
    } catch (err) {
      if (!silent) {
        setError(
          err.response?.data?.message ||
            'Unable to load your records. Please sign in again.'
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // 1. Live Server-Sent Events (SSE) Stream
    let eventSource = null;
    try {
      eventSource = new EventSource(`${API_BASE_URL}/api/patients/live`);

      eventSource.onopen = () => {
        setLiveConnected(true);
      };

      eventSource.addEventListener('queue-updated', () => {
        loadData(true);
      });

      eventSource.onerror = () => {
        setLiveConnected(false);
      };
    } catch (sseErr) {
      console.warn('SSE subscription error:', sseErr);
    }

    // 2. Sensible fallback polling every 12 seconds
    const interval = setInterval(() => {
      loadData(true);
    }, 12000);

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      clearInterval(interval);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/', { replace: true });
  };

  // Download General Patient Summary PDF
  const handleDownloadSummary = async () => {
    setError('');
    setDownloadingSummary(true);

    try {
      const response = await downloadMySummary();
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `patient-summary-${profile?.patientId || 'careflowai'}.pdf`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Unable to download your summary right now.'
      );
    } finally {
      setDownloadingSummary(false);
    }
  };

  // Download Visit-Specific PDF Report
  const handleDownloadVisitReport = async (visitId) => {
    if (!visitId) return;
    setError('');
    setDownloadingVisitId(visitId);

    try {
      const response = await downloadMyVisitReport(visitId);
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `visit-report-${profile?.patientId || 'patient'}-${visitId}.pdf`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Unable to download this visit report right now.'
      );
    } finally {
      setDownloadingVisitId('');
    }
  };

  // Download Permanent QR Code as PNG
  const handleDownloadQrPng = () => {
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

        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `CareFlowAI-QR-${profile?.patientId || 'Patient'}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      };

      img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
    } catch (pngErr) {
      console.error('QR export error:', pngErr);
      setError('Unable to export QR code image. Please take a screenshot or print.');
    }
  };

  // Print Permanent QR Card
  const handlePrintQrCard = () => {
    window.print();
  };

  const displayName = profile?.name || account?.name || 'Patient';
  const hasProfile = Boolean(profile);
  const qrToken = profile?.qrToken || '';
  const qrUrl = qrToken ? `${window.location.origin}/scan/${qrToken}` : '';

  // Determine stage progression index (0 to 4)
  const getStageIndex = (status) => {
    if (!status) return 0;
    if (CLOSED_STATUSES.includes(status)) return 4;
    if (status === 'In Treatment') return 3;
    if (status === 'Triaged') return 2;
    if (status === 'Vitals Taken') return 1;
    return 0; // Registered
  };

  const currentStageIndex = currentVisit ? getStageIndex(currentVisit.status) : -1;
  const isCurrentVisitClosed = currentVisit ? CLOSED_STATUSES.includes(currentVisit.status) : true;

  // Latest status history entry
  const latestHistoryEntry = currentVisit?.statusHistory?.length
    ? currentVisit.statusHistory[currentVisit.statusHistory.length - 1]
    : null;

  const lastUpdatedTime = (() => {
    if (latestHistoryEntry?.timestamp) return latestHistoryEntry.timestamp;
    return currentVisit?.updatedAt || currentVisit?.arrivalTime;
  })();

  // Helper to resolve timestamp for a stage
  const getStageTimestamp = (stageId) => {
    if (!currentVisit?.statusHistory?.length) {
      if (stageId === 'Registered') return formatTimeDisplay(currentVisit?.arrivalTime);
      return null;
    }
    const match = currentVisit.statusHistory.find((entry) => {
      if (stageId === 'Outcome') return CLOSED_STATUSES.includes(entry.status);
      return entry.status === stageId;
    });
    if (match) return formatTimeDisplay(match.timestamp);
    if (stageId === 'Registered') return formatTimeDisplay(currentVisit?.arrivalTime);
    return null;
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-500">
        <div className="flex items-center gap-2">
          <Loader2 size={22} className="animate-spin text-blue-900" />
          <span className="font-medium">Loading your patient records…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800">
      {/* ── PRINT-ONLY QR CARD (rendered when printing) ── */}
      <div className="hidden print:block p-8 bg-white text-black max-w-sm mx-auto border-2 border-slate-900 rounded-2xl text-center">
        <div className="border-b-2 border-slate-900 pb-3 mb-4">
          <h1 className="text-xl font-extrabold tracking-tight">CAREFLOW HOSPITAL</h1>
          <p className="text-xs font-semibold tracking-wider uppercase text-slate-600">
            Emergency Department Identification Card
          </p>
        </div>

        <div className="my-4 flex justify-center">
          {qrUrl ? (
            <QRCodeSVG value={qrUrl} size={180} level="H" includeMargin={true} />
          ) : null}
        </div>

        <div className="space-y-1 text-sm font-semibold">
          <div className="text-base font-extrabold text-slate-900">{displayName}</div>
          <div>Patient ID: <span className="font-mono">{profile?.patientId || '—'}</span></div>
          <div className="text-xs text-slate-600">
            DOB: {(profile?.dateOfBirth || '').toString().slice(0, 10) || '—'} | Gender: {profile?.gender || '—'}
          </div>
          {profile?.bloodType && (
            <div className="text-xs text-slate-600">Blood Type: {profile.bloodType}</div>
          )}
        </div>

        <div className="mt-5 pt-3 border-t border-slate-200 text-[10px] text-slate-500 leading-tight">
          Keep this card for all hospital visits. Scan code to retrieve medical record.
        </div>
      </div>

      {/* ── CLEAN TOP NAVBAR (Matching UI Mockup) ── */}
      <header className="print:hidden bg-white border-b border-slate-200/80 sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-6 bg-[#133E87] rounded-full inline-block" />
            <span className="text-base font-black text-slate-900 tracking-tight">Patient Portal</span>
            <span className="hidden sm:inline-flex items-center gap-1.5 ml-3 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className={`h-1.5 w-1.5 rounded-full ${liveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
              {liveConnected ? 'Live' : 'Polling'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              title="Notifications"
              className="relative p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition"
            >
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
            </button>

            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-[#133E87] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-bold text-slate-800 hidden sm:inline">{displayName}</span>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign out"
                className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rose-600 transition p-1.5 rounded-lg hover:bg-rose-50"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="print:hidden mx-auto max-w-6xl px-6 py-6 space-y-6">
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── 1. PROFILE CARD (Patient Image Removed as requested) ── */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-black text-slate-900">{displayName}</h1>
                {profile?.bloodType && (
                  <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                    {profile.bloodType}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500 font-medium">
                {account?.email || '—'} • {profile?.contactNumber || account?.phone || '—'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="inline-flex items-center gap-2 rounded-xl bg-[#133E87] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#0f326e]"
              >
                <PlusCircle size={15} /> Register New Visit
              </button>
              <button
                type="button"
                onClick={handleDownloadSummary}
                disabled={!hasProfile || downloadingSummary}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50"
              >
                {downloadingSummary ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
                Summary PDF
              </button>
            </div>
          </div>

          {/* 4 Stat Cards */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-slate-50/80 p-3.5 border border-slate-100">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                PERMANENT PATIENT ID
              </div>
              <div className="mt-1 font-mono text-sm sm:text-base font-black text-slate-900">
                {profile?.patientId || 'Not registered yet'}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50/80 p-3.5 border border-slate-100">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                DATE OF BIRTH
              </div>
              <div className="mt-1 text-sm sm:text-base font-bold text-slate-800">
                {(profile?.dateOfBirth || account?.dateOfBirth || '').toString().slice(0, 10) || '—'}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50/80 p-3.5 border border-slate-100">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                GENDER
              </div>
              <div className="mt-1 text-sm sm:text-base font-bold text-slate-800">
                {profile?.gender || '—'}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50/80 p-3.5 border border-slate-100">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                TOTAL VISITS
              </div>
              <div className="mt-1 text-sm sm:text-base font-black text-blue-700">
                {(visits?.length || 0) + (currentVisit?.visitId ? 1 : 0)} visits recorded
              </div>
            </div>
          </div>
        </section>

        {/* ── 2. MY PATIENT QR CODE ── */}
        {hasProfile && (
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-[#133E87]">
                  <QrCode size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">My Patient QR</h2>
                  <p className="text-xs text-slate-500">
                    Permanent identification token • Same code used for all present &amp; future hospital visits
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadQrPng}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 shadow-2xs"
                >
                  <Download size={14} /> Download QR (PNG)
                </button>
                <button
                  type="button"
                  onClick={handlePrintQrCard}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-1.5 text-xs font-semibold text-[#133E87] transition hover:bg-blue-100 shadow-2xs"
                >
                  <Printer size={14} /> Print QR Card
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-col md:flex-row items-center gap-8">
              {/* QR Container */}
              <div
                ref={qrRef}
                className="shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col items-center justify-center text-center"
              >
                {qrUrl ? (
                  <QRCodeSVG
                    value={qrUrl}
                    size={180}
                    level="H"
                    includeMargin={true}
                  />
                ) : (
                  <div className="grid h-44 w-44 place-items-center text-xs text-slate-400">
                    QR token unavailable
                  </div>
                )}
                <div className="mt-2 text-xs font-mono font-bold text-slate-800">
                  {profile.patientId}
                </div>
              </div>

              {/* QR Info and Security Highlights */}
              <div className="flex-1 space-y-3.5 text-sm">
                <div className="rounded-xl bg-slate-50/80 p-4 border border-slate-100 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>Secure Zero-Knowledge Identification</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed pl-6">
                    This QR code embeds only a cryptographically secure 32-byte identifier token. It exposes <strong>zero medical data, diagnosis, or sensitive details</strong> to unauthenticated viewers.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 pt-1">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={15} className="text-[#133E87] mt-0.5 shrink-0" />
                    <span><strong>Permanent:</strong> Works for all future visits without generating a new QR code.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={15} className="text-[#133E87] mt-0.5 shrink-0" />
                    <span><strong>Staff Protected:</strong> Only authorized clinicians can exchange this token for clinical records.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={15} className="text-[#133E87] mt-0.5 shrink-0" />
                    <span><strong>Real-time Sync:</strong> Staff updates to vitals or treatment reflect here automatically.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={15} className="text-[#133E87] mt-0.5 shrink-0" />
                    <span><strong>Print Ready:</strong> Keep a physical copy in your wallet for quick emergency admissions.</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── 3. LIVE VISIT STATUS (Matching UI Mockup 2-column layout) ── */}
        {hasProfile && (
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-700">
                  <Activity size={18} />
                </div>
                <h2 className="text-base font-bold text-slate-900">Live Visit Status</h2>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Updates
              </span>
            </div>

            {currentVisit && currentVisit.visitId ? (
              <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left Column: Active Visit Details (4 cols) */}
                <div className="lg:col-span-4 space-y-3.5 pr-0 lg:pr-6 lg:border-r border-slate-100">
                  <div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      Active Visit
                    </span>
                  </div>

                  <div className="space-y-2.5 pt-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-slate-500">
                        <FileText size={14} className="text-slate-400" /> Visit ID
                      </span>
                      <span className="font-mono font-bold text-[#133E87]">
                        {currentVisit.visitId}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-slate-500">
                        <Calendar size={14} className="text-slate-400" /> Visit Date
                      </span>
                      <span className="font-semibold text-slate-800">
                        {formatDateDisplay(currentVisit.arrivalTime)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-slate-500">
                        <Clock size={14} className="text-slate-400" /> Arrival Time
                      </span>
                      <span className="font-semibold text-slate-800">
                        {formatTimeDisplay(currentVisit.arrivalTime)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-slate-500">
                        <Users size={14} className="text-slate-400" /> Queue Number
                      </span>
                      <span className="font-black text-slate-900 text-sm">
                        {currentVisit.queueNumber ? `Q${currentVisit.queueNumber}` : '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-slate-500">
                        <Activity size={14} className="text-slate-400" /> Current Status
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
                        {currentVisit.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-slate-500">
                        <Clock size={14} className="text-slate-400" /> Last Updated
                      </span>
                      <span className="font-semibold text-slate-700">
                        {formatDateTimeDisplay(lastUpdatedTime)}
                      </span>
                    </div>
                  </div>

                  {/* Actions for current visit */}
                  <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadVisitReport(currentVisit.visitId)}
                      disabled={downloadingVisitId === currentVisit.visitId}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 shadow-2xs"
                    >
                      {downloadingVisitId === currentVisit.visitId ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <FileDown size={13} />
                      )}
                      Visit PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 shadow-2xs"
                    >
                      <Printer size={13} /> Print
                    </button>
                  </div>
                </div>

                {/* Right Column: Treatment Progress Horizontal Stepper (8 cols) */}
                <div className="lg:col-span-8 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900">Treatment Progress</h3>

                  {/* Stepper Bar */}
                  <div className="pt-2 pb-3 overflow-x-auto">
                    <div className="flex items-center justify-between min-w-[560px] relative px-2">
                      {VISIT_STAGES.map((stage, idx) => {
                        const isCompleted = idx < currentStageIndex || (idx === 4 && isCurrentVisitClosed);
                        const isCurrent = idx === currentStageIndex && !isCurrentVisitClosed;
                        const isPending = idx > currentStageIndex && !isCurrentVisitClosed;
                        const timestamp = getStageTimestamp(stage.id);

                        const StageIcon = stage.icon;

                        return (
                          <div key={stage.id} className="flex-1 flex items-center relative">
                            {/* Node item */}
                            <div className="flex flex-col items-center relative z-10 mx-auto text-center">
                              {/* Icon container */}
                              {isCurrent ? (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 flex flex-col items-center shadow-xs">
                                  <div className="w-9 h-9 rounded-full bg-[#133E87] text-white flex items-center justify-center shadow-md mb-1.5">
                                    <StageIcon size={16} />
                                  </div>
                                  <span className="text-xs font-bold text-[#133E87] whitespace-nowrap">
                                    {stage.label}
                                  </span>
                                  <span className="text-[10px] font-bold text-blue-600 whitespace-nowrap">
                                    (Current)
                                  </span>
                                  {timestamp && (
                                    <span className="text-[10px] text-slate-500 mt-0.5 whitespace-nowrap">
                                      {timestamp}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col items-center">
                                  <div
                                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                                      isCompleted
                                        ? 'bg-emerald-500 text-white shadow-xs'
                                        : 'bg-white border-2 border-slate-300 text-slate-400'
                                    }`}
                                  >
                                    {isCompleted ? (
                                      <Check size={18} strokeWidth={2.5} />
                                    ) : (
                                      <StageIcon size={16} />
                                    )}
                                  </div>
                                  <span
                                    className={`mt-2 text-xs font-semibold whitespace-nowrap ${
                                      isCompleted ? 'text-slate-800 font-bold' : 'text-slate-500'
                                    }`}
                                  >
                                    {stage.label}
                                  </span>
                                  <span className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">
                                    {isCompleted && timestamp ? timestamp : isPending ? 'Pending' : ''}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Connecting line to next node */}
                            {idx < VISIT_STAGES.length - 1 && (
                              <div
                                className={`absolute left-1/2 right-[-50%] top-4 h-0.5 -z-0 transition-all ${
                                  idx < currentStageIndex
                                    ? 'bg-emerald-500'
                                    : idx === currentStageIndex && !isCurrentVisitClosed
                                    ? 'bg-blue-300'
                                    : 'bg-slate-200'
                                }`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Attending doctor & triage notes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs">
                    {currentVisit.chiefComplaint && (
                      <div className="bg-slate-50/70 rounded-xl p-3 border border-slate-100">
                        <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider block mb-0.5">
                          Chief Complaint
                        </span>
                        <span className="font-semibold text-slate-800">
                          {currentVisit.chiefComplaint}
                        </span>
                      </div>
                    )}
                    {currentVisit.assignedDoctor && (
                      <div className="bg-slate-50/70 rounded-xl p-3 border border-slate-100">
                        <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider block mb-0.5">
                          Attending Physician
                        </span>
                        <span className="font-semibold text-slate-800 flex items-center gap-1">
                          <Stethoscope size={13} className="text-[#133E87]" />
                          Dr. {currentVisit.assignedDoctor}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400 mb-2">
                  <AlertCircle size={20} />
                </div>
                <p className="text-sm font-bold text-slate-700">No active hospital visit</p>
                <p className="mt-1 text-xs text-slate-400">
                  Your permanent QR code is ready. Check in at the emergency kiosk or click below to start a new visit.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#133E87] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0f326e]"
                >
                  <PlusCircle size={15} /> Register New Visit
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── NO ACTIVE VISIT FALLBACK (When no hospital profile yet) ── */}
        {!hasProfile && (
          <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-xs">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400 mb-3">
              <AlertCircle size={24} />
            </div>
            <h3 className="text-base font-bold text-slate-800">No active hospital visit</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              You do not have an active hospital profile yet. Click below to register your first emergency visit and generate your permanent patient QR code.
            </p>
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#133E87] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0f326e]"
            >
              <PlusCircle size={15} /> Register First Visit
            </button>
          </section>
        )}

        {/* ── 4. PREVIOUS VISITS (Clean Table matching UI Mockup) ── */}
        {hasProfile && (
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-[#133E87]">
                  <Clock size={18} />
                </div>
                <h2 className="text-base font-bold text-slate-900">Previous Visits</h2>
              </div>
              <span className="text-xs font-bold text-blue-700 hover:text-blue-800 cursor-pointer flex items-center gap-1">
                View All Visits <ArrowRight size={13} />
              </span>
            </div>

            {visits.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No previous archived visits. All prior records will be preserved here automatically.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                      <th className="py-3 px-3">Visit ID</th>
                      <th className="py-3 px-3">Visit Date</th>
                      <th className="py-3 px-3">Queue No.</th>
                      <th className="py-3 px-3">Final Outcome</th>
                      <th className="py-3 px-3 text-right">Report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visits.map((visit, index) => (
                      <tr key={visit.visitId || index} className="hover:bg-slate-50/60 transition">
                        <td className="py-3.5 px-3 font-mono font-bold text-[#133E87]">
                          {visit.visitId}
                        </td>
                        <td className="py-3.5 px-3 font-medium text-slate-700">
                          {formatDateDisplay(visit.arrivalTime)}
                        </td>
                        <td className="py-3.5 px-3 font-bold text-slate-800">
                          {visit.queueNumber ? `Q${visit.queueNumber}` : '—'}
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              visit.status === 'Discharged'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : visit.status === 'Admitted'
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-purple-100 text-purple-800 border border-purple-200'
                            }`}
                          >
                            {visit.treatment?.disposition || visit.status || 'Completed'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDownloadVisitReport(visit.visitId)}
                            disabled={downloadingVisitId === visit.visitId}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#133E87] hover:bg-slate-50 transition shadow-2xs disabled:opacity-50"
                          >
                            {downloadingVisitId === visit.visitId ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <FileDown size={13} />
                            )}
                            Download PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="print:hidden py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} CareFlowAI • Protected Health Information • Role-Based Access Control
      </footer>
    </div>
  );
}
