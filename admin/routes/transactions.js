/**
 * Transactions routes
 */
const express = require('express');
const router = express.Router();
const Transaction = require('../../src/models/transaction');
const User = require('../../src/models/user');

/**
 * List all transactions
 */
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Get query parameters for filtering
    const { status, userId, transactionId } = req.query;
    
    // Build query
    const query = {};
    if (status) query.status = status;
    if (transactionId) query.transactionId = transactionId;
    if (userId) {
      query.$or = [
        { 'initiator.userId': userId },
        { 'recipient.userId': userId }
      ];
    }
    
    // Execute query with pagination
    const transactions = await Transaction.find(query)
      .sort({ 'timestamps.created': -1 })
      .skip(skip)
      .limit(limit);
    
    // Count total for pagination
    const total = await Transaction.countDocuments(query);
    const pages = Math.ceil(total / limit);
    
    // Get user info for each transaction
    const formattedTransactions = [];
    for (const tx of transactions) {
      const initiator = await User.findOne({ userId: tx.initiator.userId });
      const recipient = tx.recipient.userId ? await User.findOne({ userId: tx.recipient.userId }) : null;
      
      formattedTransactions.push({
        id: tx.transactionId,
        initiator: {
          id: tx.initiator.userId,
          name: initiator ? initiator.name : 'Unknown',
          amount: tx.initiator.amount,
          currency: tx.initiator.currency
        },
        recipient: {
          id: tx.recipient.userId,
          name: recipient ? recipient.name : 'Pending',
          amount: tx.recipient.amount,
          currency: tx.recipient.currency
        },
        status: tx.status,
        rate: tx.rate,
        relationship: tx.relationship,
        createdAt: tx.timestamps.created ? new Date(tx.timestamps.created).toLocaleString() : 'N/A',
        completedAt: tx.timestamps.completed ? new Date(tx.timestamps.completed).toLocaleString() : 'N/A'
      });
    }
    
    res.render('transactions/index', {
      title: 'Transaction Management',
      transactions: formattedTransactions,
      filters: { status, userId, transactionId },
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
 * View transaction details
 */
router.get('/:transactionId', async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({ transactionId: req.params.transactionId });
    
    if (!transaction) {
      return res.status(404).render('error', {
        title: 'Transaction Not Found',
        message: `No transaction found with ID: ${req.params.transactionId}`
      });
    }
    
    // Get user details
    const initiator = await User.findOne({ userId: transaction.initiator.userId });
    const recipient = transaction.recipient.userId ? 
      await User.findOne({ userId: transaction.recipient.userId }) : 
      null;
    
    // Format messages
    const messages = (transaction.messages || []).map(msg => ({
      from: msg.fromUserId,
      fromName: msg.fromUserName,
      to: msg.toUserId,
      message: msg.message,
      timestamp: new Date(msg.timestamp).toLocaleString(),
      read: msg.read
    }));
    
    // Format proofs
    const proofs = (transaction.proofs || []).map(proof => ({
      userId: proof.userId,
      imageId: proof.imageId,
      uploadedAt: new Date(proof.uploadedAt).toLocaleString()
    }));
    
    // Format reports
    const reports = (transaction.reports || []).map(report => ({
      userId: report.userId,
      reason: report.reason,
      details: report.details,
      timestamp: new Date(report.timestamp).toLocaleString(),
      status: report.status
    }));
    
    res.render('transactions/view', {
      title: `Transaction: ${transaction.transactionId}`,
      transaction: {
        id: transaction.transactionId,
        initiator: {
          id: transaction.initiator.userId,
          name: initiator ? initiator.name : 'Unknown',
          amount: transaction.initiator.amount,
          currency: transaction.initiator.currency
        },
        recipient: {
          id: transaction.recipient.userId,
          name: recipient ? recipient.name : 'Pending',
          amount: transaction.recipient.amount,
          currency: transaction.recipient.currency
        },
        status: transaction.status,
        rate: transaction.rate,
        relationship: transaction.relationship,
        notes: transaction.notes,
        pendingPartnerTransactionId: transaction.pendingPartnerTransactionId,
        messages,
        proofs,
        reports,
        timestamps: {
          created: transaction.timestamps.created ? new Date(transaction.timestamps.created).toLocaleString() : 'N/A',
          matchRequested: transaction.timestamps.matchRequested ? new Date(transaction.timestamps.matchRequested).toLocaleString() : 'N/A',
          matched: transaction.timestamps.matched ? new Date(transaction.timestamps.matched).toLocaleString() : 'N/A',
          completed: transaction.timestamps.completed ? new Date(transaction.timestamps.completed).toLocaleString() : 'N/A'
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Update transaction status
 */
router.post('/:transactionId/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['open', 'pending_match', 'matched', 'proof_uploaded', 'completed', 'cancelled'];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid status. Valid values are: ${validStatuses.join(', ')}` 
      });
    }
    
    const transaction = await Transaction.findOne({ transactionId: req.params.transactionId });
    
    if (!transaction) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transaction not found' 
      });
    }
    
    // Update status and timestamps
    transaction.status = status;
    if (status === 'completed' && !transaction.timestamps.completed) {
      transaction.timestamps.completed = new Date();
      
      // Update trust scores if completing the transaction
      await updateTrustScores(transaction);
    }
    
    await transaction.save();
    
    res.json({ 
      success: true, 
      message: `Transaction status updated to ${status}`,
      transaction: {
        id: transaction.transactionId,
        status: transaction.status
      }
    });
  } catch (err) {
    console.error('Error updating transaction status:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating transaction status' 
    });
  }
});

