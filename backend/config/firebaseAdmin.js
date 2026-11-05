const fs = require('fs');
const path = require('path');
const { initializeApp, getApps, getApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

let appInstance = null;

function initFirebaseAdmin() {
  if (getApps().length > 0) {
    appInstance = getApp();
    return appInstance;
  }

  try {
    // 1. Full service account JSON or file path
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      let serviceAccount;
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      if (raw.startsWith('{')) {
        serviceAccount = JSON.parse(raw);
      } else {
        const resolvedPath = path.isAbsolute(raw)
          ? raw
          : path.resolve(__dirname, '..', raw);
        serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
      }
      appInstance = initializeApp({
        credential: cert(serviceAccount)
      });
      console.log('✅ Firebase Admin initialized with service account');
      return appInstance;
    }

    // 2. Individual environment variables
    if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      appInstance = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
      console.log('✅ Firebase Admin initialized with individual credentials');
      return appInstance;
    }

    // 3. Project ID only (for verifying tokens against Google public keys)
    if (process.env.FIREBASE_PROJECT_ID) {
      appInstance = initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID
      });
      console.log('✅ Firebase Admin initialized with projectId:', process.env.FIREBASE_PROJECT_ID);
      return appInstance;
    }

    // 4. Fallback default credentials (e.g. GOOGLE_APPLICATION_CREDENTIALS)
    appInstance = initializeApp();
    console.log('✅ Firebase Admin initialized with default credentials');
    return appInstance;
  } catch (err) {
    console.warn('⚠️ Firebase Admin initialization notice:', err.message);
    return null;
  }
}

// Automatically initialize on module load
initFirebaseAdmin();

/**
 * Verify a Firebase ID token sent from the client.
 * Returns the decoded token payload.
 */
async function verifyFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Firebase ID token is required');
  }

  if (getApps().length === 0) {
    initFirebaseAdmin();
  }

  if (getApps().length === 0) {
    throw new Error(
      'Firebase Admin SDK is not configured. Please set FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT in backend/.env.'
    );
  }

  const auth = getAuth(getApp());
  const decoded = await auth.verifyIdToken(idToken);
  return decoded;
}

module.exports = {
  initFirebaseAdmin,
  verifyFirebaseIdToken
};
