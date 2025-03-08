/**
 * Transaction model definition
 */
const mongoose = require('mongoose');

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
    enum: ['open', 'matched', 'proof_uploaded', 'completed', 'cancelled'],
    default: 'open'
  },
  notes: String,
  relationship: {
    type: String,
    enum: ['referrer', 'referee', 'sibling']
  },
  proofs: [{
    userId: String,
    imageId: String,
    uploadedAt: Date
  }],
  timestamps: {
    created: Date,
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