/**
 * Resolve a reported issue
 */
router.post('/:transactionId/reports/:reportId/resolve', async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({ 
      transactionId: req.params.transactionId,
      'reports._id': req.params.reportId
    });
    
    if (!transaction) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transaction or report not found' 
      });
    }
    
    // Find and update the report
    const report = transaction.reports.id(req.params.reportId);
    if (!report) {
      return res.status(404).json({ 
        success: false, 
        message: 'Report not found' 
      });
    }
    
    report.status = 'resolved';
    await transaction.save();
    
    res.json({ 
      success: true, 
      message: 'Issue marked as resolved',
      report: {
        id: report._id,
        status: report.status
      }
    });
  } catch (err) {
    console.error('Error resolving issue:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error resolving issue' 
    });
  }
});

/**
 * Cancel a transaction
 */
router.post('/:transactionId/cancel', async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({ transactionId: req.params.transactionId });
    
    if (!transaction) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transaction not found' 
      });
    }
    
    // Can only cancel transactions that are not completed or cancelled
    if (['completed', 'cancelled'].includes(transaction.status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot cancel a transaction that is already ${transaction.status}` 
      });
    }
    
    // Update status
    transaction.status = 'cancelled';
    await transaction.save();
    
    res.json({ 
      success: true, 
      message: 'Transaction cancelled',
      transaction: {
        id: transaction.transactionId,
        status: transaction.status
      }
    });
  } catch (err) {
    console.error('Error cancelling transaction:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error cancelling transaction' 
    });
  }
});

/**
 * Update trust scores for transaction parties
 */
async function updateTrustScores(transaction) {
  // Skip if no recipient
  if (!transaction.recipient.userId) return;
  
  // Update initiator trust score
  await User.updateOne(
    { userId: transaction.initiator.userId },
    { 
      $inc: { 
        trustScore: 5,
        completedTransactions: 1
      } 
    }
  );
  
  // Update recipient trust score
  await User.updateOne(
    { userId: transaction.recipient.userId },
    { 
      $inc: { 
        trustScore: 5,
        completedTransactions: 1
      } 
    }
  );
}

module.exports = router;