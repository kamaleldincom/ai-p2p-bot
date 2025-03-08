/**
 * User model definition
 */
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  telegramUsername: String,
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  identificationNumber: String,
  country: {
    type: String,
    required: true,
    enum: ['UAE', 'SDN', 'EGY']
  },
  referralCode: {
    type: String,
    required: true,
    unique: true
  },
  referredBy: {
    type: String,
    required: true
  },
  trustScore: {
    type: Number,
    default: 20
  },
  completedTransactions: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active'
  }
});

module.exports = mongoose.model('User', userSchema);
