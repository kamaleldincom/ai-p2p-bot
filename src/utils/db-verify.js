/**
 * src/utils/db-verify.js
 * Utility to verify database connection and operations
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');
const Transaction = require('../models/transaction');

async function verifyDatabase() {
  try {
    console.log('Attempting to connect to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB');
    
    // Check database collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections in database:', collections.map(c => c.name));
    
    // Check user collection
    const userCount = await User.countDocuments();
    console.log(`Total users in database: ${userCount}`);
    
    if (userCount > 0) {
      const users = await User.find({});
      console.log('Users in database:');
      users.forEach(user => {
        console.log({
          id: user._id,
          userId: user.userId,
          name: user.name,
          referralCode: user.referralCode,
          referredBy: user.referredBy
        });
      });
    }
    
    // Check transaction collection
    const transactionCount = await Transaction.countDocuments();
    console.log(`Total transactions in database: ${transactionCount}`);
    
    // Test creating a dummy user (won't save to db)
    try {
      const dummyUser = new User({
        userId: 'test123',
        telegramUsername: 'test_user',
        name: 'Test User',
        phone: '+1234567890',
        country: 'UAE',
        referralCode: 'TEST123',
        referredBy: 'test123',
        trustScore: 20,
        completedTransactions: 0,
        status: 'active'
      });
      
      // Validate but don't save
      await dummyUser.validate();
      console.log('Dummy user validation successful');
    } catch (error) {
      console.error('Error validating dummy user:', error);
      if (error.name === 'ValidationError') {
        for (const field in error.errors) {
          console.error(`Validation error for ${field}:`, error.errors[field].message);
        }
      }
    }
    
    console.log('Database verification complete');
  } catch (error) {
    console.error('Database verification error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the verification
verifyDatabase();

module.exports = { verifyDatabase };