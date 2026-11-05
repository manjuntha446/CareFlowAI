
import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

import { getPatient, getQueuePosition } from '../services/api';
import careFlowAILogo from '../assets/CareFlowAI-Logo.png';

import {
  Clock,
  Users,
  Activity,
  CheckCircle,
  MapPin,
  AlertCircle,
  Moon,
  Sun,
  QrCode,
  Heart
} from 'lucide-react';

// ============================================
// CONSTANTS
// ============================================

const STATUS_ORDER = [
  'Registered',
  'Vitals Taken',
  'Triaged',
  'In Treatment',
  'Discharged'
];

const JOURNEY_STEPS = [
  { label: 'Checked In', minStatus: 'Registered' },
  { label: 'Triage Assessment', minStatus: 'Vitals Taken' },
  { label: 'Waiting for Doctor', minStatus: 'Triaged' },
  { label: 'Medical Examination', minStatus: 'In Treatment' },
  { label: 'Disposition', minStatus: 'Discharged' }
];

// ============================================
// HELPER FUNCTIONS
// ============================================

function computeAge(dob) {
  if (!dob) return 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â';

  const birth = new Date(dob);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const month = today.getMonth() - birth.getMonth();

  if (
    month < 0 ||
    (month === 0 && today.getDate() < birth.getDate())
  ) {
    age--;
  }

  return age;
}

function getStatusIndex(status) {
  const index = STATUS_ORDER.indexOf(status);
  return index === -1 ? 0 : index;
}

function getEffectiveStatus(patient) {
  if (
    patient?.status === 'Registered' &&
    patient?.vitalSigns?.heartRate != null
  ) {
    return 'Vitals Taken';
  }

  return patient?.status || 'Registered';
}

function getStepState(stepMinStatus, currentStatus) {
  if (
    currentStatus === 'Discharged' &&
    stepMinStatus === 'Discharged'
  ) {
    return 'completed';
  }

  const stepIndex = getStatusIndex(stepMinStatus);
  const currentIndex = getStatusIndex(currentStatus);

  if (currentIndex > stepIndex) return 'completed';
  if (currentIndex === stepIndex) return 'current';

  return 'pending';
}

