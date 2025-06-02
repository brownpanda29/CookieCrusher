// CookieCrusher - Enhanced Content Script (Improved)
class CookieCrusher {
  constructor() {
    this.manualButtonInjected = false;
    this.observerStarted = false;
    this.mutationObserver = null;
    this.processingRejection = false; // Flag to prevent double execution
    this.lastRejectionAttempt = 0; // Timestamp for debouncing
    this.rejectionDebounceMs = 2000; // Minimum time between rejection attempts
    this.clickedButtons = new Set(); // Track clicked buttons to avoid duplicates
    this.bannerCheckInterval = null; // For auto-removal of manual button
    
    this.settings = {
      autoRejectEnabled: true,
      excludedDomains: [],
      buttonAppearance: 'bottom-right',
      enableLogging: true,
      aggressiveMode: false,
      customPhrases: [],
      autoRemoveButton: true, // New setting for auto-removal
      shadowDomSupport: true // New setting for shadow DOM support
    };
    
    this.analytics = {
      sessionsStarted: 0,
      bannersDetected: 0,
      buttonsClicked: 0,
      errors: 0,
      shadowDomBannersFound: 0,
      domainStats: {}
    };
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadAnalytics();
    
    if (this.isExcludedDomain()) {
      this.logInfo('Domain excluded, skipping initialization');
      return;
    }

    this.analytics.sessionsStarted++;
    this.saveAnalytics();
    
    this.logInfo('CookieCrusher initialized', { settings: this.settings });
    
    // Start the main functionality
    this.startCookieRejection();
  }

  // Consistent Logging Helpers
  logInfo(message, data = null) {
    this.log('INFO', message, data);
  }

  logWarn(message, data = null) {
    this.log('WARN', message, data);
  }

  logError(message, data = null) {
    this.log('ERROR', message, data);
    this.analytics.errors++;
    this.saveAnalytics();
  }

  logDebug(message, data = null) {
    if (this.settings.aggressiveMode) { // Only log debug in aggressive mode
      this.log('DEBUG', message, data);
    }
  }

