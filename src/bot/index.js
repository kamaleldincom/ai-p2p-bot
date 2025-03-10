/**
 * src/bot/index.js
 * Main bot initialization file with enhanced features
 */
require('dotenv').config();
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const { 
  handleMessage, 
  handlePhoto, 
  handleStart, 
  handleTransfer, 
  handleProfile, 
  handleMessageCommand,
  handleMessages,
  handleReport,
  setBotInstance 
} = require('./handlers');
const { sessionMiddleware } = require('../middleware/session');
const { logSessionState } = require('../utils/debug');

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Connect to MongoDB with better error handling
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error details:', {
      message: err.message,
      code: err.code,
      name: err.name
    });
  });

// Set the bot instance for notifications
setBotInstance(bot);

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('An error occurred. Please try again later.');
});

// Apply session middleware to all updates
bot.use(sessionMiddleware);

// Add debug middleware to log all commands
bot.use((ctx, next) => {
  if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/')) {
    console.log(`Command received: ${ctx.message.text}`);
    logSessionState(ctx);
  }
  return next();
});

// Command handlers - we need to be explicit about message command
bot.start(handleStart);
bot.command('transfer', handleTransfer);
bot.command('profile', handleProfile);
bot.command('message', handleMessageCommand); 
bot.command('messages', handleMessages); // Add the messages command
bot.command('report', handleReport);

// Special case for /exit command to leave messaging mode
bot.command('exit', async (ctx) => {
  ctx.state.inMessagingMode = false;
  await ctx.reply("You've exited messaging mode.");
});

// Message handlers
bot.on('text', handleMessage);
bot.on('photo', handlePhoto);

// Launch bot
bot.launch()
  .then(() => console.log('Bot started'))
  .catch(err => console.error('Bot launch error:', err));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));