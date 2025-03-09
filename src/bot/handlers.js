/**
 * src/bot/handlers.js
 * Enhanced message handlers with improved user flows
 */
const { OpenAI } = require('openai');
const { getSystemPrompt } = require('../ai/prompt');
const { functionDefinitions } = require('../ai/functions');
const userService = require('../services/user');
const transactionService = require('../services/transaction');
const { formatCurrency } = require('../utils/helpers');

// Bot instance reference for sending notifications to users
let botInstance = null;

// Set the bot instance for notifications
function setBotInstance(bot) {
  botInstance = bot;
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Handle incoming text messages with enhanced flows
 */
async function handleMessage(ctx) {
  try {
    const userId = ctx.state.userId;
    const message = ctx.message.text;
    const conversations = ctx.state.conversations;
    
    console.log(`Message from ${userId}: ${message}`);
    
    // Add user message to conversation
    conversations[userId].push({ role: "user", content: message });

    // If this is a registered user, provide a summary of active trades and actions
    // instead of waiting for AI to check this
    if (ctx.state.userExists && !ctx.state.summaryShown) {
      await provideTradeSummary(ctx);
      return;
    }
    
    // If this is the first interaction after starting the bot
    // and the user doesn't exist in our database, we can
    // provide a special welcome message
    if (conversations[userId].length === 2 && !ctx.state.userExists) {
      const welcomeMessage = `Welcome to the P2P Transfer Bot! 👋

I'm here to help you with secure peer-to-peer currency exchanges within your trusted network.

📌 Key features:
• Exchange currency with people you trust
• Send money across supported countries (UAE, Sudan, Egypt)
• Build a trust score with successful transactions

To get started, you'll need to register. If you're the first user of the system, just tell me and I'll set you up. Otherwise, please provide a valid referral code from someone who's already using the service.`;

      conversations[userId].push({ role: "assistant", content: welcomeMessage });
      await ctx.reply(welcomeMessage);
      return;
    }
    
    // Get AI response
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: conversations[userId],
      functions: functionDefinitions,
      function_call: "auto"
    });
    
    const responseMessage = response.choices[0].message;
    
    // Handle function calls
    if (responseMessage.function_call) {
      const functionName = responseMessage.function_call.name;
      const functionArgs = JSON.parse(responseMessage.function_call.arguments);
      
      console.log(`Function call: ${functionName}`, functionArgs);
      
      // Always use the authenticated user's ID for security
      functionArgs.userId = userId;
      
      // Execute function
      let functionResult;
      switch (functionName) {
        case "checkUserExists":
          functionResult = await userService.checkUserExists(userId);
          break;
        case "validateReferralCode":
          functionResult = await userService.validateReferralCode(functionArgs.referralCode);
          break;
        case "registerUser":
          // Add the Telegram username
          functionArgs.telegramUsername = ctx.from.username || '';
          functionResult = await userService.registerUser(functionArgs);
          break;
        case "registerFirstUser":
          // Add the Telegram username
          functionArgs.telegramUsername = ctx.from.username || '';
          functionResult = await userService.registerFirstUser(functionArgs);
          break;
        case "getUserProfile":
          functionResult = await userService.getUserProfile(userId);
          break;
        case "getNetworkConnections":
          functionResult = await userService.getNetworkConnections(userId);
          break;
        case "createTransferRequest":
          // Don't include rate in initial transfer creation
          // We'll use default rates instead
          functionArgs.rate = await getDefaultRate(functionArgs.currency, functionArgs.targetCurrency);
          functionResult = await transactionService.createTransferRequest(functionArgs);
          
          // If transfer creation was successful, check for matches immediately
          if (functionResult.success) {
            const matches = await transactionService.findMatchingTransfers(
              userId, 
              functionResult.transaction.transactionId
            );
            
            // If matches found, notify the user and the other parties
            if (matches.success && matches.matches && matches.matches.length > 0) {
              // Append the matches to the function result
              functionResult.matches = matches.matches;
              
              // Send notifications to users with matching transactions
              for (const match of matches.matches) {
                await notifyUserOfMatch(match.partnerId, userId, match.transactionId, functionResult.transaction.transactionId);
              }
            }
          }
          break;
        case "getActiveTransaction":
          functionResult = await transactionService.getActiveTransaction(userId);
          break;
        case "findMatchingTransfers":
          functionResult = await transactionService.findMatchingTransfers(
            userId, 
            functionArgs.transactionId
          );
          break;
        case "matchTransaction":
          functionResult = await transactionService.matchTransaction(
            userId, 
            functionArgs.transactionId, 
            functionArgs.partnerTransactionId
          );
          
          // If match successful, notify the other user
          if (functionResult.success) {
            await notifyUserOfMatchConfirmation(
              functionResult.match.partnerId, 
              userId, 
              functionArgs.partnerTransactionId,
              functionArgs.transactionId
            );
          }
          break;
        case "uploadProofOfPayment":
          functionResult = await transactionService.uploadProofOfPayment(
            userId, 
            functionArgs.transactionId, 
            functionArgs.imageId
          );
          
          // If proof uploaded, notify the partner
          if (functionResult.success) {
            const transaction = await transactionService.getTransactionById(functionArgs.transactionId);
            if (transaction && transaction.partner) {
              await notifyUserOfProofUpload(
                transaction.partner.userId,
                userId,
                functionArgs.transactionId
              );
            }
          }
          break;
        case "completeTransaction":
          functionResult = await transactionService.completeTransaction(
            userId, 
            functionArgs.transactionId, 
            functionArgs.confirmed
          );
          
          // If completion confirmed, notify the partner
          if (functionResult.success && functionArgs.confirmed) {
            const transaction = await transactionService.getTransactionById(functionArgs.transactionId);
            if (transaction && transaction.partner) {
              await notifyUserOfCompletion(
                transaction.partner.userId,
                userId,
                functionArgs.transactionId
              );
            }
          }
          break;
        case "reportIssue":
          functionResult = await transactionService.reportIssue(
            userId, 
            functionArgs.transactionId, 
            functionArgs.reason, 
            functionArgs.details
          );
          break;
        case "updateTransferRequest":
          functionResult = await transactionService.updateTransferRequest(
            userId,
            functionArgs.transactionId,
            functionArgs.updates
          );
          break;
        default:
          functionResult = { error: "Function not implemented" };
      }
      
      // After registration, update the user status in context
      if (functionName === "registerUser" || functionName === "registerFirstUser") {
        if (functionResult.success) {
          ctx.state.userExists = true;
        }
      }
      
      // Add function result to conversation
      conversations[userId].push({
        role: "function",
        name: functionName,
        content: JSON.stringify(functionResult)
      });
      
      // Get new response
      const newResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: conversations[userId]
      });
      
      const newResponseContent = newResponse.choices[0].message.content;
      
      // Add response to conversation
      conversations[userId].push({
        role: "assistant",
        content: newResponseContent
      });
      
      await ctx.reply(newResponseContent);
    } else {
      // Add response to conversation
      conversations[userId].push({
        role: "assistant",
        content: responseMessage.content
      });
      
      await ctx.reply(responseMessage.content);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
}

