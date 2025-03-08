/**
 * src/bot/handlers.js
 * Message handlers for the bot
 */
const { OpenAI } = require('openai');
const { getSystemPrompt } = require('../ai/prompt');
const { functionDefinitions } = require('../ai/functions');
const userService = require('../services/user');
const transactionService = require('../services/transaction');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Store conversation history
const conversations = {};

// Store active registration sessions
const registrationSessions = {};

/**
 * Handle incoming text messages
 */
async function handleMessage(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const message = ctx.message.text;
    
    console.log(`Message from ${userId}: ${message}`);
    
    // Initialize conversation if it doesn't exist
    if (!conversations[userId]) {
      conversations[userId] = [
        { role: "system", content: getSystemPrompt() }
      ];
    }
    
    // Add user message to conversation
    conversations[userId].push({ role: "user", content: message });
    
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
      
      // Execute function
      let functionResult;
      switch (functionName) {
        case "checkUserExists":
    functionResult = await userService.checkUserExists(functionArgs.userId);
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
          functionResult = await userService.getUserProfile(functionArgs.userId);
          break;
        case "getNetworkConnections":
          functionResult = await userService.getNetworkConnections(functionArgs.userId);
          break;
        case "createTransferRequest":
          functionResult = await transactionService.createTransferRequest(functionArgs);
          break;
        case "getActiveTransaction":
          functionResult = await transactionService.getActiveTransaction(functionArgs.userId);
          break;
        case "findMatchingTransfers":
          functionResult = await transactionService.findMatchingTransfers(
            functionArgs.userId, 
            functionArgs.transactionId
          );
          break;
        case "matchTransaction":
          functionResult = await transactionService.matchTransaction(
            functionArgs.userId, 
            functionArgs.transactionId, 
            functionArgs.partnerTransactionId
          );
          break;
        case "uploadProofOfPayment":
          // For demonstration - in a real implementation, you would use the file ID
          // from a previously uploaded photo
          functionResult = await transactionService.uploadProofOfPayment(
            functionArgs.userId, 
            functionArgs.transactionId, 
            functionArgs.imageId
          );
          break;
        case "completeTransaction":
          functionResult = await transactionService.completeTransaction(
            functionArgs.userId, 
            functionArgs.transactionId, 
            functionArgs.confirmed
          );
          break;
        case "reportIssue":
          functionResult = await transactionService.reportIssue(
            functionArgs.userId, 
            functionArgs.transactionId, 
            functionArgs.reason, 
            functionArgs.details
          );
          break;
        default:
          functionResult = { error: "Function not implemented" };
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
 * Handle photo uploads (for payment proof)
 */
async function handlePhoto(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const photoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id; // Get the highest resolution
    const caption = ctx.message.caption || '';
    
    console.log(`Photo from ${userId}, file ID: ${photoFileId}, caption: ${caption}`);
    
    // Check if user has an active transaction
    const activeTransaction = await transactionService.getActiveTransaction(userId);
    
    if (!activeTransaction.exists) {
      await ctx.reply("You don't have any active transaction. Please create a transfer request first.");
      return;
    }
    
    // Add the photo message to conversation history
    if (!conversations[userId]) {
      conversations[userId] = [
        { role: "system", content: getSystemPrompt() }
      ];
    }
    
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
    } else {
      await ctx.reply(`There was an issue: ${result.message || result.error}`);
    }
  } catch (error) {
    console.error('Error handling photo upload:', error);
    await ctx.reply('An error occurred processing your photo. Please try again later.');
  }
}

/**
 * Handle /start command
 */
async function handleStart(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const userName = ctx.from.first_name;
    
    // Check if user exists
    const userExists = await userService.checkUserExists(userId);
    
    let welcomeMessage;
    if (userExists.exists) {
      welcomeMessage = `Welcome back, ${userName}! How can I help you today? You can create a new transfer with /transfer, check your profile with /profile, or just chat with me for help.`;
    } else {
      welcomeMessage = `Welcome to the P2P Transfer Bot, ${userName}! 👋

To get started, you'll need to complete a quick registration process. Please enter a valid referral code to continue:`;
      
      // Start registration session
      registrationSessions[userId] = { step: 'referral_code' };
    }
    
    // Initialize or reset conversation
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
 * Handle /transfer command
 */
async function handleTransfer(ctx) {
  try {
    const userId = ctx.from.id.toString();
    
    // Check if user exists
    const userExists = await userService.checkUserExists(userId);
    
    if (!userExists.exists) {
      await ctx.reply("You need to be registered to create a transfer. Please use /start to register first.");
      return;
    }
    
    // Check if user already has an active transaction
    const activeTransaction = await transactionService.getActiveTransaction(userId);
    
    if (activeTransaction.exists) {
      await ctx.reply(`You already have an active transaction (#${activeTransaction.transaction.transactionId}). Please complete or cancel it before creating a new one.`);
      return;
    }
    
    // Add message to conversation
    if (!conversations[userId]) {
      conversations[userId] = [
        { role: "system", content: getSystemPrompt() }
      ];
    }
    
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
    const userId = ctx.from.id.toString();
    
    // Check if user exists
    const userExists = await userService.checkUserExists(userId);
    
    if (!userExists.exists) {
      await ctx.reply("You need to be registered to view your profile. Please use /start to register first.");
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
    if (!conversations[userId]) {
      conversations[userId] = [
        { role: "system", content: getSystemPrompt() }
      ];
    }
    
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
    const userId = ctx.from.id.toString();
    
    // Check if user exists
    const userExists = await userService.checkUserExists(userId);
    
    if (!userExists.exists) {
      await ctx.reply("You need to be registered to report an issue. Please use /start to register first.");
      return;
    }
    
    // Check if user has an active transaction
    const activeTransaction = await transactionService.getActiveTransaction(userId);
    
    if (!activeTransaction.exists) {
      await ctx.reply("You don't have any active transaction to report an issue with.");
      return;
    }
    
    // Add message to conversation
    if (!conversations[userId]) {
      conversations[userId] = [
        { role: "system", content: getSystemPrompt() }
      ];
    }
    
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
  handleReport
};