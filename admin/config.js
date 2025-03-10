/**
 * Admin dashboard configuration
 */
module.exports = {
  // Server configuration
  port: process.env.ADMIN_PORT || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'admin-dashboard-secret',
  
  // Authentication
  adminUsers: {
    // Default admin user - should be changed in production
    admin: {
      password: process.env.ADMIN_PASSWORD || 'admin123',
      role: 'superadmin'
    }
  },

  // Dashboard settings
  title: 'P2P Transfer Admin Dashboard',
  
  // Currency settings - moved from hardcoded values
  supportedCurrencies: [
    { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', enabled: true },
    { code: 'SDG', name: 'Sudanese Pound', symbol: 'ج.س', enabled: true },
    { code: 'EGP', name: 'Egyptian Pound', symbol: 'ج.م', enabled: true }
  ],
  
  // Exchange rates between currencies
  exchangeRates: {
    'AED_SDG': 13.5,
    'AED_EGP': 8.5,
    'SDG_AED': 0.075,
    'SDG_EGP': 0.63,
    'EGP_AED': 0.118,
    'EGP_SDG': 1.6
  },

  // Payment methods
  paymentMethods: [
    { id: 'bank_transfer', name: 'Bank Transfer', enabled: true },
    { id: 'cash', name: 'Cash Payment', enabled: true },
    { id: 'mobile_money', name: 'Mobile Money', enabled: false }
  ]
};