function clickRejectButton() {
  const buttons = document.querySelectorAll('button, input[type="button"], a');

  const rejectLikePhrases = [
    'reject all', 'only essential', 'use essential', 'accept necessary',
    'strictly necessary', 'decline', 'do not accept', 'continue without accepting',
    'save preferences', 'save settings', 'confirm choices', 'manage choices'
  ];

  const acceptLikePhrases = [
    'accept all', 'agree', 'allow all', 'i accept', 'i agree', 'accept everything'
  ];

  for (let btn of buttons) {
    const text = btn.textContent?.toLowerCase() || btn.value?.toLowerCase() || '';

    if (acceptLikePhrases.some(p => text.includes(p))) continue;

    if (rejectLikePhrases.some(p => text.includes(p))) {
      console.log(`[CookieCrusher] Clicking reject-like button: "${text}"`);
      btn.click();
      return;
    }
  }
}

// Load setting before acting
chrome.storage.sync.get('autoRejectEnabled', (data) => {
  if (data.autoRejectEnabled ?? true) {
    window.addEventListener('load', () => {
      setTimeout(clickRejectButton, 1500);
    });
  }
});
