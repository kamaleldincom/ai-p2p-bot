/**
 * User-related service functions
 */
const User = require('../models/user');

/**
 * Check if a user exists
 */
async function checkUserExists(userId) {
  try {
    const user = await User.findOne({ userId: userId.toString() });
    return { exists: !!user };
  } catch (error) {
    console.error('Error checking user:', error);
    return { error: error.message };
  }
}

module.exports = {
  checkUserExists
};
