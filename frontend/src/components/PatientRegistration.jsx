import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyProfile, createMyVisit } from '../services/api';
import { AlertCircle, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import careFlowAILogo from '../assets/CareFlowAI-Logo.png';

const CLOSED_STATUSES = ['Discharged', 'Admitted', 'Referred'];

export default function PatientRegistration() {
  const navigate = useNavigate();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [account, setAccount] = useState(null);
  const [profile, setProfile] = useState(null);
  const [currentVisit, setCurrentVisit] = useState(null);

  const [formData, setFormData] = useState({
    chiefComplaint: '',
    symptoms: '',
    gender: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await getMyProfile();
        if (!active) return;

        setAccount(response.data?.account || null);
        setProfile(response.data?.profile || null);
        setCurrentVisit(response.data?.currentVisit || null);
      } catch (err) {
        if (!active) return;
        setError(
          err.response?.data?.message ||
            'Unable to load your profile. Please sign in again.'
        );
      } finally {
        if (active) setLoadingProfile(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  // Personal details are taken from the authenticated profile — never typed
  // again during a hospital visit.
  const identityName = profile?.name || account?.name || '';
  const identityDob = (profile?.dateOfBirth || account?.dateOfBirth || '')
    .toString()
    .slice(0, 10);
  const identityPhone = profile?.contactNumber || account?.phone || '';

  // Gender only needs to be collected when it is missing from the profile.
  const needsGender = !profile?.gender;

  const hasActiveVisit =
    currentVisit &&
    currentVisit.visitId &&
    !CLOSED_STATUSES.includes(currentVisit.status);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.chiefComplaint.trim()) {
      setError('Please describe your chief complaint.');
      return;
    }

    if (needsGender && !formData.gender) {
      setError('Please select your sex.');
      return;
    }

    setLoading(true);

    try {
      const response = await createMyVisit({
        chiefComplaint: formData.chiefComplaint.trim(),
        symptoms: formData.symptoms.trim() || null,
        ...(needsGender ? { gender: formData.gender } : {}),
      });

      setConfirmation({
        visitId: response.data?.visitId,
        queueNumber: response.data?.queueNumber,
        patientId: response.data?.patientId,
      });
    } catch (err) {
      const message =
        err.response?.data?.message ||
        'Failed to register your visit. Please try again.';

      // 409 = an active visit is already open.
      if (err.response?.status === 409) {
        setCurrentVisit((previous) =>
          previous || { visitId: 'active', status: 'Registered' }
        );
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const fieldClass =
    'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-[#1C3D6E] focus:bg-white transition';
  const labelClass =
    'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5';

  // ---- Confirmation screen ----
  if (confirmation) {
    return (
      <div className="min-h-screen bg-[#1C3D6E]">
        <header className="px-6 py-5">
          <div className="max-w-2xl mx-auto flex flex-col items-center gap-1">
            <img
              src={careFlowAILogo}
              alt="CareFlowAI Logo"
              className="w-16 h-16 rounded-2xl object-cover shadow-lg"
            />
            <h1 className="text-xl font-bold text-white tracking-wide mt-1">
              Visit Registered
            </h1>
            <p className="text-white/60 text-sm">CareFlowAI · Patient Self-Registration</p>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 pb-12">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={28} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              You are checked in
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Please keep your queue number safe. You can track your status from your dashboard.
            </p>

            <div className="mt-7 grid grid-cols-2 gap-3 text-left">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Queue number
                </div>
                <div className="mt-1 text-3xl font-bold text-[#1C3D6E]">
                  {confirmation.queueNumber ?? '—'}
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Visit ID
                </div>
                <div className="mt-1 text-lg font-bold text-[#1C3D6E] break-all">
                  {confirmation.visitId || '—'}
                </div>
              </div>
            </div>

            {confirmation.patientId && (
              <p className="mt-4 text-xs text-gray-400">
                Patient ID: {confirmation.patientId}
              </p>
            )}

            <button
              type="button"
              onClick={() => navigate('/patient', { replace: true })}
              className="mt-7 w-full flex items-center justify-center gap-2 text-white font-semibold py-3.5 rounded-xl transition-all duration-200"
              style={{ background: '#1C3D6E', boxShadow: '0 4px 14px rgba(28,61,110,0.30)' }}
            >
              Go to my dashboard <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1C3D6E]">
      <header className="px-6 py-5">
        <div className="max-w-2xl mx-auto flex flex-col items-center gap-1">
          <img
            src={careFlowAILogo}
            alt="CareFlowAI Logo"
            className="w-16 h-16 rounded-2xl object-cover shadow-lg"
          />
          <h1 className="text-xl font-bold text-white tracking-wide mt-1">
            Emergency Check-in
          </h1>
          <p className="text-white/60 text-sm">
            CareFlowAI · Register a hospital visit
          </p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pb-12">
        <div className="bg-white rounded-2xl shadow-xl p-6 overflow-hidden">
          {loadingProfile ? (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
              <Loader2 size={18} className="animate-spin" />
              Loading your profile…
            </div>
          ) : (
            <>
              <p className="text-gray-500 text-sm mb-6">
                Your personal details are taken from your account. Just tell us why
                you are visiting today and you will receive a queue number.
              </p>

              {error && (
                <div
                  className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm"
                  role="alert"
                  aria-live="polite"
                >
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {hasActiveVisit ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-800 text-sm">
                  <p className="font-semibold">You already have an active visit.</p>
                  <p className="mt-1">
                    Visit <span className="font-mono">{currentVisit.visitId}</span> is
                    currently <span className="font-semibold">{currentVisit.status}</span>.
                    Please wait until it is completed before registering a new visit.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/patient', { replace: true })}
                    className="mt-4 inline-flex items-center gap-2 text-white font-semibold py-2.5 px-4 rounded-xl"
                    style={{ background: '#1C3D6E' }}
                  >
                    Go to my dashboard <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Read-only identity from the authenticated profile */}
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2">
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-gray-400">Name</span>
                      <span className="font-semibold text-gray-700 text-right">
                        {identityName || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-gray-400">Date of birth</span>
                      <span className="font-semibold text-gray-700 text-right">
                        {identityDob || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-gray-400">Mobile</span>
                      <span className="font-semibold text-gray-700 text-right">
                        {identityPhone || '—'}
                      </span>
                    </div>
                    {profile?.patientId && (
                      <div className="flex justify-between gap-4 text-sm">
                        <span className="text-gray-400">Patient ID</span>
                        <span className="font-semibold text-gray-700 text-right">
                          {profile.patientId}
                        </span>
                      </div>
                    )}
                  </div>

                  {needsGender && (
                    <div>
                      <label className={labelClass}>Sex *</label>
                      <select
                        name="gender"
                        required
                        value={formData.gender}
                        onChange={handleChange}
                        className={fieldClass}
                      >
                        <option value="">Select sex</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className={labelClass}>Chief Complaint *</label>
                    <textarea
                      name="chiefComplaint"
                      required
                      value={formData.chiefComplaint}
                      onChange={handleChange}
                      rows="3"
                      className={`${fieldClass} resize-none`}
                      placeholder="Describe your main reason for visiting the emergency department"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Current Symptoms</label>
                    <textarea
                      name="symptoms"
                      value={formData.symptoms}
                      onChange={handleChange}
                      rows="3"
                      className={`${fieldClass} resize-none`}
                      placeholder="Any other symptoms you are experiencing (optional)"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 text-white font-semibold py-3.5 rounded-xl transition-all duration-200"
                    style={{
                      background: loading ? '#6B7280' : '#1C3D6E',
                      boxShadow: loading ? 'none' : '0 4px 14px rgba(28,61,110,0.30)',
                      cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Registering…
                      </>
                    ) : (
                      'Register & Get Queue Number'
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/patient', { replace: true })}
                    className="w-full text-sm font-semibold text-gray-500 hover:text-[#1C3D6E] transition"
                  >
                    Back to my dashboard
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
