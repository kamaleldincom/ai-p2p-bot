/**
 * Dashboard routes
 */
const express = require('express');
const router = express.Router();
const User = require('../../src/models/user');
const Transaction = require('../../src/models/transaction');

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

module.exports = router;