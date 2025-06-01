# CookieCrusher 🧹🍪

A Chrome extension that automatically rejects all non-essential cookies — because your privacy shouldn't require 3 clicks.

## ✨ Features

- 🛑 Auto-clicks "Reject All" on cookie banners (OneTrust, Cookiebot, and more)
- 🍪 Optionally injects a "Reject All" button if missing
- ⚙️ User settings to enable/disable features
- 🌐 Whitelist domains you trust

## 🔧 Tech Stack

- Chrome Extension (Manifest V3)
- JavaScript / TypeScript (TBD)
- DOM-based detection

## 📦 Folder Structure
<pre> 
 cookiecrusher/
├── manifest.json
├── background.js
├── content.js
├── popup/
│ ├── popup.html
│ └── popup.js
├── icons/
│ └── icon.png
├── README.md
└── .gitignore ##
</pre>


## 🚀 Getting Started

1. Clone the repo:
   ```bash
   git clone https://github.com/yourusername/cookiecrusher.git

2. Load the extension in Chrome:

   1️⃣ Go to chrome://extensions/

   2️⃣ Enable Developer Mode

   3️⃣ Click Load unpacked and select the project folder

   4️⃣ Visit any site with a cookie banner — and watch CookieCrusher go to work.
   
