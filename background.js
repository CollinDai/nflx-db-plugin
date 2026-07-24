// Netflix Availability Checker - Background Service Worker

// ==========================================
// CONFIGURATION
// ==========================================
const TMDB_API_KEY = "YOUR_TMDB_API_KEY"; // <-- REPLACE WITH YOUR FREE TMDB API KEY
const REGION = "US";                      // <-- CHOOSE YOUR NETFLIX REGION (e.g. "US", "GB", "KR", "CN")
// ==========================================

console.log("Netflix Checker Background Worker Loaded. Active region:", REGION);

// Listener for messages from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received message:", request);

  if (request.action === "checkNetflixAvailability") {
    const { title, year, type } = request;

    if (!TMDB_API_KEY || TMDB_API_KEY === "YOUR_TMDB_API_KEY") {
      console.warn("TMDb API Key is not set in background.js");
      sendResponse({ status: "error", message: "API key not configured in background.js" });
      return false; // Close channel synchronously since we responded
    }

    checkAvailability(title, year, type)
      .then(result => {
        console.log(`Availability result for "${title}" (${type}):`, result);
        sendResponse({ status: "success", data: result });
      })
      .catch(error => {
        console.error(`Error checking availability for "${title}" (${type}):`, error);
        sendResponse({ status: "error", message: error.message });
      });

    return true; // Keep the message channel open for async response
  }
  
  return false; // Close channel for other actions
});

/**
 * Checks if a movie, TV show, or anime is streaming on Netflix in the specified region.
 */
async function checkAvailability(title, year, type = "movie") {
  try {
    const isTV = type === "tv";
    const isAnime = type === "anime";
    
    // Step 1: Search movie/TV on TMDb to get the ID
    let searchUrl = "";
    // For anime, start searching as a TV show first (most common for anime catalog listings)
    if (isTV || isAnime) {
      searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
      if (year) {
        searchUrl += `&first_air_date_year=${year}`;
      }
    } else {
      searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
      if (year) {
        searchUrl += `&primary_release_year=${year}`;
      }
    }

    console.log(`Fetching TMDb search (${type}): ${searchUrl}`);
    let response = await fetch(searchUrl);
    if (!response.ok) {
      throw new Error(`TMDb search failed: ${response.statusText}`);
    }
    
    let searchData = await response.json();

    // Fallback 1: If no results found with year, try searching without the year filter
    if ((!searchData.results || searchData.results.length === 0) && year) {
      let fallbackUrl = "";
      if (isTV || isAnime) {
        fallbackUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
      } else {
        fallbackUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
      }
      console.log(`Fallback 1 (no year): Fetching TMDb search: ${fallbackUrl}`);
      response = await fetch(fallbackUrl);
      if (response.ok) {
        searchData = await response.json();
      }
    }

    // Fallback 2: For anime, if still no results found as a TV show, try searching as a movie
    let resolvedType = (isTV || isAnime) ? "tv" : "movie";
    if (isAnime && (!searchData.results || searchData.results.length === 0)) {
      resolvedType = "movie";
      let movieSearchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
      if (year) {
        movieSearchUrl += `&primary_release_year=${year}`;
      }
      console.log(`Fallback 2 (anime as movie): Fetching TMDb movie search: ${movieSearchUrl}`);
      response = await fetch(movieSearchUrl);
      if (response.ok) {
        searchData = await response.json();
        // Fallback 3: If no movie results found with year, try without year
        if ((!searchData.results || searchData.results.length === 0) && year) {
          const movieSearchUrlNoYear = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
          response = await fetch(movieSearchUrlNoYear);
          if (response.ok) {
            searchData = await response.json();
          }
        }
      }
    }

    if (!searchData.results || searchData.results.length === 0) {
      return { 
        onNetflix: false, 
        reason: `${type} not found on TMDb`,
        netflixSearchUrl: `https://www.netflix.com/search?q=${encodeURIComponent(title)}`
      };
    }

    // Get the most popular/first match
    const item = searchData.results[0];
    const itemId = item.id;
    console.log(`Found TMDb ID: ${itemId} for "${title}" (resolved as: ${resolvedType})`);

    // Step 2: Get Watch Providers for the item ID
    const providerPath = resolvedType; // "tv" or "movie"
    const providersUrl = `https://api.themoviedb.org/3/${providerPath}/${itemId}/watch/providers?api_key=${TMDB_API_KEY}`;
    console.log(`Fetching watch providers: ${providersUrl}`);
    const providersResponse = await fetch(providersUrl);
    if (!providersResponse.ok) {
      throw new Error(`TMDb watch providers query failed: ${providersResponse.statusText}`);
    }

    const providersData = await providersResponse.json();
    const regionData = providersData.results ? providersData.results[REGION] : null;

    // Step 3: Check if available on Netflix under flatrate (subscription) streaming
    let onNetflix = false;
    if (regionData && regionData.flatrate) {
      onNetflix = regionData.flatrate.some(
        provider => provider.provider_id === 8 || provider.provider_name.toLowerCase().includes("netflix")
      );
    }

    // TV shows use item.name, Movies use item.title on TMDb
    const tmdbTitle = (resolvedType === "tv") ? item.name : item.title;

    return {
      onNetflix: onNetflix,
      tmdbTitle: tmdbTitle,
      tmdbId: itemId,
      releaseDate: (resolvedType === "tv") ? item.first_air_date : item.release_date,
      netflixSearchUrl: `https://www.netflix.com/search?q=${encodeURIComponent(tmdbTitle)}`
    };
  } catch (error) {
    console.error("API Call error in checkAvailability:", error);
    throw error;
  }
}
