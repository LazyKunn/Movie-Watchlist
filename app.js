/* =========================================================
   BUCKETLIST — app.js
   ========================================================= */

const TMDB_API_KEY = "5bc7f38e833ac2cdaf4f69c82d4fb2a5";
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_W342 = "https://image.tmdb.org/t/p/w342";
const IMG_W500 = "https://image.tmdb.org/t/p/w500";

const WATCHLIST_KEY = "bucketlist_watchlist";
const WATCHING_KEY = "bucketlist_watching";
const WATCHED_KEY = "bucketlist_watched";
const PROFILE_KEY = "bucketlist_profile";

/* ---------------------------------------------------------
   ICONS
   --------------------------------------------------------- */
const ICON_PERSON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6" stroke-linecap="round"/></svg>`;
const ICON_BOOKMARK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 4h12v16l-6-4-6 4V4z" stroke-linejoin="round"/></svg>`;
const ICON_PLAY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3l14 9-14 9V3z" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
const ICON_EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke-linejoin="round" stroke-linecap="round"/><circle cx="12" cy="12" r="3" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12.5l4.5 4.5L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ---------------------------------------------------------
   STORAGE HELPERS
   --------------------------------------------------------- */
function getList(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}
function saveList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}
function isInList(key, id, mediaType) {
  return getList(key).some((it) => it.id === id && it.media_type === mediaType);
}
function removeFromFile(key, id, mediaType) {
  const list = getList(key).filter(it => !(it.id === id && it.media_type === mediaType));
  saveList(key, list);
}
function toggleInList(key, item) {
  const list = getList(key);
  const index = list.findIndex((it) => it.id === item.id && it.media_type === item.media_type);
  if (index === -1) { list.push(item); saveList(key, list); return true; }
  list.splice(index, 1); saveList(key, list); return false;
}

function getProfileName() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY))?.name || ""; } catch { return ""; }
}
function saveProfileName(name) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ name }));
}

/* ---------------------------------------------------------
   TMDB — API Requests
   --------------------------------------------------------- */
