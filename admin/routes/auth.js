/**
 * Authentication routes
 */
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

/**
 * Login page
 */
router.get('/login', (req, res) => {
  if (req.session.authenticated) {
    return res.redirect('/dashboard');
  }
  
  res.render('auth/login', {
    title: 'Admin Login',
    error: null
  });
});

/**
 * Login form submission
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.render('auth/login', {
      title: 'Admin Login',
      error: 'Username and password are required'
    });
  }
  
  const authResult = authenticate(username, password);
  
  if (!authResult.success) {
    return res.render('auth/login', {
      title: 'Admin Login',
      error: authResult.message
    });
  }
  
  // Set session variables
  req.session.authenticated = true;
  req.session.user = authResult.user;
  
  // Redirect to original destination or dashboard
  const redirectTo = req.session.redirectTo || '/dashboard';
  delete req.session.redirectTo;
  
  res.redirect(redirectTo);
});

/**
 * Logout
 */
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;