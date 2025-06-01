// CookieCrusher - Content Script
let manualButtonInjected = false;
let observerStarted = false;

function clickRejectButton() {
  const buttons = document.querySelectorAll('button, input[type="button"], a, span[role="button"], div[role="button"]');
  
  // Expanded reject-like phrases
  const rejectLikePhrases = [
    'reject all', 'only essential', 'use essential', 'accept necessary',
    'strictly necessary', 'decline', 'do not accept', 'continue without accepting',
    'save preferences', 'save settings', 'confirm choices', 'manage choices',
    'necessary only', 'essential only', 'required only', 'functional only',
    'customize', 'manage cookies', 'cookie settings', 'privacy settings',
    'deny', 'refuse', 'no thanks', 'not now', 'later'
  ];
  
  // Accept phrases to avoid
  const acceptLikePhrases = [
    'accept all', 'agree', 'allow all', 'i accept', 'i agree', 'accept everything',
    'accept cookies', 'got it', 'ok', 'continue', 'proceed'
  ];

  let found = false;

  for (let btn of buttons) {
    const text = (btn.textContent?.toLowerCase() || btn.value?.toLowerCase() || '').trim();
    const ariaLabel = (btn.getAttribute('aria-label')?.toLowerCase() || '').trim();
    const title = (btn.getAttribute('title')?.toLowerCase() || '').trim();
    const allText = `${text} ${ariaLabel} ${title}`;
    
    // Skip if it contains accept-like phrases
    if (acceptLikePhrases.some(phrase => allText.includes(phrase))) {
      continue;
    }

    // Check for reject-like phrases
    if (rejectLikePhrases.some(phrase => allText.includes(phrase))) {
      console.log(`[CookieCrusher] Found reject button: "${text || ariaLabel || title}"`);
      
      // Ensure button is visible and clickable
      if (isElementClickable(btn)) {
        btn.click();
        found = true;
        break;
      }
    }
  }

  // If no reject button found, inject manual button
  if (!found && !manualButtonInjected) {
    console.log("[CookieCrusher] No reject button found, injecting manual button...");
    injectManualRejectButton();
  }

  return found;
}

function isElementClickable(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  
  return (
    rect.width > 0 && 
    rect.height > 0 && 
    style.display !== 'none' && 
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

function injectManualRejectButton() {
  if (document.getElementById('cookiecrusher-reject') || manualButtonInjected) {
    return;
  }

  const btn = document.createElement('button');
  btn.id = 'cookiecrusher-reject';
  btn.innerHTML = '🚫 Reject All Cookies';
  btn.title = 'CookieCrusher: Manually reject cookies';
  
  btn.style.cssText = `
    position: fixed !important;
    bottom: 20px !important;
    right: 20px !important;
    z-index: 2147483647 !important;
    background: #dc3545 !important;
    color: white !important;
    border: none !important;
    padding: 12px 16px !important;
    font-size: 14px !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
    transition: all 0.2s ease !important;
    font-weight: 600 !important;
    letter-spacing: 0.5px !important;
  `;

  // Hover effects
  btn.addEventListener('mouseenter', () => {
    btn.style.background = '#c82333 !important';
    btn.style.transform = 'translateY(-2px) !important';
    btn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4) !important';
  });

  btn.addEventListener('mouseleave', () => {
    btn.style.background = '#dc3545 !important';
    btn.style.transform = 'translateY(0) !important';
    btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3) !important';
  });

  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Try to find and click reject buttons
    const foundReject = clickRejectButton();
    
    if (foundReject) {
      // Remove manual button if we found a real reject button
      btn.remove();
      manualButtonInjected = false;
    } else {
      // If no reject button found, try alternative approaches
      handleManualReject();
    }
  };

  // Wait for body to be available
  if (document.body) {
    document.body.appendChild(btn);
    manualButtonInjected = true;
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(btn);
      manualButtonInjected = true;
    });
  }
}

