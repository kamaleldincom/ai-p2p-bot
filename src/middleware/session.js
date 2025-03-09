/**
 * src/middleware/session.js
 * Middleware for handling user sessions with improved user verification and state management
 */
const userService = require('../services/user');
const { getSystemPrompt } = require('../ai/prompt');

// Store for conversation histories
const conversations = {};

// Store for user session states
const sessionStates = {};

/**
 * Middleware that ensures user identification and conversation tracking
 * with enhanced state management
 */
async function sessionMiddleware(ctx, next) {
    try {
      // Always use the numeric Telegram user ID
      const userId = ctx.from?.id?.toString();
      
      console.log('Session middleware processing request for user:', userId);
      
      if (!userId) {
        console.log('No user ID available in context');
        return next();
      }
      
      // Double check it's actually a string and not undefined
      if (typeof userId !== 'string') {
        console.error('userId is not a string:', userId);
        return next();
      }
      
      console.log(`User ID type: ${typeof userId}, value: ${userId}`);
      
      // Check if user exists in our database
      const userExists = await userService.checkUserExists(userId);
      console.log(`User ${userId} exists in database:`, userExists.exists);
      
      // Initialize session state if it doesn't exist
      if (!sessionStates[userId]) {
        sessionStates[userId] = {
          userExists: userExists.exists,
          summaryShown: false,
          inTransferCreation: false,
          awaitingMatchSelection: false,
          awaitingTransferAmount: false,
          awaitingDestinationCurrency: false,
          activeTransactionId: null,
          availableMatches: null,
          transferAmount: null,
          transferCurrency: null
        };
      } else {
        // Keep userExists up to date
        sessionStates[userId].userExists = userExists.exists;
      }
      
      // Make session state accessible in the context
      ctx.state = { 
        ...ctx.state,
        ...sessionStates[userId],
        userId
      };
      
      // Initialize conversation if it doesn't exist
      if (!conversations[userId]) {
        console.log(`Initializing new conversation for user: ${userId}`);
        conversations[userId] = [
          { role: "system", content: getSystemPrompt() }
        ];
      } else {
        console.log(`Using existing conversation for user: ${userId}`);
      }
      
      // Make conversations accessible in the context
      ctx.state.conversations = conversations;
      
      // Save updated state after request handling
      const originalNext = next;
      next = async () => {
        try {
          await originalNext();
        } finally {
          // Preserve state for next request
          sessionStates[userId] = {
            userExists: ctx.state.userExists,
            summaryShown: ctx.state.summaryShown,
            inTransferCreation: ctx.state.inTransferCreation,
            awaitingMatchSelection: ctx.state.awaitingMatchSelection,
            awaitingTransferAmount: ctx.state.awaitingTransferAmount,
            awaitingDestinationCurrency: ctx.state.awaitingDestinationCurrency,
            activeTransactionId: ctx.state.activeTransactionId,
            availableMatches: ctx.state.availableMatches,
            transferAmount: ctx.state.transferAmount,
            transferCurrency: ctx.state.transferCurrency
          };
          
          console.log(`Updated session state for user ${userId}:`, {
            userExists: sessionStates[userId].userExists,
            summaryShown: sessionStates[userId].summaryShown,
            inTransferCreation: sessionStates[userId].inTransferCreation,
            awaitingMatchSelection: sessionStates[userId].awaitingMatchSelection
          });
        }
      };
      
      return next();
    } catch (error) {
      console.error('Error in session middleware:', error);
      return next();
    }
  }

module.exports = { sessionMiddleware, conversations };