/**
 * src/ai/functions.js
 * Define AI function schema definitions with messaging support
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
  },
  {
    name: "registerFirstUser",
    description: "Register the first user in the system without a referral code",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Telegram user ID"
        },
        telegramUsername: {
          type: "string",
          description: "Telegram username"
        },
        name: {
          type: "string",
          description: "User's full name"
        },
        phone: {
          type: "string",
          description: "User's phone number"
        },
        identificationNumber: {
          type: "string",
          description: "Optional identification number"
        },
        country: {
          type: "string",
          description: "User's country (UAE, SDN, or EGY)",
          enum: ["UAE", "SDN", "EGY"]
        }
      },
      required: ["userId", "name", "phone", "country"]
    }
  },
  {
    name: "registerUser",
    description: "Register a new user in the system",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Telegram user ID"
        },
        telegramUsername: {
          type: "string",
          description: "Telegram username"
        },
        name: {
          type: "string",
          description: "User's full name"
        },
        phone: {
          type: "string",
          description: "User's phone number"
        },
        identificationNumber: {
          type: "string",
          description: "Optional identification number"
        },
        country: {
          type: "string",
          description: "User's country (UAE, SDN, or EGY)",
          enum: ["UAE", "SDN", "EGY"]
        },
        referralCode: {
          type: "string",
          description: "The referral code used by this user to register"
        }
      },
      required: ["userId", "name", "phone", "country", "referralCode"]
    }
  },
  {
    name: "getUserProfile",
    description: "Get a user's profile information",
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
  },
  {
    name: "getNetworkConnections",
    description: "Get a user's network connections (referrer, referrals, siblings)",
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
  },
  {
    name: "createTransferRequest",
    description: "Create a new transfer request",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Telegram user ID of the initiator"
        },
        amount: {
          type: "number",
          description: "Amount to transfer"
        },
        currency: {
          type: "string",
          description: "Currency code of the amount",
          enum: ["AED", "SDG", "EGP"]
        },
        targetCurrency: {
          type: "string",
          description: "Currency code of the destination",
          enum: ["AED", "SDG", "EGP"]
        },
        notes: {
          type: "string",
          description: "Optional notes about the transfer"
        }
      },
      required: ["userId", "amount", "currency", "targetCurrency"]
    }
  },
  {
    name: "updateTransferRequest",
    description: "Update an existing transfer request",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Telegram user ID of the initiator"
        },
        transactionId: {
          type: "string",
          description: "ID of the transaction to update"
        },
        updates: {
          type: "object",
          description: "Fields to update",
          properties: {
            amount: {
              type: "number",
              description: "New amount to transfer"
            },
            currency: {
              type: "string",
              description: "New currency code of the amount",
              enum: ["AED", "SDG", "EGP"]
            },
            targetCurrency: {
              type: "string",
              description: "New currency code of the destination",
              enum: ["AED", "SDG", "EGP"]
            },
            rate: {
              type: "number",
              description: "New exchange rate between the currencies"
            },
            notes: {
              type: "string",
              description: "New notes about the transfer"
            }
          }
        }
      },
      required: ["userId", "transactionId", "updates"]
    }
  },
  {
    name: "getActiveTransaction",
    description: "Get a user's active transaction",
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
  },
  {
    name: "findMatchingTransfers",
    description: "Find matching transfer requests in the user's network",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Telegram user ID"
        },
        transactionId: {
          type: "string",
          description: "Transaction ID to find matches for"
        }
      },
      required: ["userId", "transactionId"]
    }
  },
  {
    name: "initiateMatchRequest",
    description: "Send a match request that requires confirmation from the other party",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Telegram user ID initiating the match"
        },
        transactionId: {
          type: "string",
          description: "Transaction ID to match"
        },
        partnerTransactionId: {
          type: "string",
          description: "Partner's transaction ID to match with"
        }
      },
      required: ["userId", "transactionId", "partnerTransactionId"]
    }
  },
  {
    name: "confirmMatchRequest",
    description: "Confirm or reject a match request",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Telegram user ID confirming the match"
        },
        transactionId: {
          type: "string", 
          description: "User's transaction ID"
        },
        accept: {
          type: "boolean",
          description: "Whether to accept the match request"
        }
      },
      required: ["userId", "transactionId", "accept"]
    }
  },
  {
    name: "sendMessage",
    description: "Send a message to transaction partner",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Telegram user ID sending the message"
        },
        transactionId: {
          type: "string",
          description: "Transaction ID"
        },
        message: {
          type: "string",
          description: "Message content to send"
        }
      },
      required: ["userId", "transactionId", "message"]
    }
  },
  {
    name: "getMessages",
    description: "Get message history for a transaction",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Telegram user ID"
        },
        transactionId: {
          type: "string",
          description: "Transaction ID"
        }
      },
      required: ["userId", "transactionId"]
    }
  },
  {
    name: "uploadProofOfPayment",
    description: "Record that a payment proof has been uploaded",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Telegram user ID"
        },
        transactionId: {
          type: "string",
          description: "Transaction ID"
        },
        imageId: {
          type: "string",
          description: "Telegram file ID of the uploaded image"
        }
      },
      required: ["userId", "transactionId", "imageId"]
    }
  },
  {
    name: "completeTransaction",
    description: "Mark a transaction as completed",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Telegram user ID"
        },
        transactionId: {
          type: "string",
          description: "Transaction ID"
        },
        confirmed: {
          type: "boolean",
          description: "Whether the user confirms completion"
        }
      },
      required: ["userId", "transactionId", "confirmed"]
    }
  },
  {
    name: "reportIssue",
    description: "Report an issue with a transaction",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Telegram user ID"
        },
        transactionId: {
          type: "string",
          description: "Transaction ID"
        },
        reason: {
          type: "string",
          description: "Reason for reporting",
          enum: ["no_response", "payment_issue", "wrong_amount", "other"]
        },
        details: {
          type: "string",
          description: "Additional details about the issue"
        }
      },
      required: ["userId", "transactionId", "reason"]
    }
  },
  {
    name: "validateReferralCode",
    description: "Validate if a referral code exists",
    parameters: {
      type: "object",
      properties: {
        referralCode: {
          type: "string",
          description: "Referral code to validate"
        }
      },
      required: ["referralCode"]
    }
  }
];

module.exports = { functionDefinitions };