function handleManualReject() {
  console.log("[CookieCrusher] Attempting manual rejection methods...");
  
  // Method 1: Try to find cookie banners and hide them
  const cookieBanners = document.querySelectorAll([
    '[id*="cookie"]', '[class*="cookie"]',
    '[id*="consent"]', '[class*="consent"]',
    '[id*="gdpr"]', '[class*="gdpr"]',
    '[id*="privacy"]', '[class*="privacy"]',
    '[role="dialog"]', '[role="banner"]'
  ].join(', '));

  let bannersHidden = 0;
  cookieBanners.forEach(banner => {
    if (banner.offsetHeight > 50) { // Only hide substantial elements
      banner.style.display = 'none !important';
      bannersHidden++;
    }
  });

  // Method 2: Try to clear common cookie consent localStorage/sessionStorage
  try {
    const consentKeys = Object.keys(localStorage).filter(key => 
      key.toLowerCase().includes('cookie') || 
      key.toLowerCase().includes('consent') ||
      key.toLowerCase().includes('gdpr')
    );
    
    consentKeys.forEach(key => {
      localStorage.removeItem(key);
    });

    // Also clear sessionStorage
    const sessionKeys = Object.keys(sessionStorage).filter(key => 
      key.toLowerCase().includes('cookie') || 
      key.toLowerCase().includes('consent') ||
      key.toLowerCase().includes('gdpr')
    );
    
    sessionKeys.forEach(key => {
      sessionStorage.removeItem(key);
    });
  } catch (e) {
    console.log("[CookieCrusher] Could not clear storage:", e);
  }

  if (bannersHidden > 0) {
    console.log(`[CookieCrusher] Hidden ${bannersHidden} cookie banner(s)`);
    
    // Show success feedback
    showFeedback("Cookie banners hidden! 🎉", "success");
  } else {
    showFeedback("No cookie banners found to reject", "info");
  }
}

function showFeedback(message, type = "info") {
  const feedback = document.createElement('div');
  feedback.style.cssText = `
    position: fixed !important;
    top: 20px !important;
    right: 20px !important;
    z-index: 2147483647 !important;
    background: ${type === 'success' ? '#28a745' : '#17a2b8'} !important;
    color: white !important;
    padding: 12px 16px !important;
    border-radius: 8px !important;
    font-size: 14px !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
    animation: slideIn 0.3s ease !important;
  `;
  
  feedback.textContent = message;
  document.body.appendChild(feedback);
  
  setTimeout(() => {
    feedback.remove();
  }, 3000);
}

function observeDOM() {
  if (observerStarted) return;
  
  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        // Check if any added nodes might be cookie banners
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const text = node.textContent?.toLowerCase() || '';
            if (text.includes('cookie') || text.includes('consent') || text.includes('privacy')) {
              shouldCheck = true;
              break;
            }
          }
        }
      }
      if (shouldCheck) break;
    }
    
    if (shouldCheck) {
      // Debounce the check
      setTimeout(() => {
        clickRejectButton();
      }, 500);
    }
  });

  observer.observe(document.body || document.documentElement, { 
    childList: true, 
    subtree: true 
  });
  
  observerStarted = true;
  console.log("[CookieCrusher] DOM observer started");
}

// Initialize the extension
function init() {
  console.log("[CookieCrusher] Initializing...");
  
  // Check if extension is enabled
  chrome.storage.sync.get('autoRejectEnabled', (data) => {
    const isEnabled = data.autoRejectEnabled ?? true;
    
    if (isEnabled) {
      console.log("[CookieCrusher] Auto-reject enabled");
      
      // Initial check
      setTimeout(() => {
        clickRejectButton();
        observeDOM();
      }, 1000);
      
      // Also check after page load
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(clickRejectButton, 500);
        });
      }
      
      window.addEventListener('load', () => {
        setTimeout(clickRejectButton, 1000);
      });
      
    } else {
      console.log("[CookieCrusher] Auto-reject disabled");
    }
  });
}

// Start the extension
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
