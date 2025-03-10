/**
 * Authentication middleware for admin dashboard
 */
const config = require('../config');

/**
 * Require authentication for protected routes
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  
  // Remember the original URL they were trying to access
  req.session.redirectTo = req.originalUrl;
  res.redirect('/login');
}

/**
 * Authenticate admin user
 */
function authenticate(username, password) {
  const user = config.adminUsers[username];
  
  if (!user) {
    return { success: false, message: 'User not found' };
  }
  
  if (user.password !== password) {
    return { success: false, message: 'Invalid password' };
  }
  
  return { 
    success: true, 
    user: {
      username,
      role: user.role
    }
  };
}

/**
 * Check if user has required role
 */
function requireRole(roles) {
  return function(req, res, next) {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    
    if (roles.includes(req.session.user.role)) {
      return next();
    }
    
    res.status(403).render('error', {
      title: 'Access Denied',
      message: 'You do not have permission to access this resource'
    });
  };
}

module.exports = {
  requireAuth,
  authenticate,
  requireRole
};