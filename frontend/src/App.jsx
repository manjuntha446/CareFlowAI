
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation
} from 'react-router-dom';

import Login from './components/Login';
import PatientRegistration from './components/PatientRegistration';
import PatientWaitingScreen from './components/PatientWaitingScreen';
import PatientScanView from './components/PatientScanView';
import PatientTracking from './components/PatientTracking';
import AdminDashboard from './components/AdminDashboard';
import ClinicianDashboard from './components/ClinicianDashboard';
import PatientDashboard from './components/PatientDashboard';

import './index.css';

// ============================================
// AUTHENTICATION HELPER
// ============================================

const getAuthenticatedUser = () => {
  const token = sessionStorage.getItem('token');
const storedUser = sessionStorage.getItem('user');

  if (!token || !storedUser) {
    return null;
  }

  try {
    const user = JSON.parse(storedUser);

    if (!user || !user.role) {
      return null;
    }

    return user;

  } catch (error) {
    console.error('Invalid user information:', error);

    return null;
  }
};

// ============================================
// PROTECTED ROUTE
// ============================================

const ProtectedRoute = ({ children, allowedRoles }) => {
  const user = getAuthenticatedUser();

  // User not logged in
  if (!user) {
   sessionStorage.removeItem('token');
sessionStorage.removeItem('user');

    return <Navigate to="/" replace />;
  }

  // Check user role
  if (
    allowedRoles &&
    !allowedRoles.includes(user.role)
  ) {
    // Redirect to the correct dashboard
    if (user.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }

    if (user.role === 'clinician') {
      return <Navigate to="/clinician" replace />;
    }

    if (user.role === 'patient') {
      return <Navigate to="/patient" replace />;
    }

    return <Navigate to="/" replace />;
  }

  return children;
};

// ============================================
// SCAN ROUTE (staff login required)
// Remembers the scan URL so staff return here after signing in.
// ============================================

const ScanRoute = ({ children }) => {
  const user = getAuthenticatedUser();
  const location = useLocation();

  if (!user || !['admin', 'clinician'].includes(user.role)) {
    sessionStorage.setItem('postLoginRedirect', location.pathname);
    return <Navigate to="/" replace />;
  }

  return children;
};

// ============================================
// PUBLIC ROUTE
// ============================================

const PublicRoute = ({ children }) => {
  const user = getAuthenticatedUser();

  // Redirect logged-in staff to their dashboard
  if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  if (user?.role === 'clinician') {
    return <Navigate to="/clinician" replace />;
  }

  if (user?.role === 'patient') {
    return <Navigate to="/patient" replace />;
  }

  return children;
};

// ============================================
// MAIN APP
// ============================================

function App() {
  return (
    <Router>
      <Routes>

        {/* LOGIN */}
        <Route
          path="/"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        {/* PATIENT VISIT REGISTRATION (authenticated patient only) */}
        <Route
          path="/register"
          element={
            <ProtectedRoute allowedRoles={['patient']}>
              <PatientRegistration />
            </ProtectedRoute>
          }
        />

        {/* PATIENT WAITING SCREEN */}
        <Route
          path="/waiting/:id"
          element={<PatientWaitingScreen />}
        />

        {/* PUBLIC MOBILE QR TRACKING (no authentication) */}
        <Route
          path="/track/:token"
          element={<PatientTracking />}
        />

        {/* QR SCAN RESULT (staff login required) */}
        <Route
          path="/scan/:token"
          element={
            <ScanRoute>
              <PatientScanView />
            </ScanRoute>
          }
        />

        {/* ADMIN DASHBOARD */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        {/* CLINICIAN DASHBOARD */}
        <Route
          path="/clinician"
          element={
            <ProtectedRoute allowedRoles={['clinician']}>
              <ClinicianDashboard />
            </ProtectedRoute>
          }
        />

        {/* PATIENT DASHBOARD */}
        <Route
          path="/patient"
          element={
            <ProtectedRoute allowedRoles={['patient']}>
              <PatientDashboard />
            </ProtectedRoute>
          }
        />

        {/* UNKNOWN ROUTES */}
        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />

      </Routes>
    </Router>
  );
}

export default App;
