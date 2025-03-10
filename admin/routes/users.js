/**
 * Users routes
 */
const express = require('express');
const router = express.Router();
const User = require('../../src/models/user');

/**
 * List all users
 */
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Get query parameters for filtering
    const { name, status, country } = req.query;
    
    // Build query
    const query = {};
    if (name) query.name = new RegExp(name, 'i');
    if (status) query.status = status;
    if (country) query.country = country;
    
    // Execute query with pagination
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Count total for pagination
    const total = await User.countDocuments(query);
    const pages = Math.ceil(total / limit);
    
    // Format users for display
    const formattedUsers = users.map(user => ({
      id: user.userId,
      name: user.name,
      country: user.country,
      referralCode: user.referralCode,
      referredBy: user.referredBy,
      trustScore: user.trustScore,
      completedTransactions: user.completedTransactions,
      status: user.status,
      createdAt: user.createdAt ? new Date(user.createdAt).toLocaleString() : 'N/A'
    }));
    
    res.render('users/index', {
      title: 'User Management',
      users: formattedUsers,
      filters: { name, status, country },
      pagination: {
        page,
        limit,
        total,
        pages
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * View user details
 */
router.get('/:userId', async (req, res, next) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    
    if (!user) {
      return res.status(404).render('error', {
        title: 'User Not Found',
        message: `No user found with ID: ${req.params.userId}`
      });
    }
    
    res.render('users/view', {
      title: `User: ${user.name}`,
      user: {
        id: user.userId,
        telegramUsername: user.telegramUsername,
        name: user.name,
        phone: user.phone,
        identificationNumber: user.identificationNumber,
        country: user.country,
        referralCode: user.referralCode,
        referredBy: user.referredBy,
        trustScore: user.trustScore,
        completedTransactions: user.completedTransactions,
        status: user.status,
        createdAt: user.createdAt ? new Date(user.createdAt).toLocaleString() : 'N/A'
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Update user status
 */
router.post('/:userId/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    
    if (!status || !['active', 'suspended'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status value' 
      });
    }
    
    const user = await User.findOneAndUpdate(
      { userId: req.params.userId },
      { status },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: `User status updated to ${status}`,
      user: {
        id: user.userId,
        name: user.name,
        status: user.status
      }
    });
  } catch (err) {
    console.error('Error updating user status:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating user status' 
    });
  }
});

/**
 * Adjust user trust score
 */
router.post('/:userId/trust-score', async (req, res, next) => {
  try {
    const { adjustment } = req.body;
    const adjustmentValue = parseInt(adjustment);
    
    if (isNaN(adjustmentValue)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid adjustment value' 
      });
    }
    
    const user = await User.findOne({ userId: req.params.userId });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    user.trustScore += adjustmentValue;
    await user.save();
    
    res.json({ 
      success: true, 
      message: `Trust score adjusted by ${adjustment}`,
      user: {
        id: user.userId,
        name: user.name,
        trustScore: user.trustScore
      }
    });
  } catch (err) {
    console.error('Error adjusting trust score:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error adjusting trust score' 
    });
  }
});

module.exports = router;