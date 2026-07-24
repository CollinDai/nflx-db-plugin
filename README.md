# Netflix Availability Checker Chrome Extension

A Chrome Extension (Manifest V3) that automatically checks whether movies, TV shows, and anime displayed on media listing pages are currently available for streaming on Netflix in your region. It injects direct Netflix search links and provides an interactive toggle to filter content on the page.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Manifest V3](https://img.shields.io/badge/manifest-v3-green.svg)

---

## ✨ Features

- 🍿 **Streaming Check**: Uses the TMDb (The Movie Database) API to query Netflix availability for movies, TV series, and anime.
- 🔗 **Direct Search Links**: Injects an "On Netflix" badge and direct link onto content cards for instant navigation.
- 🎛️ **Floating Filter Toggle**: Adds a floating UI button ("Netflix Only") to hide unavailable titles on the page dynamically.
- ⚡ **Local Caching**: Uses `chrome.storage.local` to cache results for 7 days, reducing unnecessary network requests.
- 🔄 **Dynamic DOM Support**: Monitors SPA navigation and dynamically rendered content using `MutationObserver`.

---

## 🛠️ Configuration

Before loading the extension into Chrome, you need to configure your TMDb API key and region:

1. Obtain a free API key from [The Movie Database (TMDb)](https://www.themoviedb.org/settings/api).
2. Open `background.js` and set your API key and preferred Netflix region:

```javascript
const TMDB_API_KEY = "YOUR_TMDB_API_KEY"; // Replace with your free TMDb API Key
const REGION = "US";                      // Set your Netflix region code (e.g. "US", "GB", "KR", "CN")
```

---

## 🚀 Installation

1. Clone or download this repository:
   ```bash
   git clone <repository-url>
   cd nflx-db-plugin
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the root directory of this extension.

---

## 📁 File Structure

```
├── manifest.json      # Chrome Extension Manifest V3 configuration
├── background.js     # Service worker handling TMDb API requests & caching
├── content.js        # Content script scanning DOM & injecting UI elements
├── content.css       # Styles for badges, overlays, and floating toggle switch
├── .gitignore        # Git ignore rules
└── README.md         # Project documentation
```

---

## 📝 License

This project is licensed under the MIT License.
