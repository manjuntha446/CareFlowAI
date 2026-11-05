import { useState, useEffect } from 'react';
import careFlowAILogo from '../assets/CareFlowAI-Logo.png';
import { getPatients, getStats, getUsers, createUser, deleteUser } from '../services/api';
import { Users, Activity, Clock, TrendingUp, AlertCircle, LayoutDashboard,  User, LogOut, Search, Eye, ChevronUp, ChevronDown, Moon, Sun, UserPlus, Trash2, Shield, Stethoscope, Heart, X, Check, AlertTriangle } from 'lucide-react';
// import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

function computeAge(dob) {
  if (!dob) return '—';
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function getTriageColor(category) {
  const colors = {
    1: 'bg-red-100 text-red-800 border-red-300',
    2: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    3: 'bg-green-100 text-green-800 border-green-300'
  };
  return colors[category] || 'bg-gray-100 text-gray-800 border-gray-300';
}

function getTriageLabel(category) {
  const labels = { 1: 'Cat 1 (Red)', 2: 'Cat 2 (Yellow)', 3: 'Cat 3 (Green)' };
  return labels[category] || 'Not triaged';
}

function getStatusColor(status, disposition) {
  if (status === 'Discharged') {
    if (disposition === 'Admit')    return 'bg-blue-100 text-blue-800';
    if (disposition === 'Referral') return 'bg-orange-100 text-orange-800';
    return 'bg-green-100 text-green-800';
  }
  const colors = {
    'Registered':  'bg-purple-100 text-purple-800',
    'Vitals Taken':'bg-indigo-100 text-indigo-800',
    'Triaged':     'bg-orange-100 text-orange-800',
    'In Treatment':'bg-blue-100 text-blue-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

function getStatusLabel(status, disposition) {
  if (status === 'Discharged') {
    if (disposition === 'Admit')    return 'Admitted';
    if (disposition === 'Referral') return 'Referred';
    return 'Discharged';
  }
  return status;
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const STATUS_ORDER = { 'Registered': 1, 'Vitals Taken': 2, 'Triaged': 3, 'In Treatment': 4, 'Discharged': 5 };

function PatientTable({ patients }) {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [sortField, setSortField] = useState('arrivalTime');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const filtered = patients.filter(p =>
    (p.name?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (p.patientId?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (p.icNumber?.toLowerCase() || '').includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    let aVal, bVal;
    switch (sortField) {
      case 'name':       aVal = a.name?.toLowerCase() || ''; bVal = b.name?.toLowerCase() || ''; break;
      case 'icNumber':   aVal = a.icNumber?.toLowerCase() || ''; bVal = b.icNumber?.toLowerCase() || ''; break;
      case 'age':        aVal = a.dateOfBirth ? new Date(a.dateOfBirth).getTime() : 0; bVal = b.dateOfBirth ? new Date(b.dateOfBirth).getTime() : 0; break;
      case 'triage':     aVal = a.triageCategory ?? 99; bVal = b.triageCategory ?? 99; break;
      case 'location':   aVal = a.assignedLocation?.toLowerCase() || ''; bVal = b.assignedLocation?.toLowerCase() || ''; break;
      case 'diagnosis':  aVal = a.treatment?.provisionalDiagnosis?.toLowerCase() || ''; bVal = b.treatment?.provisionalDiagnosis?.toLowerCase() || ''; break;
      case 'disposition':aVal = a.treatment?.disposition?.toLowerCase() || ''; bVal = b.treatment?.disposition?.toLowerCase() || ''; break;
      case 'status':     aVal = STATUS_ORDER[a.status] ?? 99; bVal = STATUS_ORDER[b.status] ?? 99; break;
      case 'arrivalTime':aVal = new Date(a.arrivalTime).getTime(); bVal = new Date(b.arrivalTime).getTime(); break;
      default:           aVal = 0; bVal = 0;
    }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="ml-1 opacity-30">↕</span>;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="inline ml-1 text-blue-500" />
      : <ChevronDown size={12} className="inline ml-1 text-blue-500" />;
  };

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-blue-600 hover:bg-blue-50/60 transition-colors";
  const thNoSort = "px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider";

  const toggleExpand = (id) => setExpandedId(prev => (prev === id ? null : id));

  return (
    <div className="bg-white rounded-2xl shadow overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-lg font-bold text-gray-800">All Patients</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {filtered.length} record{filtered.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search name, ID or IC…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200 w-56"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: '900px' }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className={thClass} onClick={() => handleSort('name')}>Patient<SortIcon field="name" /></th>
              <th className={thClass} onClick={() => handleSort('icNumber')}>IC / Passport<SortIcon field="icNumber" /></th>
              <th className={thClass} onClick={() => handleSort('age')}>Age<SortIcon field="age" /></th>
              <th className={thClass} onClick={() => handleSort('triage')}>Triage<SortIcon field="triage" /></th>
              <th className={thClass} onClick={() => handleSort('location')}>Location<SortIcon field="location" /></th>
              <th className={thClass} onClick={() => handleSort('diagnosis')}>Diagnosis<SortIcon field="diagnosis" /></th>
              <th className={thClass} onClick={() => handleSort('disposition')}>Disposition<SortIcon field="disposition" /></th>
              <th className={thClass} onClick={() => handleSort('status')}>Status<SortIcon field="status" /></th>
              <th className={thClass} onClick={() => handleSort('arrivalTime')}>Arrival<SortIcon field="arrivalTime" /></th>
              <th className={thNoSort}>Clinical</th>
              <th className={thNoSort}>View</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((patient, i) => {
              const isExpanded = expandedId === patient._id;
              return (
                <>
                  <tr
                    key={patient._id}
                    className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {getInitials(patient.name)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 leading-tight">{patient.name}</p>
                          <p className="text-xs text-gray-400">{patient.patientId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{patient.icNumber || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{computeAge(patient.dateOfBirth)}</td>
                    <td className="px-4 py-3">
                      {patient.triageCategory ? (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getTriageColor(patient.triageCategory)}`}>
                          {getTriageLabel(patient.triageCategory)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{patient.assignedLocation || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate" title={patient.treatment?.provisionalDiagnosis || ''}>
                      {patient.treatment?.provisionalDiagnosis || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{patient.treatment?.disposition || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusColor(patient.status, patient.treatment?.disposition)}`}>
                        {getStatusLabel(patient.status, patient.treatment?.disposition)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(patient.arrivalTime).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {/* Admins monitor only — clinical status changes are
                          performed by clinicians, never from this dashboard. */}
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium text-gray-400"
                        title="Monitoring only — clinical updates are made by clinicians"
                      >
                        <Eye size={12} /> Read-only
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleExpand(patient._id)}
                        title="View patient details"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          isExpanded
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'
                        }`}
                      >
                        <Eye size={13} />
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    </td>
                  </tr>

                  {/* ── Expanded detail panel ── */}
                  {isExpanded && (
                    <tr key={`${patient._id}-detail`} className="bg-blue-50/30">
                      <td colSpan={11} className="px-4 py-4">
                        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5 overflow-x-auto">
                          <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wide mb-4 flex items-center gap-2">
                            <Eye size={15} className="text-blue-500" />
                            Patient Details — {patient.name}
                          </h3>

                          {/* Section: Demographics */}
                          <div className="mb-5">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Demographics</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Full Name</p>
                                <p className="text-sm font-medium text-gray-800">{patient.name || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">IC / Passport</p>
                                <p className="text-sm font-medium text-gray-800">{patient.icNumber || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Age</p>
                                <p className="text-sm font-medium text-gray-800">{computeAge(patient.dateOfBirth)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Contact Number</p>
                                <p className="text-sm font-medium text-gray-800">{patient.contactNumber || '—'}</p>
                              </div>
                            </div>
                          </div>

                          <hr className="border-gray-100 mb-5" />

                          {/* Section: Presentation */}
                          <div className="mb-5">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Presentation</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Chief Complaint</p>
                                <p className="text-sm font-medium text-gray-800">{patient.chiefComplaint || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Arrival Time</p>
                                <p className="text-sm font-medium text-gray-800">{new Date(patient.arrivalTime).toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Location</p>
                                <p className="text-sm font-medium text-gray-800">{patient.assignedLocation || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Triage Category</p>
                                {patient.triageCategory ? (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getTriageColor(patient.triageCategory)}`}>
                                    {getTriageLabel(patient.triageCategory)}
                                  </span>
                                ) : (
                                  <p className="text-sm font-medium text-gray-400">Not triaged</p>
                                )}
                              </div>
                            </div>
                          </div>

                          <hr className="border-gray-100 mb-5" />

                          {/* Section: Vitals */}
                          <div className="mb-5">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Vitals</p>
                            <div className="grid grid-cols-3 gap-3">
                              {[
                                { label: 'SpO₂',         value: patient.vitalSigns?.spO2 != null ? `${patient.vitalSigns.spO2}%` : '—' },
                                { label: 'Heart Rate',   value: patient.vitalSigns?.heartRate != null ? `${patient.vitalSigns.heartRate} bpm` : '—' },
                                { label: 'Blood Pressure', value: (patient.vitalSigns?.systolicBP != null && patient.vitalSigns?.diastolicBP != null) ? `${patient.vitalSigns.systolicBP}/${patient.vitalSigns.diastolicBP} mmHg` : '—' },
                                { label: 'Temperature',  value: patient.vitalSigns?.temperature != null ? `${patient.vitalSigns.temperature}°C` : '—' },
                                { label: 'Resp. Rate',   value: patient.vitalSigns?.respiratoryRate != null ? `${patient.vitalSigns.respiratoryRate} /min` : '—' },
                                { label: 'GCS',          value: patient.vitalSigns?.gcs != null ? patient.vitalSigns.gcs : '—' },
                              ].map(v => (
                                <div key={v.label} className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                                  <p className="text-xs text-gray-400 mb-1">{v.label}</p>
                                  <p className="text-sm font-bold text-gray-800">{v.value}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <hr className="border-gray-100 mb-5" />

                          {/* Section: Treatment */}
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Treatment</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Provisional Diagnosis</p>
                                <p className="text-sm font-medium text-gray-800">{patient.treatment?.provisionalDiagnosis || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Clinical Notes</p>
                                <p className="text-sm font-medium text-gray-800">{patient.treatment?.clinicalNotes || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Treatment Given</p>
                                <p className="text-sm font-medium text-gray-800">{patient.treatment?.treatmentGiven || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Disposition</p>
                                <p className="text-sm font-medium text-gray-800">{patient.treatment?.disposition || '—'}</p>
                              </div>
                              <div className="col-span-2">
                                <p className="text-xs text-gray-400 mb-0.5">Reason for Disposition</p>
                                <p className="text-sm font-medium text-gray-800">{patient.treatment?.dispositionReason || '—'}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <Users size={26} />
            </div>
            <p className="font-medium text-gray-500">
              {search ? 'No patients match your search' : 'No patients registered yet'}
            </p>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="mt-2 text-sm text-blue-500 hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [patients, setPatients] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('medivision-dark') === 'true');
  // const [hourlyFlowDate, setHourlyFlowDate] = useState('today');

  // User management state
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createFormData, setCreateFormData] = useState({ username: '', password: '', name: '', email: '', role: 'clinician' });
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('medivision-dark', darkMode);
  }, [darkMode]);

  const fetchData = async () => {
    try {
      const [patientsRes, statsRes] = await Promise.all([
        getPatients(),
        getStats()
      ]);
      setPatients(patientsRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await getUsers();
      setUsers(res.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreateSuccess('');
    setCreatingUser(true);
    try {
      await createUser(createFormData);
      setCreateSuccess(`User "${createFormData.username}" created successfully!`);
      setCreateFormData({ username: '', password: '', name: '', email: '', role: 'clinician' });
      fetchUsers();
      setTimeout(() => setCreateSuccess(''), 4000);
    } catch (error) {
      setCreateError(error.response?.data?.message || 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await deleteUser(userId);
      setDeleteConfirm(null);
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert(error.response?.data?.message || 'Failed to delete user');
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'admin': return <Shield size={14} />;
      case 'clinician': return <Stethoscope size={14} />;
      case 'patient': return <Heart size={14} />;
      default: return <User size={14} />;
    }
  };

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'clinician': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'patient': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  // Admins are monitoring-only: clinical status changes are never performed
  // from the admin dashboard (clinicians own the clinical workflow).

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'dark-mode bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <Activity className="animate-spin mx-auto mb-4 text-blue-600" size={48} />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const formatMetricDuration = (minutes) => {
    if (minutes == null) return '—';
    const mins = Math.round(minutes);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  // const TRIAGE_COLORS = { 1: '#ef4444', 2: '#eab308', 3: '#22c55e' };

  // const triageData = stats?.triageStats
  //   ?.slice()
  //   .sort((a, b) => a._id - b._id)
  //   .map(item => ({
  //     name: getTriageLabel(item._id),
  //     value: item.count,
  //     color: TRIAGE_COLORS[item._id] || '#9ca3af',
  //   })) || [];

  // Compute hourly flow from patient list based on selected date filter
  // const computeHourlyFlow = (filter) => {
  //   const now = new Date();
  //   let startDate, endDate;
  //   if (filter === 'today') {
  //     startDate = new Date(now); startDate.setHours(0, 0, 0, 0);
  //     endDate   = new Date(now); endDate.setHours(23, 59, 59, 999);
  //   } else if (filter === 'yesterday') {
  //     startDate = new Date(now); startDate.setDate(startDate.getDate() - 1); startDate.setHours(0, 0, 0, 0);
  //     endDate   = new Date(now); endDate.setDate(endDate.getDate() - 1);     endDate.setHours(23, 59, 59, 999);
  //   } else if (filter === 'week') {
  //     startDate = new Date(now); startDate.setDate(startDate.getDate() - 6); startDate.setHours(0, 0, 0, 0);
  //     endDate   = new Date(now);
  //   } else {
  //     startDate = null; endDate = null; // all time
  //   }
  //   const inRange = (d) => !startDate || (d >= startDate && d <= endDate);
  //   const arrivals   = new Array(24).fill(0);
  //   const discharges = new Array(24).fill(0);
  //   patients.forEach(p => {
  //     if (p.arrivalTime) {
  //       const d = new Date(p.arrivalTime);
  //       if (inRange(d)) arrivals[d.getHours()]++;
  //     }
  //     if (p.treatment?.treatmentEndTime && p.status === 'Discharged') {
  //       const d = new Date(p.treatment.treatmentEndTime);
  //       if (inRange(d)) discharges[d.getHours()]++;
  //     }
  //   });
  //   return Array.from({ length: 24 }, (_, h) => ({
  //     label: `${String(h).padStart(2, '0')}:00`,
  //     arrivals:   arrivals[h],
  //     discharges: discharges[h],
  //   }));
  // };

  // const hourlyFlowData = computeHourlyFlow(hourlyFlowDate);

  // const hourlyFlowLabel = {
  //   today:     `Today — ${new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}`,
  //   yesterday: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `Yesterday — ${d.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}`; })(),
  //   week:      'Last 7 Days — arrivals & discharges by hour of day',
  //   all:       'All Time — arrivals & discharges by hour of day',
  // }[hourlyFlowDate];

  const navItems = [
    { key: 'overview',   label: 'Overview',   icon: <LayoutDashboard size={20} /> },
    { key: 'patients',   label: 'Patients',   icon: <Users size={20} /> },
    { key: 'users',      label: 'Users',      icon: <UserPlus size={20} /> },
  ];

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark-mode bg-gray-900' : 'bg-[#f0f4f8]'}`}>

      {/* â”€â”€ Sidebar â”€â”€ */}
      <aside className="w-32 flex-shrink-0 flex flex-col items-center py-6 gap-3 min-h-screen" style={{ backgroundColor: '#1C3D6E' }}>
        {/* Logo */}
        <div className="flex flex-col items-center mb-5">
          <img
            src={careFlowAILogo}
            alt="CareFlowAI Logo"
            className="w-20 h-20 rounded-2xl object-cover shadow"
          />
        </div>

        {/* Nav items */}
        {navItems.map(item => (
          <button
            key={item.key}
            onClick={() => setActiveTab(item.key)}
            className={`flex flex-col items-center gap-1 px-3 py-3 rounded-full w-28 text-white transition-all duration-150 ${
              activeTab === item.key
                ? 'bg-white/25 font-semibold shadow-inner'
                : 'hover:bg-white/10'
            }`}
          >
            {item.icon}
            <span className="text-xs">{item.label}</span>
          </button>
        ))}
      </aside>

      {/* â”€â”€ Main area â”€â”€ */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* â”€â”€ Top Navbar â”€â”€ */}
        <header className="flex items-center justify-between px-6 py-3 shadow-md" style={{ backgroundColor: '#1C3D6E' }}>
          {/* Page title */}
          <h1 className="text-white font-semibold text-base tracking-wide">Smart Patient Flow Platform</h1>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDarkMode(prev => !prev)}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="flex items-center justify-center bg-white/15 hover:bg-white/25 rounded-full w-9 h-9 text-white transition"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="flex items-center gap-2 bg-white/15 rounded-full px-4 py-2 text-white text-sm select-none">
              <User size={15} />
              <span>Admin</span>
            </div>
            <button
              onClick={() => {
                sessionStorage.removeItem('token');
                sessionStorage.removeItem('user');
                window.location.href = '/';
              }}
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 rounded-full px-4 py-2 text-white text-sm transition"
            >
              <LogOut size={15} />
              <span>Log Out</span>
            </button>
          </div>
        </header>

        {/* â”€â”€ Tab content â”€â”€ */}
        <main className="flex-1 p-6 overflow-auto">

          {/* â”€â”€ OVERVIEW â”€â”€ */}
          {activeTab === 'overview' && (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
                <div className="bg-white rounded-2xl shadow p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Total Patients</p>
                      <p className="text-3xl font-bold text-gray-800">{stats?.totalPatients || 0}</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-2">
                      <Users className="text-blue-600" size={36} />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Registered</p>
                      <p className="text-3xl font-bold text-yellow-600">{stats?.registered || 0}</p>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-2">
                      <Clock className="text-yellow-500" size={36} />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">In Treatment</p>
                      <p className="text-3xl font-bold text-blue-600">{stats?.inTreatment || 0}</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-2">
                      <Activity className="text-blue-600" size={36} />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Discharged</p>
                      <p className="text-3xl font-bold text-green-600">{stats?.discharged || 0}</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-2">
                      <TrendingUp className="text-green-600" size={36} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div className="bg-white rounded-2xl shadow p-5">
                  <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Avg Triage Time</p>
                  <p className="text-3xl font-bold text-purple-700">{formatMetricDuration(stats?.averageTriageTime)}</p>
                  <p className="text-xs text-gray-400 mt-1">Check-in to Triage complete</p>
                </div>
                <div className="bg-white rounded-2xl shadow p-5">
                  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1">Avg Wait Time</p>
                  <p className="text-3xl font-bold text-orange-600">{formatMetricDuration(stats?.averageWaitingTime)}</p>
                  <p className="text-xs text-gray-400 mt-1">Triage complete to Doctor</p>
                </div>
                <div className="bg-white rounded-2xl shadow p-5">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Avg Consultation</p>
                  <p className="text-3xl font-bold text-blue-700">{formatMetricDuration(stats?.averageConsultationTime)}</p>
                  <p className="text-xs text-gray-400 mt-1">Doctor start to end</p>
                </div>
                <div className="bg-white rounded-2xl shadow p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">ED Congestion</p>
                      <p className="text-3xl font-bold text-red-600">{stats?.edCongestion ?? 0}</p>
                      <p className="text-xs text-gray-400 mt-1">Patients not discharged</p>
                    </div>
                    <AlertCircle className="text-red-300" size={34} />
                  </div>
                </div>
              </div>

              {/* Charts
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                <div className="bg-white rounded-2xl shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">Triage Distribution</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={triageData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={80} fill="#8884d8" dataKey="value">
                        {triageData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-white rounded-2xl shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">Patient Status Overview</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={[
                      { name: 'Registered',   count: stats?.registered   || 0 },
                      { name: 'Triaged',      count: stats?.triaged      || 0 },
                      { name: 'In Treatment', count: stats?.inTreatment  || 0 },
                      { name: 'Discharged',   count: stats?.discharged   || 0 },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div> */}

              {/* Patients Table */}
              <div className="mt-6">
                <PatientTable patients={patients} />
              </div>
            </>
          )}


          {/* ── PATIENTS PAGE ── */}
          {activeTab === 'patients' && (
            <PatientTable patients={patients} />
          )}

          {/* ── USER MANAGEMENT ── */}
          {activeTab === 'users' && (
            <>
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">User Management</h2>
                  <p className="text-sm text-gray-400 mt-0.5">Create and manage staff and patient accounts</p>
                </div>
                <button
                  onClick={() => { setShowCreateForm(!showCreateForm); setCreateError(''); setCreateSuccess(''); }}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm shadow transition-all duration-200 ${
                    showCreateForm
                      ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg'
                  }`}
                >
                  {showCreateForm ? <><X size={16} /> Cancel</> : <><UserPlus size={16} /> Register New User</>}
                </button>
              </div>

              {/* Create User Form */}
              {showCreateForm && (
                <div className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6 mb-6 transition-all duration-300" style={{ animation: 'loginFadeIn 0.35s ease both' }}>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                      <UserPlus size={20} className="text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-800">Register New User</h3>
                      <p className="text-xs text-gray-400">Fill in all fields to create a new staff or patient account</p>
                    </div>
                  </div>

                 {createError && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
                      <AlertTriangle size={16} />
                      <span>{createError}</span>
                    </div>
                  )}
                  {createSuccess && (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 mb-4">
                      <Check size={16} />
                      {createSuccess}
                    </div>
                  )}

                  <form onSubmit={handleCreateUser}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Dr.Manjunatha"
                          value={createFormData.name}
                          onChange={e => setCreateFormData({ ...createFormData, name: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
                        <input
                          type="email"
                          required
                          placeholder="e.g. sarah@medivision.com"
                          value={createFormData.email}
                          onChange={e => setCreateFormData({ ...createFormData, email: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Username</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. sarah.lee"
                          value={createFormData.username}
                          onChange={e => setCreateFormData({ ...createFormData, username: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Password</label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          placeholder="Min. 6 characters"
                          value={createFormData.password}
                          onChange={e => setCreateFormData({ ...createFormData, password: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
                        />
                      </div>
                    </div>
                    <div className="mb-5">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">User Role</label>
                      <div className="flex flex-wrap gap-3">
                        {[
                          { value: 'clinician', label: 'Clinician / Staff', icon: <Stethoscope size={18} />, desc: 'Doctors, nurses, medical staff', activeBorder: 'border-blue-500', activeBg: 'bg-blue-50', activeIconBg: 'bg-blue-100', activeIconText: 'text-blue-600' },
                          { value: 'patient', label: 'Patient', icon: <Heart size={18} />, desc: 'Patient with portal access', activeBorder: 'border-green-500', activeBg: 'bg-green-50', activeIconBg: 'bg-green-100', activeIconText: 'text-green-600' },
                          { value: 'admin', label: 'Admin', icon: <Shield size={18} />, desc: 'Full system administrator', activeBorder: 'border-purple-500', activeBg: 'bg-purple-50', activeIconBg: 'bg-purple-100', activeIconText: 'text-purple-600' },
                        ].map(r => (
                          <button
                            key={r.value}
                            type="button"
                            onClick={() => setCreateFormData({ ...createFormData, role: r.value })}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all duration-200 min-w-[180px] ${
                              createFormData.role === r.value
                                ? `${r.activeBorder} ${r.activeBg} shadow-sm`
                                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                              createFormData.role === r.value
                                ? `${r.activeIconBg} ${r.activeIconText}`
                                : 'bg-gray-100 text-gray-400'
                            }`}>
                              {r.icon}
                            </div>
                            <div>
                              <p className={`text-sm font-semibold ${createFormData.role === r.value ? 'text-gray-800' : 'text-gray-600'}`}>{r.label}</p>
                              <p className="text-xs text-gray-400">{r.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={creatingUser}
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-all duration-200 shadow hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {creatingUser ? (
                          <><Activity size={16} className="animate-spin" /> Creating...</>
                        ) : (
                          <><UserPlus size={16} /> Create User</>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
                <div className="bg-white rounded-2xl shadow p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Total Users</p>
                      <p className="text-3xl font-bold text-gray-800">{users.length}</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-2">
                      <Users className="text-blue-600" size={36} />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Admins</p>
                      <p className="text-3xl font-bold text-purple-600">{users.filter(u => u.role === 'admin').length}</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-2">
                      <Shield className="text-purple-600" size={36} />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Clinicians / Staff</p>
                      <p className="text-3xl font-bold text-blue-600">{users.filter(u => u.role === 'clinician').length}</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-2">
                      <Stethoscope className="text-blue-600" size={36} />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Patients</p>
                      <p className="text-3xl font-bold text-green-600">{users.filter(u => u.role === 'patient').length}</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-2">
                      <Heart className="text-green-600" size={36} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Users Table */}
              <div className="bg-white rounded-2xl shadow overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">All Users</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {users.filter(u =>
                        (u.name?.toLowerCase() || '').includes(userSearch.toLowerCase()) ||
                        (u.username?.toLowerCase() || '').includes(userSearch.toLowerCase()) ||
                        (u.email?.toLowerCase() || '').includes(userSearch.toLowerCase())
                      ).length} user{users.length !== 1 ? 's' : ''} found
                    </p>
                  </div>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search name, username or email…"
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      className="pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200 w-64"
                    />
                  </div>
                </div>

                {usersLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <Activity className="animate-spin mb-3" size={32} />
                    <p className="text-sm">Loading users...</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Username</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users
                          .filter(u =>
                            (u.name?.toLowerCase() || '').includes(userSearch.toLowerCase()) ||
                            (u.username?.toLowerCase() || '').includes(userSearch.toLowerCase()) ||
                            (u.email?.toLowerCase() || '').includes(userSearch.toLowerCase())
                          )
                          .map((user, i) => (
                            <tr key={user._id} className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                    {getInitials(user.name)}
                                  </div>
                                  <p className="font-medium text-gray-900">{user.name}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-600 font-mono text-xs">{user.username}</td>
                              <td className="px-4 py-3 text-gray-600">{user.email}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getRoleBadgeClass(user.role)}`}>
                                  {getRoleIcon(user.role)}
                                  {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                {new Date(user.createdAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </td>
                              <td className="px-4 py-3">
                                {deleteConfirm === user._id ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleDeleteUser(user._id)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition"
                                    >
                                      <Check size={12} /> Yes
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirm(null)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
                                    >
                                      <X size={12} /> No
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirm(user._id)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 bg-white hover:bg-red-50 transition"
                                  >
                                    <Trash2 size={13} /> Delete
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>

                    {users.filter(u =>
                      (u.name?.toLowerCase() || '').includes(userSearch.toLowerCase()) ||
                      (u.username?.toLowerCase() || '').includes(userSearch.toLowerCase()) ||
                      (u.email?.toLowerCase() || '').includes(userSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                          <Users size={26} />
                        </div>
                        <p className="font-medium text-gray-500">
                          {userSearch ? 'No users match your search' : 'No users found'}
                        </p>
                        {userSearch && (
                          <button
                            onClick={() => setUserSearch('')}
                            className="mt-2 text-sm text-blue-500 hover:underline"
                          >
                            Clear search
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

        </main>
      </div>
    </div>
  );
}