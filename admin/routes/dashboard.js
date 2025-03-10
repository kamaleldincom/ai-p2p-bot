/**
 * Dashboard routes
 */
const express = require('express');
const router = express.Router();
const User = require('../../src/models/user');
const Transaction = require('../../src/models/transaction');
const config = require('../config');

/**
 * Dashboard home page with stats
 */
router.get('/', async (req, res, next) => {
  try {
    // Get system stats
    const userCount = await User.countDocuments();
    const activeUserCount = await User.countDocuments({ status: 'active' });
    const totalTransactions = await Transaction.countDocuments();
    const completedTransactions = await Transaction.countDocuments({ status: 'completed' });
    const pendingTransactions = await Transaction.countDocuments({ 
      status: { $in: ['open', 'pending_match', 'matched', 'proof_uploaded'] } 
    });
    
    // Get recent transactions
    const recentTransactions = await Transaction.find()
      .sort({ 'timestamps.created': -1 })
      .limit(5);
    
    // Format for display
    const formattedTransactions = recentTransactions.map(tx => ({
      id: tx.transactionId,
      initiator: tx.initiator.userId,
      amount: `${tx.initiator.amount} ${tx.initiator.currency}`,
      targetAmount: tx.recipient.amount ? `${tx.recipient.amount} ${tx.recipient.currency}` : 'N/A',
      status: tx.status,
      created: tx.timestamps.created ? new Date(tx.timestamps.created).toLocaleString() : 'N/A'
    }));
    
    // Render dashboard
    res.render('dashboard/index', {
      title: 'Admin Dashboard',
      user: req.session.user,
      stats: {
        users: {
          total: userCount,
          active: activeUserCount
        },
        transactions: {
          total: totalTransactions,
          completed: completedTransactions,
          pending: pendingTransactions
        }
      },
      recentTransactions: formattedTransactions
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Debug route to check user permissions
 */
router.get('/debug-user', (req, res) => {
  const sessionInfo = {
    authenticated: req.session.authenticated || false,
    user: req.session.user || 'Not logged in',
    availableAdmins: Object.keys(config.adminUsers).map(username => ({
      username,
      role: config.adminUsers[username].role
    }))
  };
  
  res.render('dashboard/debug', {
    title: 'Debug User Info',
    debugInfo: JSON.stringify(sessionInfo, null, 2),
    user: req.session.user
  });
});

module.exports = router;