# AI-P2P-BOT Commands & Guidelines

## Commands
- `npm start` - Start the bot
- `npm run dev` - Run with nodemon for development
- `npm test` - Run tests (not configured yet)
- `npm run lint` - Run linting (not configured yet)

## User Commands
- `/start` - Begin using the bot, register if needed
- `/transfer` - Create or manage currency transfers
- `/profile` - View your profile and network
- `/message` - Send messages to your transaction partner
- `/messages` - View conversation history with your partner
- `/report` - Report issues with transactions
- `/exit` - Exit messaging mode

## Code Style
- **Modules**: Use CommonJS `require`/`module.exports`
- **Functions**: Prefer arrow functions for callbacks, named functions for exports
- **Error Handling**: Use try/catch blocks for async operations, validate inputs
- **DB Operations**: Use atomic operations with findOneAndUpdate when possible
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Logging**: Use descriptive console.log messages for debugging
- **Formatting**: 2-space indentation, semicolons required

## Project Structure
- `src/ai/` - OpenAI integration with prompt templates
- `src/bot/` - Telegram bot handlers and command processors
- `src/middleware/` - Bot middleware and session management
- `src/models/` - Mongoose database schemas
- `src/services/` - Business logic for users and transactions
- `src/utils/` - Helper functions for common operations