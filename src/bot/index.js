/**
 * Main bot initialization file
 */
require('dotenv').config();
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const { handleMessage } = require('./handlers');

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('An error occurred. Please try again later.');
});

// Message handlers
bot.on('text', handleMessage);

// Launch bot
bot.launch()
  .then(() => console.log('Bot started'))
  .catch(err => console.error('Bot launch error:', err));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
