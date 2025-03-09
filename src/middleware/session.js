/**
 * src/middleware/session.js
 * Middleware for handling user sessions with improved user verification
 */
const userService = require('../services/user');
const { getSystemPrompt } = require('../ai/prompt');

// Store for conversation histories
const conversations = {};

/**
 * Middleware that ensures user identification and conversation tracking
 * with enhanced first-user detection
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
      
      // Add user status to conversation context
      ctx.state.userExists = userExists.exists;
      
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
      ctx.state.userId = userId;
      
      return next();
    } catch (error) {
      console.error('Error in session middleware:', error);
      return next();
    }
  }

module.exports = { sessionMiddleware, conversations };