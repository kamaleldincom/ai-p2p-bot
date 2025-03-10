/**
 * src/utils/debug.js
 * Debug helper to diagnose session state issues
 */

/**
 * Log session state in a readable format
 * @param {Object} ctx - Telegram context object
 */
function logSessionState(ctx) {
    if (!ctx || !ctx.state) {
      console.log('No context or state available');
      return;
    }
    
    const userId = ctx.from?.id?.toString();
    console.log(`\n==== DEBUG SESSION STATE for ${userId} ====`);
    console.log('User exists:', ctx.state.userExists);
    console.log('Summary shown:', ctx.state.summaryShown);
    console.log('In messaging mode:', ctx.state.inMessagingMode);
    console.log('In transfer creation:', ctx.state.inTransferCreation);
    console.log('Awaiting match selection:', ctx.state.awaitingMatchSelection);
    console.log('Awaiting transfer amount:', ctx.state.awaitingTransferAmount);
    console.log('Awaiting destination currency:', ctx.state.awaitingDestinationCurrency);
    console.log('Awaiting match confirmation:', ctx.state.awaitingMatchConfirmation);
    console.log('Active transaction ID:', ctx.state.activeTransactionId);
    console.log('=================================\n');
  }
  
  /**
   * Reset messaging mode state
   * @param {Object} ctx - Telegram context object
   */
  function resetMessagingState(ctx) {
    if (!ctx || !ctx.state) {
      return;
    }
    
    console.log('Resetting messaging state');
    ctx.state.inMessagingMode = false;
  }
  
  /**
   * Debug transaction state in the database
   * @param {String} userId - Telegram user ID
   */
  async function debugTransactionState(userId) {
    const Transaction = require('../models/transaction');
    
    try {
      console.log(`\n==== DEBUG TRANSACTION STATE for ${userId} ====`);
      
      // Find active transactions where user is initiator or recipient
      const transactions = await Transaction.find({
        $or: [
          { 'initiator.userId': userId.toString() },
          { 'recipient.userId': userId.toString() }
        ]
      });
      
      if (transactions.length === 0) {
        console.log('No transactions found for this user');
        return;
      }
      
      // Log details of each transaction
      transactions.forEach((tx, index) => {
        console.log(`Transaction ${index + 1}:`);
        console.log('  ID:', tx.transactionId);
        console.log('  Status:', tx.status);
        console.log('  Initiator:', tx.initiator.userId);
        console.log('  Recipient:', tx.recipient.userId);
        console.log('  Amount:', tx.initiator.amount, tx.initiator.currency);
        console.log('  Target Amount:', tx.recipient.amount, tx.recipient.currency);
        console.log('  Created:', tx.timestamps.created);
        console.log('  Messages:', tx.messages ? tx.messages.length : 0);
      });
      
      console.log('=================================\n');
    } catch (error) {
      console.error('Error debugging transaction state:', error);
    }
  }
  
  module.exports = {
    logSessionState,
    resetMessagingState,
    debugTransactionState
  };