// Background Service Worker for CookieCrusher Extension

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  console.log('CookieCrusher installed:', details.reason);
  
  // Set default settings
  chrome.storage.sync.set({
    autoRejectEnabled: true
  });
  
  // Initialize stats
  chrome.storage.local.set({
    cookieStats: {
      totalRejected: 0,
      todayRejected: 0,
      lastRejection: null,
      lastResetDate: new Date().toDateString()
    }
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'cookieRejected') {
    updateStats();
    sendResponse({ success: true });
  }
  
  if (message.type === 'getStats') {
    chrome.storage.local.get(['cookieStats'], (data) => {
      sendResponse(data.cookieStats || {});
    });
    return true; // Keep message channel open for async response
  }
});

// Update rejection statistics
function updateStats() {
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
    }
    
    stats.totalRejected++;
    stats.todayRejected++;
    stats.lastRejection = new Date().toISOString();
    
    chrome.storage.local.set({ cookieStats: stats });
    
    // Update badge with today's count
    chrome.action.setBadgeText({
      text: stats.todayRejected.toString()
    });
    
    chrome.action.setBadgeBackgroundColor({
      color: '#dc3545'
    });
  });
}

// Reset daily stats at midnight
function checkDailyReset() {
  chrome.storage.local.get(['cookieStats'], (data) => {
    const stats = data.cookieStats;
    if (!stats) return;
    
    const today = new Date().toDateString();
    if (stats.lastResetDate !== today) {
      stats.todayRejected = 0;
      stats.lastResetDate = today;
      chrome.storage.local.set({ cookieStats: stats });
      
      // Update badge
      chrome.action.setBadgeText({
        text: '0'
      });
    }
  });
}

// Check for daily reset every hour
setInterval(checkDailyReset, 60 * 60 * 1000);

// Initialize badge on startup
chrome.storage.local.get(['cookieStats'], (data) => {
  const stats = data.cookieStats;
  if (stats) {
    chrome.action.setBadgeText({
      text: (stats.todayRejected || 0).toString()
    });
    chrome.action.setBadgeBackgroundColor({
      color: '#dc3545'
    });
  }
});
