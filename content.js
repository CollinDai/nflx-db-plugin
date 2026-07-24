// Netflix Availability Checker - Content Script

console.log("Netflix Checker Content Script Loaded.");

// Helper: Clean title text (extract English/clean title part)
function cleanTitle(titleText) {
  if (!titleText) return "";
  // Remove text inside parentheses (e.g. "(2025)", "(HD)")
  let clean = titleText.replace(/\([^)]*\)/g, "");
  // Handle bilingual titles separated by slashes (e.g., "Brat / 兄弟")
  if (clean.includes("/")) {
    const parts = clean.split("/").map(p => p.trim());
    return parts[0];
  }
  return clean.trim();
}

// Helper: Extract release year (4-digit number) from meta text
function parseYear(metaText) {
  if (!metaText) return null;
  const match = metaText.match(/\b(19\d\d|20\d\d)\b/);
  return match ? parseInt(match[0], 10) : null;
}

// Injects the Netflix badge/overlay onto a movie card
function injectBadge(coverDiv, cardElement, onNetflix, netflixSearchUrl) {
  // Add class mapping for show/hide toggle filtering
  if (onNetflix) {
    cardElement.classList.add("nflx-card-available");
    cardElement.classList.remove("nflx-card-unavailable");
  } else {
    cardElement.classList.add("nflx-card-unavailable");
    cardElement.classList.remove("nflx-card-available");
  }

  // Check if we already injected a badge to avoid duplicates
  if (coverDiv.querySelector(".nflx-cover-overlay") || cardElement.querySelector(".nflx-injected-badge")) {
    return;
  }

  console.log(`Injecting badge: onNetflix=${onNetflix}, URL=${netflixSearchUrl}`);

  // Option 1: Floating Overlay on the cover image (.li-img.cover)
  if (onNetflix) {
    const overlay = document.createElement("a");
    overlay.href = netflixSearchUrl;
    overlay.target = "_blank";
    overlay.className = "nflx-cover-overlay";
    overlay.title = "Available on Netflix! Click to search.";
    overlay.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0H8v14.4L16 0zm-8 24h8V9.6L8 24z M8 0L0 24h8V0zM16 24l8-24h-8v24z" />
      </svg>
    `;
    coverDiv.appendChild(overlay);
  }

  // Option 2: Inline badge below the movie info
  // Find where to append - try to find sibling elements that look like info or metadata
  const badgeWrapper = document.createElement("div");
  badgeWrapper.className = "nflx-badge-container nflx-injected-badge";
  
  if (onNetflix) {
    badgeWrapper.innerHTML = `
      <a href="${netflixSearchUrl}" target="_blank" class="nflx-badge nflx-available" title="Open Netflix Search">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0H8v14.4L16 0zm-8 24h8V9.6L8 24z M8 0L0 24h8V0zM16 24l8-24h-8v24z" />
        </svg>
        On Netflix
      </a>
    `;
  } else {
    badgeWrapper.innerHTML = `
      <span class="nflx-badge nflx-unavailable">Not on Netflix</span>
    `;
  }
  
  cardElement.appendChild(badgeWrapper);
}

// Process a single movie card
async function processMovieCard(coverDiv) {
  // Mark as processing/processed to prevent duplicate operations
  if (coverDiv.dataset.nflxProcessed) return;
  coverDiv.dataset.nflxProcessed = "true";

  const cardElement = coverDiv.parentElement; // The list item (li) or container
  if (!cardElement) return;

  // 1. Get title from the <a> tag inside .li-img.cover
  const aLink = coverDiv.querySelector("a");
  let rawTitle = aLink ? aLink.getAttribute("title") : "";
  
  // Fallback to text content if no title attribute
  if (!rawTitle) {
    rawTitle = aLink ? aLink.textContent : "";
  }

  // 2. Extract release year from all text inside the card element (e.g. "2025 / 波兰 / 剧情")
  const rawMetaText = cardElement.textContent || "";
  
  const title = cleanTitle(rawTitle);
  const year = parseYear(rawMetaText);

  if (!title) {
    console.log("Could not resolve title for cover:", coverDiv);
    coverDiv.removeAttribute("data-nflx-processed");
    return;
  }

  // Determine if it is a TV show, anime, or movie based on pathname
  let type = "movie";
  if (window.location.pathname.includes("/tv")) {
    type = "tv";
  } else if (window.location.pathname.includes("/ac")) {
    type = "anime";
  }

  console.log(`Processing card (${type}): "${title}" (${year})`);

  const cacheKey = `nflx_cache_${type}_${title.toLowerCase()}_${year || ""}`;

  // Step 1: Check local cache first to avoid redundant API hits
  chrome.storage.local.get([cacheKey], (result) => {
    if (result[cacheKey]) {
      const cached = result[cacheKey];
      // Check if cache is older than 7 days (604800000 ms)
      if (Date.now() - cached.lastChecked < 604800000) {
        console.log(`Cache hit for "${title}" (${type}):`, cached);
        injectBadge(coverDiv, cardElement, cached.onNetflix, cached.netflixSearchUrl);
        return;
      }
    }

    console.log(`Cache miss. Sending background query for "${title}" (${year}) (${type})`);

    // Step 2: Query background script
    chrome.runtime.sendMessage(
      { action: "checkNetflixAvailability", title, year, type },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(`Error sending message for "${title}":`, chrome.runtime.lastError);
          coverDiv.removeAttribute("data-nflx-processed"); // Retry later
          return;
        }

        console.log(`Response received for "${title}" (${type}):`, response);

        if (response && response.status === "success" && response.data) {
          const { onNetflix, netflixSearchUrl } = response.data;
          
          // Cache the result
          const cacheData = {};
          cacheData[cacheKey] = {
            onNetflix,
            netflixSearchUrl,
            lastChecked: Date.now()
          };
          chrome.storage.local.set(cacheData);

          injectBadge(coverDiv, cardElement, onNetflix, netflixSearchUrl);
        } else {
          console.warn(`Netflix check failed for "${title}":`, response ? response.message : "No response");
          coverDiv.removeAttribute("data-nflx-processed");
        }
      }
    );
  });
}

// Scans the DOM and processes all movie cards
function scanAndProcessCards() {
  const covers = document.querySelectorAll(".li-img.cover");
  console.log(`Scanning movie cards. Found covers: ${covers.length}`);
  covers.forEach(cover => {
    processMovieCard(cover);
  });
}

// Inject floating toggle switch
function injectToggleFilter() {
  if (document.getElementById("nflx-toggle-container")) return;

  const toggleWrapper = document.createElement("label");
  toggleWrapper.id = "nflx-toggle-container";
  toggleWrapper.className = "nflx-toggle-wrapper";
  toggleWrapper.setAttribute("for", "nflx-toggle-checkbox");
  
  toggleWrapper.innerHTML = `
    <span class="nflx-toggle-label">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0H8v14.4L16 0zm-8 24h8V9.6L8 24z M8 0L0 24h8V0zM16 24l8-24h-8v24z" />
      </svg>
      Netflix Only
    </span>
    <span class="nflx-switch">
      <input type="checkbox" id="nflx-toggle-checkbox" />
      <span class="nflx-slider"></span>
    </span>
  `;
  
  document.body.appendChild(toggleWrapper);

  const checkbox = document.getElementById("nflx-toggle-checkbox");
  
  // Load state from local storage
  chrome.storage.local.get(["nflx_show_only_available"], (result) => {
    const isActive = result.nflx_show_only_available || false;
    checkbox.checked = isActive;
    if (isActive) {
      document.body.classList.add("nflx-filter-active");
    } else {
      document.body.classList.remove("nflx-filter-active");
    }
  });

  // Listener for toggle state changes
  checkbox.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    if (isChecked) {
      document.body.classList.add("nflx-filter-active");
    } else {
      document.body.classList.remove("nflx-filter-active");
    }
    chrome.storage.local.set({ nflx_show_only_available: isChecked });
  });
}

// Initialize content script
function init() {
  console.log("Initializing extension script scanning...");
  // Inject the floating switch UI
  injectToggleFilter();
  
  // Run initial scan
  scanAndProcessCards();

  // Watch for dynamic DOM changes (Vue renders pagination and filters asynchronously)
  let debounceTimer;
  const observer = new MutationObserver((mutations) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log("DOM mutated, rescanning...");
      scanAndProcessCards();
      
      // Re-inject toggle switch if Vue navigation replaced the body structure
      injectToggleFilter();
    }, 300); // Debounce to group batch card mutations
  });

  const config = { childList: true, subtree: true };
  const targetNode = document.body;
  observer.observe(targetNode, config);
  console.log("Mutation observer started on document body");
}

// Wait for the DOM to load before running
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
