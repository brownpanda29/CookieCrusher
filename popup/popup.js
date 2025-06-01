const toggle = document.getElementById('toggleAutoReject');

// Load saved setting
chrome.storage.sync.get('autoRejectEnabled', (data) => {
  toggle.checked = data.autoRejectEnabled ?? true; // Default ON
});

// Save setting on toggle
toggle.addEventListener('change', () => {
  chrome.storage.sync.set({ autoRejectEnabled: toggle.checked });
});
