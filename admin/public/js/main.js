/**
 * Admin Dashboard JavaScript
 */

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  // Initialize tooltips
  var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
  var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });
  
  // Status update handlers
  const statusFormButtons = document.querySelectorAll('.status-update-btn');
  if (statusFormButtons) {
    statusFormButtons.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const form = this.closest('form');
        const transactionId = form.dataset.transactionId;
        const status = this.dataset.status;
        
        if (confirm(`Are you sure you want to change the status to ${status}?`)) {
          fetch(`/transactions/${transactionId}/status`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              showAlert('success', data.message);
              setTimeout(() => window.location.reload(), 1000);
            } else {
              showAlert('danger', data.message || 'An error occurred');
            }
          })
          .catch(error => {
            console.error('Error:', error);
            showAlert('danger', 'An error occurred while updating the status');
          });
        }
      });
    });
  }
  
  // Cancel transaction button
  const cancelTransactionBtn = document.getElementById('cancel-transaction-btn');
  if (cancelTransactionBtn) {
    cancelTransactionBtn.addEventListener('click', function(e) {
      e.preventDefault();
      const transactionId = this.dataset.transactionId;
      
      if (confirm('Are you sure you want to cancel this transaction?')) {
        fetch(`/transactions/${transactionId}/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            showAlert('success', data.message);
            setTimeout(() => window.location.reload(), 1000);
          } else {
            showAlert('danger', data.message || 'An error occurred');
          }
        })
        .catch(error => {
          console.error('Error:', error);
          showAlert('danger', 'An error occurred while cancelling the transaction');
        });
      }
    });
  }
  
  // Currency form
  const currencyForm = document.getElementById('currency-form');
  if (currencyForm) {
    currencyForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      // Collect currency data
      const currencies = [];
      document.querySelectorAll('.currency-item').forEach(item => {
        currencies.push({
          code: item.querySelector('[name="code"]').value,
          name: item.querySelector('[name="name"]').value,
          symbol: item.querySelector('[name="symbol"]').value,
          enabled: item.querySelector('[name="enabled"]').checked
        });
      });
      
      // Collect exchange rates
      const exchangeRates = {};
      document.querySelectorAll('.rate-item').forEach(item => {
        const from = item.querySelector('[name="from"]').value;
        const to = item.querySelector('[name="to"]').value;
        const rate = parseFloat(item.querySelector('[name="rate"]').value);
        
        if (from && to && !isNaN(rate)) {
          exchangeRates[`${from}_${to}`] = rate;
        }
      });
      
      fetch('/settings/currencies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ currencies, exchangeRates })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showAlert('success', data.message);
        } else {
          showAlert('danger', data.message || 'An error occurred');
        }
      })
      .catch(error => {
        console.error('Error:', error);
        showAlert('danger', 'An error occurred while updating currency settings');
      });
    });
  }
  
  // Show alerts
  function showAlert(type, message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
    alertDiv.setAttribute('role', 'alert');
    alertDiv.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Auto dismiss after 5 seconds
    setTimeout(() => {
      const alert = bootstrap.Alert.getOrCreateInstance(alertDiv);
      alert.close();
    }, 5000);
  }
});