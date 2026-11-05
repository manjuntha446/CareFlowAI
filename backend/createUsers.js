const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    // Create demo users
    const users = [
      {
        username: 'admin',
        password: await bcrypt.hash('admin123', 10),
        role: 'admin',
        name: 'Admin User',
        email: 'admin@careflowai.com'
      },
      {
        username: 'doctor',
        password: await bcrypt.hash('doctor123', 10),
        role: 'clinician',
        name: 'Khairul Aming',
        email: 'doctor@careflowai.com'
      },
      {
        username: 'patient',
        password: await bcrypt.hash('patient123', 10),
        role: 'patient',
        name: 'Patient User',
        email: 'patient@careflowai.com'
      }
    ];

    // Clear existing users
    await User.deleteMany({});
    console.log('🗑️  Cleared existing users');

    // Insert demo users
    await User.insertMany(users);
    console.log('✅ Demo users created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('-----------------------------------');
    console.log('👤 Admin:     admin / admin123');
    console.log('👨‍⚕️  Clinician: doctor / doctor123');
    console.log('🏥 Patient:   patient / patient123');
    console.log('-----------------------------------\n');
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
