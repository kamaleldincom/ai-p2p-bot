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
  handleReport,
  setBotInstance 
} = require('./handlers');
const { sessionMiddleware } = require('../middleware/session');

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

// Command handlers
bot.start(handleStart);
bot.command('transfer', handleTransfer);
bot.command('profile', handleProfile);
bot.command('report', handleReport);

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