/**
 * Get default exchange rate for currency pair
 */
async function getDefaultRate(fromCurrency, toCurrency) {
  // Default rates for currency pairs
  const defaultRates = {
    'AED_SDG': 13.5,
    'AED_EGP': 8.5,
    'SDG_AED': 0.075,
    'SDG_EGP': 0.63,
    'EGP_AED': 0.118,
    'EGP_SDG': 1.6
  };
  
  const pair = `${fromCurrency}_${toCurrency}`;
  return defaultRates[pair] || 1.0; // Default to 1.0 if pair not found
}

/**
 * Provide a summary of active trades and available actions
 */
async function provideTradeSummary(ctx) {
  try {
    const userId = ctx.state.userId;
    const conversations = ctx.state.conversations;
    
    // Mark that we've shown the summary
    ctx.state.summaryShown = true;
    
    // Get user profile
    const profile = await userService.getUserProfile(userId);
    if (!profile.success) {
      return;
    }
    
    // Get active transaction
    const activeTransaction = await transactionService.getActiveTransaction(userId);
    
    // Format welcome message
    let welcomeMessage = `Welcome back, ${profile.profile.name}! 👋\n\n`;
    
    // Add active transaction info if exists
    if (activeTransaction.exists) {
      welcomeMessage += `📊 You have an active transaction:\n`;
      welcomeMessage += `#${activeTransaction.transaction.transactionId} - Status: ${activeTransaction.transaction.status}\n`;
      welcomeMessage += `${formatCurrency(activeTransaction.transaction.amount, activeTransaction.transaction.currency)} ↔ `;
      welcomeMessage += `${formatCurrency(activeTransaction.transaction.partnerAmount, activeTransaction.transaction.partnerCurrency)}\n\n`;
    } else {
      welcomeMessage += `You don't have any active transactions at the moment.\n\n`;
    }
    
    // Add available actions
    welcomeMessage += `What would you like to do?\n\n`;
    welcomeMessage += `💸 /transfer - Create a new transfer\n`;
    welcomeMessage += `👤 /profile - View your profile\n`;
    
    if (activeTransaction.exists) {
      switch (activeTransaction.transaction.status) {
        case 'open':
          welcomeMessage += `🔄 Edit Transfer - Send your changes (e.g., "Change amount to 2000")\n`;
          welcomeMessage += `❌ Cancel Transfer - Cancel your current transfer\n`;
          break;
        case 'matched':
          welcomeMessage += `📷 Upload Payment Proof - Send a photo as proof of payment\n`;
          welcomeMessage += `⚠️ /report - Report an issue with this transaction\n`;
          break;
        case 'proof_uploaded':
          welcomeMessage += `✅ Complete Transaction - Confirm transaction completion\n`;
          welcomeMessage += `⚠️ /report - Report an issue with this transaction\n`;
          break;
      }
    }
    
    // Add response to conversation
    conversations[userId].push({
      role: "assistant",
      content: welcomeMessage
    });
    
    await ctx.reply(welcomeMessage);
  } catch (error) {
    console.error('Error providing trade summary:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
}

/**
 * Notify a user about a matching transfer
 */
async function notifyUserOfMatch(toUserId, fromUserId, toTransactionId, fromTransactionId) {
  try {
    if (!botInstance) {
      console.error('Bot instance not set for notifications');
      return;
    }
    
    // Get user details
    const fromUser = await userService.getUserProfile(fromUserId);
    if (!fromUser.success) return;
    
    // Get transaction details
    const fromTransaction = await transactionService.getTransactionById(fromTransactionId);
    const toTransaction = await transactionService.getTransactionById(toTransactionId);
    if (!fromTransaction || !toTransaction) return;
    
    const message = `🔔 Transfer Match Found!

A user in your network has created a transfer that matches yours:

Your Transfer: #${toTransactionId}
${formatCurrency(toTransaction.amount, toTransaction.currency)} ↔ ${formatCurrency(toTransaction.targetAmount, toTransaction.targetCurrency)}

Matching Transfer: #${fromTransactionId}
From: ${fromUser.profile.name}
${formatCurrency(fromTransaction.amount, fromTransaction.currency)} ↔ ${formatCurrency(fromTransaction.targetAmount, fromTransaction.targetCurrency)}

To accept this match, use /transfer and select this offer.`;
    
    await botInstance.telegram.sendMessage(toUserId, message);
    return true;
  } catch (error) {
    console.error('Error sending match notification:', error);
    return false;
  }
}

/**
 * Notify a user that their transaction has been matched
 */
async function notifyUserOfMatchConfirmation(toUserId, fromUserId, toTransactionId, fromTransactionId) {
  try {
    if (!botInstance) {
      console.error('Bot instance not set for notifications');
      return;
    }
    
    // Get user details
    const fromUser = await userService.getUserProfile(fromUserId);
    if (!fromUser.success) return;
    
    // Get transaction details
    const toTransaction = await transactionService.getTransactionById(toTransactionId);
    if (!toTransaction) return;
    
    const message = `✅ Transfer Match Confirmed!

${fromUser.profile.name} has matched with your transfer:

Your Transfer: #${toTransactionId}
Status: Matched
${formatCurrency(toTransaction.amount, toTransaction.currency)} ↔ ${formatCurrency(toTransaction.targetAmount, toTransaction.targetCurrency)}

You can now communicate with your transfer partner to arrange payment. Once payment is sent, upload proof by sending a photo.`;
    
    await botInstance.telegram.sendMessage(toUserId, message);
    return true;
  } catch (error) {
    console.error('Error sending match confirmation:', error);
    return false;
  }
}

/**
 * Notify a user that proof has been uploaded
 */
async function notifyUserOfProofUpload(toUserId, fromUserId, transactionId) {
  try {
    if (!botInstance) {
      console.error('Bot instance not set for notifications');
      return;
    }
    
    // Get user details
    const fromUser = await userService.getUserProfile(fromUserId);
    if (!fromUser.success) return;
    
    const message = `📷 Payment Proof Uploaded!

${fromUser.profile.name} has uploaded proof of payment for transaction #${transactionId}.

Please check your messages with the bot and upload your proof as well if you have made the payment.`;
    
    await botInstance.telegram.sendMessage(toUserId, message);
    return true;
  } catch (error) {
    console.error('Error sending proof upload notification:', error);
    return false;
  }
}

/**
 * Notify a user that transaction has been completed
 */
async function notifyUserOfCompletion(toUserId, fromUserId, transactionId) {
  try {
    if (!botInstance) {
      console.error('Bot instance not set for notifications');
      return;
    }
    
    // Get user details
    const fromUser = await userService.getUserProfile(fromUserId);
    if (!fromUser.success) return;
    
    const message = `✅ Transaction Completed!

${fromUser.profile.name} has confirmed completion of transaction #${transactionId}.

Your trust score has been updated accordingly. Thank you for using our service!`;
    
    await botInstance.telegram.sendMessage(toUserId, message);
    return true;
  } catch (error) {
    console.error('Error sending completion notification:', error);
    return false;
  }
}

/**
 * Handle photo uploads (for payment proof)
 */
async function handlePhoto(ctx) {
  try {
    const userId = ctx.state.userId;
    const photoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id; // Get the highest resolution
    const caption = ctx.message.caption || '';
    const conversations = ctx.state.conversations;
    
    console.log(`Photo from ${userId}, file ID: ${photoFileId}, caption: ${caption}`);
    
    // Check if user has an active transaction
    const activeTransaction = await transactionService.getActiveTransaction(userId);
    
    if (!activeTransaction.exists) {
      await ctx.reply("You don't have any active transaction. Please create a transfer request first.");
      return;
    }
    
    // Add the photo message to conversation history
    conversations[userId].push({ 
      role: "user", 
      content: `I'm uploading a photo as proof of payment${caption ? ': ' + caption : ''}.` 
    });
    
    // Upload the proof
    const result = await transactionService.uploadProofOfPayment(
      userId,
      activeTransaction.transaction.transactionId,
      photoFileId
    );
    
    if (result.success) {
      let message;
      if (result.status === 'proof_uploaded') {
        message = "Thanks for uploading your proof of payment! We're waiting for the other party to upload their proof as well.";
      } else if (result.status === 'completed') {
        message = "Great! Both parties have now uploaded proof of payment. The transaction has been completed successfully, and your trust score has been updated.";
      }
      
      // Add the response to conversation
      conversations[userId].push({
        role: "assistant",
        content: message
      });
      
      await ctx.reply(message);
      
      // Notify the partner
      if (activeTransaction.transaction.partner) {
        await notifyUserOfProofUpload(
          activeTransaction.transaction.partner.userId,
          userId,
          activeTransaction.transaction.transactionId
        );
      }
    } else {
      await ctx.reply(`There was an issue: ${result.message || result.error}`);
    }
  } catch (error) {
    console.error('Error handling photo upload:', error);
    await ctx.reply('An error occurred processing your photo. Please try again later.');
  }
}

/**
 * Handle /start command with improved first-user detection
 */
async function handleStart(ctx) {
  try {
    const userId = ctx.state.userId;
    const userName = ctx.from.first_name;
    const conversations = ctx.state.conversations;
    
    // Check if user exists in our database
    const userExistsResult = await userService.checkUserExists(userId);
    ctx.state.userExists = userExistsResult.exists;
    ctx.state.summaryShown = false; // Reset summary shown flag
    
    let welcomeMessage;
    
    if (userExistsResult.exists) {
      // User already registered, provide summary immediately
      await provideTradeSummary(ctx);
      return;
    } else {
      // Check if this is the first user in the system
      const isFirstUserCheck = await isFirstUserInSystem();
      
      if (isFirstUserCheck) {
        // Auto-register as first user
        welcomeMessage = `Welcome to the P2P Transfer Bot, ${userName}! 👋

You're our first user! Let's get you set up right away.

To complete your registration as the first user in our system, I need a bit more information:

1. Please provide your full name
2. Your phone number 
3. Your country (UAE, Sudan, or Egypt)

Once you provide this information, I'll create your profile and generate a referral code that you can share with others.`;
      } else {
        // Not first user, need registration with referral code
        welcomeMessage = `Welcome to the P2P Transfer Bot, ${userName}! 👋

I'm here to help you with secure peer-to-peer currency exchanges within your trusted network.

📌 Key features:
• Exchange currency with people you trust
• Send money across supported countries (UAE, Sudan, Egypt)
• Build a trust score with successful transactions

To get started, you'll need to register with a referral code from someone who's already using the service.

Please enter a valid referral code to continue:`;
      }
    }
    
    // Reset conversation
    conversations[userId] = [
      { role: "system", content: getSystemPrompt() },
      { role: "assistant", content: welcomeMessage }
    ];
    
    await ctx.reply(welcomeMessage);
  } catch (error) {
    console.error('Error handling start command:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
}

/**
 * Check if this is the first user in the system
 */
async function isFirstUserInSystem() {
  try {
    const userCount = await require('../models/user').countDocuments();
    return userCount === 0;
  } catch (error) {
    console.error('Error checking if first user:', error);
    return false;
  }
}

/**
 * Handle /transfer command with enhanced matching
 */
async function handleTransfer(ctx) {
  try {
    const userId = ctx.state.userId;
    const conversations = ctx.state.conversations;
    
    // Check if user exists
    const userExists = await userService.checkUserExists(userId);
    
    if (!userExists.exists) {
      await ctx.reply("You need to be registered to create a transfer. Please register first by telling me your details.");
      return;
    }
    
    // Check if user already has an active transaction
    const activeTransaction = await transactionService.getActiveTransaction(userId);
    
    if (activeTransaction.exists) {
      // If transaction is open, check for matches
      if (activeTransaction.transaction.status === 'open') {
        const matches = await transactionService.findMatchingTransfers(
          userId, 
          activeTransaction.transaction.transactionId
        );
        
        if (matches.success && matches.matches && matches.matches.length > 0) {
          // Format message with matches
          let matchesMessage = `You have an active transfer #${activeTransaction.transaction.transactionId} with these matching offers:\n\n`;
          
          matches.matches.forEach((match, index) => {
            matchesMessage += `${index + 1}. From: ${match.partnerName} (${match.relationship})\n`;
            matchesMessage += `   Amount: ${formatCurrency(match.amount, match.currency)} ↔ ${formatCurrency(match.targetAmount, match.targetCurrency)}\n`;
            matchesMessage += `   Rate: ${match.rate}\n\n`;
          });
          
          matchesMessage += `To accept a match, reply with the number (e.g., "1" for the first match).`;
          
          // Add to conversation
          conversations[userId].push({ 
            role: "user", 
            content: "/transfer" 
          });
          
          conversations[userId].push({
            role: "assistant",
            content: matchesMessage
          });
          
          await ctx.reply(matchesMessage);
          return;
        } else {
          const editMessage = `You already have an active transfer request #${activeTransaction.transaction.transactionId}.\n\n`;
          
          const details = `${formatCurrency(activeTransaction.transaction.amount, activeTransaction.transaction.currency)} ↔ ${formatCurrency(activeTransaction.transaction.partnerAmount, activeTransaction.transaction.partnerCurrency)}\n\n`;
          
          const options = `You can:\n1. Wait for matches\n2. Edit details (e.g., "Change amount to 500")\n3. Cancel this request`;
          
          conversations[userId].push({ 
            role: "user", 
            content: "/transfer" 
          });
          
          conversations[userId].push({
            role: "assistant",
            content: editMessage + details + options
          });
          
          await ctx.reply(editMessage + details + options);
          return;
        }
      } else {
        await ctx.reply(`You already have an active transaction (#${activeTransaction.transaction.transactionId}) in status "${activeTransaction.transaction.status}". Please complete or cancel it before creating a new one.`);
        return;
      }
    }
    
    // Add message to conversation
    conversations[userId].push({ role: "user", content: "/transfer" });
    
    const message = "Let's create a new transfer! How much would you like to transfer? Please enter the amount and currency (e.g., 1000 AED).";
    
    conversations[userId].push({
      role: "assistant",
      content: message
    });
    
    await ctx.reply(message);
  } catch (error) {
    console.error('Error handling transfer command:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
}

/**
 * Handle /profile command
 */
async function handleProfile(ctx) {
  try {
    const userId = ctx.state.userId;
    const conversations = ctx.state.conversations;
    
    // Check if user exists
    const userExists = await userService.checkUserExists(userId);
    
    if (!userExists.exists) {
      await ctx.reply("You need to be registered to view your profile. Please register first by telling me your details.");
      return;
    }
    
    // Get user profile
    const profile = await userService.getUserProfile(userId);
    
    if (!profile.success) {
      await ctx.reply(`Error retrieving profile: ${profile.message || profile.error}`);
      return;
    }
    
    // Format profile message
    const profileMessage = `👤 Your Profile:
• Name: ${profile.profile.name}
• Country: ${profile.profile.country}
• Trust Score: ${profile.profile.trustScore} (${profile.profile.completedTransactions} transfers)

🔗 Your Network:
• Referrer: ${profile.profile.network.referrer} user
• Your referrals: ${profile.profile.network.referrals} users
• Sibling referrals: ${profile.profile.network.siblings} users

Your referral code: ${profile.profile.referralCode}`;
    
    // Add to conversation
    conversations[userId].push({ role: "user", content: "/profile" });
    conversations[userId].push({ role: "assistant", content: profileMessage });
    
    await ctx.reply(profileMessage);
  } catch (error) {
    console.error('Error handling profile command:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
}

/**
 * Handle /report command
 */
async function handleReport(ctx) {
  try {
    const userId = ctx.state.userId;
    const conversations = ctx.state.conversations;
    
    // Check if user exists
    const userExists = await userService.checkUserExists(userId);
    
    if (!userExists.exists) {
      await ctx.reply("You need to be registered to report an issue. Please register first by telling me your details.");
      return;
    }
    
    // Check if user has an active transaction
    const activeTransaction = await transactionService.getActiveTransaction(userId);
    
    if (!activeTransaction.exists) {
      await ctx.reply("You don't have any active transaction to report an issue with.");
      return;
    }
    
    // Add message to conversation
    conversations[userId].push({ role: "user", content: "/report" });
    
    const message = `Report issue with current transfer:
#${activeTransaction.transaction.transactionId}${activeTransaction.transaction.partner ? ' with ' + activeTransaction.transaction.partner.name : ''}

Select issue type:
• No response
• Payment issue
• Wrong amount
• Other

Please type your reason from the list above.`;
    
    conversations[userId].push({
      role: "assistant",
      content: message
    });
    
    await ctx.reply(message);
  } catch (error) {
    console.error('Error handling report command:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
}

module.exports = {
  handleMessage,
  handlePhoto,
  handleStart,
  handleTransfer,
  handleProfile,
  handleReport,
  setBotInstance
};