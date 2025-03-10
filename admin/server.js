/**
 * Admin dashboard server
 */
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const config = require('./config');
const authMiddleware = require('./middleware/auth');

// Connect to MongoDB (shared with bot)
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Create Express app
const app = express();

// Set view engine with layouts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'partials/layout');
app.set("layout extractScripts", true);
app.set("layout extractStyles", true);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Make config available to templates
app.use((req, res, next) => {
  res.locals.config = config;
  next();
});

// Routes
app.use('/', require('./routes/auth'));
app.use('/dashboard', authMiddleware.requireAuth, require('./routes/dashboard'));
app.use('/users', authMiddleware.requireAuth, require('./routes/users'));
app.use('/transactions', authMiddleware.requireAuth, require('./routes/transactions'));
app.use('/settings', authMiddleware.requireAuth, require('./routes/settings'));

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { 
    title: 'Error',
    message: err.message || 'Something went wrong!' 
  });
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`Admin dashboard running on port ${PORT}`);
});