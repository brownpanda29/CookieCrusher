// Popup JavaScript for CookieCrusher Extension

document.addEventListener('DOMContentLoaded', function() {
  const autoRejectToggle = document.getElementById('autoRejectToggle');
  const statusIndicator = document.getElementById('statusIndicator');
  const rejectCurrentPageBtn = document.getElementById('rejectCurrentPage');
  const clearAllCookiesBtn = document.getElementById('clearAllCookies');
  const resetStatsBtn = document.getElementById('resetStats');
  
  // Stats elements
  const todayCountEl = document.getElementById('todayCount');
  const totalCountEl = document.getElementById('totalCount');
  const lastRejectionEl = document.getElementById('lastRejection');

  // Initialize popup
  init();

  async function init() {
    try {
      // Load settings and stats
      await loadSettings();
      await loadStats();
      
      // Set up event listeners
      setupEventListeners();
      
    } catch (error) {
      console.error('Error initializing popup:', error);
      updateStatus('Error loading extension', 'disabled');
    }
  }

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['autoRejectEnabled'], (data) => {
        const isEnabled = data.autoRejectEnabled ?? true;
        
        // Update toggle UI
        if (isEnabled) {
          autoRejectToggle.classList.add('active');
          updateStatus('Auto-reject is enabled', 'enabled');
        } else {
          autoRejectToggle.classList.remove('active');
          updateStatus('Auto-reject is disabled', 'disabled');
        }
        
        resolve();
      });
    });
  }

  async function loadStats() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['cookieStats'], (data) => {
        const stats = data.cookieStats || {
          totalRejected: 0,
          todayRejected: 0,
          lastRejection: null,
          lastResetDate: new Date().toDateString()
        };

        // Check if it's a new day
        const today = new Date().toDateString();
        if (stats.lastResetDate !== today) {
          stats.todayRejected = 0;
          stats.lastResetDate = today;
          chrome.storage.local.set({ cookieStats: stats });
        }

        // Update UI
        updateStatsUI(stats);
        resolve();
      });
    });
  }

  function updateStatsUI(stats) {
    todayCountEl.textContent = stats.todayRejected || 0;
    totalCountEl.textContent = stats.totalRejected || 0;
    
    if (stats.lastRejection) {
      const lastDate = new Date(stats.lastRejection);
      const now = new Date();
      const diffMinutes = Math.floor((now - lastDate) / (1000 * 60));
      
      if (diffMinutes < 1) {
        lastRejectionEl.textContent = 'Just now';
      } else if (diffMinutes < 60) {
        lastRejectionEl.textContent = `${diffMinutes}m ago`;
      } else if (diffMinutes < 1440) {
        lastRejectionEl.textContent = `${Math.floor(diffMinutes / 60)}h ago`;
      } else {
        lastRejectionEl.textContent = lastDate.toLocaleDateString();
      }
    } else {
      lastRejectionEl.textContent = 'Never';
    }
  }

  function setupEventListeners() {
    // Toggle auto-reject
    autoRejectToggle.addEventListener('click', toggleAutoReject);
    
    // Reject cookies on current page
    rejectCurrentPageBtn.addEventListener('click', rejectCurrentPage);
    
    // Clear all cookies
    clearAllCookiesBtn.addEventListener('click', clearAllCookies);
    
    // Reset statistics
    resetStatsBtn.addEventListener('click', resetStatistics);
  }

  function toggleAutoReject() {
    const isCurrentlyActive = autoRejectToggle.classList.contains('active');
    const newState = !isCurrentlyActive;
    
    // Update UI immediately
    if (newState) {
      autoRejectToggle.classList.add('active');
      updateStatus('Auto-reject enabled', 'enabled');
    } else {
      autoRejectToggle.classList.remove('active');
      updateStatus('Auto-reject disabled', 'disabled');
    }
    
    // Save to storage
    chrome.storage.sync.set({ autoRejectEnabled: newState }, () => {
      console.log(`Auto-reject ${newState ? 'enabled' : 'disabled'}`);
    });
  }

  async function rejectCurrentPage() {
    try {
      rejectCurrentPageBtn.disabled = true;
      rejectCurrentPageBtn.innerHTML = '⏳ Rejecting...';
      
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('No active tab found');
      }

      // Inject and execute rejection script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: injectRejectScript
      });

      // Update stats
      await updateRejectionStats();
      
      // Show success
      rejectCurrentPageBtn.innerHTML = '✅ Rejected!';
      setTimeout(() => {
        rejectCurrentPageBtn.innerHTML = '🚫 Reject Cookies on This Page';
        rejectCurrentPageBtn.disabled = false;
      }, 2000);
      
    } catch (error) {
      console.error('Error rejecting cookies:', error);
      rejectCurrentPageBtn.innerHTML = '❌ Error';
      setTimeout(() => {
        rejectCurrentPageBtn.innerHTML = '🚫 Reject Cookies on This Page';
        rejectCurrentPageBtn.disabled = false;
      }, 2000);
    }
  }

  // This function will be injected into the page
  function injectRejectScript() {
    // Find and click reject buttons
    const buttons = document.querySelectorAll('button, input[type="button"], a, span[role="button"], div[role="button"]');
    const rejectPhrases = [
      'reject all', 'only essential', 'decline', 'necessary only',
      'manage cookies', 'customize', 'deny', 'refuse'
    ];
    
    let found = false;
    for (let btn of buttons) {
      const text = (btn.textContent || '').toLowerCase();
      if (rejectPhrases.some(phrase => text.includes(phrase))) {
        btn.click();
        found = true;
        break;
      }
    }
    
    // If no reject button found, hide cookie banners
    if (!found) {
      const banners = document.querySelectorAll([
        '[id*="cookie"]', '[class*="cookie"]',
        '[id*="consent"]', '[class*="consent"]',
        '[role="dialog"]'
      ].join(', '));
      
      banners.forEach(banner => {
        if (banner.offsetHeight > 50) {
          banner.style.display = 'none';
        }
      });
    }
    
    return found;
  }

  async function clearAllCookies() {
    try {
      clearAllCookiesBtn.disabled = true;
      clearAllCookiesBtn.innerHTML = '⏳ Clearing...';
      
      // Get current domain
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tab.url);
      
      // Clear cookies for current domain
      const cookies = await chrome.cookies.getAll({ domain: url.hostname });
      
      for (const cookie of cookies) {
        await chrome.cookies.remove({
          url: `${url.protocol}//${cookie.domain}${cookie.path}`,
          name: cookie.name
        });
      }
      
      // Also clear storage
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch (e) {
            console.log('Could not clear storage:', e);
          }
        }
      });
      
      clearAllCookiesBtn.innerHTML = '✅ Cleared!';
      setTimeout(() => {
        clearAllCookiesBtn.innerHTML = '🧹 Clear All Stored Cookies';
        clearAllCookiesBtn.disabled = false;
      }, 2000);
      
    } catch (error) {
      console.error('Error clearing cookies:', error);
      clearAllCookiesBtn.innerHTML = '❌ Error';
      setTimeout(() => {
        clearAllCookiesBtn.innerHTML = '🧹 Clear All Stored Cookies';
        clearAllCookiesBtn.disabled = false;
      }, 2000);
    }
  }

  async function resetStatistics() {
    try {
      resetStatsBtn.disabled = true;
      resetStatsBtn.innerHTML = '⏳ Resetting...';
      
      const emptyStats = {
        totalRejected: 0,
        todayRejected: 0,
        lastRejection: null,
        lastResetDate: new Date().toDateString()
      };
      
      chrome.storage.local.set({ cookieStats: emptyStats }, () => {
        updateStatsUI(emptyStats);
        
        resetStatsBtn.innerHTML = '✅ Reset!';
        setTimeout(() => {
          resetStatsBtn.innerHTML = '📊 Reset Statistics';
          resetStatsBtn.disabled = false;
        }, 1500);
      });
      
    } catch (error) {
      console.error('Error resetting stats:', error);
      resetStatsBtn.innerHTML = '❌ Error';
      setTimeout(() => {
        resetStatsBtn.innerHTML = '📊 Reset Statistics';
        resetStatsBtn.disabled = false;
      }, 2000);
    }
  }

  async function updateRejectionStats() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['cookieStats'], (data) => {
        const stats = data.cookieStats || {
          totalRejected: 0,
          todayRejected: 0,
          lastRejection: null,
          lastResetDate: new Date().toDateString()
        };
        
        stats.totalRejected++;
        stats.todayRejected++;
        stats.lastRejection = new Date().toISOString();
        
        chrome.storage.local.set({ cookieStats: stats }, () => {
          updateStatsUI(stats);
          resolve();
        });
      });
    });
  }

  function updateStatus(message, type) {
    statusIndicator.textContent = message;
    statusIndicator.className = `status ${type}`;
  }

  // Listen for storage changes to update UI
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.cookieStats) {
      updateStatsUI(changes.cookieStats.newValue);
    }
    
    if (namespace === 'sync' && changes.autoRejectEnabled) {
      const isEnabled = changes.autoRejectEnabled.newValue;
      if (isEnabled) {
        autoRejectToggle.classList.add('active');
        updateStatus('Auto-reject is enabled', 'enabled');
      } else {
        autoRejectToggle.classList.remove('active');
        updateStatus('Auto-reject is disabled', 'disabled');
      }
    }
  });
});
