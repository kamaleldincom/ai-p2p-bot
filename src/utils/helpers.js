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

module.exports = {
  generateReferralCode,
  generateTransactionId
};
