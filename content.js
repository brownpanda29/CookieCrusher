// Broader list of "reject or minimal consent" buttons
const rejectLikePhrases = [
  'reject all',
  'only essential',
  'use essential',
  'accept necessary',
  'strictly necessary',
  'decline',
  'do not accept',
  'continue without accepting',
  'save preferences',
  'save settings',
  'confirm choices',
  'manage choices'
];

// Phrases to avoid clicking
const acceptLikePhrases = [
  'accept all',
  'agree',
  'allow all',
  'i accept',
  'i agree',
  'accept everything'
];

function clickRejectButton() {
  const buttons = document.querySelectorAll('button, input[type="button"], a');

  for (let btn of buttons) {
    const text = btn.textContent?.toLowerCase() || btn.value?.toLowerCase() || '';

    // Skip if text matches an Accept All
    if (acceptLikePhrases.some(accept => text.includes(accept))) {
      continue;
    }

    // Click if text matches a reject-like phrase
    if (rejectLikePhrases.some(reject => text.includes(reject))) {
      console.log(`[CookieCrusher] Clicking reject-like button: "${text}"`);
      btn.click();
      return;
    }
  }
}

window.addEventListener('load', () => {
  // Wait to allow banner to load
  setTimeout(clickRejectButton, 1500);
});