function formatTime(dateString) {
  if (!dateString) return null;

  return new Date(dateString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDuration(ms) {
  const totalMinutes = Math.round(Math.abs(ms) / 60000);

  if (totalMinutes < 60) {
    return `${totalMinutes} minutes`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes > 0
    ? `${hours}h ${minutes}m`
    : `${hours}h`;
}

function getPatientTimestamps(patient) {
  return {
    checkIn: patient?.arrivalTime
      ? new Date(patient.arrivalTime)
      : null,

    triageComplete: patient?.triageTimestamp
      ? new Date(patient.triageTimestamp)
      : null,

    treatmentStart: patient?.treatment?.treatmentStartTime
      ? new Date(patient.treatment.treatmentStartTime)
      : null,

    treatmentEnd: patient?.treatment?.treatmentEndTime
      ? new Date(patient.treatment.treatmentEndTime)
      : null
  };
}

function getStepDisplayData(index, patient) {
  if (!patient) {
    return {
      primaryTime: null,
      durationLabel: null
    };
  }

  const timestamps = getPatientTimestamps(patient);
  const now = new Date();

  switch (index) {
    case 0:
      return {
        primaryTime: formatTime(timestamps.checkIn),
        durationLabel: null
      };

    case 1: {
      const duration =
        timestamps.triageComplete && timestamps.checkIn
          ? timestamps.triageComplete - timestamps.checkIn
          : timestamps.checkIn
            ? now - timestamps.checkIn
            : null;

      return {
        primaryTime: formatTime(timestamps.triageComplete),
        durationLabel:
          duration != null
            ? `Duration: ${formatDuration(duration)}`
            : null
      };
    }

    case 2: {
      const start = timestamps.triageComplete;
      const end = timestamps.treatmentStart;

      const duration =
        start && end
          ? end - start
          : start
            ? now - start
            : null;

      return {
        primaryTime:
          start && end
            ? `${formatTime(start)} ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ ${formatTime(end)}`
            : formatTime(start),

        durationLabel:
          duration != null
            ? `Wait time: ${formatDuration(duration)}`
            : null
      };
    }

    case 3: {
      const start = timestamps.treatmentStart;
      const end = timestamps.treatmentEnd;

      const duration =
        start && end
          ? end - start
          : start
            ? now - start
            : null;

      return {
        primaryTime:
          start && end
            ? `${formatTime(start)} ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ ${formatTime(end)}`
            : formatTime(start),

        durationLabel:
          duration != null
            ? `Consultation: ${formatDuration(duration)}`
            : null
      };
    }

    case 4:
      return {
        primaryTime: formatTime(timestamps.treatmentEnd),
        durationLabel: patient.treatment?.disposition || null
      };

    default:
      return {
        primaryTime: null,
        durationLabel: null
      };
  }
}

function getEstimatedWait(patient, queueInfo) {
  if (!patient) return 'Pending';

  if (
    patient.status === 'In Treatment' ||
    patient.status === 'Discharged'
  ) {
    return 'N/A';
  }

  if (patient.triageCategory) {
    const waits = {
      1: 'Immediate',
      2: '~30 Minutes',
      3: '~60 Minutes'
    };

    return waits[patient.triageCategory] || 'Pending';
  }

  if (queueInfo?.position) {
    return `~${queueInfo.position * 10} Minutes`;
  }

  return 'Pending Assessment';
}

function getPriorityLabel(category) {
  const labels = {
    1: 'Critical',
    2: 'Urgent',
    3: 'Non-Urgent'
  };

  return labels[category] || 'Pending';
}

function getPriorityStyle(category) {
  const styles = {
    1: 'bg-red-100 text-red-700',
    2: 'bg-yellow-100 text-yellow-700',
    3: 'bg-green-100 text-green-700'
  };

  return styles[category] || 'bg-gray-100 text-gray-600';
}

function getStatusBadgeStyle(status, disposition) {
  if (status === 'Discharged') {
    if (disposition === 'Admit') {
      return 'bg-blue-100 text-blue-700';
    }

    if (disposition === 'Referral') {
      return 'bg-orange-100 text-orange-700';
    }

    return 'bg-green-100 text-green-700';
  }

  const styles = {
    Registered: 'bg-purple-100 text-purple-700',
    'Vitals Taken': 'bg-indigo-100 text-indigo-700',
    Triaged: 'bg-orange-100 text-orange-700',
    'In Treatment': 'bg-blue-100 text-blue-700'
  };

  return styles[status] || 'bg-gray-100 text-gray-600';
}

function getStatusLabel(status, disposition) {
  if (status === 'Discharged') {
    if (disposition === 'Admit') return 'Admitted';
    if (disposition === 'Referral') return 'Referred';

    return 'Discharged';
  }

  return status;
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function PatientWaitingScreen() {
  const { id } = useParams();
  const location = useLocation();

  // Restore QR token from localStorage (survives page refresh)
  const getStoredQrToken = (patientId) => {
    if (!patientId) return null;
    return localStorage.getItem(`qrToken_${patientId}`);
  };

  const initialPatient = location.state?.patient || null;

  const [patient, setPatient] = useState(() => {
    if (!initialPatient) return null;
    // Ensure qrToken is present from localStorage if not in state
    if (!initialPatient.qrToken && initialPatient._id) {
      initialPatient.qrToken = getStoredQrToken(initialPatient._id);
    }
    return initialPatient;
  });

  const [queueInfo, setQueueInfo] = useState(null);
  const [loading, setLoading] = useState(!patient);

  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('medivision-dark') === 'true'
  );

  // ============================================
  // DARK MODE
  // ============================================

  useEffect(() => {
    localStorage.setItem('medivision-dark', darkMode);
  }, [darkMode]);

  // Persist qrToken to localStorage whenever available
  useEffect(() => {
    if (patient?._id && patient?.qrToken) {
      localStorage.setItem(`qrToken_${patient._id}`, patient.qrToken);
    }
  }, [patient?._id, patient?.qrToken]);

  // ============================================
  // FETCH PATIENT
  // ============================================

  useEffect(() => {
    let cancelled = false;

    const fetchPatient = async () => {
      try {
        const response = await getPatient(id);

        if (!cancelled) {
          setPatient(previous => ({
            ...response.data,
            // Preserve token passed after registration, fall back to localStorage
            qrToken: previous?.qrToken || response.data.qrToken || getStoredQrToken(response.data._id)
          }));
        }
      } catch (error) {
        console.error('Error fetching patient:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (!patient) {
      fetchPatient();
    }

    return () => {
      cancelled = true;
    };
  }, [id, patient]);

  // ============================================
  // POLL QUEUE POSITION EVERY 15 SECONDS
  // ============================================

  useEffect(() => {
    if (!patient?.icNumber) return;

    let cancelled = false;

    const fetchQueue = async () => {
      try {
        const response = await getQueuePosition(patient.icNumber);
        const data = response.data;

        if (!cancelled) {
          setQueueInfo(data);

          setPatient(previous => ({
            ...previous,
            ...data,
            qrToken: previous?.qrToken
          }));
        }
      } catch (error) {
        if (error.response?.status === 404) {
          try {
            const response = await getPatient(id);

            if (!cancelled) {
              setPatient(previous => ({
                ...response.data,
                qrToken: previous?.qrToken || response.data.qrToken || getStoredQrToken(response.data._id)
              }));
            }
          } catch (fetchError) {
            console.error(
              'Error refreshing patient:',
              fetchError
            );
          }
        }
      }
    };

    fetchQueue();

    const interval = setInterval(fetchQueue, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [patient?.icNumber, id]);

  // ============================================
  // LOADING SCREEN
  // ============================================

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        darkMode ? 'bg-gray-900' : 'bg-[#1C3D6E]'
      }`}>
        <div className="text-center">
          <Activity
            className="animate-spin mx-auto mb-4 text-blue-400"
            size={48}
          />

          <p className="text-white">
            Loading your information...
          </p>
        </div>
      </div>
    );
  }

  // ============================================
  // PATIENT NOT FOUND
  // ============================================

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1C3D6E]">
        <div className="text-center">
          <AlertCircle
            className="mx-auto mb-4 text-white/50"
            size={48}
          />

          <p className="text-white">
            Registration not found. Please register at the check-in counter.
          </p>
        </div>
      </div>
    );
  }

  // ============================================
  // PATIENT DATA
  // ============================================

  const hasVitals =
    patient.vitalSigns &&
    patient.vitalSigns.heartRate != null;

  const currentLocation =
    patient.assignedLocation || 'Waiting Area';

  const estimatedWait =
    getEstimatedWait(patient, queueInfo);

  const currentStatus =
    getEffectiveStatus(patient);

  const darkCard = darkMode
    ? 'bg-gray-800 text-white'
    : 'bg-white text-gray-800';

  const secondaryText = darkMode
    ? 'text-gray-300'
    : 'text-gray-500';

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className={`min-h-screen ${
      darkMode ? 'bg-gray-900' : 'bg-[#1C3D6E]'
    }`}>

      {/* HEADER */}
      <header className="px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">

          <div className="w-32">
            <button
              onClick={() => setDarkMode(previous => !previous)}
              title="Toggle dark mode"
              className="flex items-center justify-center bg-white/15 hover:bg-white/25 rounded-full w-10 h-10 text-white"
            >
              {darkMode ? (
                <Sun size={18} />
              ) : (
                <Moon size={18} />
              )}
            </button>
          </div>

          <div className="flex flex-col items-center text-center">

            <img
              src={careFlowAILogo}
              alt="CareFlowAI Logo"
              className="w-16 h-16 rounded-2xl object-cover shadow-lg"
            />

            <h1 className="text-xl font-bold text-white mt-2">
              Patient Visitation
            </h1>

            <div className="flex items-center gap-2 mt-2">
              <span className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />

              <span className="text-white font-semibold">
                Live ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â updates automatically
              </span>
            </div>

            <div className="bg-yellow-500 rounded-lg px-4 py-2 mt-3">
              <p className="text-sm font-semibold text-yellow-950">
                Please stay on this page for live updates.
              </p>
            </div>

            <div className="bg-white/15 rounded-2xl px-6 py-3 mt-3 flex items-center gap-3">
              <span className="text-white/80">
                Queue Number
              </span>

              <span className="text-4xl font-extrabold text-white">
                {patient.queueNumber || 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}
              </span>
            </div>

          </div>

          <div className="w-32" />
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-6 py-8">

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* LEFT COLUMN */}
          <div className="lg:col-span-3 space-y-6">

            {/* NEXT STEPS */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">

              <h3 className="font-semibold text-blue-900 mb-2">
                Next Steps
              </h3>

              <p className="text-sm text-blue-800">

                {patient.status === 'Registered' &&
                  'A doctor will see you shortly. Please remain calm. If your symptoms worsen, notify staff immediately.'}

                {patient.status === 'Vitals Taken' &&
                  'Your vital signs have been recorded. Please wait while the nurse completes your triage assessment.'}

                {patient.status === 'Triaged' &&
                  `Your triage assessment is complete. Please proceed to ${currentLocation}.`}

                {patient.status === 'In Treatment' &&
                  `You are currently being treated ${
                    patient.assignedDoctor
                      ? `by Dr. ${patient.assignedDoctor}`
                      : ''
                  }. Please follow your doctor's instructions.`}

                {patient.status === 'Discharged' &&
                  (
                    patient.treatment?.disposition === 'Admit'
                      ? 'Your treatment is complete. You will be admitted for further care.'
                      : patient.treatment?.disposition === 'Referral'
                        ? 'Your treatment is complete. You have been referred for specialist consultation.'
                        : 'You have been discharged. Thank you for using CareFlowAI.'
                  )}

              </p>
            </div>

            {/* PATIENT STATUS */}
            <div className={`${darkCard} rounded-xl shadow-lg p-6`}>

              <h1 className="text-2xl font-bold mb-1">
                Welcome, {patient.name}
              </h1>

              <p className={`text-sm mb-6 ${secondaryText}`}>
                Patient ID: {patient.patientId}
              </p>

              <h2 className="text-lg font-semibold mb-4">
                Your Status
              </h2>

              <div className="space-y-4">

                <div className="flex items-center justify-between">
                  <span className={secondaryText}>
                    Current Location:
                  </span>

                  <span className="flex items-center gap-2 font-medium">
                    <MapPin size={16} className="text-blue-500" />
                    {currentLocation}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className={secondaryText}>
                    Status:
                  </span>

                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    getStatusBadgeStyle(
                      patient.status,
                      patient.treatment?.disposition
                    )
                  }`}>
                    {getStatusLabel(
                      patient.status,
                      patient.treatment?.disposition
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className={secondaryText}>
                    Estimated Wait:
                  </span>

                  <span className="font-bold">
                    {estimatedWait}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className={secondaryText}>
                    Priority Level:
                  </span>

                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    getPriorityStyle(patient.triageCategory)
                  }`}>
                    {getPriorityLabel(patient.triageCategory)}
                  </span>
                </div>

              </div>
            </div>

            {/* PATIENT QR CODE */}
            <div className={`${darkCard} rounded-xl shadow-lg p-6`}>

              <div className="text-center">

                <div className="flex items-center justify-center gap-2 mb-2">
                  <QrCode size={22} className="text-blue-500" />

                  <h2 className="text-lg font-bold">
                    Your Patient QR Code
                  </h2>
                </div>

                <p className={`text-sm mb-5 ${secondaryText}`}>
                  Show this QR code to authorized hospital staff
                  for quick patient identification.
                </p>

                {(patient.qrToken || patient.patientId || patient._id) ? (
                  <>
                    <div className="inline-block bg-white border border-gray-200 rounded-xl p-4">

                      <QRCodeSVG
                        value={patient.qrToken || patient.patientId || patient._id}
                        size={200}
                        level="H"
                        includeMargin={true}
                      />

                    </div>

                    <p className="font-semibold mt-4">
                      Patient ID: {patient.patientId}
                    </p>

                    <p className={`text-xs mt-2 ${secondaryText}`}>
                      Keep this QR code private. Show it only to
                      authorized hospital staff.
                    </p>
                  </>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                      QR code is not available. Please contact
                      the registration counter.
                    </p>
                  </div>
                )}

              </div>
            </div>

            {/* VITAL SIGNS */}
            {hasVitals && (
              <div className={`${darkCard} rounded-xl shadow-lg p-6`}>

                <h2 className="text-lg font-semibold mb-4">
                  Your Vital Signs
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  {/* HEART RATE */}
                  <div className="bg-gray-50 rounded-lg p-4 border">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-gray-600">
                          Heart Rate
                        </p>

                        <p className="text-xs text-gray-400">
                          bpm
                        </p>
                      </div>

                      <Heart className="text-red-500" />

                      <span className={`text-2xl font-bold ${
                        patient.vitalSigns.heartRate > 100 ||
                        patient.vitalSigns.heartRate < 60
                          ? 'text-red-500'
                          : 'text-blue-600'
                      }`}>
                        {patient.vitalSigns.heartRate}
                      </span>
                    </div>
                  </div>

                  {/* BLOOD PRESSURE */}
                  <div className="bg-gray-50 rounded-lg p-4 border">
                    <p className="text-sm text-gray-600">
                      Blood Pressure
                    </p>

                    <p className="text-2xl font-bold text-blue-600">
                      {patient.vitalSigns.systolicBP || 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}/
                      {patient.vitalSigns.diastolicBP || 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}
                    </p>

                    <p className="text-xs text-gray-400">
                      mmHg
                    </p>
                  </div>

                  {/* TEMPERATURE */}
                  {patient.vitalSigns.temperature != null && (
                    <div className="bg-gray-50 rounded-lg p-4 border">
                      <p className="text-sm text-gray-600">
                        Temperature
                      </p>

                      <p className="text-2xl font-bold text-blue-600">
                        {patient.vitalSigns.temperature} Ãƒâ€šÃ‚Â°C
                      </p>
                    </div>
                  )}

                  {/* SPO2 */}
                  {patient.vitalSigns.spO2 != null && (
                    <div className="bg-gray-50 rounded-lg p-4 border">
                      <p className="text-sm text-gray-600">
                        SpO2
                      </p>

                      <p className="text-2xl font-bold text-blue-600">
                        {patient.vitalSigns.spO2}%
                      </p>
                    </div>
                  )}

                </div>
              </div>
            )}

            {/* QUEUE POSITION */}
            {queueInfo && patient.status === 'Registered' && (
              <div className={`${darkCard} rounded-xl shadow-lg p-6`}>

                <h2 className="text-lg font-semibold mb-4">
                  Queue Status
                </h2>

                <div className="grid grid-cols-2 gap-4">

                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
                      <Users size={16} />
                      <span className="text-xs font-medium">
                        Your Position
                      </span>
                    </div>

                    <p className="text-3xl font-bold text-blue-700">
                      {queueInfo.position}
                    </p>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
                      <Clock size={16} />
                      <span className="text-xs font-medium">
                        Total Waiting
                      </span>
                    </div>

                    <p className="text-3xl font-bold text-blue-700">
                      {queueInfo.totalWaiting}
                    </p>
                  </div>

                </div>
              </div>
            )}

          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-2 space-y-6">

            {/* JOURNEY TIMELINE */}
            <div className={`${darkCard} rounded-xl shadow-lg p-6`}>

              <h2 className="text-lg font-semibold mb-6">
                Your Journey
              </h2>

              <div className="relative">

                <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gray-200" />

                <div className="space-y-8">

                  {JOURNEY_STEPS.map((step, index) => {

                    const state = getStepState(
                      step.minStatus,
                      currentStatus
                    );

                    const {
                      primaryTime,
                      durationLabel
                    } = getStepDisplayData(index, patient);

                    return (
                      <div
                        key={index}
                        className="relative flex items-start gap-4"
                      >

                        <div className="relative z-10 flex-shrink-0">

                          {state === 'completed' && (
                            <div className="w-[30px] h-[30px] rounded-full bg-green-500 flex items-center justify-center">
                              <CheckCircle
                                size={16}
                                className="text-white"
                              />
                            </div>
                          )}

                          {state === 'current' && (
                            <div className="w-[30px] h-[30px] rounded-full bg-blue-500 flex items-center justify-center">
                              <span className="h-3 w-3 rounded-full bg-white animate-pulse" />
                            </div>
                          )}

                          {state === 'pending' && (
                            <div className="w-[30px] h-[30px] rounded-full bg-gray-200 flex items-center justify-center">
                              <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                            </div>
                          )}

                        </div>

                        <div className="pt-1">

                          <p className={`font-semibold ${
                            state === 'completed'
                              ? 'text-green-600'
                              : state === 'current'
                                ? 'text-blue-600'
                                : secondaryText
                          }`}>
                            {step.label}
                          </p>

                          {state === 'pending' ? (
                            <p className={`text-sm ${secondaryText}`}>
                              Pending
                            </p>
                          ) : (
                            <>
                              {primaryTime && (
                                <p className={`text-sm ${secondaryText}`}>
                                  {primaryTime}
                                </p>
                              )}

                              {durationLabel && (
                                <p className={`text-xs mt-1 ${secondaryText}`}>
                                  {durationLabel}
                                </p>
                              )}

                              {state === 'current' && !primaryTime && (
                                <p className="text-sm text-blue-500">
                                  In Progress
                                </p>
                              )}
                            </>
                          )}

                        </div>

                      </div>
                    );
                  })}

                </div>
              </div>
            </div>

            {/* PATIENT DETAILS */}
            <div className={`${darkCard} rounded-xl shadow-lg p-6`}>

              <h2 className="text-lg font-semibold mb-4">
                Your Details
              </h2>

              <div className="space-y-3 text-sm">

                <div className="flex justify-between gap-3">
                  <span className={secondaryText}>Name</span>
                  <span className="font-medium text-right">
                    {patient.name}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className={secondaryText}>
                    IC / Passport Number
                  </span>

                  <span className="font-medium text-right">
                    {patient.icNumber}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className={secondaryText}>
                    Age / Gender
                  </span>

                  <span className="font-medium text-right">
                    {computeAge(patient.dateOfBirth)} / {patient.gender}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className={secondaryText}>Contact</span>

                  <span className="font-medium text-right">
                    {patient.contactNumber}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className={secondaryText}>
                    Chief Complaint
                  </span>

                  <span className="font-medium text-right max-w-[200px]">
                    {patient.chiefComplaint}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className={secondaryText}>Registered</span>

                  <span className="font-medium text-right">
                    {patient.arrivalTime
                      ? new Date(patient.arrivalTime).toLocaleTimeString()
                      : 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}
                  </span>
                </div>

              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
