/**
 * Transaction model definition with messaging support
 */
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  fromUserId: String,
  fromUserName: String,
  toUserId: String,
  message: String,
  timestamp: Date,
  read: {
    type: Boolean,
    default: false
  }
});

const transactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  initiator: {
    userId: String,
    amount: Number,
    currency: String
  },
  recipient: {
    userId: String,
    amount: Number,
    currency: String
  },
  rate: Number,
  status: {
    type: String,
    enum: ['open', 'pending_match', 'matched', 'proof_uploaded', 'completed', 'cancelled'],
    default: 'open'
  },
  notes: String,
  relationship: {
    type: String,
    enum: ['referrer', 'referee', 'sibling']
  },
  // For two-way confirmation
  pendingPartnerTransactionId: String,
  
  // For messaging between users
  messages: [messageSchema],
  
  proofs: [{
    userId: String,
    imageId: String,
    uploadedAt: Date
  }],
  timestamps: {
    created: Date,
    matchRequested: Date,
    matched: Date,
    completed: Date
  },
  reports: [{
    userId: String,
    reason: String,
    details: String,
    timestamp: Date,
    status: {
      type: String,
      enum: ['pending', 'resolved'],
      default: 'pending'
    }
  }]
});

module.exports = mongoose.model('Transaction', transactionSchema);