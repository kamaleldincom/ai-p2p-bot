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
  if (amount === undefined || amount === null || 
      currency === undefined || currency === null || 
      isNaN(amount)) {
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
 * List of supported currencies
 */
const SUPPORTED_CURRENCIES = ['AED', 'SDG', 'EGP'];

/**
 * Parse amount from text
 * e.g. "1000 AED" -> { amount: 1000, currency: "AED" }
 * 
 * This version is more robust and supports various formats
 * and validates that the currency is one of the supported ones
 */
function parseAmountAndCurrency(text) {
  if (!text) {
    console.log('Empty text provided to parseAmountAndCurrency');
    return null;
  }
  
  console.log(`Parsing amount from: "${text}"`);
  
  // Different regex patterns to try
  const patterns = [
    // Standard format: 1000 AED
    /(\d+(?:\.\d+)?)\s*([A-Z]{3})/i,
    
    // Format with comma: 1,000 AED
    /([\d,]+(?:\.\d+)?)\s*([A-Z]{3})/i,
    
    // Just the number, assuming we can get currency from context
    /^(\d+(?:\.\d+)?)$/
  ];
  
  for (const regex of patterns) {
    const match = text.match(regex);
    if (match) {
      // Clean the amount string - remove commas
      const amountStr = match[1].replace(/,/g, '');
      const amount = parseFloat(amountStr);
      
      if (isNaN(amount) || amount <= 0) {
        console.log(`Invalid amount: ${amountStr}`);
        continue;
      }
      
      // Use the matched currency or default to a common one
      let currency = match[2] ? match[2].toUpperCase() : 'AED';
      
      // Check if currency is supported
      if (!SUPPORTED_CURRENCIES.includes(currency)) {
        console.log(`Unsupported currency: ${currency}`);
        if (match[2]) {
          // If there was an explicit currency that's not supported, return null
          return null;
        }
        // Default to AED for patterns without currency
        currency = 'AED';
      }
      
      console.log(`Successfully parsed: amount=${amount}, currency=${currency}`);
      
      return {
        amount: amount,
        currency: currency
      };
    }
  }
  
  console.log('Failed to parse amount');
  return null;
}

module.exports = {
  generateReferralCode,
  generateTransactionId,
  formatCurrency,
  getCurrencySymbol,
  parseAmountAndCurrency
};