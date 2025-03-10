/**
 * Test file to check config writing
 */
const fs = require('fs');
const path = require('path');

// Path to config file and backup
const CONFIG_PATH = path.join(__dirname, 'config.js');
const BACKUP_PATH = path.join(__dirname, 'config.backup.js');

// First backup the current config
console.log('Backing up current config to:', BACKUP_PATH);
fs.copyFileSync(CONFIG_PATH, BACKUP_PATH);
console.log('Backup created');

// Read the current config
console.log('Reading current config');
const configModule = require('./config');
console.log('Config read successfully');

// Create a test config modification
console.log('Modifying config');
const testConfig = {...configModule};

// Add a test currency
testConfig.supportedCurrencies = [
  ...testConfig.supportedCurrencies,
  { code: 'TST', name: 'Test Currency', symbol: '$T', enabled: true }
];

// Create config string
const configString = `/**
 * Admin dashboard configuration
 */
module.exports = ${JSON.stringify(testConfig, null, 2).replace(/"([^"]+)":/g, '$1:')};`;

// Write the modified config
console.log('Writing modified config');
fs.writeFileSync(CONFIG_PATH, configString, 'utf8');
console.log('Modified config written');

// Clear require cache and re-import to verify changes
console.log('Clearing require cache');
delete require.cache[require.resolve('./config')];
const newConfig = require('./config');
console.log('New config imported');

// Verify the change
const testCurrency = newConfig.supportedCurrencies.find(c => c.code === 'TST');
if (testCurrency) {
  console.log('TEST PASSED: Test currency successfully added to config');
  console.log(testCurrency);
} else {
  console.log('TEST FAILED: Test currency not found in reloaded config');
}

// Restore the backup
console.log('Restoring config from backup');
fs.copyFileSync(BACKUP_PATH, CONFIG_PATH);
console.log('Backup restored');

// Clean up
console.log('Removing backup');
fs.unlinkSync(BACKUP_PATH);
console.log('Test completed');