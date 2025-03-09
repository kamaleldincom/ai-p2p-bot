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
    console.log('=== REGISTRATION ATTEMPT ===');
    console.log('Registering first user with data:', userData);
    
    // Check if any users exist in the system
    const userCount = await User.countDocuments();
    console.log(`Total users in system: ${userCount}`);
    
    if (userCount > 0) {
      console.log('System already has users, aborting first user registration');
      return { success: false, message: "System already has users. Please use a valid referral code." };
    }

    // Check if user already exists
    const existingUser = await User.findOne({ userId: userData.userId.toString() });
    console.log(`User exists check for ID ${userData.userId}: ${!!existingUser}`);
    
    if (existingUser) {
      console.log('User already registered, aborting registration');
      return { success: false, message: "User already registered" };
    }

    // Generate a unique referral code for the new user
    const userReferralCode = await generateUniqueReferralCode();
    console.log(`Generated referral code: ${userReferralCode}`);

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

    console.log('Attempting to save user to database...');
    try {
      await newUser.save();
      console.log('User successfully saved to database');
      
      // Verify saved user
      const savedUser = await User.findOne({ userId: userData.userId.toString() });
      console.log('Verified user in database:', savedUser ? 'Found' : 'Not found');
      if (savedUser) {
        console.log('Saved user details:', {
          id: savedUser._id,
          userId: savedUser.userId,
          name: savedUser.name,
          referralCode: savedUser.referralCode
        });
      }
    } catch (saveError) {
      console.error('Error saving user to database:', saveError);
      // Check for validation errors
      if (saveError.name === 'ValidationError') {
        for (const field in saveError.errors) {
          console.error(`Validation error for ${field}:`, saveError.errors[field].message);
        }
      }
      throw saveError;
    }

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
    console.log('=== PROFILE RETRIEVAL ATTEMPT ===');
    console.log(`Getting profile for user ID: ${userId}`);
    
    // List all users in the database for debugging
    const allUsers = await User.find({});
    console.log(`Total users in database: ${allUsers.length}`);
    if (allUsers.length > 0) {
      console.log('User IDs in database:', allUsers.map(user => ({
        userId: user.userId,
        name: user.name
      })));
    }
    
    const user = await User.findOne({ userId: userId.toString() });
    console.log(`User found in database: ${!!user}`);
    
    if (!user) {
      console.log(`No user found with ID: ${userId}`);
      return { success: false, message: "User not found" };
    }

    console.log('User details:', {
      id: user._id,
      userId: user.userId,
      name: user.name,
      referralCode: user.referralCode,
      referredBy: user.referredBy,
      trustScore: user.trustScore
    });

    // Get network stats
    const referrer = await User.findOne({ userId: user.referredBy });
    const referrals = await User.countDocuments({ referredBy: userId.toString() });
    const siblings = await User.countDocuments({ 
      referredBy: user.referredBy,
      userId: { $ne: userId.toString() }
    });
    
    console.log('Network stats:', {
      referrer: referrer ? 'Found' : 'None',
      referrerName: referrer?.name,
      referrals: referrals,
      siblings: siblings
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