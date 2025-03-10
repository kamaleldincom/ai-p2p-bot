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

// Store for last activity timestamp
const lastActivity = {};

// Inactive timeout in milliseconds (4 hours)
const SESSION_TIMEOUT = 4 * 60 * 60 * 1000;

/**
 * Clean up expired sessions to prevent memory leaks
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  const expiredUsers = [];
  
  // Find expired sessions
  for (const userId in lastActivity) {
    if (now - lastActivity[userId] > SESSION_TIMEOUT) {
      expiredUsers.push(userId);
    }
  }
  
  // Remove expired sessions
  for (const userId of expiredUsers) {
    console.log(`Cleaning up expired session for user: ${userId}`);
    delete conversations[userId];
    delete sessionStates[userId];
    delete lastActivity[userId];
  }
  
  if (expiredUsers.length > 0) {
    console.log(`Cleaned up ${expiredUsers.length} expired sessions`);
  }
}

/**
 * Middleware that ensures user identification and conversation tracking
 * with enhanced state management
 */
async function sessionMiddleware(ctx, next) {
    try {
      // Run cleanup on each request (could be optimized to run less frequently in production)
      cleanupExpiredSessions();

      // Always use the numeric Telegram user ID
      const userId = ctx.from?.id?.toString();
      
      console.log('Session middleware processing request for user:', userId);
      
      if (!userId) {
        console.log('No user ID available in context');
        return next();
      }
      
      // Update last activity timestamp
      lastActivity[userId] = Date.now();
      
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
          inMessagingMode: false,
          awaitingMatchConfirmation: false,
          activeTransactionId: null,
          availableMatches: null,
          transferAmount: null,
          transferCurrency: null,
          transactionToConfirm: null,
          partnerUserId: null,
          partnerTransactionId: null
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
      
      // Initialize conversation if it doesn't exist or manage conversation size
      if (!conversations[userId]) {
        console.log(`Initializing new conversation for user: ${userId}`);
        conversations[userId] = [
          { role: "system", content: getSystemPrompt() }
        ];
      } else {
        console.log(`Using existing conversation for user: ${userId} (length: ${conversations[userId].length})`);
        
        // Check if conversation is getting too long
        if (conversations[userId].length > 50) {
          console.log(`Trimming conversation for user: ${userId}`);
          
          // Keep the system message and last 20 messages to maintain recent context
          const systemMessage = conversations[userId].find(msg => msg.role === "system");
          const recentMessages = conversations[userId].slice(-20);
          
          // Reset conversation with system message and recent exchanges
          conversations[userId] = [
            systemMessage || { role: "system", content: getSystemPrompt() },
            ...recentMessages
          ];
          
          console.log(`Trimmed conversation to ${conversations[userId].length} messages`);
        }
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
            inMessagingMode: ctx.state.inMessagingMode,
            awaitingMatchConfirmation: ctx.state.awaitingMatchConfirmation,
            activeTransactionId: ctx.state.activeTransactionId,
            availableMatches: ctx.state.availableMatches,
            transferAmount: ctx.state.transferAmount,
            transferCurrency: ctx.state.transferCurrency,
            transactionToConfirm: ctx.state.transactionToConfirm,
            partnerUserId: ctx.state.partnerUserId,
            partnerTransactionId: ctx.state.partnerTransactionId
          };
          
          console.log(`Updated session state for user ${userId}:`, {
            userExists: sessionStates[userId].userExists,
            summaryShown: sessionStates[userId].summaryShown,
            inTransferCreation: sessionStates[userId].inTransferCreation,
            awaitingMatchSelection: sessionStates[userId].awaitingMatchSelection,
            inMessagingMode: sessionStates[userId].inMessagingMode, // Log this important flag
            awaitingMatchConfirmation: sessionStates[userId].awaitingMatchConfirmation
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