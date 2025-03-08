/**
 * Define AI function schema definitions
 */
const functionDefinitions = [
  {
    name: "checkUserExists",
    description: "Check if a user is already registered in the system",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Telegram user ID"
        }
      },
      required: ["userId"]
    }
  }
];

module.exports = { functionDefinitions };
