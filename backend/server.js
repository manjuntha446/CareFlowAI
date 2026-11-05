
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');


// Load environment variables
require('dotenv').config({
  path: path.join(__dirname, '.env')
});

const app = express();

// Behind a reverse proxy (Render / Vercel) this makes req.ip reflect the real
// client so rate limiting works per-client instead of per-proxy.
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Routes
const patientsRouter = require('./routes/patients');
const authRouter = require('./routes/authRoutes');
const aiRouter = require('./routes/ai');
const usersRouter = require('./routes/users');
const reportsRouter = require('./routes/reports');
const { rateLimit } = require('./middleware/rateLimit');

// ---- Rate limiting on sensitive authentication endpoints ----
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many sign-in attempts. Please wait and try again.'
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many accounts created from this device. Please try later.'
});

// These must be registered BEFORE the auth router so they run first.
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/google', loginLimiter);
app.use('/api/auth/register', registerLimiter);

app.use('/api/patients', patientsRouter);
app.use('/api/auth', authRouter);
app.use('/api/ai', aiRouter);
app.use('/api/users', usersRouter);
app.use('/api/reports', reportsRouter);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'CareFlowAI Backend API Running',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      patients: '/api/patients',
      ai: '/api/ai',
      users: '/api/users',
      reports: '/api/reports'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);

  res.status(500).json({
    message: 'Something went wrong!'
  });
});

// MongoDB connection and server startup
const connectWithRetry = (retries = 5, delayMs = 5000) => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('MONGO_URI is missing in .env');
    process.exit(1);
  }

  const attemptConnection = (remainingRetries) => {
    mongoose.connect(mongoUri)
      .then(() => {
        console.log('MongoDB connected successfully');

        const PORT = process.env.PORT || 5000;

        // app.listen(PORT, () => {
        //   console.log(`CareFlowAI server running at http://localhost:${PORT}`);
        // });
      const options = {
  key: fs.readFileSync(
    path.join(__dirname, '../certs/localhost-key.pem')
  ),
  cert: fs.readFileSync(
    path.join(__dirname, '../certs/localhost.pem')
  )
};

https.createServer(options, app).listen(5000, () => {
  console.log('HTTPS Backend running at https://localhost:5000');
});
      })
      .catch((err) => {
        console.error('MongoDB connection error:', err.message);

        if (remainingRetries <= 0) {
          console.error('All MongoDB connection retries exhausted.');
          process.exit(1);
        }

        console.log(
          `Retrying MongoDB connection in ${delayMs / 1000} seconds...`
        );

        setTimeout(() => {
          attemptConnection(remainingRetries - 1);
        }, delayMs);
      });
  };

  attemptConnection(retries);
};

connectWithRetry();
