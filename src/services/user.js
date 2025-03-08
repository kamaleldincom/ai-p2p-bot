/**
 * src/services/user.js
 * User-related service functions
 */
const User = require('../models/user');
const { generateReferralCode } = require('../utils/helpers');

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

/**
 * Register the first user (with no referral)
 */
async function registerFirstUser(userData) {
  try {
    // Check if any users exist in the system
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      return { success: false, message: "System already has users. Please use a valid referral code." };
    }

    // Check if user already exists
    const existingUser = await User.findOne({ userId: userData.userId.toString() });
    if (existingUser) {
      return { success: false, message: "User already registered" };
    }

    // Generate a unique referral code for the new user
    const userReferralCode = await generateUniqueReferralCode();

    // Create new user (as first user, they are self-referred)
    const newUser = new User({
      userId: userData.userId.toString(),
      telegramUsername: userData.telegramUsername,
      name: userData.name,
      phone: userData.phone,
      identificationNumber: userData.identificationNumber || "",
      country: userData.country,
      referralCode: userReferralCode,
      referredBy: userData.userId.toString(), // Self-referred as first user
      trustScore: 20,
      completedTransactions: 0,
      createdAt: new Date(),
      status: 'active'
    });

    await newUser.save();

    return {
      success: true,
      isFirstUser: true,
      user: {
        name: newUser.name,
        referralCode: newUser.referralCode,
        trustScore: newUser.trustScore
      }
    };
  } catch (error) {
    console.error('Error registering first user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Validate a referral code
 */
async function validateReferralCode(referralCode) {
  try {
    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      return { valid: false, message: "Invalid referral code" };
    }
    return { 
      valid: true, 
      referrerId: referrer.userId,
      referrerName: referrer.name
    };
  } catch (error) {
    console.error('Error validating referral code:', error);
    return { error: error.message };
  }
}

/**
 * Register a new user
 */
async function registerUser(userData) {
  try {
    // Validate referral code
    const referralValidation = await validateReferralCode(userData.referralCode);
    if (!referralValidation.valid) {
      return { success: false, message: referralValidation.message };
    }

    // Check if user already exists
    const existingUser = await User.findOne({ userId: userData.userId.toString() });
    if (existingUser) {
      return { success: false, message: "User already registered" };
    }

    // Generate a unique referral code for the new user
    const userReferralCode = await generateUniqueReferralCode();

    // Create new user
    const newUser = new User({
      userId: userData.userId.toString(),
      telegramUsername: userData.telegramUsername,
      name: userData.name,
      phone: userData.phone,
      identificationNumber: userData.identificationNumber,
      country: userData.country,
      referralCode: userReferralCode,
      referredBy: referralValidation.referrerId,
      trustScore: 20,
      completedTransactions: 0,
      createdAt: new Date(),
      status: 'active'
    });

    await newUser.save();

    return {
      success: true,
      user: {
        name: newUser.name,
        referralCode: newUser.referralCode,
        referredBy: referralValidation.referrerName,
        trustScore: newUser.trustScore
      }
    };
  } catch (error) {
    console.error('Error registering user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate a unique referral code
 */
async function generateUniqueReferralCode() {
  let isUnique = false;
  let code;

  while (!isUnique) {
    code = generateReferralCode();
    const existingUser = await User.findOne({ referralCode: code });
    if (!existingUser) {
      isUnique = true;
    }
  }

  return code;
}

/**
 * Get user profile
 */
async function getUserProfile(userId) {
  try {
    const user = await User.findOne({ userId: userId.toString() });
    if (!user) {
      return { success: false, message: "User not found" };
    }

    // Get network stats
    const referrer = await User.findOne({ userId: user.referredBy });
    const referrals = await User.countDocuments({ referredBy: userId.toString() });
    const siblings = await User.countDocuments({ 
      referredBy: user.referredBy,
      userId: { $ne: userId.toString() }
    });

    return {
      success: true,
      profile: {
        name: user.name,
        country: user.country,
        trustScore: user.trustScore,
        completedTransactions: user.completedTransactions,
        referralCode: user.referralCode,
        network: {
          referrer: referrer ? 1 : 0,
          referrals: referrals,
          siblings: siblings
        }
      }
    };
  } catch (error) {
    console.error('Error getting user profile:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get user's network connections
 */
async function getNetworkConnections(userId) {
  try {
    const user = await User.findOne({ userId: userId.toString() });
    if (!user) {
      return { success: false, message: "User not found" };
    }

    // Get referrer
    const referrer = await User.findOne({ userId: user.referredBy });
    
    // Get direct referrals
    const referrals = await User.find({ referredBy: userId.toString() });
    
    // Get siblings (other users referred by the same person)
    const siblings = await User.find({ 
      referredBy: user.referredBy,
      userId: { $ne: userId.toString() }
    });

    return {
      success: true,
      network: {
        referrer: referrer ? {
          userId: referrer.userId,
          name: referrer.name,
          trustScore: referrer.trustScore
        } : null,
        referrals: referrals.map(r => ({
          userId: r.userId,
          name: r.name,
          trustScore: r.trustScore
        })),
        siblings: siblings.map(s => ({
          userId: s.userId,
          name: s.name,
          trustScore: s.trustScore
        }))
      }
    };
  } catch (error) {
    console.error('Error getting network connections:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  checkUserExists,
  validateReferralCode,
  registerUser,
  getUserProfile,
  getNetworkConnections,
  registerFirstUser
};