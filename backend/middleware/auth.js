
const jwt = require('jsonwebtoken');

// ============================================
// VERIFY JWT TOKEN
// ============================================
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Access denied. No token provided.'
    });
  }

  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: 'Authentication service is not configured'
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    // Reject temporary MFA login tokens.
    if (
      decoded.purpose ||
      !decoded.id ||
      !decoded.role
    ) {
      return res.status(401).json({
        message: 'Invalid access token.'
      });
    }

    req.user = decoded;

    next();

  } catch (error) {
    return res.status(401).json({
      message: 'Invalid or expired token.'
    });
  }
};

// ============================================
// ADMIN ONLY
// ============================================
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      message: 'Access denied. Admin role required.'
    });
  }

  next();
};

// ============================================
// ADMIN AND CLINICIAN ACCESS
// ============================================
const requireMedicalStaff = (req, res, next) => {
  if (!['admin', 'clinician'].includes(req.user?.role)) {
    return res.status(403).json({
      message: 'Access denied. Medical staff only.'
    });
  }

  next();
};

// ============================================
// CLINICIAN ONLY
// ============================================
const requireClinician = (req, res, next) => {
  if (req.user?.role !== 'clinician') {
    return res.status(403).json({
      message: 'Access denied. Only clinicians can update clinical workflow status.'
    });
  }

  next();
};

// ============================================
// PATIENT ONLY
// ============================================
const requirePatient = (req, res, next) => {
  if (req.user?.role !== 'patient') {
    return res.status(403).json({
      message: 'Access denied. Patient account required.'
    });
  }

  next();
};

// ============================================
// EXPORT MIDDLEWARE
// ============================================
module.exports = {
  verifyToken,
  requireAdmin,
  requireClinician,
  requireMedicalStaff,
  requirePatient
};