async function tmdbFetch(path, params = {}) {
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", "en-US"); 
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TMDB Error (${response.status})`);
  return response.json();
}

function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const pad = (n) => String(n).padStart(2, "0");
  return { gte: `${year}-${pad(month + 1)}-01`, lte: `${year}-${pad(month + 1)}-${pad(lastDay)}` };
}

function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function fetchMonthlyReleases() {
  const { gte, lte } = getCurrentMonthRange();
  const baseParams = {
    "primary_release_date.gte": gte, "primary_release_date.lte": lte,
    sort_by: "popularity.desc", "vote_count.gte": 1, include_adult: false, region: "US", 
  };
  const page1 = await tmdbFetch("/discover/movie", { ...baseParams, page: 1 });
  let results = page1.results || [];
  if ((page1.total_pages || 1) > 1) {
    const page2 = await tmdbFetch("/discover/movie", { ...baseParams, page: 2 });
    results = results.concat(page2.results || []);
  }
  return shuffleArray(results).filter((m) => m.poster_path).slice(0, 12);
}

async function fetchTrendingRow() {
  const data = await tmdbFetch("/trending/all/week");
  return (data.results || []).filter((it) => it.poster_path && (it.media_type === "movie" || it.media_type === "tv"));
}

async function searchMulti(query, page = 1) {
  const data = await tmdbFetch("/search/multi", { query, include_adult: false, page });
  const results = (data.results || []).filter((it) => it.poster_path && (it.media_type === "movie" || it.media_type === "tv"));
  return { results, totalPages: data.total_pages };
}

async function fetchDiscoverMovies(genreId, sortBy = "popularity.desc", page = 1) {
  const params = { sort_by: sortBy, include_adult: false, page: page, "vote_count.gte": sortBy === "vote_average.desc" ? 300 : 0 };
  if (genreId) params.with_genres = genreId;
  const data = await tmdbFetch("/discover/movie", params);
  const results = (data.results || []).filter((it) => it.poster_path);
  return { results, totalPages: data.total_pages };
}

/* ---------------------------------------------------------
   DATA NORMALIZATION & CARD BUILDING
   --------------------------------------------------------- */
function normalizeMedia(item) {
  const mediaType = item.media_type || (item.title ? "movie" : "tv");
  return {
    id: item.id, 
    media_type: mediaType,
    title: item.title || item.name || "Untitled",
    poster_path: item.poster_path || null,
    date: item.date || item.release_date || item.first_air_date || "",
    vote_average: typeof item.vote_average === "number" ? item.vote_average : null,
  };
}

function buildCard(rawItem, options = {}) {
  const media = normalizeMedia(rawItem);
  const year = media.date ? media.date.slice(0, 4) : "—";
  const rating = media.vote_average ? media.vote_average.toFixed(1) : "—";

  const card = document.createElement("div");
  card.className = "card";

  const poster = media.poster_path
    ? Object.assign(document.createElement("img"), { className: "card-poster", src: IMG_W342 + media.poster_path, alt: media.title, loading: "lazy" })
    : Object.assign(document.createElement("div"), { className: "card-poster placeholder", textContent: "No poster available" });

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "card-actions";

  // 1. WATCHLIST BUTTON
  const watchListBtn = document.createElement("button");
  watchListBtn.className = "action-btn";
  watchListBtn.type = "button";
  watchListBtn.setAttribute("title", "To Watch");

  // 2. WATCHING BUTTON
  const watchingBtn = document.createElement("button");
  watchingBtn.className = "action-btn";
  watchingBtn.type = "button";
  watchingBtn.setAttribute("title", "Currently Watching");

  // 3. WATCHED BUTTON
  const watchedBtn = document.createElement("button");
  watchedBtn.className = "action-btn";
  watchedBtn.type = "button";
  watchedBtn.setAttribute("title", "Watched");

  // Sync visuals function
  function syncActionButtons() {
    const isWl = isInList(WATCHLIST_KEY, media.id, media.media_type);
    const isWg = isInList(WATCHING_KEY, media.id, media.media_type);
    const isWd = isInList(WATCHED_KEY, media.id, media.media_type);

    watchListBtn.classList.toggle("is-saved", isWl);
    watchListBtn.innerHTML = isWl ? ICON_CHECK : ICON_BOOKMARK;

    watchingBtn.classList.toggle("is-watching", isWg);
    watchingBtn.innerHTML = isWg ? ICON_CHECK : ICON_PLAY;

    watchedBtn.classList.toggle("is-watched", isWd);
    watchedBtn.innerHTML = isWd ? ICON_CHECK : ICON_EYE;
  }
  syncActionButtons(); // Initial sync

  // Event Listeners with Mutual Exclusion
  watchListBtn.addEventListener("click", () => {
    const isNowSaved = toggleInList(WATCHLIST_KEY, media);
    if (isNowSaved) {
      removeFromFile(WATCHING_KEY, media.id, media.media_type);
      removeFromFile(WATCHED_KEY, media.id, media.media_type);
    }
    syncActionButtons();
    if (options.onToggle) options.onToggle();
  });

  watchingBtn.addEventListener("click", () => {
    const isNowWatching = toggleInList(WATCHING_KEY, media);
    if (isNowWatching) {
      removeFromFile(WATCHLIST_KEY, media.id, media.media_type);
      removeFromFile(WATCHED_KEY, media.id, media.media_type);
    }
    syncActionButtons();
    if (options.onToggle) options.onToggle();
  });

  watchedBtn.addEventListener("click", () => {
    const isNowWatched = toggleInList(WATCHED_KEY, media);
    if (isNowWatched) {
      removeFromFile(WATCHLIST_KEY, media.id, media.media_type);
      removeFromFile(WATCHING_KEY, media.id, media.media_type);
    }
    syncActionButtons();
    if (options.onToggle) options.onToggle();
  });

  actionsWrap.append(watchedBtn, watchingBtn, watchListBtn);

  const body = document.createElement("div");
  body.className = "card-body";
  body.innerHTML = `
    <div class="card-title">${escapeHtml(media.title)}</div>
    <div class="card-meta"><span>${year}</span><span class="card-rating">★ ${rating}</span></div>
  `;

  card.append(poster, actionsWrap, body);
  return card;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------------------------------------------------
   HEADER & MODALS
   --------------------------------------------------------- */
function initHeader() {
  const searchToggle = document.getElementById("searchToggle");
  const searchPanel = document.getElementById("searchPanel");
  const searchForm = document.getElementById("searchForm");
  const searchInput = document.getElementById("searchInput");
  const profileToggle = document.getElementById("profileToggle");
  const profileModalOverlay = document.getElementById("profileModalOverlay");
  const closeProfileBtn = document.getElementById("closeProfileBtn");
  const profileForm = document.getElementById("profileForm");
  const profileInput = document.getElementById("profileInput");
  const clearWatchlistBtn = document.getElementById("clearWatchlistBtn");

  if (searchToggle && searchPanel) {
    searchToggle.addEventListener("click", () => {
      const isOpen = searchPanel.classList.toggle("is-open");
      searchToggle.setAttribute("aria-expanded", String(isOpen));
      if (isOpen) setTimeout(() => searchInput?.focus(), 200);
    });
  }

  if (searchForm && searchInput) {
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = searchInput.value.trim();
      if (!query) return;
      window.location.href = `results.html?q=${encodeURIComponent(query)}`;
    });
  }

  const genreBtns = document.querySelectorAll(".genre-btn");
  genreBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const genreId = btn.getAttribute("data-id");
      const genreName = btn.textContent;
      window.location.href = `results.html?genre=${genreId}&name=${encodeURIComponent(genreName)}`;
    });
  });

  const params = new URLSearchParams(window.location.search);
  const currentQuery = params.get("q");
  if (currentQuery && searchInput && searchPanel) {
    searchInput.value = currentQuery;
    searchPanel.classList.add("is-open");
    searchToggle?.setAttribute("aria-expanded", "true");
  }

  function openProfileModal() {
    if (!profileModalOverlay) return;
    profileModalOverlay.classList.add("is-open");
    if (profileInput) profileInput.value = getProfileName();
    
    const countToWatch = document.getElementById("watchlistCount");
    const countWatching = document.getElementById("watchingCount");
    const countWatched = document.getElementById("watchedCount");
    
    if (countToWatch) countToWatch.textContent = getList(WATCHLIST_KEY).length;
    if (countWatching) countWatching.textContent = getList(WATCHING_KEY).length;
    if (countWatched) countWatched.textContent = getList(WATCHED_KEY).length;

    searchPanel?.classList.remove("is-open");
    setTimeout(() => profileInput?.focus(), 100);
  }

  function closeProfileModal() {
    profileModalOverlay?.classList.remove("is-open");
  }

  function updateProfileButton() {
    const name = getProfileName();
    if (!profileToggle) return;
    if (name) { profileToggle.innerHTML = `<span>${escapeHtml(name[0].toUpperCase())}</span>`; } 
    else { profileToggle.innerHTML = ICON_PERSON; }
  }

  if (profileToggle && profileModalOverlay) {
    updateProfileButton();
    profileToggle.addEventListener("click", openProfileModal);
    closeProfileBtn?.addEventListener("click", closeProfileModal);
    profileModalOverlay.addEventListener("click", (event) => {
      if (event.target === profileModalOverlay) closeProfileModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { closeProfileModal(); searchPanel?.classList.remove("is-open"); }
    });
  }

  if (profileForm && profileInput) {
    profileForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveProfileName(profileInput.value.trim());
      updateProfileButton();
      closeProfileModal();
    });
  }

  if (clearWatchlistBtn) {
    clearWatchlistBtn.addEventListener("click", () => {
      if (confirm("Clear all your lists? This cannot be undone.")) {
        saveList(WATCHLIST_KEY, []); 
        saveList(WATCHING_KEY, []); 
        saveList(WATCHED_KEY, []); 
        closeProfileModal();
        if (window.location.pathname.includes("watchlist.html") && typeof initWatchlistPage === "function") initWatchlistPage(); 
        else window.location.reload();
      }
    });
  }
}

/* ---------------------------------------------------------
   PAGE INITS 
   --------------------------------------------------------- */
async function initHero() {
  const track = document.getElementById("heroTrack");
  const nextBtn = document.getElementById("heroNext");
  const dotsWrap = document.getElementById("heroDots");
  if (!track) return;
  track.innerHTML = `<p class="state-message">Loading new releases…</p>`;
  
  try {
    const movies = await fetchMonthlyReleases();
    if (movies.length === 0) {
      track.innerHTML = `<p class="state-message">No new releases found for this month.</p>`;
      nextBtn?.style.setProperty("display", "none");
      return;
    }
    const groups = [];
    for (let i = 0; i < movies.length; i += 3) groups.push(movies.slice(i, i + 3));
    let currentGroup = 0;

    function renderGroup() {
      track.innerHTML = "";
      groups[currentGroup].forEach((movie) => {
        const media = normalizeMedia(movie);
        const year = media.date ? media.date.slice(0, 4) : "—";
        const card = document.createElement("div");
        card.className = "hero-card";
        card.innerHTML = `
          ${media.poster_path ? `<img src="${IMG_W500 + media.poster_path}" alt="${escapeHtml(media.title)}" loading="lazy">` : `<div class="card-poster placeholder" style="height:100%">No poster</div>`}
          <div class="hero-card-info"><h3>${escapeHtml(media.title)}</h3><p>Release · ${year}</p></div>`;
        track.appendChild(card);
      });
      if (dotsWrap) {
        dotsWrap.innerHTML = groups.map((_, i) => `<span class="${i === currentGroup ? "is-active" : ""}"></span>`).join("");
      }
    }
    nextBtn?.addEventListener("click", () => { currentGroup = (currentGroup + 1) % groups.length; renderGroup(); });
    renderGroup();
  } catch (err) { track.innerHTML = `<p class="state-message">Could not load releases.</p>`; }
}

async function initCategoryRow() {
  const track = document.getElementById("categoryTrack");
  const prevBtn = document.getElementById("categoryPrev");
  const nextBtn = document.getElementById("categoryNext");
  if (!track) return;
  track.innerHTML = `<p class="state-message">Loading trending movies…</p>`;
  try {
    const items = await fetchTrendingRow();
    track.innerHTML = "";
    items.forEach((item) => track.appendChild(buildCard(item)));
    const scrollAmount = () => track.clientWidth * 0.8;
    prevBtn?.addEventListener("click", () => track.scrollBy({ left: -scrollAmount(), behavior: "smooth" }));
    nextBtn?.addEventListener("click", () => track.scrollBy({ left: scrollAmount(), behavior: "smooth" }));
  } catch (err) { track.innerHTML = `<p class="state-message">Could not load this category.</p>`; }
}

async function initResultsPage() {
  const grid = document.getElementById("resultsGrid");
  const heading = document.getElementById("resultsHeading");
  const sortContainer = document.getElementById("sortContainer");
  const sortSelect = document.getElementById("sortSelect");
  const paginationWrap = document.getElementById("paginationWrap");
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  if (!grid) return;

  const params = new URLSearchParams(window.location.search);
  const query = (params.get("q") || "").trim();
  const genreId = params.get("genre");
  const genreName = params.get("name") || "Genre";
  const sortBy = params.get("sort") || "popularity.desc";

  let currentPage = 1; let totalPages = 1;

  if (sortSelect) {
    sortSelect.value = sortBy;
    sortSelect.addEventListener("change", (e) => { params.set("sort", e.target.value); window.location.search = params.toString(); });
  }

  if (heading) {
    if (query) heading.textContent = `Results for "${query}"`;
    else if (genreId) heading.textContent = `Popular ${genreName} Movies`;
    else heading.textContent = "Search";
  }

  if (sortContainer) sortContainer.style.display = query ? "none" : "flex";

  if (!query && !genreId) {
    grid.innerHTML = `<p class="state-message">Type something in the search bar or pick a category.</p>`;
    if (sortContainer) sortContainer.style.display = "none";
    return;
  }

  async function fetchAndRender(page) {
    if (page === 1) grid.innerHTML = `<p class="state-message">Searching…</p>`;
    try {
      let response = query ? await searchMulti(query, page) : await fetchDiscoverMovies(genreId, sortBy, page);
      if (page === 1) grid.innerHTML = "";
      if (response.results.length === 0 && page === 1) {
        grid.innerHTML = `<p class="state-message">We couldn't find anything.</p>`;
        if (paginationWrap) paginationWrap.style.display = "none"; return;
      }
      response.results.forEach((item) => grid.appendChild(buildCard(item)));
      totalPages = response.totalPages;
      if (paginationWrap) paginationWrap.style.display = (currentPage < totalPages) ? "block" : "none";
    } catch (err) { if (page === 1) grid.innerHTML = `<p class="state-message">Could not perform search.</p>`; }
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      if (currentPage < totalPages) {
        currentPage++;
        const oldText = loadMoreBtn.textContent;
        loadMoreBtn.textContent = "Loading...";
        fetchAndRender(currentPage).then(() => { loadMoreBtn.textContent = oldText; });
      }
    });
  }
  fetchAndRender(currentPage);
}

