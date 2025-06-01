// CookieCrusher - Enhanced Content Script
class CookieCrusher {
  constructor() {
    this.manualButtonInjected = false;
    this.observerStarted = false;
    this.mutationObserver = null;
    this.settings = {
      autoRejectEnabled: true,
      excludedDomains: [],
      buttonAppearance: 'bottom-right',
      enableLogging: true,
      aggressiveMode: false,
      customPhrases: []
    };
    this.analytics = {
      sessionsStarted: 0,
      bannersDetected: 0,
      buttonsClicked: 0,
      errors: 0,
      domainStats: {}
    };
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadAnalytics();
    
    if (this.isExcludedDomain()) {
      this.log('Domain excluded, skipping initialization');
      return;
    }

    this.analytics.sessionsStarted++;
    this.saveAnalytics();
    
    this.log('CookieCrusher initialized', { settings: this.settings });
    
    // Start the main functionality
    this.startCookieRejection();
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['cookieCrusherSettings'], (data) => {
        if (data.cookieCrusherSettings) {
          this.settings = { ...this.settings, ...data.cookieCrusherSettings };
        }
        resolve();
      });
    });
  }

  async loadAnalytics() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['cookieCrusherAnalytics'], (data) => {
        if (data.cookieCrusherAnalytics) {
          this.analytics = { ...this.analytics, ...data.cookieCrusherAnalytics };
        }
        resolve();
      });
    });
  }

  saveSettings() {
    chrome.storage.sync.set({ cookieCrusherSettings: this.settings });
  }

  saveAnalytics() {
    chrome.storage.local.set({ cookieCrusherAnalytics: this.analytics });
  }

  isExcludedDomain() {
    const currentDomain = window.location.hostname;
    return this.settings.excludedDomains.some(domain => 
      currentDomain.includes(domain) || currentDomain === domain
    );
  }

  log(message, data = null) {
    if (!this.settings.enableLogging) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      message,
      data
    };
    
    console.log(`[CookieCrusher] ${message}`, data || '');
    
    // Store recent logs for debugging
    chrome.storage.local.get(['cookieCrusherLogs'], (result) => {
      const logs = result.cookieCrusherLogs || [];
      logs.push(logEntry);
      
      // Keep only last 100 logs
      if (logs.length > 100) {
        logs.splice(0, logs.length - 100);
      }
      
      chrome.storage.local.set({ cookieCrusherLogs: logs });
    });
  }

  startCookieRejection() {
    if (!this.settings.autoRejectEnabled) {
      this.log('Auto-reject disabled');
      return;
    }

    // Initial detection with delays to handle different loading scenarios
    setTimeout(() => this.detectAndRejectCookies(), 500);
    setTimeout(() => this.detectAndRejectCookies(), 2000);
    setTimeout(() => this.detectAndRejectCookies(), 5000);

    // Start DOM observation for dynamic content
    this.startDOMObservation();

    // Handle page load events
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => this.detectAndRejectCookies(), 1000);
      });
    }

    window.addEventListener('load', () => {
      setTimeout(() => this.detectAndRejectCookies(), 1500);
    });

    // Handle focus events (for modals that appear on focus)
    window.addEventListener('focus', () => {
      setTimeout(() => this.detectAndRejectCookies(), 500);
    });
  }

  startDOMObservation() {
    if (this.observerStarted || !document.body) return;

    this.mutationObserver = new MutationObserver((mutations) => {
      let shouldCheck = false;
      let addedElementsCount = 0;

      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              addedElementsCount++;
              const text = node.textContent?.toLowerCase() || '';
              const hasRelevantContent = [
                'cookie', 'consent', 'privacy', 'gdpr', 'accept', 'reject', 'agree'
              ].some(keyword => text.includes(keyword));

              if (hasRelevantContent || node.querySelector('[class*="cookie"], [class*="consent"], [role="dialog"]')) {
                shouldCheck = true;
                this.log('Relevant content detected via mutation observer', {
                  element: node.tagName,
                  text: text.substring(0, 100)
                });
                break;
              }
            }
          }
        }
        if (shouldCheck) break;
      }

      // Debounced check to avoid excessive calls
      if (shouldCheck) {
        clearTimeout(this.mutationTimeout);
        this.mutationTimeout = setTimeout(() => {
          this.detectAndRejectCookies();
        }, 300);
      }
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden']
    });

    this.observerStarted = true;
    this.log('DOM observation started');
  }

  detectAndRejectCookies() {
    try {
      const bannerInfo = this.detectCookieBanner();
      if (bannerInfo.found) {
        this.analytics.bannersDetected++;
        this.trackDomainStats('bannerDetected');
        
        const rejectButton = this.findRejectButton(bannerInfo.elements);
        if (rejectButton) {
          this.clickRejectButton(rejectButton);
          return true;
        }
      }

      // If no automatic rejection possible, inject manual button
      if (!this.manualButtonInjected) {
        this.injectManualRejectButton();
      }

      return false;
    } catch (error) {
      this.analytics.errors++;
      this.saveAnalytics();
      this.log('Error in detectAndRejectCookies', { error: error.message });
      return false;
    }
  }

  detectCookieBanner() {
    const cookieSelectors = [
      // Common cookie banner selectors
      '[id*="cookie" i]', '[class*="cookie" i]',
      '[id*="consent" i]', '[class*="consent" i]',
      '[id*="gdpr" i]', '[class*="gdpr" i]',
      '[id*="privacy" i]', '[class*="privacy" i]',
      '[role="dialog"]', '[role="alertdialog"]',
      '[aria-label*="cookie" i]', '[aria-label*="consent" i]',
      
      // Specific known patterns
      '.cc-banner', '.cookie-banner', '.consent-banner',
      '.privacy-notice', '.gdpr-banner', '#cookieConsent',
      '.cookie-notification', '.cookie-popup', '.consent-popup',
      
      // Shadow DOM and iframe content
      'div[style*="position: fixed"]', 'div[style*="z-index"]'
    ];

    const elements = [];
    const relevantText = ['cookie', 'consent', 'privacy', 'gdpr', 'accept', 'agree', 'tracking'];

    // Find elements using selectors
    cookieSelectors.forEach(selector => {
      try {
        const found = document.querySelectorAll(selector);
        found.forEach(el => {
          if (this.isElementVisible(el) && this.hasRelevantContent(el, relevantText)) {
            elements.push(el);
          }
        });
      } catch (e) {
        // Invalid selector, skip
      }
    });

    // Also check for elements with relevant text content
    const allElements = document.querySelectorAll('div, section, aside, footer, header');
    allElements.forEach(el => {
      if (this.isElementVisible(el) && this.hasRelevantContent(el, relevantText)) {
        const rect = el.getBoundingClientRect();
        // Check if it's positioned like a banner (fixed, sticky, or taking significant space)
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'sticky' || 
            rect.height > 100 || rect.width > window.innerWidth * 0.8) {
          elements.push(el);
        }
      }
    });

    return {
      found: elements.length > 0,
      elements: [...new Set(elements)] // Remove duplicates
    };
  }

  isElementVisible(element) {
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    
    return (
      rect.width > 0 && 
      rect.height > 0 && 
      style.display !== 'none' && 
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity) > 0
    );
  }

  hasRelevantContent(element, keywords) {
    const text = element.textContent?.toLowerCase() || '';
    return keywords.some(keyword => text.includes(keyword)) && text.length > 10;
  }

  findRejectButton(bannerElements) {
    const allButtons = [];
    
    // Collect all buttons from banner elements and their descendants
    bannerElements.forEach(banner => {
      const buttons = banner.querySelectorAll('button, input[type="button"], a, span[role="button"], div[role="button"], [onclick]');
      allButtons.push(...buttons);
    });

    // Also search globally if no buttons found in banners
    if (allButtons.length === 0) {
      const globalButtons = document.querySelectorAll('button, input[type="button"], a[href="#"], span[role="button"], div[role="button"]');
      allButtons.push(...globalButtons);
    }

    const rejectPhrases = [
      // Standard reject phrases
      'reject all', 'decline all', 'deny all', 'refuse all',
      'only essential', 'only necessary', 'essential only', 'necessary only',
      'use essential', 'use necessary', 'strictly necessary',
      'manage preferences', 'customize', 'settings', 'options',
      'save preferences', 'confirm choices', 'save settings',
      
      // Negative responses
      'no thanks', 'no thank you', 'not now', 'maybe later',
      'decline', 'deny', 'refuse', 'disagree', 'opt out',
      
      // Custom phrases from settings
      ...this.settings.customPhrases,
      
      // International phrases
      'ablehnen', 'rejeter', 'rechazar', 'rifiuta', // German, French, Spanish, Italian
      'отклонить', '拒绝', '거부', 'rejeitar' // Russian, Chinese, Korean, Portuguese
    ];

    const acceptPhrases = [
      'accept all', 'accept everything', 'allow all', 'agree all',
      'i accept', 'i agree', 'got it', 'ok', 'okay', 'continue',
      'proceed', 'enable all', 'yes', 'sure'
    ];

    let bestMatch = null;
    let bestScore = 0;

    for (const button of allButtons) {
      if (!this.isElementClickable(button)) continue;

      const text = this.getButtonText(button).toLowerCase();
      
      // Skip if it contains accept-like phrases
      if (acceptPhrases.some(phrase => text.includes(phrase))) {
        continue;
      }

      // Score based on reject phrase matches
      let score = 0;
      for (const phrase of rejectPhrases) {
        if (text.includes(phrase)) {
          score += phrase.length; // Longer phrases get higher scores
          if (text === phrase) score += 10; // Exact matches get bonus
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = button;
      }
    }

    if (bestMatch) {
      this.log('Found reject button', {
        text: this.getButtonText(bestMatch),
        score: bestScore
      });
    }

    return bestMatch;
  }

  getButtonText(button) {
    return (
      button.textContent?.trim() || 
      button.value?.trim() || 
      button.getAttribute('aria-label')?.trim() || 
      button.getAttribute('title')?.trim() || 
      button.getAttribute('alt')?.trim() || 
      ''
    );
  }

  isElementClickable(element) {
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    
    return (
      rect.width > 0 && 
      rect.height > 0 && 
      style.display !== 'none' && 
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity) > 0 &&
      !element.disabled &&
      style.pointerEvents !== 'none'
    );
  }

  clickRejectButton(button) {
    try {
      this.log('Clicking reject button', {
        text: this.getButtonText(button),
        tagName: button.tagName
      });

      // Simulate human-like click with slight delay
      setTimeout(() => {
        // Try multiple click methods for maximum compatibility
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        
        button.dispatchEvent(clickEvent);
        
        // Also try direct click
        if (typeof button.click === 'function') {
          button.click();
        }

        // Track success
        this.analytics.buttonsClicked++;
        this.trackDomainStats('buttonClicked');
        this.saveAnalytics();

        // Send message to background for stats
        chrome.runtime.sendMessage({ type: 'cookieRejected' });

        // Remove manual button if it exists
        this.removeManualButton();

      }, Math.random() * 100 + 50); // Random delay 50-150ms

    } catch (error) {
      this.analytics.errors++;
      this.saveAnalytics();
      this.log('Error clicking reject button', { error: error.message });
    }
  }

  injectManualRejectButton() {
    if (this.manualButtonInjected || document.getElementById('cookiecrusher-reject')) {
      return;
    }

    const button = this.createManualButton();
    this.positionButton(button);
    this.addButtonEventListeners(button);
    
    // Wait for body to be available
    if (document.body) {
      document.body.appendChild(button);
      this.manualButtonInjected = true;
      this.log('Manual reject button injected');
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(button);
        this.manualButtonInjected = true;
      });
    }
  }

  createManualButton() {
    const button = document.createElement('button');
    button.id = 'cookiecrusher-reject';
    button.innerHTML = '🚫 Reject Cookies';
    button.type = 'button';
    
    // Accessibility attributes
    button.setAttribute('aria-label', 'Reject all cookies on this page using CookieCrusher extension');
    button.setAttribute('title', 'CookieCrusher: Reject all cookies and tracking');
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');

    this.styleButton(button);
    return button;
  }

  styleButton(button) {
    const positions = {
      'bottom-right': { bottom: '20px', right: '20px' },
      'bottom-left': { bottom: '20px', left: '20px' },
      'top-right': { top: '20px', right: '20px' },
      'top-left': { top: '20px', left: '20px' }
    };

    const position = positions[this.settings.buttonAppearance] || positions['bottom-right'];

    button.style.cssText = `
      position: fixed !important;
      ${Object.entries(position).map(([k, v]) => `${k}: ${v}`).join(' !important; ')} !important;
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
      min-width: 140px !important;
      text-align: center !important;
      outline: none !important;
      user-select: none !important;
    `;
  }

  addButtonEventListeners(button) {
    // Mouse events
    button.addEventListener('mouseenter', () => {
      button.style.background = '#c82333 !important';
      button.style.transform = 'translateY(-2px) !important';
      button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4) !important';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = '#dc3545 !important';
      button.style.transform = 'translateY(0) !important';
      button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3) !important';
    });

    // Click event
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleManualReject(button);
    });

    // Keyboard accessibility
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.handleManualReject(button);
      }
    });

    // Focus events for accessibility
    button.addEventListener('focus', () => {
      button.style.outline = '2px solid #ffffff !important';
      button.style.outlineOffset = '2px !important';
    });

    button.addEventListener('blur', () => {
      button.style.outline = 'none !important';
    });
  }

  positionButton(button) {
    // Ensure button doesn't overlap with existing elements
    const checkOverlap = () => {
      const rect = button.getBoundingClientRect();
      const elements = document.elementsFromPoint(rect.left + rect.width/2, rect.top + rect.height/2);
      
      if (elements.length > 1 && elements[0] !== button) {
        // Adjust position if overlapping
        const currentBottom = parseInt(button.style.bottom) || 20;
        button.style.bottom = (currentBottom + 60) + 'px !important';
      }
    };

    // Check overlap after a short delay
    setTimeout(checkOverlap, 100);
  }

  async handleManualReject(button) {
    const originalText = button.innerHTML;
    button.innerHTML = '⏳ Working...';
    button.disabled = true;

    try {
      const success = this.detectAndRejectCookies();
      
      if (!success) {
        // Alternative rejection methods
        await this.performAlternativeRejection();
      }

      button.innerHTML = '✅ Done!';
      this.showFeedback('Cookies rejected successfully! 🎉', 'success');
      
      // Remove button after success
      setTimeout(() => {
        this.removeManualButton();
      }, 2000);

    } catch (error) {
      this.log('Error in manual reject', { error: error.message });
      button.innerHTML = '❌ Error';
      this.showFeedback('Error occurred during rejection', 'error');
      
      setTimeout(() => {
        button.innerHTML = originalText;
        button.disabled = false;
      }, 2000);
    }
  }

  async performAlternativeRejection() {
    // Method 1: Hide cookie banners
    const banners = document.querySelectorAll([
      '[id*="cookie" i]', '[class*="cookie" i]',
      '[id*="consent" i]', '[class*="consent" i]',
      '[id*="gdpr" i]', '[class*="gdpr" i]',
      '[role="dialog"]', '[role="alertdialog"]'
    ].join(', '));

    let hiddenCount = 0;
    banners.forEach(banner => {
      if (this.isElementVisible(banner) && banner.offsetHeight > 50) {
        banner.style.display = 'none !important';
        banner.style.visibility = 'hidden !important';
        banner.setAttribute('aria-hidden', 'true');
        hiddenCount++;
      }
    });

    // Method 2: Clear storage
    try {
      const storageKeys = [
        ...Object.keys(localStorage).filter(key => 
          /cookie|consent|gdpr|privacy|tracking/i.test(key)
        ),
        ...Object.keys(sessionStorage).filter(key => 
          /cookie|consent|gdpr|privacy|tracking/i.test(key)
        )
      ];

      storageKeys.forEach(key => {
        try {
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
        } catch (e) {
          // Ignore errors for individual keys
        }
      });

    } catch (error) {
      this.log('Could not clear storage', { error: error.message });
    }

    // Method 3: Set common rejection flags
    const rejectionFlags = {
      'cookieConsent': 'rejected',
      'gdprConsent': false,
      'trackingAllowed': false,
      'analyticsEnabled': false
    };

    Object.entries(rejectionFlags).forEach(([key, value]) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        // Ignore errors
      }
    });

    this.log('Alternative rejection completed', { hiddenBanners: hiddenCount });
    return hiddenCount > 0;
  }

  removeManualButton() {
    const button = document.getElementById('cookiecrusher-reject');
    if (button) {
      button.remove();
      this.manualButtonInjected = false;
    }
  }

  showFeedback(message, type = 'info') {
    const feedback = document.createElement('div');
    feedback.setAttribute('role', 'alert');
    feedback.setAttribute('aria-live', 'polite');
    
    const colors = {
      success: '#28a745',
      error: '#dc3545',
      info: '#17a2b8',
      warning: '#ffc107'
    };

    feedback.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      z-index: 2147483647 !important;
      background: ${colors[type] || colors.info} !important;
      color: white !important;
      padding: 12px 16px !important;
      border-radius: 8px !important;
      font-size: 14px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
      animation: slideInRight 0.3s ease !important;
      max-width: 300px !important;
      word-wrap: break-word !important;
    `;

    // Add CSS animation
    if (!document.getElementById('cookiecrusher-animations')) {
      const style = document.createElement('style');
      style.id = 'cookiecrusher-animations';
      style.textContent = `
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    
    feedback.textContent = message;
    document.body.appendChild(feedback);
    
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.remove();
      }
    }, 4000);
  }

  trackDomainStats(action) {
    const domain = window.location.hostname;
    if (!this.analytics.domainStats[domain]) {
      this.analytics.domainStats[domain] = {
        bannersDetected: 0,
        buttonsClicked: 0,
        lastVisit: new Date().toISOString()
      };
    }

    this.analytics.domainStats[domain][action]++;
    this.analytics.domainStats[domain].lastVisit = new Date().toISOString();
  }

  // Cleanup method
  destroy() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    this.removeManualButton();
    clearTimeout(this.mutationTimeout);
  }
}

// Initialize CookieCrusher
let cookieCrusher;

// Handle different loading states
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    cookieCrusher = new CookieCrusher();
  });
} else {
  cookieCrusher = new CookieCrusher();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (cookieCrusher) {
    cookieCrusher.destroy();
  }
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.cookieCrusherSettings && cookieCrusher) {
    cookieCrusher.settings = { ...cookieCrusher.settings, ...changes.cookieCrusherSettings.newValue };
    cookieCrusher.log('Settings updated', cookieCrusher.settings);
  }
});