  log(level, message, data = null) {
    if (!this.settings.enableLogging) return;
    
    const logEntry = {
      level,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      message,
      data
    };
    
    const logColor = {
      INFO: '#2196F3',
      WARN: '#FF9800', 
      ERROR: '#F44336',
      DEBUG: '#9C27B0'
    };
    
    console.log(
      `%c[CookieCrusher ${level}] ${message}`, 
      `color: ${logColor[level] || '#000'}; font-weight: bold;`,
      data || ''
    );
    
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

  startCookieRejection() {
    if (!this.settings.autoRejectEnabled) {
      this.logInfo('Auto-reject disabled');
      return;
    }

    // Initial detection with delays to handle different loading scenarios
    setTimeout(() => this.detectAndRejectCookies('initial-500ms'), 500);
    setTimeout(() => this.detectAndRejectCookies('initial-2s'), 2000);
    setTimeout(() => this.detectAndRejectCookies('initial-5s'), 5000);

    // Start DOM observation for dynamic content
    this.startDOMObservation();

    // Handle page load events
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => this.detectAndRejectCookies('dom-content-loaded'), 1000);
      });
    }

    window.addEventListener('load', () => {
      setTimeout(() => this.detectAndRejectCookies('window-load'), 1500);
    });

    // Handle focus events (for modals that appear on focus)
    window.addEventListener('focus', () => {
      setTimeout(() => this.detectAndRejectCookies('window-focus'), 500);
    });
  }

  startDOMObservation() {
    if (this.observerStarted || !document.body) return;

    this.mutationObserver = new MutationObserver((mutations) => {
      // More specific filtering to reduce noise
      let shouldCheck = false;
      let relevantMutations = 0;

      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // More targeted detection
              const isRelevantElement = this.isRelevantCookieElement(node);
              if (isRelevantElement) {
                relevantMutations++;
                shouldCheck = true;
                this.logDebug('Relevant cookie element detected via mutation', {
                  element: node.tagName,
                  className: node.className,
                  id: node.id
                });
                break;
              }
            }
          }
        }
        if (shouldCheck) break;
      }

      // Debounced check with anti-double-execution
      if (shouldCheck && !this.processingRejection) {
        clearTimeout(this.mutationTimeout);
        this.mutationTimeout = setTimeout(() => {
          this.detectAndRejectCookies('mutation-observer');
        }, 300);
      }
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
    });

    this.observerStarted = true;
    this.logInfo('DOM observation started');
  }

  // More targeted element detection
  isRelevantCookieElement(element) {
    const text = element.textContent?.toLowerCase() || '';
    const className = element.className?.toLowerCase() || '';
    const id = element.id?.toLowerCase() || '';
    
    const cookieKeywords = ['cookie', 'consent', 'privacy', 'gdpr', 'tracking'];
    const hasRelevantText = cookieKeywords.some(keyword => text.includes(keyword));
    const hasRelevantClass = cookieKeywords.some(keyword => className.includes(keyword));
    const hasRelevantId = cookieKeywords.some(keyword => id.includes(keyword));
    
    // Check for dialog/modal attributes
    const isDialog = element.getAttribute('role') === 'dialog' || 
                    element.getAttribute('role') === 'alertdialog';
    
    // Check for fixed positioning (common for banners)
    const style = window.getComputedStyle(element);
    const isFixed = style.position === 'fixed' || style.position === 'sticky';
    
    return (hasRelevantText || hasRelevantClass || hasRelevantId || isDialog) && 
           text.length > 10 && // Avoid false positives from tiny elements
           (isFixed || element.querySelector('button, a[href], [role="button"]'));
  }

  detectAndRejectCookies(source = 'unknown') {
    // Prevent double execution
    const now = Date.now();
    if (this.processingRejection || (now - this.lastRejectionAttempt) < this.rejectionDebounceMs) {
      this.logDebug(`Rejection attempt blocked - processing: ${this.processingRejection}, debounce: ${now - this.lastRejectionAttempt}ms`);
      return false;
    }

    this.processingRejection = true;
    this.lastRejectionAttempt = now;
    
    try {
      this.logDebug(`Starting cookie rejection from source: ${source}`);
      
      const bannerInfo = this.detectCookieBanner();
      if (bannerInfo.found) {
        this.analytics.bannersDetected++;
        this.trackDomainStats('bannerDetected');
        
        const rejectButton = this.findRejectButton(bannerInfo.elements);
        if (rejectButton && !this.clickedButtons.has(this.getButtonSignature(rejectButton))) {
          this.clickRejectButton(rejectButton);
          return true;
        }
      }

      // Shadow DOM detection if enabled
      if (this.settings.shadowDomSupport) {
        const shadowBanners = this.detectShadowDomBanners();
        if (shadowBanners.length > 0) {
          this.analytics.shadowDomBannersFound++;
          this.logInfo(`Found ${shadowBanners.length} potential shadow DOM banners`);
        }
      }

      // If no automatic rejection possible, inject manual button
      if (!this.manualButtonInjected) {
        this.injectManualRejectButton();
      }

      return false;
    } catch (error) {
      this.logError('Error in detectAndRejectCookies', { error: error.message, source });
      return false;
    } finally {
      // Reset processing flag after a short delay
      setTimeout(() => {
        this.processingRejection = false;
      }, 500);
    }
  }

  // Shadow DOM detection
  detectShadowDomBanners() {
    const shadowBanners = [];
    
    try {
      // Find elements that might contain shadow DOM
      const potentialShadowHosts = document.querySelectorAll('*');
      
      potentialShadowHosts.forEach(element => {
        if (element.shadowRoot) {
          const shadowBanner = this.searchShadowRoot(element.shadowRoot);
          if (shadowBanner) {
            shadowBanners.push(shadowBanner);
          }
        }
      });
    } catch (error) {
      this.logDebug('Error detecting shadow DOM banners', { error: error.message });
    }
    
    return shadowBanners;
  }

  searchShadowRoot(shadowRoot) {
    try {
      const cookieElements = shadowRoot.querySelectorAll([
        '[id*="cookie" i]', '[class*="cookie" i]',
        '[id*="consent" i]', '[class*="consent" i]',
        '[role="dialog"]', '[role="alertdialog"]'
      ].join(', '));
      
      for (const element of cookieElements) {
        if (this.isElementVisible(element) && this.hasRelevantContent(element, ['cookie', 'consent', 'privacy'])) {
          return element;
        }
      }
    } catch (error) {
      this.logDebug('Error searching shadow root', { error: error.message });
    }
    
    return null;
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
      
      // Common framework patterns
      '[data-testid*="cookie"]', '[data-cy*="cookie"]',
      '[data-qa*="cookie"]', '[data-track*="cookie"]'
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
        this.logDebug('Invalid selector', { selector, error: e.message });
      }
    });

    // Enhanced heuristic detection
    const allElements = document.querySelectorAll('div, section, aside, footer, header, form');
    allElements.forEach(el => {
      if (this.isElementVisible(el) && this.hasRelevantContent(el, relevantText)) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        
        // More sophisticated banner detection
        const isPositionedLikeBanner = (
          style.position === 'fixed' || 
          style.position === 'sticky' || 
          (rect.height > 80 && rect.width > window.innerWidth * 0.6) ||
          (style.zIndex && parseInt(style.zIndex) > 1000)
        );
        
        if (isPositionedLikeBanner) {
          elements.push(el);
        }
      }
    });

    const uniqueElements = [...new Set(elements)];
    
    if (uniqueElements.length > 0) {
      this.logInfo(`Found ${uniqueElements.length} potential cookie banners`);
    }

    return {
      found: uniqueElements.length > 0,
      elements: uniqueElements
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
      style.opacity !== '0' &&
      !element.hasAttribute('hidden')
    );
  }

  hasRelevantContent(element, keywords) {
    const text = element.textContent?.toLowerCase() || '';
    const hasKeywords = keywords.some(keyword => text.includes(keyword));
    const hasMinLength = text.length > 15; // Increased threshold
    const hasButtons = element.querySelector('button, a[href], [role="button"]');
    
    return hasKeywords && hasMinLength && hasButtons;
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

    // Enhanced reject phrases with better scoring
    const rejectPhrases = [
      // High priority phrases (exact matches get bonus)
      { phrase: 'reject all', score: 100 },
      { phrase: 'decline all', score: 100 },
      { phrase: 'deny all', score: 100 },
      { phrase: 'only essential', score: 90 },
      { phrase: 'only necessary', score: 90 },
      { phrase: 'essential only', score: 90 },
      { phrase: 'necessary only', score: 90 },
      
      // Medium priority phrases
      { phrase: 'manage preferences', score: 70 },
      { phrase: 'customize', score: 60 },
      { phrase: 'settings', score: 50 },
      { phrase: 'decline', score: 80 },
      { phrase: 'reject', score: 80 },
      { phrase: 'no thanks', score: 70 },
      { phrase: 'not now', score: 60 },
      
      // Custom phrases from settings
      ...this.settings.customPhrases.map(phrase => ({ phrase: phrase.toLowerCase(), score: 85 })),
      
      // International phrases
      { phrase: 'ablehnen', score: 90 }, // German
      { phrase: 'rejeter', score: 90 }, // French
      { phrase: 'rechazar', score: 90 }, // Spanish
      { phrase: 'rifiuta', score: 90 }, // Italian
      { phrase: 'отклонить', score: 90 }, // Russian
      { phrase: '拒绝', score: 90 }, // Chinese
      { phrase: '거부', score: 90 }, // Korean
      { phrase: 'rejeitar', score: 90 } // Portuguese
    ];

    const acceptPhrases = [
      'accept all', 'accept everything', 'allow all', 'agree all',
      'i accept', 'i agree', 'got it', 'ok', 'okay', 'continue',
      'proceed', 'enable all', 'yes', 'sure', 'confirm'
    ];

    let bestMatch = null;
    let bestScore = 0;

    for (const button of allButtons) {
      if (!this.isElementClickable(button)) continue;

      const text = this.getButtonText(button).toLowerCase().trim();
      
      // Skip if it contains accept-like phrases
      if (acceptPhrases.some(phrase => text.includes(phrase))) {
        continue;
      }

      // Enhanced scoring system
      let score = 0;
      for (const { phrase, score: phraseScore } of rejectPhrases) {
        if (text.includes(phrase)) {
          score += phraseScore;
          if (text === phrase) score += 20; // Exact match bonus
          if (text.split(' ').length <= 3) score += 10; // Short phrase bonus
        }
      }

      // Additional scoring factors
      if (button.getAttribute('data-reject') || button.getAttribute('data-decline')) {
        score += 50;
      }
      
      if (button.className.toLowerCase().includes('reject') || 
          button.className.toLowerCase().includes('decline')) {
        score += 30;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = button;
      }
    }

    if (bestMatch) {
      this.logInfo('Found reject button', {
        text: this.getButtonText(bestMatch),
        score: bestScore,
        className: bestMatch.className,
        id: bestMatch.id
      });
    } else {
      this.logWarn('No suitable reject button found', {
        totalButtons: allButtons.length,
        visibleButtons: allButtons.filter(b => this.isElementClickable(b)).length
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
      button.getAttribute('data-text')?.trim() ||
      ''
    );
  }

  // Generate unique signature for button to prevent duplicate clicks
  getButtonSignature(button) {
    const text = this.getButtonText(button);
    const rect = button.getBoundingClientRect();
    return `${text}_${Math.round(rect.x)}_${Math.round(rect.y)}_${button.tagName}`;
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
      !element.hasAttribute('disabled') &&
      style.pointerEvents !== 'none' &&
      !element.hasAttribute('aria-hidden')
    );
  }

  clickRejectButton(button) {
    try {
      const buttonSignature = this.getButtonSignature(button);
      
      // Prevent duplicate clicks
      if (this.clickedButtons.has(buttonSignature)) {
        this.logDebug('Button already clicked, skipping', { signature: buttonSignature });
        return;
      }
      
      this.clickedButtons.add(buttonSignature);
      
      this.logInfo('Clicking reject button', {
        text: this.getButtonText(button),
        tagName: button.tagName,
        className: button.className,
        id: button.id
      });

      // Simulate human-like click with slight delay
      setTimeout(() => {
        try {
          // Scroll button into view if needed
          button.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Wait a bit for scroll to complete
          setTimeout(() => {
            // Multiple click methods for maximum compatibility
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: button.getBoundingClientRect().x + button.getBoundingClientRect().width / 2,
              clientY: button.getBoundingClientRect().y + button.getBoundingClientRect().height / 2
            });
            
            button.dispatchEvent(clickEvent);
            
            // Also try direct click and other events
            if (typeof button.click === 'function') {
              button.click();
            }
            
            // Trigger focus and blur for form elements
            if (button.tagName === 'BUTTON' || button.tagName === 'INPUT') {
              button.focus();
              button.blur();
            }

            // Track success
            this.analytics.buttonsClicked++;
            this.trackDomainStats('buttonClicked');
            this.saveAnalytics();

            // Send message to background for stats
            if (chrome.runtime?.sendMessage) {
              chrome.runtime.sendMessage({ type: 'cookieRejected' });
            }

            // Start auto-removal process
            if (this.settings.autoRemoveButton && this.manualButtonInjected) {
              this.startBannerMonitoring();
            }

            this.logInfo('Reject button clicked successfully');
            
          }, 100);
          
        } catch (clickError) {
          this.logError('Error during button click execution', { error: clickError.message });
        }
      }, Math.random() * 200 + 100); // Random delay 100-300ms

    } catch (error) {
      this.logError('Error clicking reject button', { error: error.message });
    }
  }

  // Auto-removal: Monitor for banner disappearance
  startBannerMonitoring() {
    if (this.bannerCheckInterval) {
      clearInterval(this.bannerCheckInterval);
    }
    
    let checksWithoutBanner = 0;
    const maxChecks = 10; // Check for 5 seconds
    
    this.bannerCheckInterval = setInterval(() => {
      const bannerInfo = this.detectCookieBanner();
      
      if (!bannerInfo.found) {
        checksWithoutBanner++;
        this.logDebug(`Banner check: no banners found (${checksWithoutBanner}/${maxChecks})`);
        
        if (checksWithoutBanner >= 3) { // Banner gone for 1.5 seconds
          this.logInfo('Cookie banner disappeared, removing manual button');
          this.removeManualButton();
          clearInterval(this.bannerCheckInterval);
          this.bannerCheckInterval = null;
        }
      } else {
        checksWithoutBanner = 0; // Reset counter if banner reappears
      }
      
      // Stop monitoring after max checks
      if (checksWithoutBanner >= maxChecks) {
        clearInterval(this.bannerCheckInterval);
        this.bannerCheckInterval = null;
      }
    }, 500);
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
      this.logInfo('Manual reject button injected');
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          document.body.appendChild(button);
          this.manualButtonInjected = true;
          this.logInfo('Manual reject button injected after DOM loaded');
        }
      });
    }
  }

  createManualButton() {
    const button = document.createElement('button');
    button.id = 'cookiecrusher-reject';
    button.innerHTML = '🚫 Reject Cookies';
    button.type = 'button';
    
    // Enhanced accessibility attributes
    button.setAttribute('aria-label', 'Reject all cookies on this page using CookieCrusher extension');
    button.setAttribute('title', 'CookieCrusher: Reject all cookies and tracking');
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('data-cookiecrusher', 'manual-button');

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
      background: linear-gradient(135deg, #dc3545, #c82333) !important;
      color: white !important;
      border: none !important;
      padding: 12px 16px !important;
      font-size: 14px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      border-radius: 8px !important;
      cursor: pointer !important;
      box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3) !important;
      transition: all 0.2s ease !important;
      font-weight: 600 !important;
      letter-spacing: 0.5px !important;
      min-width: 140px !important;
      text-align: center !important;
      outline: none !important;
      user-select: none !important;
      backdrop-filter: blur(10px) !important;
      -webkit-backdrop-filter: blur(10px) !important;
    `;
  }

  addButtonEventListeners(button) {
    // Mouse events
    button.addEventListener('mouseenter', () => {
      button.style.background = 'linear-gradient(135deg, #c82333, #bd2130) !important';
      button.style.transform = 'translateY(-2px) scale(1.02) !important';
      button.style.boxShadow = '0 6px 20px rgba(220, 53, 69, 0.4) !important';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = 'linear-gradient(135deg, #dc3545, #c82333) !important';
      button.style.transform = 'translateY(0) scale(1) !important';
      button.style.boxShadow = '0 4px 12px rgba(220, 53, 69, 0.3) !important';
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
      button.style.outline = '3px solid rgba(255, 255, 255, 0.8) !important';
      button.style.outlineOffset = '2px !important';
    });

    button.addEventListener('blur', () => {
      button.style.outline = 'none !important';
    });
  }