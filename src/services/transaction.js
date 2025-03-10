/**
 * src/services/transaction.js
 * Enhanced transaction-related service functions with two-way confirmation
 */
const mongoose = require('mongoose');
const Transaction = require('../models/transaction');
const User = require('../models/user');
const { generateTransactionId } = require('../utils/helpers');

/**
 * Get a user's active transaction
 */
async function getActiveTransaction(userId) {
  try {
    const activeTransaction = await Transaction.findOne({
      $or: [
        { 'initiator.userId': userId.toString() },
        { 'recipient.userId': userId.toString() }
      ],
      status: { $in: ['open', 'pending_match', 'matched', 'proof_uploaded'] }
    });

    if (!activeTransaction) {
      return { exists: false };
    }

    // Determine if user is initiator or recipient
    const isInitiator = activeTransaction.initiator.userId === userId.toString();
    const partnerUserId = isInitiator 
      ? activeTransaction.recipient.userId 
      : activeTransaction.initiator.userId;

    // Get partner details if transaction is matched
    let partner = null;
    if (activeTransaction.status !== 'open' && partnerUserId) {
      const partnerUser = await User.findOne({ userId: partnerUserId });
      if (partnerUser) {
        partner = {
          userId: partnerUser.userId,
          name: partnerUser.name,
          trustScore: partnerUser.trustScore,
          completedTransactions: partnerUser.completedTransactions
        };
      }
    }

    return {
      exists: true,
      transaction: {
        transactionId: activeTransaction.transactionId,
        status: activeTransaction.status,
        role: isInitiator ? 'initiator' : 'recipient',
        amount: isInitiator 
          ? activeTransaction.initiator.amount 
          : activeTransaction.recipient.amount,
        currency: isInitiator 
          ? activeTransaction.initiator.currency 
          : activeTransaction.recipient.currency,
        partnerAmount: isInitiator 
          ? activeTransaction.recipient.amount 
          : activeTransaction.initiator.amount,
        partnerCurrency: isInitiator 
          ? activeTransaction.recipient.currency 
          : activeTransaction.initiator.currency,
        rate: activeTransaction.rate,
        notes: activeTransaction.notes,
        relationship: activeTransaction.relationship,
        partner: partner,
        pendingConfirmation: activeTransaction.status === 'pending_match' 
          && !isInitiator, // Check if this user needs to confirm the match
        initiatedBy: isInitiator ? 'you' : partner ? partner.name : 'partner',
        proofs: activeTransaction.proofs.map(proof => ({
          userId: proof.userId,
          uploadedAt: proof.uploadedAt
        })),
        messages: activeTransaction.messages || [],
        timestamps: activeTransaction.timestamps
      }
    };
  } catch (error) {
    console.error('Error getting active transaction:', error);
    return { error: error.message };
  }
}

/**
 * Get transaction by ID
 */
async function getTransactionById(transactionId) {
  try {
    const transaction = await Transaction.findOne({ transactionId });
    
    if (!transaction) {
      return null;
    }
    
    // Get initiator details
    const initiator = await User.findOne({ userId: transaction.initiator.userId });
    
    // Get recipient details if available
    let recipient = null;
    if (transaction.recipient.userId) {
      recipient = await User.findOne({ userId: transaction.recipient.userId });
    }
    
    return {
      transactionId: transaction.transactionId,
      amount: transaction.initiator.amount,
      currency: transaction.initiator.currency,
      targetAmount: transaction.recipient.amount,
      targetCurrency: transaction.recipient.currency,
      initiatorId: transaction.initiator.userId,
      initiatorName: initiator ? initiator.name : 'Unknown',
      initiatorTrustScore: initiator ? initiator.trustScore : 0,
      recipientId: transaction.recipient.userId,
      recipientName: recipient ? recipient.name : null,
      status: transaction.status,
      rate: transaction.rate,
      notes: transaction.notes,
      messages: transaction.messages || []
    };
  } catch (error) {
    console.error('Error getting transaction by ID:', error);
    return null;
  }
}

/**
 * Check network relationship between two users
 */
