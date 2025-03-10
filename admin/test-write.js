/**
 * Test file to check write permissions
 */
const fs = require('fs');
const path = require('path');

// Path to test file
const TEST_PATH = path.join(__dirname, 'test-write-file.txt');

// Write a test file
console.log('Writing to test file:', TEST_PATH);
fs.writeFile(TEST_PATH, 'Test write operation ' + new Date().toISOString(), 'utf8', (err) => {
  if (err) {
    console.error('Error writing file:', err);
    process.exit(1);
  }
  console.log('Successfully wrote to test file');
  
  // Read it back
  fs.readFile(TEST_PATH, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading file:', err);
      process.exit(1);
    }
    console.log('Successfully read file back:', data);
    
    // Clean up
    fs.unlink(TEST_PATH, (err) => {
      if (err) {
        console.error('Error deleting test file:', err);
        process.exit(1);
      }
      console.log('Successfully cleaned up test file');
    });
  });
});