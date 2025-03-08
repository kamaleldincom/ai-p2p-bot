/**
 * Message handlers for the bot
 */
const { OpenAI } = require('openai');
const { getSystemPrompt } = require('../ai/prompt');
const { functionDefinitions } = require('../ai/functions');
const userService = require('../services/user');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Store conversation history
const conversations = {};

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

module.exports = { handleMessage };