async function checkNetworkRelationship(userId1, userId2) {
  try {
    const user1 = await User.findOne({ userId: userId1.toString() });
    const user2 = await User.findOne({ userId: userId2.toString() });

    if (!user1 || !user2) {
      return { valid: false, message: "One or both users not found" };
    }

    // Check if user2 is user1's referrer
    if (user1.referredBy === user2.userId) {
      return { valid: true, relationship: 'referrer' };
    }

    // Check if user2 is referred by user1
    if (user2.referredBy === user1.userId) {
      return { valid: true, relationship: 'referee' };
    }

    // Check if both users share the same referrer (siblings)
    if (user1.referredBy === user2.referredBy && user1.referredBy !== "") {
      return { valid: true, relationship: 'sibling' };
    }

    return { valid: false, message: "Users are not in the same network" };
  } catch (error) {
    console.error('Error checking network relationship:', error);
    return { error: error.message };
  }
}

/**
 * Create a new transfer request
 */
async function createTransferRequest(data) {
  try {
    // List of supported currencies
    const SUPPORTED_CURRENCIES = ['AED', 'SDG', 'EGP'];
    
    // Check if user exists
    const user = await User.findOne({ userId: data.userId.toString() });
    if (!user) {
      return { success: false, message: "User not found" };
    }

    // Validate amount
    if (!data.amount || isNaN(data.amount) || data.amount <= 0) {
      return { success: false, message: "Invalid amount. Please provide a positive number." };
    }

    // Validate currencies
    if (!SUPPORTED_CURRENCIES.includes(data.currency)) {
      return { 
        success: false, 
        message: `Invalid currency: ${data.currency}. Supported currencies are: ${SUPPORTED_CURRENCIES.join(', ')}.` 
      };
    }

    if (!SUPPORTED_CURRENCIES.includes(data.targetCurrency)) {
      return { 
        success: false, 
        message: `Invalid target currency: ${data.targetCurrency}. Supported currencies are: ${SUPPORTED_CURRENCIES.join(', ')}.` 
      };
    }

    // Check if source and target currencies are the same
    if (data.currency === data.targetCurrency) {
      return { success: false, message: "Source and target currencies cannot be the same." };
    }

    // Check if user already has an active transaction
    const hasActiveTransaction = await Transaction.findOne({
      $or: [
        { 'initiator.userId': data.userId.toString() },
        { 'recipient.userId': data.userId.toString() }
      ],
      status: { $in: ['open', 'pending_match', 'matched', 'proof_uploaded'] }
    });

    if (hasActiveTransaction) {
      return { success: false, message: "You already have an active transaction" };
    }

    // Validate rate
    if (!data.rate || isNaN(data.rate) || data.rate <= 0) {
      return { success: false, message: "Invalid exchange rate. Please provide a positive number." };
    }

    // Create a new transaction
    const transactionId = generateTransactionId();
    const newTransaction = new Transaction({
      transactionId,
      initiator: {
        userId: data.userId.toString(),
        amount: data.amount,
        currency: data.currency
      },
      recipient: {
        amount: data.amount * data.rate,
        currency: data.targetCurrency
      },
      rate: data.rate,
      notes: data.notes || "",
      status: 'open',
      timestamps: {
        created: new Date()
      },
      messages: [] // Add messages array
    });

    await newTransaction.save();

    return {
      success: true,
      transaction: {
        transactionId: newTransaction.transactionId,
        amount: newTransaction.initiator.amount,
        currency: newTransaction.initiator.currency,
        targetAmount: newTransaction.recipient.amount,
        targetCurrency: newTransaction.recipient.currency,
        rate: newTransaction.rate,
        notes: newTransaction.notes
      }
    };
  } catch (error) {
    console.error('Error creating transfer request:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update an existing transfer request
 */
async function updateTransferRequest(userId, transactionId, updates) {
  try {
    // Get the transaction
    const transaction = await Transaction.findOne({ 
      transactionId,
      'initiator.userId': userId.toString(),
      status: 'open' // Only open transactions can be updated
    });

    if (!transaction) {
      return { 
        success: false, 
        message: "Transaction not found, or you are not authorized to update it, or it's not in 'open' status" 
      };
    }

    // Apply updates
    let updated = false;
    
    if (updates.amount && updates.amount > 0) {
      transaction.initiator.amount = updates.amount;
      updated = true;
    }
    
    if (updates.currency) {
      transaction.initiator.currency = updates.currency;
      updated = true;
    }
    
    if (updates.targetCurrency) {
      transaction.recipient.currency = updates.targetCurrency;
      updated = true;
    }
    
    if (updates.rate && updates.rate > 0) {
      transaction.rate = updates.rate;
      updated = true;
    }
    
    if (updates.notes !== undefined) {
      transaction.notes = updates.notes;
      updated = true;
    }
    
    // Recalculate target amount if amount or rate changed
    if ((updates.amount || updates.rate) && transaction.rate > 0 && transaction.initiator.amount > 0) {
      transaction.recipient.amount = transaction.initiator.amount * transaction.rate;
      updated = true;
    }

    if (!updated) {
      return { success: false, message: "No valid updates provided" };
    }

    await transaction.save();

    return {
      success: true,
      transaction: {
        transactionId: transaction.transactionId,
        amount: transaction.initiator.amount,
        currency: transaction.initiator.currency,
        targetAmount: transaction.recipient.amount,
        targetCurrency: transaction.recipient.currency,
        rate: transaction.rate,
        notes: transaction.notes
      }
    };
  } catch (error) {
    console.error('Error updating transfer request:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Find matching transfer requests in the user's network
 */
async function findMatchingTransfers(userId, transactionId) {
  try {
    // Get the transaction
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      return { success: false, message: "Transaction not found" };
    }

    // Check if the user is the initiator
    if (transaction.initiator.userId !== userId.toString()) {
      return { success: false, message: "You are not authorized to view matches for this transaction" };
    }

    // Get user's network
    const user = await User.findOne({ userId: userId.toString() });
    if (!user) {
      return { success: false, message: "User not found" };
    }

    // Get referrer
    const referrer = await User.findOne({ userId: user.referredBy });
    
    // Get direct referrals
    const referrals = await User.find({ referredBy: userId.toString() });
    
    // Get siblings
    const siblings = await User.find({ 
      referredBy: user.referredBy,
      userId: { $ne: userId.toString() }
    });

    // Combine all network IDs
    const networkUserIds = [
      ...(referrer ? [referrer.userId] : []),
      ...referrals.map(r => r.userId),
      ...siblings.map(s => s.userId)
    ];

    // Find matching transactions from network users
    const matches = await Transaction.find({
      'initiator.userId': { $in: networkUserIds },
      'initiator.currency': transaction.recipient.currency,
      'recipient.currency': transaction.initiator.currency,
      status: 'open'
    });

    // If no matches found, return empty array
    if (matches.length === 0) {
      return {
        success: true,
        matches: []
      };
    }

    // Format and return matches
    const formattedMatches = [];
    for (const match of matches) {
      // Get relationship
      const relationship = await getRelationshipLabel(userId, match.initiator.userId);
      
      // Get partner details
      const partner = await User.findOne({ userId: match.initiator.userId });
      
      formattedMatches.push({
        transactionId: match.transactionId,
        partnerId: match.initiator.userId,
        partnerName: partner ? partner.name : 'Unknown',
        partnerTrustScore: partner ? partner.trustScore : 0,
        partnerCompletedTransactions: partner ? partner.completedTransactions : 0,
        relationship: relationship,
        amount: match.initiator.amount,
        currency: match.initiator.currency,
        targetAmount: match.recipient.amount,
        targetCurrency: match.recipient.currency,
        rate: match.rate,
        notes: match.notes
      });
    }

    return {
      success: true,
      matches: formattedMatches
    };
  } catch (error) {
    console.error('Error finding matching transfers:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get relationship label
 */
async function getRelationshipLabel(userId, partnerId) {
  const user = await User.findOne({ userId: userId.toString() });
  const partner = await User.findOne({ userId: partnerId.toString() });
  
  if (user.referredBy === partnerId) {
    return 'referrer';
  } else if (partner.referredBy === userId) {
    return 'referee';
  } else {
    return 'sibling';
  }
}

/**
 * Initiate a match request (first step in two-way confirmation)
 */
async function initiateMatchRequest(userId, transactionId, partnerTransactionId) {
  try {
    // Get the transactions
    const userTransaction = await Transaction.findOne({ transactionId });
    const partnerTransaction = await Transaction.findOne({ transactionId: partnerTransactionId });
    
    if (!userTransaction || !partnerTransaction) {
      return { success: false, message: "One or both transactions not found" };
    }

    // Verify user is the initiator of their transaction
    if (userTransaction.initiator.userId !== userId.toString()) {
      return { success: false, message: "You are not authorized to match this transaction" };
    }

    // Check if transactions are already matched or pending
    if (userTransaction.status !== 'open' || partnerTransaction.status !== 'open') {
      return { success: false, message: "One or both transactions are already matched or in progress" };
    }

    // Verify network relationship
    const relationship = await checkNetworkRelationship(userId, partnerTransaction.initiator.userId);
    if (!relationship.valid) {
      return { success: false, message: relationship.message };
    }

    // Set transactions to pending match status
    userTransaction.recipient.userId = partnerTransaction.initiator.userId;
    userTransaction.status = 'pending_match';
    userTransaction.relationship = relationship.relationship;
    userTransaction.pendingPartnerTransactionId = partnerTransactionId;
    userTransaction.timestamps.matchRequested = new Date();

    await userTransaction.save();

    // Get partner details
    const partner = await User.findOne({ userId: partnerTransaction.initiator.userId });

    return {
      success: true,
      match: {
        transactionId: userTransaction.transactionId,
        partnerId: partner.userId,
        partnerName: partner.name,
        partnerTrustScore: partner.trustScore,
        partnerCompletedTransactions: partner.completedTransactions,
        relationship: relationship.relationship,
        amount: userTransaction.initiator.amount,
        currency: userTransaction.initiator.currency,
        partnerAmount: partnerTransaction.initiator.amount,
        partnerCurrency: partnerTransaction.initiator.currency,
        rate: userTransaction.rate
      }
    };
  } catch (error) {
    console.error('Error initiating match request:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Confirm a match request (second step in two-way confirmation)
 */
async function confirmMatchRequest(userId, transactionId, accept) {
  try {
    // Find the user's transaction
    const userTransaction = await Transaction.findOne({ 
      transactionId,
      'initiator.userId': userId.toString(),
      status: 'open'
    });
    
    if (!userTransaction) {
      return { success: false, message: "Your transaction not found or not in open status" };
    }
    
    // Find the partner's transaction that requested the match
    const partnerTransaction = await Transaction.findOne({ 
      'recipient.userId': userId.toString(),
      'status': 'pending_match'
    });
    
    if (!partnerTransaction) {
      return { success: false, message: "No pending match request found" };
    }
    
    if (!accept) {
      // Reject the match
      partnerTransaction.recipient.userId = null;
      partnerTransaction.status = 'open';
      partnerTransaction.pendingPartnerTransactionId = null;
      
      await partnerTransaction.save();
      
      return { success: true, accepted: false };
    }
    
    // Accept the match - update both transactions using atomic operations
    const partnerTransactionId = partnerTransaction.transactionId;
    const currentTime = new Date();
    const relationship = partnerTransaction.relationship === 'referrer' 
      ? 'referee' 
      : (partnerTransaction.relationship === 'referee' ? 'referrer' : 'sibling');
    
    try {
      // Use a session to ensure both updates happen or neither happens
      const session = await mongoose.startSession();
      
      await session.withTransaction(async () => {
        // Update partner's transaction atomically
        const updatedPartnerTx = await Transaction.findOneAndUpdate(
          { 
            transactionId: partnerTransactionId,
            status: 'pending_match' // Ensure it's still in the expected state
          },
          { 
            $set: {
              status: 'matched',
              'timestamps.matched': currentTime
            }
          },
          { 
            new: true,
            session
          }
        );
        
        if (!updatedPartnerTx) {
          throw new Error("Partner transaction no longer available for matching");
        }
        
        // Update user's transaction atomically
        const updatedUserTx = await Transaction.findOneAndUpdate(
          { 
            transactionId: userTransaction.transactionId,
            status: 'open'  // Ensure it's still in the expected state
          },
          { 
            $set: {
              'recipient.userId': partnerTransaction.initiator.userId,
              status: 'matched',
              relationship: relationship,
              'timestamps.matched': currentTime
            }
          },
          { 
            new: true,
            session
          }
        );
        
        if (!updatedUserTx) {
          throw new Error("Your transaction is no longer available for matching");
        }
      });
      
      await session.endSession();
    } catch (error) {
      console.error('Transaction error in confirmMatchRequest:', error);
      return { success: false, message: error.message };
    }
    
    // Get partner details
    const partner = await User.findOne({ userId: partnerTransaction.initiator.userId });
    
    return {
      success: true,
      accepted: true,
      match: {
        transactionId: userTransaction.transactionId,
        partnerTransactionId: partnerTransactionId,
        partnerId: partner.userId,
        partnerName: partner.name,
        partnerTrustScore: partner.trustScore,
        relationship: userTransaction.relationship,
        amount: userTransaction.initiator.amount,
        currency: userTransaction.initiator.currency,
        partnerAmount: partnerTransaction.initiator.amount,
        partnerCurrency: partnerTransaction.initiator.currency,
        rate: partnerTransaction.rate
      }
    };
  } catch (error) {
    console.error('Error confirming match request:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a message to transaction partner
 */
async function sendMessage(userId, transactionId, message) {
  try {
    // Find the transaction
    const transaction = await Transaction.findOne({
      $or: [
        { transactionId, 'initiator.userId': userId.toString() },
        { transactionId, 'recipient.userId': userId.toString() }
      ],
      status: { $in: ['matched', 'proof_uploaded'] }
    });
    
    if (!transaction) {
      return { 
        success: false, 
        message: "Transaction not found, or you are not part of it, or it's not in matched status" 
      };
    }
    
    // Determine sender and recipient
    const isInitiator = transaction.initiator.userId === userId.toString();
    const recipientId = isInitiator ? transaction.recipient.userId : transaction.initiator.userId;
    
    // Get user info
    const user = await User.findOne({ userId: userId.toString() });
    
    if (!user) {
      return { success: false, message: "User not found" };
    }
    
    // Initialize messages array if it doesn't exist
    if (!transaction.messages) {
      transaction.messages = [];
    }
    
    // Add the message
    const messageObj = {
      fromUserId: userId.toString(),
      fromUserName: user.name,
      toUserId: recipientId,
      message: message,
      timestamp: new Date()
    };
    
    transaction.messages.push(messageObj);
    await transaction.save();
    
    return {
      success: true,
      message: messageObj
    };
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get messages for a transaction
 */
async function getMessages(userId, transactionId) {
  try {
    // Find the transaction
    const transaction = await Transaction.findOne({
      $or: [
        { transactionId, 'initiator.userId': userId.toString() },
        { transactionId, 'recipient.userId': userId.toString() }
      ]
    });
    
    if (!transaction) {
      return { 
        success: false, 
        message: "Transaction not found or you are not part of it" 
      };
    }
    
    // Return messages or empty array
    return {
      success: true,
      messages: transaction.messages || []
    };
  } catch (error) {
    console.error('Error getting messages:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Upload proof of payment
 */
async function uploadProofOfPayment(userId, transactionId, imageId) {
  try {
    const transaction = await Transaction.findOne({ 
      transactionId,
      $or: [
        { 'initiator.userId': userId.toString() },
        { 'recipient.userId': userId.toString() }
      ]
    });

    if (!transaction) {
      return { success: false, message: "Transaction not found or you are not part of it" };
    }

    if (transaction.status !== 'matched' && transaction.status !== 'proof_uploaded') {
      return { success: false, message: "Transaction is not in the correct state for proof upload" };
    }

    // Check if user already uploaded proof
    const existingProof = transaction.proofs.find(p => p.userId === userId.toString());
    if (existingProof) {
      return { success: false, message: "You have already uploaded proof of payment" };
    }

    // Instead of modifying and saving the document, use findOneAndUpdate
    // with an atomic update operation to prevent race conditions
    const updatedTransaction = await Transaction.findOneAndUpdate(
      { 
        transactionId,
        $or: [
          { 'initiator.userId': userId.toString() },
          { 'recipient.userId': userId.toString() }
        ]
      },
      { 
        $push: { 
          proofs: {
            userId: userId.toString(),
            imageId: imageId,
            uploadedAt: new Date()
          } 
        }
      },
      { new: true } // Return the updated document
    );
    
    if (!updatedTransaction) {
      return { success: false, message: "Transaction not found or you are not part of it" };
    }
    
    // Count proofs after the update
    const proofCount = updatedTransaction.proofs.length;
    
    // Determine the new status based on proof count
    let newStatus = updatedTransaction.status;
    let completed = false;
    
    if (proofCount === 1) {
      newStatus = 'proof_uploaded';
    } else if (proofCount >= 2) {
      newStatus = 'completed';
      completed = true;
    }
    
    // If status needs to change, update it in a separate operation
    if (newStatus !== updatedTransaction.status) {
      const update = { 
        status: newStatus 
      };
      
      // Add completion timestamp if needed
      if (completed) {
        update['timestamps.completed'] = new Date();
      }
      
      await Transaction.updateOne(
        { transactionId },
        update
      );
      
      // Update trust scores if completed
      if (completed) {
        await updateTrustScores(updatedTransaction);
      }
    }

    return {
      success: true,
      status: newStatus,
      proofs: proofCount
    };
  } catch (error) {
    console.error('Error uploading proof of payment:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update trust scores after transaction completion
 */
async function updateTrustScores(transaction) {
  try {
    // Use Promise.all to perform both updates concurrently
    // $inc operator is atomic, preventing race conditions
    const results = await Promise.all([
      User.findOneAndUpdate(
        { userId: transaction.initiator.userId },
        { 
          $inc: { 
            trustScore: 5,
            completedTransactions: 1
          } 
        },
        { new: true } // Return the updated document
      ),
      
      User.findOneAndUpdate(
        { userId: transaction.recipient.userId },
        { 
          $inc: { 
            trustScore: 5,
            completedTransactions: 1
          } 
        },
        { new: true } // Return the updated document
      )
    ]);
    
    // Log the results
    console.log(`Trust scores updated: Initiator=${results[0]?.trustScore}, Recipient=${results[1]?.trustScore}`);
    return true;
  } catch (error) {
    console.error('Error updating trust scores:', error);
    // Don't throw - we don't want to break transaction completion
    // but we should log the error
    return false;
  }
}

/**
 * Complete a transaction
 */
async function completeTransaction(userId, transactionId, confirmed) {
  try {
    const transaction = await Transaction.findOne({ 
      transactionId,
      $or: [
        { 'initiator.userId': userId.toString() },
        { 'recipient.userId': userId.toString() }
      ]
    });

    if (!transaction) {
      return { success: false, message: "Transaction not found or you are not part of it" };
    }

    if (!confirmed) {
      return { success: false, message: "Transaction not confirmed" };
    }

    if (transaction.status === 'completed') {
      return { success: true, message: "Transaction is already completed" };
    }

    if (transaction.status !== 'proof_uploaded') {
      return { success: false, message: "Both parties must upload proof first" };
    }

    // Complete the transaction
    transaction.status = 'completed';
    transaction.timestamps.completed = new Date();

    await transaction.save();

    // Update trust scores
    await updateTrustScores(transaction);

    // Get partner info
    const partnerUserId = transaction.initiator.userId === userId.toString()
      ? transaction.recipient.userId
      : transaction.initiator.userId;
    
    const partner = await User.findOne({ userId: partnerUserId });
    const user = await User.findOne({ userId: userId.toString() });

    return {
      success: true,
      transaction: {
        transactionId: transaction.transactionId,
        partnerName: partner ? partner.name : 'Unknown',
        newTrustScore: user ? user.trustScore : 0
      }
    };
  } catch (error) {
    console.error('Error completing transaction:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Report an issue with a transaction
 */
async function reportIssue(userId, transactionId, reason, details) {
  try {
    const transaction = await Transaction.findOne({ 
      transactionId,
      $or: [
        { 'initiator.userId': userId.toString() },
        { 'recipient.userId': userId.toString() }
      ]
    });

    if (!transaction) {
      return { success: false, message: "Transaction not found or you are not part of it" };
    }

    // Add report
    transaction.reports.push({
      userId: userId.toString(),
      reason: reason,
      details: details || '',
      timestamp: new Date(),
      status: 'pending'
    });

    await transaction.save();

    return {
      success: true,
      reportId: transaction.reports.length
    };
  } catch (error) {
    console.error('Error reporting issue:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Mark a message as read
 */
async function markMessageAsRead(transactionId, timestamp) {
  try {
    // Find the transaction
    const transaction = await Transaction.findOne({ transactionId });
    
    if (!transaction || !transaction.messages) {
      console.log(`No transaction or messages found for ID: ${transactionId}`);
      return false;
    }
    
    // Find and update the message
    const result = await Transaction.updateOne(
      { 
        transactionId, 
        "messages.timestamp": new Date(timestamp) 
      },
      { 
        $set: { 
          "messages.$.read": true 
        } 
      }
    );
    
    return result.modifiedCount > 0;
  } catch (error) {
    console.error('Error marking message as read:', error);
    return false;
  }
}

module.exports = {
  getActiveTransaction,
  getTransactionById,
  createTransferRequest,
  updateTransferRequest,
  findMatchingTransfers,
  initiateMatchRequest,
  confirmMatchRequest,
  sendMessage,
  getMessages,
  markMessageAsRead,
  uploadProofOfPayment,
  completeTransaction,
  reportIssue,
  checkNetworkRelationship
};