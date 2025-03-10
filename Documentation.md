# AI-Powered P2P Remittance Bot - Project Documentation

## Project Overview
The AI-Powered P2P Remittance Bot is a Telegram-based platform facilitating currency exchanges between users within trusted networks. The system utilizes AI to provide a natural, conversational experience while maintaining the security and structure of a traditional remittance system.

## Business Problem & Solution
Peer-to-peer currency exchange is often hampered by trust issues, rigid interfaces, and complex workflows. Our solution creates a trusted network through referrals and implements an AI-powered conversational interface to simplify the user experience while maintaining all necessary security features.

## Core Architecture
- **Bot Framework**: Telegram Bot API via Telegraf
- **AI Integration**: OpenAI's GPT models with function calling
- **Database**: MongoDB for persistence
- **Business Logic**: Node.js services architecture

## Key Features
The system functions as a specialized matchmaking platform that connects currency buyers and sellers within trusted social networks, while providing a structured framework to safely complete transactions.

### Core Functionality
1. **Trust-Based Network**
   - Users can only transact with direct referrers, referees, or "siblings" (others referred by the same person)
   - Trust scores increase with successful transactions

2. **Conversational Interface**
   - Natural language understanding for user intents
   - Guided conversation flow through complex processes

3. **Transaction Lifecycle**
   - User registration with referral codes
   - Transfer request creation
   - Matching with compatible partners
   - Transaction confirmation
   - Proof of payment uploads
   - Completion verification
   - Issue reporting

4. **Security Features**
   - Network relationship validation
   - Single active transaction limit
   - Two-way proof requirement
   - Trust score system

## Current Implementation Status

### Completed
- ✅ Project structure setup
- ✅ MongoDB integration
- ✅ Telegram bot initialization
- ✅ AI integration with OpenAI
- ✅ Conversation history management
- ✅ Initial AI function calling structure
- ✅ Basic conversational capabilities
- ✅ User existence check function
- ✅ User registration flow
- ✅ Referral code validation
- ✅ User data collection (name, phone, country)
- ✅ Profile creation and viewing
- ✅ Referral code generation
- ✅ Network connections management
- ✅ Transfer request creation
- ✅ Amount specification and currency selection
- ✅ Exchange rate setting
- ✅ Transfer matching within network
- ✅ Match selection and confirmation
- ✅ In-app messaging between transaction partners
- ✅ Media handling for payment proofs
- ✅ Transaction completion and verification
- ✅ Trust score adjustment
- ✅ Relationship verification (referrer/referee/sibling)
- ✅ Transaction limit enforcement
- ✅ Input validation and sanitization
- ✅ Status transition validation
- ✅ Issue reporting system
- ✅ Robust error handling

### In Progress
- Comprehensive testing
- Code documentation

## Pending Implementation

### 1. Administrative Functions
- **System Monitoring**
  - Admin dashboard
  - User statistics
  - Transaction tracking
- **Issue Management**
  - Admin interface for reported problems
  - Dispute resolution tools
  - Transaction reversal capabilities

### 2. Enhanced Security Features
- **Advanced Validation**
  - Identity verification beyond referrals
  - External validation options
  - Fraud detection mechanisms
- **Access Control**
  - Role-based permissions
  - Admin user management
  - Activity logging

### 3. Extended Features
- **Rate Negotiation**
  - User-proposed exchange rates
  - Rate history tracking
  - Market rate integration
- **Multi-Currency Support**
  - Support for additional currencies
  - Dynamic currency conversion
  - Exchange rate APIs integration

### 4. Performance Optimization
- **Database Indexing**
  - Optimized queries
  - Caching for frequent data
  - Connection pooling
- **Scaling Preparation**
  - Sharding strategy
  - Load balancing setup
  - Monitoring infrastructure

## Implementation Priorities

### Phase 1: Core User Management
1. Complete user registration flow
2. Implement profile viewing
3. Add referral code validation

### Phase 2: Basic Transaction System
1. Create transfer request functionality
2. Implement transfer matching
3. Add transaction acceptance

### Phase 3: Transaction Completion
1. Add proof upload functionality
2. Implement transaction verification
3. Update trust scores

### Phase 4: Full Network Validation
1. Implement comprehensive relationship checks
2. Enforce single transaction rule

### Phase 5: Enhanced Features
1. Add issue reporting
2. Implement administrative functions
3. Optimize conversational experience

## Technical Architecture Details

### AI Implementation
The system uses OpenAI's function calling capabilities to bridge natural language understanding with structured database operations. The conversation flow follows these steps:

1. User sends message to the bot
2. Message is sent to OpenAI with conversation history
3. AI determines intent and required parameters
4. If function execution is needed, the AI calls the appropriate function
5. Function result is sent back to AI for context
6. AI generates a natural language response
7. Response is sent to the user

### Database Models

**User Model**
```
- userId: String (unique)
- telegramUsername: String
- name: String
- phone: String
- identificationNumber: String (optional)
- country: String (enum: UAE, SDN, EGY)
- referralCode: String (unique)
- referredBy: String
- trustScore: Number (default: 20)
- completedTransactions: Number (default: 0)
- status: String (enum: active, suspended)
```

**Transaction Model**
```
- transactionId: String (unique)
- initiator: {userId, amount, currency}
- recipient: {userId, amount, currency}
- rate: Number
- status: String (enum: open, matched, proof_uploaded, completed, cancelled)
- notes: String
- relationship: String (enum: referrer, referee, sibling)
- proofs: Array of {userId, imageId, uploadedAt}
- timestamps: {created, matched, completed}
- reports: Array of {userId, reason, details, timestamp, status}
```

## Conclusion
The AI-Powered P2P Remittance Bot represents a significant enhancement to the traditional remittance model by combining trusted network principles with AI-driven natural language interaction. The implementation roadmap focuses on incrementally building out the core functionality while maintaining security and user experience standards.
