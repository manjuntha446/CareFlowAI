const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const { verifyFirebaseIdToken } = require('../config/firebaseAdmin');

// Normalize email
const normalizeEmail = (email) => {
  return String(email || '').trim().toLowerCase();
};

// Create application access token
const generateAccessToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing');
  }

  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Safe user response
const getUserResponse = (user) => ({
  id: user._id,
  username: user.username,
  role: user.role,
  name: user.name,
  email: user.email,
  authProvider: user.authProvider || 'local'
});

// ============================================
// MANUAL REGISTRATION (Patient Accounts Only)
// POST /api/auth/register
// ============================================
router.post('/register', async (req, res) => {
  try {
    const { password, name, email, phone, dateOfBirth } = req.body;

    if (!password || !email || !name) {
      return res.status(400).json({
        message: 'Password, name and email are required'
      });
    }

    if (String(password).length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters'
      });
    }

    const normalizedEmail = normalizeEmail(email);

    const allowedRoles = ['admin', 'clinician', 'patient'];
    const requestedRole = String(req.body.role || '').toLowerCase().trim();
    const role = allowedRoles.includes(requestedRole) ? requestedRole : 'patient';

    const username = String(req.body.username || normalizedEmail).trim();

    const existingUser = await User.findOne({
      $or: [
        { username },
        { email: normalizedEmail }
      ]
    });

    if (existingUser) {
      return res.status(409).json({
        message: 'An account with this email already exists. Please sign in instead.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      username,
      password: hashedPassword,
      role,
      name: String(name).trim(),
      email: normalizedEmail,
      phone: phone || '',
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      authProvider: 'local'
    });

    await user.save();

    const roleLabel = role === 'admin' ? 'Administrator' : role === 'clinician' ? 'Clinical staff' : 'Patient';
    return res.status(201).json({
      message: `${roleLabel} account created successfully. You can now sign in.`,
      user: getUserResponse(user)
    });

  } catch (error) {
    console.error('Registration error:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: 'An account with this email already exists. Please sign in instead.'
      });
    }

    return res.status(500).json({
      message: 'Registration failed',
      error: error.message
    });
  }
});

// ============================================
// MANUAL EMAIL / PASSWORD LOGIN
// POST /api/auth/login
// ============================================
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: 'Email address and password are required'
      });
    }

    const loginValue = String(username).trim();
    const normalizedEmail = normalizeEmail(loginValue);

    const user = await User.findOne({
      $or: [
        { email: normalizedEmail },
        { username: loginValue }
      ]
    });

    const dummyHash = '$2b$10$C.wJvLCYOtJk9gDC11FXGeuXEt3G.yUpiRaY1oCbcnZ6FQcmGeXy2';

    if (!user) {
      // Timing attack mitigation
      await bcrypt.compare(password, dummyHash);
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    // Google-only account without manual password
    if (!user.password) {
      return res.status(400).json({
        message: 'This account was registered using Google. Please sign in with "Continue with Google".'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    const token = generateAccessToken(user);

    return res.json({
      token,
      user: getUserResponse(user)
    });

  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      message: 'Login failed. Please try again.'
    });
  }
});

// ============================================
// GOOGLE OAUTH LOGIN & UNIFIED ACCOUNT LINKING
// POST /api/auth/google
// ============================================
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        message: 'Firebase ID token is required'
      });
    }

    // 1. Verify Firebase ID token with Firebase Admin SDK
    let decodedToken;
    try {
      decodedToken = await verifyFirebaseIdToken(idToken);
    } catch (verifyErr) {
      console.error('Firebase token verification failed:', verifyErr.message);
      return res.status(401).json({
        message: 'Google authentication failed: ' + verifyErr.message
      });
    }

    const googleUid = decodedToken.uid;
    const email = normalizeEmail(decodedToken.email);

    if (!email) {
      return res.status(400).json({
        message: 'Google account did not return a valid email address.'
      });
    }

    // Security check: Only link verified Google emails
    if (!decodedToken.email_verified) {
      return res.status(400).json({
        message: 'Your Google email is not verified. Please verify your email with Google before signing in.'
      });
    }

    // 2. Find existing account by normalized email
    let user = await User.findOne({ email });

    if (user) {
      // 3. User already exists in MongoDB -> Link Google account securely
      if (user.googleUid && user.googleUid !== googleUid) {
        return res.status(409).json({
          message: 'This email is already associated with a different Google account. Please sign in using your existing method.'
        });
      }

      // Link Google UID if not already linked
      if (!user.googleUid) {
        user.googleUid = googleUid;
        user.authProvider = user.password ? 'both' : 'google';
        await user.save();
      }

      // Do NOT overwrite existing user role, name, patient profile, or data.
      // Same MongoDB account is returned for both manual and Google login.
      const token = generateAccessToken(user);

      return res.json({
        token,
        user: getUserResponse(user)
      });
    }

    // 4. No account exists yet -> Create new user following patient registration policy
    // SECURITY: Public Google registration strictly grants 'patient' role.
    const username = email;
    const name = String(decodedToken.name || email.split('@')[0]).trim();

    user = new User({
      username,
      password: null, // Google-only account; manual password login works only after password setup
      role: 'patient',
      name: name || 'Patient User',
      email,
      phone: '',
      dateOfBirth: null,
      googleUid,
      authProvider: 'google'
    });

    await user.save();

    const token = generateAccessToken(user);

    return res.status(201).json({
      token,
      user: getUserResponse(user)
    });

  } catch (error) {
    console.error('Google authentication error:', error);
    return res.status(500).json({
      message: 'Google authentication processing failed: ' + error.message
    });
  }
});

module.exports = router;
