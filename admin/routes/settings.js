/**
 * Settings routes
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { requireRole } = require('../middleware/auth');

// Path to config file
const CONFIG_PATH = path.join(__dirname, '../config.js');

/**
 * View settings
 */
router.get('/', (req, res) => {
  res.render('settings/index', {
    title: 'System Settings',
    config
  });
});

/**
 * Currency management
 */
router.get('/currencies', (req, res) => {
  res.render('settings/currencies', {
    title: 'Currency Management',
    currencies: config.supportedCurrencies,
    exchangeRates: config.exchangeRates
  });
});

/**
 * Update currency settings
 */
router.post('/currencies', requireRole(['superadmin']), async (req, res) => {
  try {
    const { currencies, exchangeRates } = req.body;
    
    console.log('Received currency update request from:', req.session.user.username);
    console.log('Currencies data:', JSON.stringify(currencies));
    console.log('Exchange rates data:', JSON.stringify(exchangeRates));
    
    if (!currencies || !Array.isArray(currencies)) {
      console.error('Invalid currencies data - not an array');
      return res.status(400).json({
        success: false,
        message: 'Invalid currencies data'
      });
    }
    
    // Validate currency data
    for (const currency of currencies) {
      if (!currency.code || !currency.name || !currency.symbol) {
        console.error('Invalid currency data:', currency);
        return res.status(400).json({
          success: false,
          message: 'Each currency must have code, name, and symbol'
        });
      }
    }
    
    // Update config file
    config.supportedCurrencies = currencies;
    console.log('Updated supportedCurrencies in config');
    
    if (exchangeRates && typeof exchangeRates === 'object') {
      config.exchangeRates = exchangeRates;
      console.log('Updated exchangeRates in config');
    }
    
    await saveConfig();
    console.log('Config saved successfully');
    
    res.json({
      success: true,
      message: 'Currency settings updated'
    });
  } catch (err) {
    console.error('Error updating currency settings:', err);
    res.status(500).json({
      success: false,
      message: 'Error updating settings'
    });
  }
});

/**
 * Payment methods management
 */
router.get('/payment-methods', (req, res) => {
  res.render('settings/payment-methods', {
    title: 'Payment Methods',
    paymentMethods: config.paymentMethods
  });
});

/**
 * Update payment methods
 */
router.post('/payment-methods', requireRole(['superadmin']), async (req, res) => {
  try {
    const { paymentMethods } = req.body;
    
    if (!paymentMethods || !Array.isArray(paymentMethods)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment methods data'
      });
    }
    
    // Validate payment method data
    for (const method of paymentMethods) {
      if (!method.id || !method.name) {
        return res.status(400).json({
          success: false,
          message: 'Each payment method must have id and name'
        });
      }
    }
    
    // Update config file
    config.paymentMethods = paymentMethods;
    
    await saveConfig();
    
    res.json({
      success: true,
      message: 'Payment methods updated'
    });
  } catch (err) {
    console.error('Error updating payment methods:', err);
    res.status(500).json({
      success: false,
      message: 'Error updating settings'
    });
  }
});

/**
 * Admin user management
 */
router.get('/admins', requireRole(['superadmin']), (req, res) => {
  const adminUsers = Object.entries(config.adminUsers).map(([username, data]) => ({
    username,
    role: data.role
  }));
  
  res.render('settings/admins', {
    title: 'Admin User Management',
    adminUsers
  });
});

/**
 * Add admin user
 */
router.post('/admins', requireRole(['superadmin']), async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    if (!username || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Username, password, and role are required'
      });
    }
    
    if (config.adminUsers[username]) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }
    
    // Add new admin user
    config.adminUsers[username] = {
      password,
      role
    };
    
    await saveConfig();
    
    res.json({
      success: true,
      message: 'Admin user added'
    });
  } catch (err) {
    console.error('Error adding admin user:', err);
    res.status(500).json({
      success: false,
      message: 'Error adding admin user'
    });
  }
});

/**
 * Delete admin user
 */
router.delete('/admins/:username', requireRole(['superadmin']), async (req, res) => {
  try {
    const { username } = req.params;
    
    if (username === req.session.user.username) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }
    
    if (!config.adminUsers[username]) {
      return res.status(404).json({
        success: false,
        message: 'Admin user not found'
      });
    }
    
    // Remove admin user
    delete config.adminUsers[username];
    
    await saveConfig();
    
    res.json({
      success: true,
      message: 'Admin user deleted'
    });
  } catch (err) {
    console.error('Error deleting admin user:', err);
    res.status(500).json({
      success: false,
      message: 'Error deleting admin user'
    });
  }
});

/**
 * Helper function to save config changes to file
 */
async function saveConfig() {
  return new Promise((resolve, reject) => {
    try {
      // Check if the file is writable
      fs.access(CONFIG_PATH, fs.constants.W_OK, (err) => {
        if (err) {
          console.error('Config file is not writable:', err);
          return reject(new Error('Config file is not writable: ' + err.message));
        }
        
        // Create config string
        const configString = `/**
 * Admin dashboard configuration
 */
module.exports = ${JSON.stringify(config, null, 2).replace(/"([^"]+)":/g, '$1:')};`;
        
        console.log('Writing config to file:', CONFIG_PATH);
        console.log('Config string length:', configString.length);
        
        // First backup the current config
        const backupPath = `${CONFIG_PATH}.backup`;
        fs.copyFile(CONFIG_PATH, backupPath, (backupErr) => {
          if (backupErr) {
            console.warn('Could not create backup of config file:', backupErr);
            // Continue even if backup fails
          } else {
            console.log('Backup created at:', backupPath);
          }
          
          // Now write the new config
          fs.writeFile(CONFIG_PATH, configString, 'utf8', (writeErr) => {
            if (writeErr) {
              console.error('Error writing config file:', writeErr);
              return reject(writeErr);
            }
            
            console.log('Config file successfully written');
            
            // Clear require cache so changes take effect immediately
            delete require.cache[require.resolve('../config')];
            console.log('Require cache cleared for config');
            
            resolve();
          });
        });
      });
    } catch (err) {
      console.error('Unexpected error in saveConfig:', err);
      reject(err);
    }
  });
}

module.exports = router;