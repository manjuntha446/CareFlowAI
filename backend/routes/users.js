const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// GET /api/users — List all users (admin only)
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/users — Create a new user (admin only)
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, role, name, email } = req.body;

    // Validate required fields
    if (!username || !password || !role || !name || !email) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate role
    const validRoles = ['admin', 'clinician', 'patient'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be admin, clinician, or patient.' });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      username,
      password: hashedPassword,
      role,
      name,
      email
    });

    await user.save();

    // Return user without password
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({ message: 'User created successfully', user: userResponse });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/users/:id — Delete a user (admin only)
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent admin from deleting themselves
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
