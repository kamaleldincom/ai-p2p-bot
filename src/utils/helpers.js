/**
 * Helper functions
 */

/**
 * Generate a unique referral code
 */
function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = 6;
  let code = '';
  
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
}

/**
 * Generate a unique transaction ID
 */
function generateTransactionId() {
  return 'TR' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

/**
 * Format currency with proper formatting
 */
function formatCurrency(amount, currency) {
  if (amount === undefined || currency === undefined) {
    return 'N/A';
  }
  
  // Format with thousands separator and 2 decimal places
  const formattedAmount = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
  
  return `${formattedAmount} ${currency}`;
}

/**
 * Get currency symbol
 */
function getCurrencySymbol(currency) {
  const symbols = {
    'AED': 'د.إ',
    'SDG': 'ج.س',
    'EGP': 'ج.م'
  };
  
  return symbols[currency] || currency;
}

/**
 * Parse amount from text
 * e.g. "1000 AED" -> { amount: 1000, currency: "AED" }
 */
function parseAmountAndCurrency(text) {
  const regex = /(\d+(?:\.\d+)?)\s*([A-Z]{3})/i;
  const match = text.match(regex);
  
  if (match) {
    return {
      amount: parseFloat(match[1]),
      currency: match[2].toUpperCase()
    };
  }
  
  return null;
}

module.exports = {
  generateReferralCode,
  generateTransactionId,
  formatCurrency,
  getCurrencySymbol,
  parseAmountAndCurrency
};