function initWatchlistPage() {
  const gridWatchlist = document.getElementById("gridWatchlist");
  const gridWatching = document.getElementById("gridWatching");
  const gridWatched = document.getElementById("gridWatched");
  if (!gridWatchlist || !gridWatching || !gridWatched) return;

  function renderSection(gridElement, listKey, hideWhenEmpty = false) {
    const list = getList(listKey);
    const sectionWrapper = gridElement.parentElement; // Pega na div inteira que inclui o título H2
    
    gridElement.innerHTML = "";
    
    if (list.length === 0) {
      if (hideWhenEmpty) {
        // Esconde a aba completamente (Título + Grelha) se estiver vazia
        sectionWrapper.style.display = "none";
      } else {
        // Mostra a aba com a mensagem de que está vazia
        sectionWrapper.style.display = "block";
        gridElement.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; padding: 30px;"><p style="margin:0;">No items in this list yet.</p></div>`;
      }
      return;
    }
    
    // Se tiver filmes, garante que a secção está visível
    sectionWrapper.style.display = "block";
    list.forEach((item) => {
      const card = buildCard(item, { onToggle: renderAll });
      gridElement.appendChild(card);
    });
  }

  function renderAll() {
    // "true" faz com que o "Currently Watching" desapareça se estiver vazio
    renderSection(gridWatching, WATCHING_KEY, true); 
    
    // "false" faz com que o "To Watch" e "Watched" mostrem a mensagem de lista vazia
    renderSection(gridWatchlist, WATCHLIST_KEY, false);
    renderSection(gridWatched, WATCHED_KEY, false);
  }

  renderAll();
}

document.addEventListener("DOMContentLoaded", () => {
  initHeader();
  initHero();
  initCategoryRow();
  initResultsPage();
  initWatchlistPage();
});