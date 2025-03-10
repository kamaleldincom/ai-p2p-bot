kamaleldin@Ahmeds-MacBook-Pro ai-p2p-bot % npm run dev:a
ll

> ai-p2p-bot@1.0.0 dev:all
> concurrently "npm run dev" "npm run admin:dev"

[0] 
[0] > ai-p2p-bot@1.0.0 dev
[0] > nodemon src/bot/index.js
[0] 
[1] 
[1] > ai-p2p-bot@1.0.0 admin:dev
[1] > nodemon admin/server.js
[1] 
[0] [nodemon] 3.1.9
[1] [nodemon] 3.1.9
[0] [nodemon] to restart at any time, enter `rs`
[1] [nodemon] to restart at any time, enter `rs`
[1] [nodemon] watching path(s): *.*
[0] [nodemon] watching path(s): *.*
[1] [nodemon] watching extensions: js,mjs,cjs,json
[0] [nodemon] watching extensions: js,mjs,cjs,json
[0] [nodemon] starting `node src/bot/index.js`
[1] [nodemon] starting `node admin/server.js`
[1] Admin dashboard running on port 3000
[1] Connected to MongoDB
[0] Connected to MongoDB
/[0] Session middleware processing request for user: 7548253962
[0] User ID type: string, value: 7548253962
[0] User 7548253962 exists in database: true
[0] Initializing new conversation for user: 7548253962
[0] Message from 7548253962: So?
[0] User exists: true, Summary shown: false
[0] 
[0] ==== DEBUG SESSION STATE for 7548253962 ====
[0] User exists: true
[0] Summary shown: false
[0] In messaging mode: false
[0] In transfer creation: false
[0] Awaiting match selection: false
[0] Awaiting transfer amount: false
[0] Awaiting destination currency: false
[0] Awaiting match confirmation: false
[0] Active transaction ID: null
[0] =================================
[0] 
[0] Parsing amount from: "So?"
[0] Failed to parse amount
[0] === PROFILE RETRIEVAL ATTEMPT ===
[0] Getting profile for user ID: 7548253962
[0] Total users in database: 2
[0] User IDs in database: [
[0]   { userId: '6655124815', name: 'User123' },
[0]   { userId: '7548253962', name: 'Ali Monum' }
[0] ]
[0] User found in database: true
[0] User details: {
[0]   id: new ObjectId('67cd167d75f4595ae44e0f4d'),
[0]   userId: '7548253962',
[0]   name: 'Ali Monum',
[0]   referralCode: 'LPKXKJ',
[0]   referredBy: '6655124815',
[0]   trustScore: 20
[0] }
[0] Network stats: {
[0]   referrer: 'Found',
[0]   referrerName: 'User123',
[0]   referrals: 0,
[0]   siblings: 1
[0] }
[0] Updated session state for user 7548253962: {
[0]   userExists: true,
[0]   summaryShown: true,
[0]   inTransferCreation: false,
[0]   awaitingMatchSelection: false,
[0]   inMessagingMode: false,
[0]   awaitingMatchConfirmation: true
[0] }
[0] Session middleware processing request for user: 7548253962
[0] User ID type: string, value: 7548253962
[0] User 7548253962 exists in database: true
[0] Using existing conversation for user: 7548253962 (length: 3)
[0] Message from 7548253962: Yes, accept
[0] User exists: true, Summary shown: true
[0] 
[0] ==== DEBUG SESSION STATE for 7548253962 ====
[0] User exists: true
[0] Summary shown: true
[0] In messaging mode: false
[0] In transfer creation: false
[0] Awaiting match selection: false
[0] Awaiting transfer amount: false
[0] Awaiting destination currency: false
[0] Awaiting match confirmation: true
[0] Active transaction ID: null
[0] =================================
[0] 
[0] Parsing amount from: "Yes, accept"
[0] Invalid amount: 
[0] Failed to parse amount
[0] Match confirmation detected for transaction: TRJ71P32
[0] Updated session state for user 7548253962: {
[0]   userExists: true,
[0]   summaryShown: true,
[0]   inTransferCreation: false,
[0]   awaitingMatchSelection: false,
[0]   inMessagingMode: false,
[0]   awaitingMatchConfirmation: true
[0] }
[0] Session middleware processing request for user: 7548253962
[0] User ID type: string, value: 7548253962
[0] User 7548253962 exists in database: true
[0] Using existing conversation for user: 7548253962 (length: 4)
[0] Message from 7548253962: Yes
[0] User exists: true, Summary shown: true
[0] 
[0] ==== DEBUG SESSION STATE for 7548253962 ====
[0] User exists: true
[0] Summary shown: true
[0] In messaging mode: false
[0] In transfer creation: false
[0] Awaiting match selection: false
[0] Awaiting transfer amount: false
[0] Awaiting destination currency: false
[0] Awaiting match confirmation: true
[0] Active transaction ID: null
[0] =================================
[0] 
[0] Parsing amount from: "Yes"
[0] Failed to parse amount
[0] Match confirmation detected for transaction: TRJ71P32
[0] User accepted match, calling handleMatchConfirmation with true
[0] Handling match confirmation: userId=7548253962, txId=TRJ71P32, accept=true
[0] Transaction TRJ71P32 not found for user 7548253962
[0] Confirmation result: { success: false, message: 'Your transaction not found' }
[0] Confirmation failed: Your transaction not found
[0] Updated session state for user 7548253962: {
[0]   userExists: true,
[0]   summaryShown: true,
[0]   inTransferCreation: false,
[0]   awaitingMatchSelection: false,
[0]   inMessagingMode: false,
[0]   awaitingMatchConfirmation: false
[0] }
[0] Session middleware processing request for user: 7548253962
[0] User ID type: string, value: 7548253962
[0] User 7548253962 exists in database: true
[0] Using existing conversation for user: 7548253962 (length: 5)
[0] Message from 7548253962: Cancel my transaction
[0] User exists: true, Summary shown: true
[0] 
[0] ==== DEBUG SESSION STATE for 7548253962 ====
[0] User exists: true
[0] Summary shown: true
[0] In messaging mode: false
[0] In transfer creation: false
[0] Awaiting match selection: false
[0] Awaiting transfer amount: false
[0] Awaiting destination currency: false
[0] Awaiting match confirmation: false
[0] Active transaction ID: null
[0] =================================
[0] 
[0] Parsing amount from: "Cancel my transaction"
[0] Failed to parse amount
[0] Function call: getActiveTransaction { userId: '12345' }
[0] Updated session state for user 7548253962: {
[0]   userExists: true,
[0]   summaryShown: true,
[0]   inTransferCreation: false,
[0]   awaitingMatchSelection: false,
[0]   inMessagingMode: false,
[0]   awaitingMatchConfirmation: false
[0] }
[0] Session middleware processing request for user: 7548253962
[0] User ID type: string, value: 7548253962
[0] User 7548253962 exists in database: true
[0] Using existing conversation for user: 7548253962 (length: 8)
[0] Message from 7548253962: Yes
[0] User exists: true, Summary shown: true
[0] 
[0] ==== DEBUG SESSION STATE for 7548253962 ====
[0] User exists: true
[0] Summary shown: true
[0] In messaging mode: false
[0] In transfer creation: false
[0] Awaiting match selection: false
[0] Awaiting transfer amount: false
[0] Awaiting destination currency: false
[0] Awaiting match confirmation: false
[0] Active transaction ID: null
[0] =================================
[0] 
[0] Parsing amount from: "Yes"
[0] Failed to parse amount
[0] Function call: completeTransaction { confirmed: false, transactionId: 'TRJ71P32', userId: '5146961955' }
[0] Updated session state for user 7548253962: {
[0]   userExists: true,
[0]   summaryShown: true,
[0]   inTransferCreation: false,
[0]   awaitingMatchSelection: false,
[0]   inMessagingMode: false,
[0]   awaitingMatchConfirmation: false
[0] }
