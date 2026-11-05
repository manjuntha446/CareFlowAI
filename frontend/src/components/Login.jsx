import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register, googleLogin } from '../services/api';
import { signInWithGooglePopup } from '../services/firebase';
import {
  Shield,
  Stethoscope,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  ChevronLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  UserPlus,
  Phone,
  Mail,
  HeartPulse,
  LockKeyhole,
} from 'lucide-react';

const ROLES = [
  {
    id: 'admin',
    label: 'Administrator',
    sub: 'Manage users, patients and system settings',
    icon: Shield,
  },
  {
    id: 'clinician',
    label: 'Clinical Staff',
    sub: 'Doctor and nurse workspace',
    icon: Stethoscope,
  },
  {
    id: 'patient',
    label: 'Patient',
    sub: 'Register and track your queue status',
    icon: User,
  },
];

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100';
const labelClass =
  'mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500';

function Notice({ type = 'error', children }) {
  const success = type === 'success';
  const Icon = success ? CheckCircle2 : AlertCircle;

  return (
    <div
      role={success ? 'status' : 'alert'}
      className={`mb-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
        success
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-rose-200 bg-rose-50 text-rose-700'
      }`}
    >
      <Icon size={17} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggle,
  placeholder = 'Enter your password',
  minLength,
  autoComplete = 'current-password',
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <input
          className={`${inputClass} pr-12`}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required
          minLength={minLength}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center text-slate-400 transition hover:text-blue-700"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();

  const [selectedRole, setSelectedRole] = useState('');
  const [step, setStep] = useState('role'); // 'role' | 'credentials' | 'register'
  const [credentials, setCredentials] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [regData, setRegData] = useState({
    name: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    password: '',
    confirmPassword: '',
  });
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [regSuccess, setRegSuccess] = useState('');

  const selectedRoleObj = ROLES.find((role) => role.id === selectedRole);
  const SelectedRoleIcon = selectedRoleObj?.icon;

  const clearMessages = () => {
    setError('');
    setRegSuccess('');
  };

  const handleEnter = () => {
    if (!selectedRole) return;
    clearMessages();
    setStep('credentials');
  };

  const handleBack = () => {
    setStep('role');
    clearMessages();
    setCredentials({ email: '', password: '' });
    setShowPassword(false);
  };

  const handleBackToLogin = () => {
    setStep('credentials');
    clearMessages();
    setRegData({
      name: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      password: '',
      confirmPassword: '',
    });
    setShowRegPassword(false);
    setShowRegConfirmPassword(false);
  };

  // Manual Registration (Administrator, Clinical Staff, or Patient accounts)
  const handleRegister = async (event) => {
    event.preventDefault();
    clearMessages();

    if (
      !regData.name.trim() ||
      !regData.email.trim() ||
      !regData.password ||
      !regData.confirmPassword ||
      (selectedRole === 'patient' && (!regData.phone.trim() || !regData.dateOfBirth))
    ) {
      setError('Please fill in all required fields.');
      return;
    }

    const email = regData.email.trim().toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (regData.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (regData.password !== regData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const targetRole = selectedRole || 'patient';
      const response = await register({
        name: regData.name.trim(),
        email,
        phone: regData.phone.trim(),
        dateOfBirth: regData.dateOfBirth || null,
        password: regData.password,
        role: targetRole,
      });

      const roleLabel =
        targetRole === 'admin'
          ? 'Administrator'
          : targetRole === 'clinician'
            ? 'Clinical staff'
            : 'Patient';

      setRegSuccess(
        response.data?.message ||
          `${roleLabel} account created successfully. Please sign in.`
      );
      setRegData({
        name: '',
        email: '',
        phone: '',
        dateOfBirth: '',
        password: '',
        confirmPassword: '',
      });
      setShowRegPassword(false);
      setShowRegConfirmPassword(false);
      setStep('credentials');
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Unable to create your account. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Helper: process authenticated user session and role-based redirect
  const completeAuth = (token, user) => {
    const safeUser = {
      username: user.username,
      role: user.role,
      name: user.name,
      email: user.email,
    };

    sessionStorage.setItem('token', token);
sessionStorage.setItem('user', JSON.stringify(safeUser));

    const postLoginRedirect = sessionStorage.getItem('postLoginRedirect');
    sessionStorage.removeItem('postLoginRedirect');

    // Redirect strictly according to the verified MongoDB role
    if (postLoginRedirect) {
      navigate(postLoginRedirect, { replace: true });
    } else if (user.role === 'admin') {
      navigate('/admin', { replace: true });
    } else if (user.role === 'clinician') {
      navigate('/clinician', { replace: true });
    } else if (user.role === 'patient') {
      navigate('/patient', { replace: true });
    } else {
      sessionStorage.removeItem('token');
sessionStorage.removeItem('user');
      throw new Error('Unsupported account role.');
    }
  };

  // Manual Email & Password Sign In
  const handleSubmit = async (event) => {
    event.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const response = await login({
        username: credentials.email.trim(),
        password: credentials.password,
      });

      const { token, user } = response.data || {};

      if (!token || !user) {
        throw new Error('Invalid login response from the server.');
      }

      // Check if user role matches the selected portal
      if (selectedRole && user.role !== selectedRole) {
        setError(
          `These credentials belong to a ${user.role} account. Please select the correct portal.`
        );
        setCredentials((previous) => ({ ...previous, password: '' }));
        return;
      }

      completeAuth(token, user);

    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          'Login failed. Check your email and password.'
      );
      setCredentials((previous) => ({ ...previous, password: '' }));
    } finally {
      setLoading(false);
    }
  };

  // Google OAuth Sign In
  const handleGoogleSignIn = async () => {
    clearMessages();
    setGoogleLoading(true);

    try {
      const { idToken } = await signInWithGooglePopup();
      const response = await googleLogin(idToken);
      const { token, user } = response.data || {};

      if (!token || !user || !user.role) {
        throw new Error('Invalid authentication response from Google login.');
      }

      // If user selected a specific role in UI, verify or notify if mismatch
      if (selectedRole && user.role !== selectedRole) {
        setError(
          `This Google account belongs to a ${user.role} account. Please select the ${
            user.role === 'admin'
              ? 'Administrator'
              : user.role === 'clinician'
                ? 'Clinical Staff'
                : 'Patient'
          } portal.`
        );
        return;
      }

      completeAuth(token, user);

    } catch (err) {
      console.error('Google sign-in error:', err);
      // Suppress popup-closed-by-user warning if user just cancelled popup
      if (err.code === 'auth/popup-closed-by-user') {
        return;
      }
      setError(
        err.response?.data?.message ||
          err.message ||
          'Google sign-in failed. Please try again.'
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const pageTitle =
    step === 'register'
      ? selectedRole === 'admin'
        ? 'Create admin account'
        : selectedRole === 'clinician'
          ? 'Create clinician account'
          : 'Create patient account'
      : step === 'credentials'
        ? 'Welcome back'
        : 'Care that flows better';

  const pageSubtitle =
    step === 'role'
      ? 'A smarter workspace for emergency care teams and patients.'
      : step === 'credentials'
        ? 'Sign in to continue to your workspace.'
        : `Enter your details to create your ${
            selectedRole === 'admin'
              ? 'administrator'
              : selectedRole === 'clinician'
                ? 'clinical staff'
                : 'patient'
          } account.`;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        {/* Branding panel */}
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-[#102c55] via-[#174477] to-[#087e91] px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
          <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -bottom-40 -left-24 h-[30rem] w-[30rem] rounded-full border border-white/10" />

          <div className="relative z-10 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <HeartPulse size={27} />
            </div>
            <div>
              <div className="text-xl font-extrabold tracking-wide">
                CAREFLOW<span className="text-cyan-300">AI</span>
              </div>
              <div className="text-xs tracking-[0.2em] text-blue-100">
                SMART PATIENT FLOW
              </div>
            </div>
          </div>

          <div className="relative z-10 my-auto max-w-xl py-12">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-200 backdrop-blur-xs">
              Clinical Workspace
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight text-white xl:text-5xl">
              Connected triage, clear queue visibility.
            </h1>
            <p className="mt-4 text-base leading-7 text-blue-100/90">
              Real-time patient prioritization, automated vital alerts and
              instant emergency care routing for modern clinical teams.
            </p>
          </div>

          <div className="relative z-10 border-t border-white/15 pt-6 text-xs text-blue-200/80">
            Emergency department operations & triage platform
          </div>
        </section>

        {/* Form panel */}
        <section className="flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">
            {/* Mobile header */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-900 text-white">
                <HeartPulse size={24} />
              </div>
              <div>
                <div className="text-lg font-extrabold tracking-wide text-blue-950">
                  CAREFLOW<span className="text-teal-600">AI</span>
                </div>
                <div className="text-[10px] font-semibold tracking-[0.18em] text-slate-500">
                  SMART PATIENT FLOW
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] sm:p-9">
              {step !== 'role' && (
                <button
                  type="button"
                  onClick={
                    step === 'credentials' ? handleBack : handleBackToLogin
                  }
                  className="mb-7 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-blue-800"
                >
                  <ChevronLeft size={17} />
                  {step === 'credentials'
                    ? 'Back to role selection'
                    : 'Back to login'}
                </button>
              )}

              <div className="mb-7">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-800">
                  {step === 'register' ? (
                    <UserPlus size={20} />
                  ) : step === 'credentials' ? (
                    <LockKeyhole size={20} />
                  ) : (
                    <HeartPulse size={20} />
                  )}
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  {pageTitle}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {pageSubtitle}
                </p>
              </div>

              {error && <Notice>{error}</Notice>}
              {regSuccess && <Notice type="success">{regSuccess}</Notice>}

              {/* STEP 1: ROLE SELECTION */}
              {step === 'role' && (
                <>
                  <div className="space-y-3">
                    {ROLES.map((role) => {
                      const Icon = role.icon;
                      const active = selectedRole === role.id;

                      return (
                        <button
                          type="button"
                          key={role.id}
                          onClick={() => setSelectedRole(role.id)}
                          aria-pressed={active}
                          className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition duration-200 ${
                            active
                              ? 'border-blue-700 bg-blue-50 shadow-md shadow-blue-900/5'
                              : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
                              active
                                ? 'bg-blue-800 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            <Icon size={21} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-slate-900">
                              {role.label}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-slate-500">
                              {role.sub}
                            </span>
                          </span>
                          <span
                            className={`h-5 w-5 rounded-full border-2 ${
                              active
                                ? 'border-blue-700 bg-blue-700 ring-4 ring-blue-100'
                                : 'border-slate-300'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={handleEnter}
                    disabled={!selectedRole}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-900 px-5 py-4 font-semibold text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                  >
                    Continue <ArrowRight size={18} />
                  </button>

                  <p className="mt-4 text-center text-xs text-slate-500">
                    Select your portal role above to sign in or create a new account.
                  </p>
                </>
              )}

              {/* STEP 2: CREDENTIALS (MANUAL EMAIL/PASSWORD + GOOGLE SIGN IN) */}
              {step === 'credentials' && (
                <>
                  <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900">
                    {SelectedRoleIcon && <SelectedRoleIcon size={14} />}
                    {selectedRole === 'admin'
                      ? 'Administrator sign in'
                      : selectedRole === 'clinician'
                        ? 'Clinical staff sign in'
                        : 'Patient sign in'}
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <label className={labelClass}>Email Address</label>
                      <input
                        className={inputClass}
                        type="email"
                        value={credentials.email}
                        onChange={(event) =>
                          setCredentials({
                            ...credentials,
                            email: event.target.value,
                          })
                        }
                        placeholder="name@example.com"
                        autoComplete="email"
                        required
                        autoFocus
                      />
                    </div>

                    <PasswordField
                      label="Password"
                      value={credentials.password}
                      onChange={(event) =>
                        setCredentials({
                          ...credentials,
                          password: event.target.value,
                        })
                      }
                      visible={showPassword}
                      onToggle={() => setShowPassword((value) => !value)}
                    />

                    <button
                      type="submit"
                      disabled={loading || googleLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-900 px-5 py-4 font-semibold text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {loading ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          Signing in…
                        </>
                      ) : (
                        <>
                          Sign in <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                  </form>

                  {/* OR Divider */}
                  <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    OR
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>

                  {/* Continue with Google Button */}
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={googleLoading || loading}
                    className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {googleLoading ? (
                      <>
                        <Loader2 size={18} className="animate-spin text-slate-600" />
                        Signing in with Google…
                      </>
                    ) : (
                      <>
                        <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                          <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                          />
                        </svg>
                        <span>Continue with Google</span>
                      </>
                    )}
                  </button>

                  {/* Registration option for selected portal */}
                  {selectedRole && (
                    <div className="mt-5 pt-5 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          clearMessages();
                          setStep('register');
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-blue-900 transition hover:border-blue-300 hover:bg-blue-50"
                      >
                        <UserPlus size={17} />
                        {selectedRole === 'admin'
                          ? 'Create admin account'
                          : selectedRole === 'clinician'
                            ? 'Create clinician account'
                            : 'Create patient account'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* STEP 3: PATIENT REGISTRATION FORM */}
              {step === 'register' && (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className={labelClass}>Full name</label>
                    <input
                      className={inputClass}
                      value={regData.name}
                      onChange={(event) =>
                        setRegData({ ...regData, name: event.target.value })
                      }
                      placeholder="Enter full name"
                      autoComplete="name"
                      required
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Email address</label>
                    <div className="relative">
                      <input
                        className={`${inputClass} pr-11`}
                        type="email"
                        value={regData.email}
                        onChange={(event) =>
                          setRegData({ ...regData, email: event.target.value })
                        }
                        placeholder="name@example.com"
                        autoComplete="email"
                        required
                      />
                      <Mail
                        size={17}
                        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Mobile number</label>
                    <div className="relative">
                      <input
                        className={`${inputClass} pr-11`}
                        type="tel"
                        value={regData.phone}
                        onChange={(event) =>
                          setRegData({ ...regData, phone: event.target.value })
                        }
                        placeholder="Include country code e.g. +60 12-345 6789"
                        autoComplete="tel"
                        required
                      />
                      <Phone
                        size={17}
                        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                    </div>
                  </div>

                  {selectedRole === 'patient' && (
                    <div>
                      <label className={labelClass}>Date of birth</label>
                      <input
                        className={inputClass}
                        type="date"
                        value={regData.dateOfBirth}
                        onChange={(event) =>
                          setRegData({
                            ...regData,
                            dateOfBirth: event.target.value,
                          })
                        }
                        max={new Date().toISOString().slice(0, 10)}
                        autoComplete="bday"
                        required
                      />
                    </div>
                  )}

                  <PasswordField
                    label="Password"
                    value={regData.password}
                    onChange={(event) =>
                      setRegData({ ...regData, password: event.target.value })
                    }
                    visible={showRegPassword}
                    onToggle={() => setShowRegPassword((value) => !value)}
                    placeholder="At least 8 characters"
                    minLength={8}
                    autoComplete="new-password"
                  />

                  <PasswordField
                    label="Confirm password"
                    value={regData.confirmPassword}
                    onChange={(event) =>
                      setRegData({
                        ...regData,
                        confirmPassword: event.target.value,
                      })
                    }
                    visible={showRegConfirmPassword}
                    onToggle={() =>
                      setShowRegConfirmPassword((value) => !value)
                    }
                    placeholder="Re-enter your password"
                    minLength={8}
                    autoComplete="new-password"
                  />

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-900 px-5 py-4 font-semibold text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Creating account…
                      </>
                    ) : (
                      <>
                        <UserPlus size={17} /> Create account
                      </>
                    )}
                  </button>

                  <p className="text-center text-sm text-slate-500">
                    Already registered?{' '}
                    <button
                      type="button"
                      onClick={handleBackToLogin}
                      className="font-semibold text-blue-800 hover:underline"
                    >
                      Sign in
                    </button>
                  </p>
                </form>
              )}
            </div>

            <p className="mt-6 text-center text-xs text-slate-400">
              © {new Date().getFullYear()} CareFlowAI. For authorized healthcare
              use.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
