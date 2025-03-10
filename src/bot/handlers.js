/**
 * src/bot/handlers.js
 * Enhanced message handlers with messaging between users
 */
const { OpenAI } = require('openai');
const { getSystemPrompt } = require('../ai/prompt');
const { functionDefinitions } = require('../ai/functions');
const userService = require('../services/user');
const transactionService = require('../services/transaction');
const { formatCurrency, parseAmountAndCurrency } = require('../utils/helpers');
const { logSessionState, resetMessagingState, debugTransactionState } = require('../utils/debug');

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
    console.log(`User exists: ${ctx.state.userExists}, Summary shown: ${ctx.state.summaryShown}`);
    
    // Log session state for debugging
    logSessionState(ctx);
    
    // Check if this is a command (starts with /)
    const isCommand = message.startsWith('/');
    
    // If this is a command, reset messaging mode
    if (isCommand) {
      resetMessagingState(ctx);
    }
    
    // Check if user is in messaging mode and this is not a command
    if (ctx.state.inMessagingMode && !isCommand) {
      // Check if the message is to exit messaging mode
      if (message.toLowerCase() === '/exit') {
        ctx.state.inMessagingMode = false;
        await ctx.reply("You've exited messaging mode.");
        return;
      }
      
      try {
        // Double-check that user actually has a matched transaction before proceeding
        const activeTransaction = await transactionService.getActiveTransaction(userId);
        
        if (!activeTransaction.exists) {
          // Reset the messaging mode as it's invalid
          ctx.state.inMessagingMode = false;
          await ctx.reply("You don't have an active transaction. Messaging mode has been disabled.");
          
          // Debug the transaction state
          await debugTransactionState(userId);
          
          // Provide a summary of available actions
          await provideTradeSummary(ctx);
          return;
        }
        
        if (activeTransaction.transaction.status !== 'matched' && 
           activeTransaction.transaction.status !== 'proof_uploaded') {
          // Reset the messaging mode as transaction isn't in the right state
          ctx.state.inMessagingMode = false;
          await ctx.reply(`Your transaction is in '${activeTransaction.transaction.status}' status. It needs to be 'matched' or 'proof_uploaded' to send messages. Messaging mode has been disabled.`);
          
          // Debug the transaction state
          await debugTransactionState(userId);
          
          // Provide a summary of available actions
          await provideTradeSummary(ctx);
          return;
        }
        
        // If we get here, messaging mode is valid, proceed with partner message
        await handlePartnerMessage(ctx, message);
        return;
      } catch (error) {
        console.error('Error checking transaction status for messaging:', error);
        // Don't disable messaging mode on temporary errors
        await ctx.reply("Unable to verify your transaction status. Please try again or use /exit to leave messaging mode.");
        return;
      }
    }
    
    if (!isCommand) {
      // Add user message to conversation
      conversations[userId].push({ role: "user", content: message });
      
      // Check if this might be a match selection (a number)
      const matchNumberMatch = message.match(/^(\d+)$/);
      if (matchNumberMatch && ctx.state.awaitingMatchSelection) {
        // Handle match selection
        await handleMatchSelection(ctx, parseInt(matchNumberMatch[1]));
        return;
      }

      // Check if this might be a destination currency selection
      if (ctx.state.awaitingDestinationCurrency) {
        // Handle currency selection
        await handleDestinationCurrencySelection(ctx, message);
        return;
      }
      
      // Check if this might be a parseable amount with currency
      const parsedAmount = parseAmountAndCurrency(message);
      if (parsedAmount && ctx.state.awaitingTransferAmount) {
        // Handle transfer amount input
        await handleTransferAmount(ctx, parsedAmount);
        return;
      }

      // Check if this is a match confirmation response
      if (ctx.state.awaitingMatchConfirmation) {
        console.log(`Match confirmation detected for transaction: ${ctx.state.transactionToConfirm}`);
        
        if (message.toLowerCase() === 'yes' || message.toLowerCase() === 'accept') {
          console.log('User accepted match, calling handleMatchConfirmation with true');
          await handleMatchConfirmation(ctx, true);
          return;
        } else if (message.toLowerCase() === 'no' || message.toLowerCase() === 'reject') {
          console.log('User rejected match, calling handleMatchConfirmation with false');
          await handleMatchConfirmation(ctx, false);
          return;
        } else {
          // For any other input when awaiting confirmation, provide guidance
          await ctx.reply("Please respond with 'yes' to accept the match request or 'no' to decline it.");
          return;
        }
      }
    }

    // If this is a registered user who hasn't seen the summary yet, 
    // and this is not a command, provide a summary
    if (ctx.state.userExists && !ctx.state.summaryShown && !isCommand) {
      await provideTradeSummary(ctx);
      return;
    }
    
    // If this is the first interaction after starting the bot
    // and the user doesn't exist in our database, we can
    // provide a special welcome message
    if (conversations[userId].length === 2 && !ctx.state.userExists && !isCommand) {
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
    
    // Get AI response with retry and better error handling
    let response;
    let retries = 2;
    
    while (retries >= 0) {
      try {
        response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: conversations[userId],
          functions: functionDefinitions,
          function_call: "auto"
        });
        break;
      } catch (error) {
        if (error.status === 429 && retries > 0) {
          // Rate limit error, wait and retry
          console.log(`OpenAI rate limit hit, retrying in 2 seconds (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          retries--;
        } else if (error.status === 400 && error.message?.includes('tokens')) {
          // Token limit exceeded
          console.log('Token limit exceeded, trimming conversation history');
          // Keep system message and last few messages
          const systemMessage = conversations[userId].find(msg => msg.role === "system");
          conversations[userId] = [
            systemMessage || { role: "system", content: getSystemPrompt() },
            { role: "user", content: message }
          ];
          retries--;
        } else {
          // Re-throw for other errors
          throw error;
        }
      }
    }
    
    if (!response) {
      throw new Error('Failed to get response from OpenAI after retries');
    }
    
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
          // Mark that we're in the transfer creation process
          ctx.state.inTransferCreation = true;
          
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
            
            // Only add matches to the result if there are actual matches
            if (matches.success && matches.matches && matches.matches.length > 0) {
              // Append the matches to the function result
              functionResult.matches = matches.matches;
              
              // Send notifications to users with matching transactions
              for (const match of matches.matches) {
                await notifyUserOfPotentialMatch(match.partnerId, userId, match.transactionId, functionResult.transaction.transactionId);
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
        case "initiateMatchRequest":
          functionResult = await transactionService.initiateMatchRequest(
            userId, 
            functionArgs.transactionId, 
            functionArgs.partnerTransactionId
          );
          
          // If match initiation successful, notify the other user to confirm
          if (functionResult.success) {
            await notifyUserOfMatchRequest(
              functionResult.match.partnerId,
              userId,
              functionArgs.partnerTransactionId,
              functionArgs.transactionId,
              functionResult.match
            );
          }
          break;
        case "confirmMatchRequest":
          functionResult = await transactionService.confirmMatchRequest(
            userId, 
            functionArgs.transactionId, 
            functionArgs.accept
          );
          
          // Reset awaiting match confirmation flag
          ctx.state.awaitingMatchConfirmation = false;
          
          // If match confirmation successful, notify the other user
          if (functionResult.success && functionResult.accepted) {
            await notifyUserOfMatchConfirmation(
              functionResult.match.partnerId,
              userId,
              functionResult.match.partnerTransactionId,
              functionResult.match.transactionId
            );
          }
          break;
        case "sendMessage":
          functionResult = await transactionService.sendMessage(
            userId,
            functionArgs.transactionId,
            functionArgs.message
          );
          
          // If message sent successfully, notify the recipient
          if (functionResult.success) {
            await notifyUserOfNewMessage(
              functionResult.message.toUserId,
              functionResult.message.fromUserId,
              functionResult.message.fromUserName,
              functionArgs.transactionId,
              functionResult.message.message
            );
          }
          break;
        case "getMessages":
          functionResult = await transactionService.getMessages(
            userId,
            functionArgs.transactionId
          );
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
      
      // Get new response with retry and better error handling
      let newResponse;
      let newRetries = 2;
      
      while (newRetries >= 0) {
        try {
          newResponse = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: conversations[userId]
          });
          break;
        } catch (error) {
          if (error.status === 429 && newRetries > 0) {
            // Rate limit error, wait and retry
            console.log(`OpenAI rate limit hit, retrying in 2 seconds (${newRetries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            newRetries--;
          } else if (error.status === 400 && error.message?.includes('tokens')) {
            // Token limit exceeded
            console.log('Token limit exceeded, trimming conversation history');
            // Keep system message, function result and truncate earlier messages
            const systemMessage = conversations[userId].find(msg => msg.role === "system");
            const functionResultMessage = conversations[userId][conversations[userId].length - 1];
            conversations[userId] = [
              systemMessage || { role: "system", content: getSystemPrompt() },
              functionResultMessage
            ];
            newRetries--;
          } else {
            // Re-throw for other errors
            throw error;
          }
        }
      }
      
      if (!newResponse) {
        throw new Error('Failed to get response from OpenAI after retries');
      }
      
      const newResponseContent = newResponse.choices[0].message.content;
      
      // Add response to conversation
      conversations[userId].push({
        role: "assistant",
        content: newResponseContent
      });
      
      await ctx.reply(newResponseContent);
      
      // If we're in transfer creation and got real matches, set flag to await selection
      if (functionName === "createTransferRequest" && functionResult.success && 
          functionResult.matches && functionResult.matches.length > 0) {
        ctx.state.awaitingMatchSelection = true;
        ctx.state.activeTransactionId = functionResult.transaction.transactionId;
        ctx.state.availableMatches = functionResult.matches;
      }
      
      // If we found no matches, clear the flag
      if (functionName === "findMatchingTransfers" && 
          (!functionResult.matches || functionResult.matches.length === 0)) {
        ctx.state.awaitingMatchSelection = false;
        ctx.state.availableMatches = null;
      }
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
 * Handle messaging with transaction partner
 */
async function handlePartnerMessage(ctx, message) {
  try {
    const userId = ctx.state.userId;
    const conversations = ctx.state.conversations;
    
    // Get active transaction
    const activeTransaction = await transactionService.getActiveTransaction(userId);
    
    if (!activeTransaction.exists || 
        (activeTransaction.transaction.status !== 'matched' && 
         activeTransaction.transaction.status !== 'proof_uploaded')) {
      await ctx.reply("You don't have an active matched transaction to send messages.");
      ctx.state.inMessagingMode = false;
      return;
    }
    
    // Send the message
    const result = await transactionService.sendMessage(
      userId,
      activeTransaction.transaction.transactionId,
      message
    );
    
    if (result.success) {
      // Add to conversation
      conversations[userId].push({
        role: "user",
        content: `Message to partner: ${message}`
      });
      
      const responseMessage = `Message sent to ${result.message.toUserId === activeTransaction.transaction.partner.userId ? 
        activeTransaction.transaction.partner.name : 'your partner'}.`;
      
      conversations[userId].push({
        role: "assistant",
        content: responseMessage
      });
      
      await ctx.reply(responseMessage);
      
      // Notify the recipient
      await notifyUserOfNewMessage(
        result.message.toUserId,
        userId,
        result.message.fromUserName,
        activeTransaction.transaction.transactionId,
        message
      );
    } else {
      await ctx.reply(`Failed to send message: ${result.message || result.error}`);
      ctx.state.inMessagingMode = false;
    }
  } catch (error) {
    console.error('Error handling partner message:', error);
    await ctx.reply('An error occurred sending your message. Please try again later.');
    ctx.state.inMessagingMode = false;
  }
}

/**
 * Handle destination currency selection
 */
async function handleDestinationCurrencySelection(ctx, selection) {
  try {
    const userId = ctx.state.userId;
    const conversations = ctx.state.conversations;
    
    let targetCurrency;
    
    // Try to parse the selection
    if (selection === '1' || selection.toUpperCase() === 'AED') {
      targetCurrency = 'AED';
    } else if (selection === '2' || selection.toUpperCase() === 'SDG') {
      targetCurrency = 'SDG';
    } else if (selection === '3' || selection.toUpperCase() === 'EGP') {
      targetCurrency = 'EGP';
    } else {
      // Invalid selection
      await ctx.reply("Invalid selection. Please choose 1 for AED, 2 for SDG, or 3 for EGP.");
      return;
    }
    
    // Calculate default rate
    const rate = await getDefaultRate(ctx.state.transferCurrency, targetCurrency);
    const targetAmount = ctx.state.transferAmount * rate;
    
    // Create transfer request
    const createResult = await transactionService.createTransferRequest({
      userId: userId,
      amount: ctx.state.transferAmount,
      currency: ctx.state.transferCurrency,
      targetCurrency: targetCurrency,
      rate: rate
    });
    
    // Reset state
    ctx.state.awaitingDestinationCurrency = false;
    ctx.state.transferAmount = null;
    ctx.state.transferCurrency = null;
    
    if (!createResult.success) {
      await ctx.reply(`Failed to create transfer: ${createResult.message || createResult.error}`);
      return;
    }
    
    // Add to conversation
    conversations[userId].push({
      role: "assistant",
      content: `Your transfer request for ${formatCurrency(ctx.state.transferAmount, ctx.state.transferCurrency)} to ${targetCurrency} has been successfully created!`
    });
    
    // Check for matches
    const matches = await transactionService.findMatchingTransfers(
      userId,
      createResult.transaction.transactionId
    );
    
    if (matches.success && matches.matches && matches.matches.length > 0) {
      // We have matches - format and display them
      let matchesMessage = `I have found ${matches.matches.length} match${matches.matches.length > 1 ? 'es' : ''} for your transfer request. Here are the details:\n\n`;
      
      matches.matches.forEach((match, index) => {
        matchesMessage += `${index + 1}. From: ${match.partnerName} (${match.relationship})\n`;
        matchesMessage += `   Trust Score: ${match.partnerTrustScore} (${match.partnerCompletedTransactions} completed transactions)\n`;
        matchesMessage += `   Amount: ${formatCurrency(match.amount, match.currency)}\n`;
        matchesMessage += `   Exchange Rate: 1 ${ctx.state.transferCurrency} = ${match.rate} ${targetCurrency}\n\n`;
      });
      
      matchesMessage += `Would you like to proceed with one of these matches? Reply with the number (e.g., "1" for the first match).`;
      
      // Set state for match selection
      ctx.state.awaitingMatchSelection = true;
      ctx.state.activeTransactionId = createResult.transaction.transactionId;
      ctx.state.availableMatches = matches.matches;
      
      // Add to conversation
      conversations[userId].push({
        role: "assistant",
        content: matchesMessage
      });
      
      await ctx.reply(matchesMessage);
      
      // Send notifications to potential match partners
      for (const match of matches.matches) {
        await notifyUserOfPotentialMatch(
          match.partnerId,
          userId,
          match.transactionId,
          createResult.transaction.transactionId
        );
      }
    } else {
      // No matches found
      const message = `Your transfer request for ${formatCurrency(createResult.transaction.amount, createResult.transaction.currency)} to ${formatCurrency(createResult.transaction.targetAmount, createResult.transaction.targetCurrency)} has been created.

No matching transactions found at the moment. I'll notify you when a match becomes available.

Transaction ID: #${createResult.transaction.transactionId}
Exchange Rate: 1 ${createResult.transaction.currency} = ${createResult.transaction.rate} ${createResult.transaction.targetCurrency}`;

      // Add to conversation
      conversations[userId].push({
        role: "assistant",
        content: message
      });
      
      await ctx.reply(message);
    }
  } catch (error) {
    console.error('Error handling destination currency selection:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
}

/**
 * Handle match confirmation
 */
async function handleMatchConfirmation(ctx, accept) {
  try {
    const userId = ctx.state.userId;
    const conversations = ctx.state.conversations;
    
    console.log(`Handling match confirmation: userId=${userId}, txId=${ctx.state.transactionToConfirm}, accept=${accept}`);
    
    // Validate that we have the transaction ID
    if (!ctx.state.transactionToConfirm) {
      console.error('Missing transaction ID for confirmation');
      await ctx.reply("Sorry, I couldn't find the transaction to confirm. Please try using /transfer to check your active transactions.");
      ctx.state.awaitingMatchConfirmation = false;
      return;
    }
    
    // Verify the transaction exists and is in the right state
    const activeTransaction = await transactionService.getActiveTransaction(userId);
    if (!activeTransaction.exists || activeTransaction.transaction.status !== 'pending_match') {
      console.error(`Transaction not found or in wrong state: ${activeTransaction?.transaction?.status}`);
      await ctx.reply("Sorry, this transaction is no longer available for confirmation.");
      ctx.state.awaitingMatchConfirmation = false;
      ctx.state.transactionToConfirm = null;
      return;
    }
    
    // Confirm or reject the match
    const result = await transactionService.confirmMatchRequest(
      userId,
      ctx.state.transactionToConfirm,
      accept
    );
    
    console.log('Confirmation result:', result);
    
    // Reset state
    ctx.state.awaitingMatchConfirmation = false;
    ctx.state.transactionToConfirm = null;
    
    if (!result.success) {
      console.error('Confirmation failed:', result.message || result.error);
      await ctx.reply(`Failed to process match confirmation: ${result.message || result.error}`);
      return;
    }
    
    if (!result.accepted) {
      // Match rejected
      const message = "You have declined the match request. The other user will be notified.";
      
      // Add to conversation
      conversations[userId].push({
        role: "user",
        content: "No, I don't want to accept this match."
      });
      
      conversations[userId].push({
        role: "assistant",
        content: message
      });
      
      await ctx.reply(message);
      
      // Notify the other user if we have partner details
      if (ctx.state.partnerUserId && ctx.state.partnerTransactionId) {
        await notifyUserOfMatchRejection(
          ctx.state.partnerUserId,
          userId,
          ctx.state.partnerTransactionId
        );
      } else {
        console.error('Unable to notify partner: missing partnerUserId or partnerTransactionId');
      }
      
      return;
    }
    
    // Match accepted
    const message = `Match confirmed! ✅

You've been matched with ${result.match.partnerName}.

Transaction details:
• Your amount: ${formatCurrency(result.match.amount, result.match.currency)}
• Partner amount: ${formatCurrency(result.match.partnerAmount, result.match.partnerCurrency)}
• Exchange rate: ${result.match.rate}

You can now communicate with your partner to arrange the payment. Use /message to start a conversation.`;
    
    // Add to conversation
    conversations[userId].push({
      role: "user",
      content: "Yes, I accept this match."
    });
    
    conversations[userId].push({
      role: "assistant",
      content: message
    });
    
    await ctx.reply(message);
    
    // Notify the other user
    await notifyUserOfMatchConfirmation(
      result.match.partnerId,
      userId,
      result.match.partnerTransactionId,
      result.match.transactionId
    );
  } catch (error) {
    console.error('Error handling match confirmation:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
}

/**
 * Handle a match selection from the user
 */
async function handleMatchSelection(ctx, matchNumber) {
  try {
    const userId = ctx.state.userId;
    const conversations = ctx.state.conversations;
    
    // Validate selection
    if (!ctx.state.availableMatches || !ctx.state.activeTransactionId ||
        matchNumber < 1 || matchNumber > ctx.state.availableMatches.length) {
      await ctx.reply("Invalid selection. Please try again or use /transfer to view available matches.");
      return;
    }
    
    const selectedMatch = ctx.state.availableMatches[matchNumber - 1];
    
    // Initiate the match request
    const result = await transactionService.initiateMatchRequest(
      userId,
      ctx.state.activeTransactionId,
      selectedMatch.transactionId
    );
    
    if (result.success) {
      // Add the selection to conversation
      conversations[userId].push({
        role: "user",
        content: `I want to match with option ${matchNumber}.`
      });
      
      const message = `Great choice! You are matched with ${selectedMatch.partnerName} for the transfer of ${formatCurrency(result.match.amount, result.match.currency)} to ${result.match.partnerCurrency} at a rate of ${result.match.rate}.

I've sent a notification to ${selectedMatch.partnerName}. The match will be confirmed when they accept.

Feel free to negotiate the exchange rate with ${selectedMatch.partnerName} if needed. Let me know once you're ready to proceed!`;
      
      // Add assistant response
      conversations[userId].push({
        role: "assistant",
        content: message
      });
      
      // Reset match selection flags
      ctx.state.awaitingMatchSelection = false;
      ctx.state.availableMatches = null;
      
      await ctx.reply(message);
      
      // Notify the partner
      await notifyUserOfMatchRequest(
        selectedMatch.partnerId,
        userId,
        selectedMatch.transactionId,
        ctx.state.activeTransactionId,
        result.match
      );
    } else {
      await ctx.reply(`Failed to initiate match: ${result.message || result.error}`);
    }
  } catch (error) {
    console.error('Error handling match selection:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
}

/**
 * Handle transfer amount input from user
 */
async function handleTransferAmount(ctx, parsedAmount) {
  try {
    const userId = ctx.state.userId;
    const conversations = ctx.state.conversations;
    
    // Confirm the amount and ask for destination currency
    const message = `You want to transfer ${formatCurrency(parsedAmount.amount, parsedAmount.currency)}.

Now, please select the destination currency:
1. AED (UAE Dirham)
2. SDG (Sudanese Pound) 
3. EGP (Egyptian Pound)

Reply with the number of your choice or type the currency code.`;
    
    // Set state for next step
    ctx.state.transferAmount = parsedAmount.amount;
    ctx.state.transferCurrency = parsedAmount.currency;
    ctx.state.awaitingTransferAmount = false;
    ctx.state.awaitingDestinationCurrency = true;
    
    // Add to conversation
    conversations[userId].push({
      role: "assistant",
      content: message
    });
    
    await ctx.reply(message);
  } catch (error) {
    console.error('Error handling transfer amount input:', error);
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
      console.error('Error retrieving user profile:', profile.message || profile.error);
      await ctx.reply('Unable to retrieve your profile information. Please try again later.');
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
      
      // If transaction is pending confirmation, show confirmation request
      if (activeTransaction.transaction.status === 'pending_match' && 
          activeTransaction.transaction.pendingConfirmation) {
        welcomeMessage += `⚠️ You have a pending match request! Please respond with "yes" to accept or "no" to decline.\n\n`;
        
        // Set state to await confirmation, with all necessary details
        ctx.state.awaitingMatchConfirmation = true;
        ctx.state.transactionToConfirm = activeTransaction.transaction.transactionId;
        
        // Find the initiator's details for later notifications
        const pendingPartnerTxId = activeTransaction.transaction.pendingPartnerTransactionId;
        if (pendingPartnerTxId) {
          console.log(`Setting partner transaction ID: ${pendingPartnerTxId}`);
          const pendingTx = await transactionService.getTransactionById(pendingPartnerTxId);
          if (pendingTx) {
            ctx.state.partnerUserId = pendingTx.initiatorId;
            ctx.state.partnerTransactionId = pendingPartnerTxId;
            console.log(`Setting partner user ID: ${ctx.state.partnerUserId}`);
          }
        }
      }
      
      // If transaction has messages, show unread count
      if (activeTransaction.transaction.messages && activeTransaction.transaction.messages.length > 0) {
        const unreadMessages = activeTransaction.transaction.messages.filter(
          msg => msg.toUserId === userId && !msg.read
        ).length;
        
        if (unreadMessages > 0) {
          welcomeMessage += `📩 You have ${unreadMessages} unread message(s). Use /messages to view them.\n\n`;
        } else if (activeTransaction.transaction.messages && activeTransaction.transaction.messages.length > 0) {
          welcomeMessage += `💬 You have ${activeTransaction.transaction.messages.length} message(s) in this transaction. Use /messages to view them.\n\n`;
        }
      }
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
        case 'pending_match':
          if (activeTransaction.transaction.pendingConfirmation) {
            welcomeMessage += `✅ Accept Match - Confirm the match request\n`;
            welcomeMessage += `❌ Reject Match - Decline the match request\n`;
          } else {
            welcomeMessage += `⏳ Waiting for partner to confirm match\n`;
          }
          break;
        case 'matched':
          welcomeMessage += `💬 /message - Send a message to your partner\n`;
          welcomeMessage += `📷 Upload Payment Proof - Send a photo as proof of payment\n`;
          welcomeMessage += `⚠️ /report - Report an issue with this transaction\n`;
          break;
        case 'proof_uploaded':
          welcomeMessage += `💬 /message - Send a message to your partner\n`;
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
 * Notify a user about a potential match
 */
async function notifyUserOfPotentialMatch(toUserId, fromUserId, toTransactionId, fromTransactionId) {
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
    
    const message = `🔔 Potential Transfer Match!

A user in your network has created a transfer that matches yours:

Your Transfer: #${toTransactionId}
${formatCurrency(toTransaction.amount, toTransaction.currency)} ↔ ${formatCurrency(toTransaction.targetAmount, toTransaction.targetCurrency)}

Matching Transfer: #${fromTransactionId}
From: ${fromUser.profile.name}
${formatCurrency(fromTransaction.amount, fromTransaction.currency)} ↔ ${formatCurrency(fromTransaction.targetAmount, fromTransaction.targetCurrency)}

Use /transfer to view and accept this match.`;
    
    await botInstance.telegram.sendMessage(toUserId, message);
    return true;
  } catch (error) {
    console.error('Error sending potential match notification:', error);
    return false;
  }
}

/**
 * Notify a user about a match request that needs confirmation
 */
async function notifyUserOfMatchRequest(toUserId, fromUserId, toTransactionId, fromTransactionId, matchDetails) {
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
    
    const message = `🔄 Transfer Match Request!

${fromUser.profile.name} wants to match with your transfer:

Your Transfer: #${toTransactionId}
Amount: ${formatCurrency(toTransaction.amount, toTransaction.currency)} ↔ ${formatCurrency(toTransaction.targetAmount, toTransaction.targetCurrency)}

To accept this match, reply with "yes" or "accept".
To decline, reply with "no" or "reject".`;
    
    await botInstance.telegram.sendMessage(toUserId, message);
    return true;
  } catch (error) {
    console.error('Error sending match request notification:', error);
    return false;
  }
}

/**
 * Notify a user that their match request was rejected
 */
async function notifyUserOfMatchRejection(toUserId, fromUserId, toTransactionId) {
  try {
    if (!botInstance) {
      console.error('Bot instance not set for notifications');
      return;
    }
    
    // Get user details
    const fromUser = await userService.getUserProfile(fromUserId);
    if (!fromUser.success) return;
    
    const message = `❌ Match Request Declined

${fromUser.profile.name} has declined your match request for transaction #${toTransactionId}.

You can try matching with other users by using /transfer.`;
    
    await botInstance.telegram.sendMessage(toUserId, message);
    return true;
  } catch (error) {
    console.error('Error sending match rejection notification:', error);
    return false;
  }
}

/**
 * Notify a user that their transaction has been matched (confirmed by both parties)
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

You can now communicate with your transfer partner to arrange payment. Use /message to start a conversation.`;
    
    await botInstance.telegram.sendMessage(toUserId, message);
    return true;
  } catch (error) {
    console.error('Error sending match confirmation:', error);
    return false;
  }
}

/**
 * Notify a user about a new message
 */
async function notifyUserOfNewMessage(toUserId, fromUserId, fromUserName, transactionId, messageText) {
  try {
    if (!botInstance) {
      console.error('Bot instance not set for notifications');
      return;
    }
    
    const message = `📩 New Message from ${fromUserName}:

"${messageText}"

This is regarding transaction #${transactionId}.
Use /message to reply.`;
    
    await botInstance.telegram.sendMessage(toUserId, message);
    return true;
  } catch (error) {
    console.error('Error sending new message notification:', error);
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
    
    // Log session state for debugging
    logSessionState(ctx);
    
    // Check if user exists in our database
    const userExistsResult = await userService.checkUserExists(userId);
    ctx.state.userExists = userExistsResult.exists;
    
    // Reset all state flags
    ctx.state.summaryShown = false;
    ctx.state.inTransferCreation = false;
    ctx.state.awaitingMatchSelection = false;
    ctx.state.awaitingTransferAmount = false;
    ctx.state.awaitingDestinationCurrency = false;
    ctx.state.awaitingMatchConfirmation = false;
    resetMessagingState(ctx);
    ctx.state.availableMatches = null;
    ctx.state.activeTransactionId = null;
    ctx.state.transferAmount = null;
    ctx.state.transferCurrency = null;
    ctx.state.transactionToConfirm = null;
    ctx.state.partnerUserId = null;
    ctx.state.partnerTransactionId = null;
    
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
    
    // Log session state for debugging
    logSessionState(ctx);
    
    // Reset all messaging-related state flags
    resetMessagingState(ctx);
    
    // Check if user exists
    const userExists = await userService.checkUserExists(userId);
    
    if (!userExists.exists) {
      await ctx.reply("You need to be registered to create a transfer. Please register first by telling me your details.");
      return;
    }

    // Set summary shown flag to true to prevent welcome message repetition
    ctx.state.summaryShown = true;
    
    // Check if user already has an active transaction
    const activeTransaction = await transactionService.getActiveTransaction(userId);
    
    // Debug the transaction state
    await debugTransactionState(userId);
    
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
            matchesMessage += `   Trust Score: ${match.partnerTrustScore} (${match.partnerCompletedTransactions} completed transactions)\n`;
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
          
          // Set state for match selection
          ctx.state.awaitingMatchSelection = true;
          ctx.state.activeTransactionId = activeTransaction.transaction.transactionId;
          ctx.state.availableMatches = matches.matches;
          
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
      } else if (activeTransaction.transaction.status === 'pending_match') {
        if (activeTransaction.transaction.pendingConfirmation) {
          // This user needs to confirm a match
          const message = `You have a pending match request for transaction #${activeTransaction.transaction.transactionId}.

Please respond with "yes" to accept or "no" to decline.`;
          
          conversations[userId].push({ 
            role: "user", 
            content: "/transfer" 
          });
          
          conversations[userId].push({
            role: "assistant",
            content: message
          });
          
          // Set state to await confirmation with partner details
          ctx.state.awaitingMatchConfirmation = true;
          ctx.state.transactionToConfirm = activeTransaction.transaction.transactionId;
          
          // Find the initiator's details for later notifications
          const pendingPartnerTxId = activeTransaction.transaction.pendingPartnerTransactionId;
          if (pendingPartnerTxId) {
            console.log(`Setting partner transaction ID: ${pendingPartnerTxId}`);
            const pendingTx = await transactionService.getTransactionById(pendingPartnerTxId);
            if (pendingTx) {
              ctx.state.partnerUserId = pendingTx.initiatorId;
              ctx.state.partnerTransactionId = pendingPartnerTxId;
              console.log(`Setting partner user ID: ${ctx.state.partnerUserId}`);
            }
          }
          
          await ctx.reply(message);
          return;
        } else {
          // This user has initiated a match and is waiting for confirmation
          const message = `You have a pending match request for transaction #${activeTransaction.transaction.transactionId}.

Waiting for the other party to confirm. I'll notify you when they respond.`;
          
          conversations[userId].push({ 
            role: "user", 
            content: "/transfer" 
          });
          
          conversations[userId].push({
            role: "assistant",
            content: message
          });
          
          await ctx.reply(message);
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
    
    // Set state for transfer creation
    ctx.state.awaitingTransferAmount = true;
    ctx.state.inTransferCreation = true;
    
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
    
    // Log session state for debugging
    logSessionState(ctx);
    
    // Reset messaging mode
    resetMessagingState(ctx);
    
    // Set summary shown flag to true to prevent welcome message repetition
    ctx.state.summaryShown = true;
    
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
 * Handle /message command
 */
async function handleMessageCommand(ctx) {
  try {
    const userId = ctx.state.userId;
    const conversations = ctx.state.conversations;
    
    // Log session state for debugging
    logSessionState(ctx);
    
    // Set summary shown flag to true to prevent welcome message repetition
    ctx.state.summaryShown = true;
    
    // Reset transfer creation flags
    ctx.state.inTransferCreation = false;
    ctx.state.awaitingTransferAmount = false;
    ctx.state.awaitingDestinationCurrency = false;
    
    // Check if user exists
    const userExists = await userService.checkUserExists(userId);
    
    if (!userExists.exists) {
      await ctx.reply("You need to be registered to send messages. Please register first by telling me your details.");
      return;
    }
    
    // Check if user has an active matched transaction
    const activeTransaction = await transactionService.getActiveTransaction(userId);
    
    // Debug the transaction
    await debugTransactionState(userId);
    
    if (!activeTransaction.exists) {
      await ctx.reply("You don't have any active transaction. Please create a transfer first with /transfer.");
      return;
    }
    
    if (activeTransaction.transaction.status !== 'matched' && 
        activeTransaction.transaction.status !== 'proof_uploaded') {
      await ctx.reply(`Your transaction is in '${activeTransaction.transaction.status}' status. It needs to be 'matched' before you can send messages.`);
      return;
    }
    
    // Get partner details
    const partnerName = activeTransaction.transaction.partner ? 
      activeTransaction.transaction.partner.name : 'your partner';
    
    // Add message to conversation
    conversations[userId].push({ role: "user", content: "/message" });
    
    // Get any existing messages
    const messagesResult = await transactionService.getMessages(
      userId,
      activeTransaction.transaction.transactionId
    );
    
    let messageHistory = '';
    if (messagesResult.success && messagesResult.messages && messagesResult.messages.length > 0) {
      messageHistory = "\nPrevious messages:\n\n";
      messagesResult.messages.forEach(msg => {
        const fromName = msg.fromUserId === userId ? "You" : msg.fromUserName;
        messageHistory += `${fromName}: ${msg.message}\n`;
      });
      messageHistory += "\n";
    }
    
    const message = `You're now in messaging mode with ${partnerName}.${messageHistory}
Type your message and I'll deliver it to ${partnerName}.
(Type /exit to leave messaging mode)`;
    
    conversations[userId].push({
      role: "assistant",
      content: message
    });
    
    // Set messaging mode state
    ctx.state.inMessagingMode = true;
    
    // Save the transaction ID for reference
    ctx.state.activeTransactionId = activeTransaction.transaction.transactionId;
    
    await ctx.reply(message);
  } catch (error) {
    console.error('Error handling message command:', error);
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
    
    // Log session state for debugging
    logSessionState(ctx);
    
    // Set summary shown flag to true to prevent welcome message repetition
    ctx.state.summaryShown = true;
    
    // Reset messaging mode
    resetMessagingState(ctx);
    
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

/**
 * Handle /messages command to view unread messages
 */
async function handleMessages(ctx) {
  try {
    const userId = ctx.state.userId;
    const conversations = ctx.state.conversations;
    
    // Log session state for debugging
    logSessionState(ctx);
    
    // Set summary shown flag to true to prevent welcome message repetition
    ctx.state.summaryShown = true;
    
    // Reset messaging mode
    resetMessagingState(ctx);
    
    // Check if user exists
    const userExists = await userService.checkUserExists(userId);
    
    if (!userExists.exists) {
      await ctx.reply("You need to be registered to view messages. Please register first by telling me your details.");
      return;
    }
    
    // Check if user has an active transaction
    const activeTransaction = await transactionService.getActiveTransaction(userId);
    
    if (!activeTransaction.exists) {
      await ctx.reply("You don't have any active transaction to view messages for.");
      return;
    }
    
    // Get transaction messages
    const messagesResult = await transactionService.getMessages(
      userId,
      activeTransaction.transaction.transactionId
    );
    
    if (!messagesResult.success) {
      await ctx.reply(`Failed to retrieve messages: ${messagesResult.message || messagesResult.error}`);
      return;
    }
    
    // Add message to conversation
    conversations[userId].push({ role: "user", content: "/messages" });
    
    // Format messages and send to user
    if (!messagesResult.messages || messagesResult.messages.length === 0) {
      const noMessagesResponse = "You don't have any messages for your current transaction.";
      conversations[userId].push({ role: "assistant", content: noMessagesResponse });
      await ctx.reply(noMessagesResponse);
      return;
    }
    
    // Format messages
    let formattedMessages = `Messages for transaction #${activeTransaction.transaction.transactionId}:\n\n`;
    
    const partnerName = activeTransaction.transaction.partner ? 
      activeTransaction.transaction.partner.name : 'your partner';
    
    messagesResult.messages.forEach((msg, index) => {
      const fromName = msg.fromUserId === userId ? "You" : msg.fromUserName || partnerName;
      const timestamp = new Date(msg.timestamp).toLocaleString();
      formattedMessages += `${fromName} (${timestamp}):\n${msg.message}\n\n`;
      
      // Mark message as read if it was sent to this user
      if (msg.toUserId === userId && !msg.read) {
        transactionService.markMessageAsRead(
          activeTransaction.transaction.transactionId, 
          msg.timestamp
        ).catch(err => console.error('Error marking message as read:', err));
      }
    });
    
    formattedMessages += `\nUse /message to send a new message to ${partnerName}.`;
    
    // Add to conversation
    conversations[userId].push({ role: "assistant", content: formattedMessages });
    
    await ctx.reply(formattedMessages);
  } catch (error) {
    console.error('Error handling messages command:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
}

module.exports = {
  handleMessage,
  handlePhoto,
  handleStart,
  handleTransfer,
  handleProfile,
  handleMessageCommand,
  handleMessages,
  handleReport,
  setBotInstance
};