/* ========================================
   POWDER - Application Logic
   TMDB API + Vidking Player Integration
   ======================================== */

// Configuration
const CONFIG = {
    TMDB_BASE_URL: 'https://api.themoviedb.org/3',
    TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p',
    VIDKING_BASE_URL: 'https://www.vidking.net/embed',
    ACCENT_COLOR: 'e50914',
    TMDB_API_KEY: 'ee2d5fba997496419e3f483f1e17a6cc',
    STORAGE_KEYS: {
        MY_LIST: 'powder_my_list',
        WATCH_PROGRESS: 'powder_progress',
        CONTINUE_WATCHING: 'powder_continue'
    }
};

// State
const state = {
    currentContent: null,
    myList: [],
    watchProgress: {},
    continueWatching: [],
    searchTimeout: null,
    heroContent: null
};

// DOM Elements
const elements = {
    loadingOverlay: document.getElementById('loadingOverlay'),
    header: document.querySelector('.header'),
    searchToggle: document.getElementById('searchToggle'),
    searchInput: document.getElementById('searchInput'),
    searchContainer: document.querySelector('.search-container'),
    searchResults: document.getElementById('searchResults'),
    searchGrid: document.getElementById('searchGrid'),
    contentRows: document.getElementById('contentRows'),
    hero: document.getElementById('hero'),
    heroBackdrop: document.querySelector('.hero-backdrop'),
    heroTitle: document.getElementById('heroTitle'),
    heroMeta: document.getElementById('heroMeta'),
    heroDescription: document.getElementById('heroDescription'),
    heroPlay: document.getElementById('heroPlay'),
    heroInfo: document.getElementById('heroInfo'),
    detailModal: document.getElementById('detailModal'),
    detailOverlay: document.getElementById('detailOverlay'),
    detailClose: document.getElementById('detailClose'),
    detailBackdrop: document.getElementById('detailBackdrop'),
    detailTitle: document.getElementById('detailTitle'),
    detailMeta: document.getElementById('detailMeta'),
    detailDescription: document.getElementById('detailDescription'),
    detailPlay: document.getElementById('detailPlay'),
    addToList: document.getElementById('addToList'),
    episodeSelector: document.getElementById('episodeSelector'),
    seasonSelect: document.getElementById('seasonSelect'),
    episodesGrid: document.getElementById('episodesGrid'),
    similarGrid: document.getElementById('similarGrid'),
    playerModal: document.getElementById('playerModal'),
    playerBack: document.getElementById('playerBack'),
    playerTitle: document.getElementById('playerTitle'),
    playerFrame: document.getElementById('playerFrame'),
    navLinks: document.querySelectorAll('.nav-link'),
    continueWatchingRow: document.getElementById('continueWatchingRow'),
    myListRow: document.getElementById('myListRow')
};

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', init);

async function init() {
    loadFromStorage();
    setupEventListeners();
    await loadContent();

    // Initialize TV remote navigation
    initTVRemoteNavigation();
}

function loadFromStorage() {
    state.myList = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.MY_LIST) || '[]');
    state.watchProgress = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.WATCH_PROGRESS) || '{}');
    state.continueWatching = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.CONTINUE_WATCHING) || '[]');
}

function saveToStorage() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.MY_LIST, JSON.stringify(state.myList));
    localStorage.setItem(CONFIG.STORAGE_KEYS.WATCH_PROGRESS, JSON.stringify(state.watchProgress));
    localStorage.setItem(CONFIG.STORAGE_KEYS.CONTINUE_WATCHING, JSON.stringify(state.continueWatching));
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
    // Header scroll effect
    window.addEventListener('scroll', () => {
        elements.header.classList.toggle('scrolled', window.scrollY > 50);
    });

    // Search
    elements.searchToggle.addEventListener('click', toggleSearch);
    elements.searchInput.addEventListener('input', handleSearchInput);
    elements.searchInput.addEventListener('blur', () => {
        if (!elements.searchInput.value) {
            elements.searchContainer.classList.remove('active');
        }
    });

    // Navigation
    elements.navLinks.forEach(link => {
        link.addEventListener('click', handleNavClick);
    });

    // Hero buttons
    elements.heroPlay.addEventListener('click', () => playContent(state.heroContent));
    elements.heroInfo.addEventListener('click', () => showDetailModal(state.heroContent));

    // Detail modal
    elements.detailOverlay.addEventListener('click', closeDetailModal);
    elements.detailClose.addEventListener('click', closeDetailModal);
    elements.detailPlay.addEventListener('click', handleDetailPlay);
    elements.addToList.addEventListener('click', handleAddToList);
    elements.seasonSelect.addEventListener('change', handleSeasonChange);

    // Player modal
    elements.playerBack.addEventListener('click', closePlayerModal);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    // Scroll buttons
    document.querySelectorAll('.scroll-btn').forEach(btn => {
        btn.addEventListener('click', handleScrollButton);
    });

    // Player message events (progress tracking)
    window.addEventListener('message', handlePlayerMessage);
}

// ========================================
// API KEY HANDLING
// ========================================

function showApiKeyModal() {
    elements.loadingOverlay.classList.add('hidden');
    elements.apiKeyModal.classList.add('active');
}

async function handleSaveApiKey() {
    const key = elements.apiKeyInput.value.trim();
    if (!key) return;

    elements.saveApiKeyBtn.textContent = 'Verifying...';
    elements.saveApiKeyBtn.disabled = true;

    try {
        // Test the API key
        const response = await fetch(`${CONFIG.TMDB_BASE_URL}/movie/popular?api_key=${key}`);
        if (!response.ok) throw new Error('Invalid API key');

        state.apiKey = key;
        localStorage.setItem(CONFIG.STORAGE_KEYS.API_KEY, key);
        elements.apiKeyModal.classList.remove('active');
        await loadContent();
    } catch (error) {
        elements.saveApiKeyBtn.textContent = 'Invalid Key - Try Again';
        setTimeout(() => {
            elements.saveApiKeyBtn.textContent = 'Get Started';
            elements.saveApiKeyBtn.disabled = false;
        }, 2000);
    }
}

// ========================================
// TMDB API
// ========================================

async function tmdbFetch(endpoint, params = {}) {
    const url = new URL(`${CONFIG.TMDB_BASE_URL}${endpoint}`);
    url.searchParams.append('api_key', CONFIG.TMDB_API_KEY);
    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
    });

    const response = await fetch(url);
    if (!response.ok) throw new Error(`TMDB API Error: ${response.status}`);
    return response.json();
}

function getImageUrl(path, size = 'w500') {
    if (!path) return 'https://via.placeholder.com/500x750/1a1a1a/808080?text=No+Image';
    return `${CONFIG.TMDB_IMAGE_BASE}/${size}${path}`;
}

// ========================================
// CONTENT LOADING
// ========================================

async function loadContent() {
    try {
        // Load all content in parallel
        const [trending, popular, topRated, trendingTV, popularTV] = await Promise.all([
            tmdbFetch('/trending/movie/week'),
            tmdbFetch('/movie/popular'),
            tmdbFetch('/movie/top_rated'),
            tmdbFetch('/trending/tv/week'),
            tmdbFetch('/tv/popular')
        ]);

        // Set hero content
        if (trending.results.length > 0) {
            const heroMovie = trending.results[Math.floor(Math.random() * Math.min(5, trending.results.length))];
            await setHeroContent(heroMovie, 'movie');
        }

        // Render content rows
        renderContentRow('trendingMovies', trending.results, 'movie');
        renderContentRow('popularMovies', popular.results, 'movie');
        renderContentRow('topRatedMovies', topRated.results, 'movie');
        renderContentRow('trendingTV', trendingTV.results, 'tv');
        renderContentRow('popularTV', popularTV.results, 'tv');

        // Render My List and Continue Watching
        updateMyListRow();
        updateContinueWatchingRow();

        // Hide loading overlay
        elements.loadingOverlay.classList.add('hidden');
    } catch (error) {
        console.error('Error loading content:', error);
        elements.loadingOverlay.innerHTML = `
            <div style="text-align: center; color: #e50914;">
                <p>Error loading content</p>
                <p style="color: #808080; font-size: 0.9rem;">${error.message}</p>
                <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 24px; background: #e50914; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    Retry
                </button>
            </div>
        `;
    }
}

async function setHeroContent(content, type) {
    state.heroContent = { ...content, media_type: type };

    // Get additional details
    const details = await tmdbFetch(`/${type}/${content.id}`);
    state.heroContent = { ...state.heroContent, ...details };

    const title = content.title || content.name;
    const year = (content.release_date || content.first_air_date || '').split('-')[0];
    const rating = content.vote_average?.toFixed(1) || 'N/A';
    const runtime = details.runtime || (details.episode_run_time?.[0]) || '';

    elements.heroBackdrop.style.backgroundImage = `url(${getImageUrl(content.backdrop_path, 'original')})`;
    elements.heroTitle.textContent = title;
    elements.heroMeta.innerHTML = `
        <span class="rating"><span class="star">★</span> ${rating}</span>
        <span class="year">${year}</span>
        ${runtime ? `<span class="runtime">${runtime} min</span>` : ''}
    `;
    elements.heroDescription.textContent = content.overview || 'No description available.';
}

function renderContentRow(containerId, items, type) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = items.map(item => createMovieCard(item, type)).join('');

    // Add click listeners with event delegation
    container.querySelectorAll('.movie-card').forEach((card, index) => {
        const item = { ...items[index], media_type: type };

        // Play button click
        const playBtn = card.querySelector('.play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (type === 'tv') {
                    // For TV shows, go to detail modal first to select episode
                    showDetailModal(item);
                } else {
                    playContent(item);
                }
            });
        }

        // Info button click
        const infoBtn = card.querySelector('.info-btn');
        if (infoBtn) {
            infoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showDetailModal(item);
            });
        }

        // Card click (fallback to info)
        card.addEventListener('click', () => showDetailModal(item));
    });
}

function createMovieCard(item, type) {
    const title = item.title || item.name;
    const year = (item.release_date || item.first_air_date || '').split('-')[0];
    const rating = item.vote_average?.toFixed(1) || 'N/A';
    const posterUrl = getImageUrl(item.poster_path, 'w342');
    const progress = state.watchProgress[`${type}-${item.id}`] || 0;

    return `
        <div class="movie-card" data-id="${item.id}" data-type="${type}">
            <div class="card-poster-wrapper">
                <img src="${posterUrl}" alt="${title}" class="card-poster" loading="lazy" 
                     onerror="handlePosterError(this)">
                ${type === 'tv' ? '<span class="card-type-badge">Series</span>' : ''}
                
                <!-- Hover Action Buttons -->
                <div class="card-hover-actions">
                    <button class="card-action-btn play-btn" title="Play" data-action="play">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                    </button>
                    <button class="card-action-btn info-btn" title="More Info" data-action="info">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="card-info">
                <h3 class="card-title">${title}</h3>
                <div class="card-meta">
                    <span class="rating">${rating}</span>
                    <span>${year}</span>
                </div>
            </div>
            ${progress > 0 ? `
                <div class="card-progress">
                    <div class="card-progress-bar" style="width: ${progress}%"></div>
                </div>
            ` : ''}
        </div>
    `;
}

// ========================================
// DETAIL MODAL
// ========================================

async function showDetailModal(content) {
    state.currentContent = content;
    const type = content.media_type || 'movie';

    // Get full details
    const details = await tmdbFetch(`/${type}/${content.id}`);
    state.currentContent = { ...state.currentContent, ...details };

    const title = details.title || details.name;
    const year = (details.release_date || details.first_air_date || '').split('-')[0];
    const rating = details.vote_average?.toFixed(1) || 'N/A';
    const runtime = details.runtime || (details.episode_run_time?.[0]) || '';

    elements.detailBackdrop.style.backgroundImage = `url(${getImageUrl(details.backdrop_path, 'w1280')})`;
    elements.detailTitle.textContent = title;
    elements.detailMeta.innerHTML = `
        <span class="rating"><span class="star">★</span> ${rating}</span>
        <span class="year">${year}</span>
        ${runtime ? `<span class="runtime">${runtime} min</span>` : ''}
        ${details.number_of_seasons ? `<span>${details.number_of_seasons} Season${details.number_of_seasons > 1 ? 's' : ''}</span>` : ''}
    `;
    elements.detailDescription.textContent = details.overview || 'No description available.';

    // Update add to list button
    const isInList = state.myList.some(item => item.id === content.id);
    elements.addToList.classList.toggle('active', isInList);
    elements.addToList.title = isInList ? 'Remove from My List' : 'Add to My List';

    // Handle TV shows - show episode selector
    if (type === 'tv' && details.seasons) {
        elements.episodeSelector.style.display = 'block';
        renderSeasons(details.seasons);
    } else {
        elements.episodeSelector.style.display = 'none';
    }

    // Load similar content
    loadSimilarContent(content.id, type);

    elements.detailModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeDetailModal() {
    elements.detailModal.classList.remove('active');
    document.body.style.overflow = '';
    state.currentContent = null;
    exitModalMode();
}

function renderSeasons(seasons) {
    // Filter out season 0 (specials) if present
    const filteredSeasons = seasons.filter(s => s.season_number > 0);

    elements.seasonSelect.innerHTML = filteredSeasons.map(season => `
        <option value="${season.season_number}">Season ${season.season_number}</option>
    `).join('');

    if (filteredSeasons.length > 0) {
        loadEpisodes(state.currentContent.id, filteredSeasons[0].season_number);
    }
}

async function handleSeasonChange() {
    const seasonNum = parseInt(elements.seasonSelect.value);
    await loadEpisodes(state.currentContent.id, seasonNum);
}

async function loadEpisodes(showId, seasonNum) {
    try {
        const season = await tmdbFetch(`/tv/${showId}/season/${seasonNum}`);

        elements.episodesGrid.innerHTML = season.episodes.map(ep => `
            <div class="episode-card" data-episode="${ep.episode_number}">
                <div class="episode-number">Episode ${ep.episode_number}</div>
                <div class="episode-name">${ep.name || `Episode ${ep.episode_number}`}</div>
                ${ep.runtime ? `<div class="episode-runtime">${ep.runtime} min</div>` : ''}
            </div>
        `).join('');

        // Add click listeners
        elements.episodesGrid.querySelectorAll('.episode-card').forEach(card => {
            card.addEventListener('click', () => {
                const episodeNum = parseInt(card.dataset.episode);
                playTVContent(showId, seasonNum, episodeNum);
            });
        });
    } catch (error) {
        console.error('Error loading episodes:', error);
        elements.episodesGrid.innerHTML = '<p style="color: var(--text-muted);">Unable to load episodes</p>';
    }
}

async function loadSimilarContent(id, type) {
    try {
        const similar = await tmdbFetch(`/${type}/${id}/similar`);
        const items = similar.results.slice(0, 8);

        elements.similarGrid.innerHTML = items.map(item => createMovieCard(item, type)).join('');

        elements.similarGrid.querySelectorAll('.movie-card').forEach((card, index) => {
            card.addEventListener('click', () => {
                closeDetailModal();
                setTimeout(() => showDetailModal({ ...items[index], media_type: type }), 300);
            });
        });
    } catch (error) {
        console.error('Error loading similar content:', error);
    }
}

// ========================================
// PLAYER
// ========================================

function handleDetailPlay() {
    if (!state.currentContent) return;
    const type = state.currentContent.media_type || 'movie';

    if (type === 'tv') {
        const seasonNum = parseInt(elements.seasonSelect.value) || 1;
        playTVContent(state.currentContent.id, seasonNum, 1);
    } else {
        playContent(state.currentContent);
    }
}

function playContent(content, season = null, episode = null) {
    if (!content) return;

    const type = content.media_type || 'movie';
    const title = content.title || content.name;
    let playerUrl;

    if (type === 'tv' && season && episode) {
        playerUrl = `${CONFIG.VIDKING_BASE_URL}/tv/${content.id}/${season}/${episode}?color=${CONFIG.ACCENT_COLOR}&autoPlay=true&nextEpisode=true&episodeSelector=true`;
        elements.playerTitle.textContent = `${title} - S${season}:E${episode}`;
    } else {
        playerUrl = `${CONFIG.VIDKING_BASE_URL}/movie/${content.id}?color=${CONFIG.ACCENT_COLOR}&autoPlay=true`;
        elements.playerTitle.textContent = title;
    }

    // Add to continue watching
    addToContinueWatching(content, type, season, episode);

    elements.playerFrame.src = playerUrl;
    elements.playerModal.classList.add('active');
    closeDetailModal();
}

function playTVContent(showId, season, episode) {
    const content = { ...state.currentContent, id: showId };
    playContent(content, season, episode);
}

function closePlayerModal() {
    elements.playerModal.classList.remove('active');
    elements.playerFrame.src = '';
}

function handlePlayerMessage(event) {
    try {
        const data = JSON.parse(event.data);
        if (data.type === 'PLAYER_EVENT' && data.data) {
            const { id, mediaType, progress, season, episode } = data.data;

            // Save progress
            const key = `${mediaType}-${id}`;
            state.watchProgress[key] = Math.round(progress);
            saveToStorage();

            // Update continue watching progress
            updateContinueWatchingProgress(id, mediaType, progress, season, episode);
        }
    } catch (e) {
        // Ignore non-JSON messages
    }
}

// ========================================
// MY LIST
// ========================================

function handleAddToList() {
    if (!state.currentContent) return;

    const content = state.currentContent;
    const isInList = state.myList.some(item => item.id === content.id);

    if (isInList) {
        state.myList = state.myList.filter(item => item.id !== content.id);
        elements.addToList.classList.remove('active');
        elements.addToList.title = 'Add to My List';
    } else {
        state.myList.push({
            id: content.id,
            title: content.title || content.name,
            poster_path: content.poster_path,
            backdrop_path: content.backdrop_path,
            vote_average: content.vote_average,
            release_date: content.release_date || content.first_air_date,
            media_type: content.media_type || 'movie'
        });
        elements.addToList.classList.add('active');
        elements.addToList.title = 'Remove from My List';
    }

    saveToStorage();
    updateMyListRow();
}

function updateMyListRow() {
    const container = document.getElementById('myList');
    if (!container) return;

    if (state.myList.length === 0) {
        elements.myListRow.style.display = 'none';
        return;
    }

    elements.myListRow.style.display = 'block';
    container.innerHTML = state.myList.map(item => createMovieCard(item, item.media_type)).join('');

    container.querySelectorAll('.movie-card').forEach((card, index) => {
        const item = state.myList[index];
        attachCardEventListeners(card, item);
    });
}

// ========================================
// CONTINUE WATCHING
// ========================================

function addToContinueWatching(content, type, season = null, episode = null) {
    const existingIndex = state.continueWatching.findIndex(item => item.id === content.id);

    const watchItem = {
        id: content.id,
        title: content.title || content.name,
        poster_path: content.poster_path,
        backdrop_path: content.backdrop_path,
        vote_average: content.vote_average,
        release_date: content.release_date || content.first_air_date,
        media_type: type,
        season,
        episode,
        timestamp: Date.now()
    };

    if (existingIndex >= 0) {
        state.continueWatching[existingIndex] = watchItem;
    } else {
        state.continueWatching.unshift(watchItem);
    }

    // Keep only last 20 items
    state.continueWatching = state.continueWatching.slice(0, 20);
    saveToStorage();
    updateContinueWatchingRow();
}

function updateContinueWatchingProgress(id, type, progress, season, episode) {
    const item = state.continueWatching.find(i => i.id == id);
    if (item) {
        item.progress = progress;
        item.season = season;
        item.episode = episode;
        saveToStorage();
    }
}

function updateContinueWatchingRow() {
    const container = document.getElementById('continueWatching');
    if (!container) return;

    // Filter items with progress
    const itemsWithProgress = state.continueWatching.filter(item => {
        const key = `${item.media_type}-${item.id}`;
        return state.watchProgress[key] > 0 && state.watchProgress[key] < 95;
    });

    if (itemsWithProgress.length === 0) {
        elements.continueWatchingRow.style.display = 'none';
        return;
    }

    elements.continueWatchingRow.style.display = 'block';
    container.innerHTML = itemsWithProgress.map(item => createMovieCard(item, item.media_type)).join('');

    container.querySelectorAll('.movie-card').forEach((card, index) => {
        const item = itemsWithProgress[index];
        attachCardEventListeners(card, item, true); // true = is continue watching
    });
}

// Helper function to attach event listeners to cards
function attachCardEventListeners(card, item, isContinueWatching = false) {
    const type = item.media_type || 'movie';

    // Play button click
    const playBtn = card.querySelector('.play-btn');
    if (playBtn) {
        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isContinueWatching && type === 'tv' && item.season && item.episode) {
                playContent(item, item.season, item.episode);
            } else if (type === 'tv') {
                showDetailModal(item);
            } else {
                playContent(item);
            }
        });
    }

    // Info button click
    const infoBtn = card.querySelector('.info-btn');
    if (infoBtn) {
        infoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showDetailModal(item);
        });
    }

    // Card click
    card.addEventListener('click', () => showDetailModal(item));
}

// ========================================
// SEARCH
// ========================================

function toggleSearch() {
    elements.searchContainer.classList.toggle('active');
    if (elements.searchContainer.classList.contains('active')) {
        elements.searchInput.focus();
    } else {
        elements.searchInput.value = '';
        hideSearchResults();
    }
}

function handleSearchInput(e) {
    const query = e.target.value.trim();

    clearTimeout(state.searchTimeout);

    if (query.length < 2) {
        hideSearchResults();
        return;
    }

    state.searchTimeout = setTimeout(() => performSearch(query), 300);
}

async function performSearch(query) {
    try {
        const results = await tmdbFetch('/search/multi', { query });

        // Filter to only movies and TV shows
        const filtered = results.results.filter(item =>
            item.media_type === 'movie' || item.media_type === 'tv'
        ).sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

        if (filtered.length === 0) {
            elements.searchGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;">No results found</p>';
        } else {
            elements.searchGrid.innerHTML = filtered.map(item =>
                createMovieCard(item, item.media_type)
            ).join('');

            elements.searchGrid.querySelectorAll('.movie-card').forEach((card, index) => {
                card.addEventListener('click', () => {
                    hideSearchResults();
                    showDetailModal(filtered[index]);
                });
            });
        }

        showSearchResults();
    } catch (error) {
        console.error('Search error:', error);
    }
}

function showSearchResults() {
    elements.searchResults.style.display = 'block';
    elements.contentRows.style.display = 'none';
    elements.hero.style.display = 'none';
}

function hideSearchResults() {
    elements.searchResults.style.display = 'none';
    elements.contentRows.style.display = 'block';
    elements.hero.style.display = 'flex';
}

// ========================================
// NAVIGATION
// ========================================

function handleNavClick(e) {
    e.preventDefault();
    const section = e.target.dataset.section;

    elements.navLinks.forEach(link => link.classList.remove('active'));
    e.target.classList.add('active');

    // Reset search
    elements.searchInput.value = '';
    elements.searchContainer.classList.remove('active');
    hideSearchResults();

    switch (section) {
        case 'home':
            elements.hero.style.display = 'flex';
            showAllRows();
            break;
        case 'movies':
            elements.hero.style.display = 'flex';
            filterRowsByType('movie');
            break;
        case 'tvshows':
            elements.hero.style.display = 'flex';
            filterRowsByType('tv');
            break;
        case 'mylist':
            elements.hero.style.display = 'none';
            showOnlyMyList();
            break;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showAllRows() {
    document.querySelectorAll('.content-row').forEach(row => {
        if (row.id === 'myListRow') {
            row.style.display = state.myList.length > 0 ? 'block' : 'none';
        } else if (row.id === 'continueWatchingRow') {
            updateContinueWatchingRow();
        } else {
            row.style.display = 'block';
        }
    });
}

function filterRowsByType(type) {
    const movieRows = ['trendingMovies', 'popularMovies', 'topRatedMovies'];
    const tvRows = ['trendingTV', 'popularTV'];

    document.querySelectorAll('.content-row').forEach(row => {
        const rowContent = row.querySelector('.row-content');
        if (!rowContent) return;

        if (type === 'movie') {
            row.style.display = movieRows.includes(rowContent.id) ? 'block' : 'none';
        } else if (type === 'tv') {
            row.style.display = tvRows.includes(rowContent.id) ? 'block' : 'none';
        }
    });

    // Always hide continue watching and my list when filtering
    elements.continueWatchingRow.style.display = 'none';
    elements.myListRow.style.display = 'none';
}

function showOnlyMyList() {
    document.querySelectorAll('.content-row').forEach(row => {
        row.style.display = row.id === 'myListRow' ? 'block' : 'none';
    });

    if (state.myList.length === 0) {
        elements.myListRow.style.display = 'block';
        document.getElementById('myList').innerHTML = `
            <div style="color: var(--text-muted); text-align: center; padding: 60px 20px; width: 100%;">
                <p style="font-size: 1.2rem; margin-bottom: 8px;">Your list is empty</p>
                <p>Add movies and TV shows to watch later</p>
            </div>
        `;
    }
}

// ========================================
// UTILITIES
// ========================================

function handleScrollButton(e) {
    const btn = e.currentTarget;
    const row = btn.closest('.row-wrapper').querySelector('.row-content');
    const scrollAmount = row.clientWidth * 0.8;

    if (btn.classList.contains('scroll-left')) {
        row.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    } else {
        row.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
}

// TV Remote State
const tvRemoteState = {
    currentRowIndex: 0,
    currentCardIndex: 0,
    isNavigating: false,
    focusMode: false,
    navMode: false,
    navIndex: 0,
    modalMode: false,
    modalFocusIndex: 0,
    modalFocusableItems: []
};

function handleKeyboard(e) {
    // Don't handle if typing in search
    if (document.activeElement === elements.searchInput) {
        if (e.key === 'Escape') {
            elements.searchInput.blur();
            toggleSearch();
        }
        return;
    }

    // Handle player modal - only Escape works
    if (elements.playerModal.classList.contains('active')) {
        if (e.key === 'Escape' || e.key === 'Backspace') {
            e.preventDefault();
            closePlayerModal();
        }
        return;
    }

    // Handle detail modal navigation
    if (elements.detailModal.classList.contains('active')) {
        handleModalKeyboard(e);
        return;
    }

    // ========================================
    // QUICK PAGE NAVIGATION (Number Keys 1-4)
    // ========================================
    // 1 = Home, 2 = Movies, 3 = TV Shows, 4 = My List
    if (e.key === '1' || e.key === 'Digit1') {
        e.preventDefault();
        navigateToPage('home');
        return;
    } else if (e.key === '2' || e.key === 'Digit2') {
        e.preventDefault();
        navigateToPage('movies');
        return;
    } else if (e.key === '3' || e.key === 'Digit3') {
        e.preventDefault();
        navigateToPage('tvshows');
        return;
    } else if (e.key === '4' || e.key === 'Digit4') {
        e.preventDefault();
        navigateToPage('mylist');
        return;
    }

    // ========================================
    // TV REMOTE COLOR BUTTONS
    // ========================================
    // Red = Home, Green = Movies, Yellow = TV Shows, Blue = My List
    if (e.key === 'ColorF0Red' || e.key === 'F1') {
        e.preventDefault();
        navigateToPage('home');
        return;
    } else if (e.key === 'ColorF1Green' || e.key === 'F2') {
        e.preventDefault();
        navigateToPage('movies');
        return;
    } else if (e.key === 'ColorF2Yellow' || e.key === 'F3') {
        e.preventDefault();
        navigateToPage('tvshows');
        return;
    } else if (e.key === 'ColorF3Blue' || e.key === 'F4') {
        e.preventDefault();
        navigateToPage('mylist');
        return;
    }

    // ========================================
    // SEARCH SHORTCUT (S key or F5)
    // ========================================
    if (e.key === 's' || e.key === 'S' || e.key === 'F5') {
        e.preventDefault();
        toggleSearch();
        elements.searchInput.focus();
        return;
    }

    // Handle main navigation
    if (e.key === 'Escape') {
        if (elements.searchContainer.classList.contains('active')) {
            toggleSearch();
        } else if (tvRemoteState.navMode) {
            exitNavMode();
        } else if (tvRemoteState.focusMode) {
            exitFocusMode();
        }
    } else if (e.key === 'Tab') {
        // Tab to enter/cycle nav mode
        e.preventDefault();
        if (!tvRemoteState.navMode) {
            enterNavMode();
        } else {
            // Cycle through nav items
            tvRemoteState.navIndex = (tvRemoteState.navIndex + 1) % 5; // Home, Movies, TV Shows, My List, Search
            updateNavFocus();
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        // If at top of page or first row, enter nav mode
        if (tvRemoteState.currentRowIndex === 0 && !tvRemoteState.focusMode && !tvRemoteState.navMode && window.scrollY < 100) {
            enterNavMode();
            return;
        }
        if (tvRemoteState.navMode) {
            // Exit nav mode and go to content
            exitNavMode();
        } else if (tvRemoteState.focusMode) {
            exitFocusMode();
            navigateContentRows('up');
        } else {
            navigateContentRows('up');
        }
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (tvRemoteState.navMode) {
            exitNavMode();
            tvRemoteState.currentRowIndex = 0;
            // Auto-enter focus mode to start browsing cards
            enterFocusModeOnFirstRow();
        } else if (tvRemoteState.focusMode) {
            exitFocusMode();
            navigateContentRows('down');
        } else {
            navigateContentRows('down');
        }
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (tvRemoteState.navMode) {
            tvRemoteState.navIndex = Math.max(0, tvRemoteState.navIndex - 1);
            updateNavFocus();
        } else if (tvRemoteState.focusMode) {
            navigateWithinRow('left');
        } else {
            enterFocusModeAndNavigate('left');
        }
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (tvRemoteState.navMode) {
            tvRemoteState.navIndex = Math.min(4, tvRemoteState.navIndex + 1);
            updateNavFocus();
        } else if (tvRemoteState.focusMode) {
            navigateWithinRow('right');
        } else {
            enterFocusModeAndNavigate('right');
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (tvRemoteState.navMode) {
            selectNavItem();
        } else if (tvRemoteState.focusMode) {
            selectFocusedCard();
        } else {
            // If not in any mode, play hero content
            if (state.heroContent && elements.hero.style.display !== 'none') {
                playContent(state.heroContent);
            }
        }
    }
}

// Navigate to a specific page section
function navigateToPage(section) {
    const navLink = document.querySelector(`.nav-link[data-section="${section}"]`);
    if (navLink) {
        navLink.click();
        showRemoteIndicator(`📺 ${section.charAt(0).toUpperCase() + section.slice(1)}`);

        // Reset navigation state
        tvRemoteState.currentRowIndex = 0;
        tvRemoteState.currentCardIndex = 0;
        exitFocusMode();
        exitNavMode();
    }
}

// Enter focus mode on the first visible row
function enterFocusModeOnFirstRow() {
    const visibleRows = Array.from(document.querySelectorAll('.content-row'))
        .filter(row => row.style.display !== 'none' && row.offsetHeight > 0);

    if (visibleRows.length === 0) return;

    tvRemoteState.currentRowIndex = 0;
    tvRemoteState.focusMode = true;
    tvRemoteState.currentCardIndex = 0;

    const firstRow = visibleRows[0];
    scrollToRow(firstRow);
    updateFocusedCard(firstRow);
}

// Initialize TV remote navigation
function initTVRemoteNavigation() {
    // Show navigation hint on first visit
    const hasSeenHint = localStorage.getItem('powder_tv_hint_seen');

    if (!hasSeenHint) {
        setTimeout(() => {
            showTVNavigationHint();
            localStorage.setItem('powder_tv_hint_seen', 'true');
        }, 2000);
    }

    // Show a brief indicator that remote navigation is available
    setTimeout(() => {
        showRemoteIndicator('📺 Use arrow keys to navigate');
    }, 1500);
}

// Show TV navigation hint overlay
function showTVNavigationHint() {
    const hint = document.createElement('div');
    hint.className = 'tv-navigation-hint';
    hint.innerHTML = `
        <div class="tv-hint-content">
            <h2>📺 Remote Navigation</h2>
            <div class="tv-hint-grid">
                <div class="tv-hint-item">
                    <span class="tv-hint-key">↑↓←→</span>
                    <span class="tv-hint-desc">Navigate</span>
                </div>
                <div class="tv-hint-item">
                    <span class="tv-hint-key">Enter</span>
                    <span class="tv-hint-desc">Select</span>
                </div>
                <div class="tv-hint-item">
                    <span class="tv-hint-key">1-4</span>
                    <span class="tv-hint-desc">Pages</span>
                </div>
                <div class="tv-hint-item">
                    <span class="tv-hint-key">S</span>
                    <span class="tv-hint-desc">Search</span>
                </div>
            </div>
            <p class="tv-hint-footer">Click anywhere or press any key to continue</p>
        </div>
    `;
    document.body.appendChild(hint);

    // Animate in
    setTimeout(() => hint.classList.add('show'), 10);

    // Remove on any key press or click
    const removeHint = () => {
        hint.classList.remove('show');
        setTimeout(() => hint.remove(), 300);
        document.removeEventListener('keydown', removeHint);
        hint.removeEventListener('click', removeHint);
    };
    document.addEventListener('keydown', removeHint);
    hint.addEventListener('click', removeHint);

    // Auto-remove after 8 seconds
    setTimeout(removeHint, 8000);
}

// Nav mode functions
function enterNavMode() {
    tvRemoteState.navMode = true;
    tvRemoteState.focusMode = false;
    clearCardFocus();

    // Find currently active nav item
    const navItems = Array.from(elements.navLinks);
    const activeIndex = navItems.findIndex(link => link.classList.contains('active'));
    tvRemoteState.navIndex = activeIndex >= 0 ? activeIndex : 0;

    updateNavFocus();
    showRemoteIndicator('Navigation: Use ←→ to browse, Enter to select');
}

function exitNavMode() {
    tvRemoteState.navMode = false;
    clearNavFocus();
}

function updateNavFocus() {
    clearNavFocus();

    // Nav items: Home(0), Movies(1), TV Shows(2), My List(3), Search(4)
    const navItems = Array.from(elements.navLinks);

    if (tvRemoteState.navIndex < navItems.length) {
        navItems[tvRemoteState.navIndex].classList.add('tv-nav-focused');
        showRemoteIndicator(navItems[tvRemoteState.navIndex].textContent);
    } else if (tvRemoteState.navIndex === 4) {
        // Focus search
        elements.searchToggle.classList.add('tv-nav-focused');
        showRemoteIndicator('Search');
    }
}

function clearNavFocus() {
    elements.navLinks.forEach(link => link.classList.remove('tv-nav-focused'));
    elements.searchToggle.classList.remove('tv-nav-focused');
}

function selectNavItem() {
    const navItems = Array.from(elements.navLinks);

    if (tvRemoteState.navIndex < navItems.length) {
        navItems[tvRemoteState.navIndex].click();
        exitNavMode();
    } else if (tvRemoteState.navIndex === 4) {
        // Activate search
        toggleSearch();
        elements.searchInput.focus();
        exitNavMode();
    }
}

// Modal keyboard handling
function handleModalKeyboard(e) {
    if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        closeDetailModal();
        exitModalMode();
        return;
    }

    // Initialize modal navigation on first key press
    if (!tvRemoteState.modalMode) {
        initModalNavigation();
    }

    if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateModal('up');
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateModal('down');
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateModal('left');
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateModal('right');
    } else if (e.key === 'Enter') {
        e.preventDefault();
        selectModalItem();
    }
}

function initModalNavigation() {
    tvRemoteState.modalMode = true;
    tvRemoteState.modalFocusIndex = 0;

    // Build list of focusable items in modal
    updateModalFocusableItems();
    updateModalFocus();
}

function updateModalFocusableItems() {
    tvRemoteState.modalFocusableItems = [];

    // Add play button
    const playBtn = elements.detailPlay;
    if (playBtn) {
        tvRemoteState.modalFocusableItems.push({ type: 'button', element: playBtn, label: 'Play' });
    }

    // Add to list button
    const addBtn = elements.addToList;
    if (addBtn) {
        tvRemoteState.modalFocusableItems.push({ type: 'button', element: addBtn, label: 'Add to List' });
    }

    // Add season selector if visible
    const seasonSelect = elements.seasonSelect;
    if (seasonSelect && elements.episodeSelector.style.display !== 'none') {
        tvRemoteState.modalFocusableItems.push({ type: 'select', element: seasonSelect, label: 'Season' });
    }

    // Add episode cards if visible
    if (elements.episodeSelector.style.display !== 'none') {
        const episodes = elements.episodesGrid.querySelectorAll('.episode-card');
        episodes.forEach((ep, i) => {
            tvRemoteState.modalFocusableItems.push({
                type: 'episode',
                element: ep,
                label: `Episode ${i + 1}`,
                episodeNum: i + 1
            });
        });
    }

    // Add similar titles
    const similarItems = elements.similarGrid.querySelectorAll('.movie-card');
    similarItems.forEach((item, i) => {
        const title = item.querySelector('.card-title')?.textContent || 'Related Title';
        tvRemoteState.modalFocusableItems.push({
            type: 'similar',
            element: item,
            label: `Related: ${title}`
        });
    });
}

function navigateModal(direction) {
    const items = tvRemoteState.modalFocusableItems;
    if (items.length === 0) return;

    // Simple navigation through focusable items
    if (direction === 'down' || direction === 'right') {
        tvRemoteState.modalFocusIndex = Math.min(tvRemoteState.modalFocusIndex + 1, items.length - 1);
    } else if (direction === 'up' || direction === 'left') {
        tvRemoteState.modalFocusIndex = Math.max(tvRemoteState.modalFocusIndex - 1, 0);
    }

    updateModalFocus();

    // Show current selection
    const item = items[tvRemoteState.modalFocusIndex];
    if (item) {
        showRemoteIndicator(item.label);
    }
}

function updateModalFocus() {
    // Clear all modal focuses
    document.querySelectorAll('.tv-modal-focused').forEach(el => el.classList.remove('tv-modal-focused'));

    const items = tvRemoteState.modalFocusableItems;
    if (items.length === 0) return;

    const currentItem = items[tvRemoteState.modalFocusIndex];
    if (currentItem && currentItem.element) {
        currentItem.element.classList.add('tv-modal-focused');

        // Scroll into view if needed
        currentItem.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function selectModalItem() {
    const items = tvRemoteState.modalFocusableItems;
    if (items.length === 0) return;

    const currentItem = items[tvRemoteState.modalFocusIndex];
    if (!currentItem) return;

    if (currentItem.type === 'button') {
        currentItem.element.click();
    } else if (currentItem.type === 'select') {
        // Cycle through seasons
        const select = currentItem.element;
        const currentIndex = select.selectedIndex;
        select.selectedIndex = (currentIndex + 1) % select.options.length;
        select.dispatchEvent(new Event('change'));

        // Update focusable items after season change
        setTimeout(() => {
            updateModalFocusableItems();
        }, 500);
    } else if (currentItem.type === 'episode' || currentItem.type === 'similar') {
        currentItem.element.click();
    }
}

function exitModalMode() {
    tvRemoteState.modalMode = false;
    tvRemoteState.modalFocusIndex = 0;
    tvRemoteState.modalFocusableItems = [];
    document.querySelectorAll('.tv-modal-focused').forEach(el => el.classList.remove('tv-modal-focused'));
}

function navigateContentRows(direction) {
    // Don't navigate if modal is open
    if (elements.playerModal.classList.contains('active') ||
        elements.detailModal.classList.contains('active') ||
        elements.searchResults.style.display === 'block') {
        return;
    }

    const visibleRows = Array.from(document.querySelectorAll('.content-row'))
        .filter(row => row.style.display !== 'none' && row.offsetHeight > 0);

    if (visibleRows.length === 0) return;

    // Update current row index
    if (direction === 'down') {
        tvRemoteState.currentRowIndex = Math.min(tvRemoteState.currentRowIndex + 1, visibleRows.length - 1);
    } else {
        // Special handling for up - if at first row, go to hero
        if (tvRemoteState.currentRowIndex === 0) {
            scrollToHero();
            return;
        }
        tvRemoteState.currentRowIndex = Math.max(tvRemoteState.currentRowIndex - 1, 0);
    }

    const targetRow = visibleRows[tvRemoteState.currentRowIndex];
    scrollToRow(targetRow);
}

function scrollToHero() {
    tvRemoteState.currentRowIndex = 0;
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
    showRemoteIndicator('↑ Back to Top');
}

function scrollToRow(row) {
    if (!row) return;

    tvRemoteState.isNavigating = true;

    // Calculate position to center the row
    const rowTop = row.getBoundingClientRect().top + window.scrollY;
    const offset = window.innerHeight * 0.25; // Center-ish position
    const scrollTo = rowTop - offset;

    window.scrollTo({
        top: scrollTo,
        behavior: 'smooth'
    });

    // Highlight the row temporarily
    highlightRow(row);

    // Show which row we're on
    const rowTitle = row.querySelector('.row-title')?.textContent || 'Content Row';
    showRemoteIndicator(rowTitle);

    setTimeout(() => {
        tvRemoteState.isNavigating = false;
    }, 600);
}

function highlightRow(row) {
    // Remove previous highlights
    document.querySelectorAll('.content-row').forEach(r => r.classList.remove('tv-remote-highlight'));

    // Add highlight to current row
    row.classList.add('tv-remote-highlight');

    // Remove highlight after animation
    setTimeout(() => {
        row.classList.remove('tv-remote-highlight');
    }, 1500);
}

function showRemoteIndicator(text) {
    // Remove existing indicator
    const existing = document.getElementById('tvRemoteIndicator');
    if (existing) {
        existing.remove();
    }

    // Create new indicator
    const indicator = document.createElement('div');
    indicator.id = 'tvRemoteIndicator';
    indicator.className = 'tv-remote-indicator';
    indicator.textContent = text;
    document.body.appendChild(indicator);

    // Trigger animation
    setTimeout(() => {
        indicator.classList.add('show');
    }, 10);

    // Remove after animation
    setTimeout(() => {
        indicator.classList.remove('show');
        setTimeout(() => {
            indicator.remove();
        }, 300);
    }, 2000);
}

function enterFocusModeAndNavigate(direction) {
    const visibleRows = Array.from(document.querySelectorAll('.content-row'))
        .filter(row => row.style.display !== 'none' && row.offsetHeight > 0);

    if (visibleRows.length === 0) return;

    const currentRow = visibleRows[tvRemoteState.currentRowIndex];
    if (!currentRow) return;

    tvRemoteState.focusMode = true;
    tvRemoteState.currentCardIndex = 0;

    updateFocusedCard(currentRow);
    navigateWithinRow(direction);
}

function exitFocusMode() {
    tvRemoteState.focusMode = false;
    clearCardFocus();
}

function navigateWithinRow(direction) {
    const visibleRows = Array.from(document.querySelectorAll('.content-row'))
        .filter(row => row.style.display !== 'none' && row.offsetHeight > 0);

    const currentRow = visibleRows[tvRemoteState.currentRowIndex];
    if (!currentRow) return;

    const cards = Array.from(currentRow.querySelectorAll('.movie-card'));
    if (cards.length === 0) return;

    if (direction === 'right') {
        tvRemoteState.currentCardIndex = Math.min(tvRemoteState.currentCardIndex + 1, cards.length - 1);
    } else {
        tvRemoteState.currentCardIndex = Math.max(tvRemoteState.currentCardIndex - 1, 0);
    }

    updateFocusedCard(currentRow);
    scrollCardIntoView(cards[tvRemoteState.currentCardIndex], currentRow);
}

function updateFocusedCard(row) {
    const cards = Array.from(row.querySelectorAll('.movie-card'));

    // Clear all focuses
    cards.forEach(card => card.classList.remove('tv-focused'));

    // Focus current card
    if (cards[tvRemoteState.currentCardIndex]) {
        cards[tvRemoteState.currentCardIndex].classList.add('tv-focused');
    }
}

function clearCardFocus() {
    document.querySelectorAll('.movie-card').forEach(card => {
        card.classList.remove('tv-focused');
    });
}

function scrollCardIntoView(card, row) {
    if (!card) return;

    const rowContent = row.querySelector('.row-content');
    if (!rowContent) return;

    const cardRect = card.getBoundingClientRect();
    const rowRect = rowContent.getBoundingClientRect();

    // Calculate if card is out of view
    const cardLeft = card.offsetLeft;
    const cardWidth = card.offsetWidth;
    const scrollLeft = rowContent.scrollLeft;
    const rowWidth = rowContent.clientWidth;

    // Scroll to keep card centered
    const targetScroll = cardLeft - (rowWidth / 2) + (cardWidth / 2);

    rowContent.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
    });
}

function selectFocusedCard() {
    const visibleRows = Array.from(document.querySelectorAll('.content-row'))
        .filter(row => row.style.display !== 'none' && row.offsetHeight > 0);

    const currentRow = visibleRows[tvRemoteState.currentRowIndex];
    if (!currentRow) return;

    const cards = Array.from(currentRow.querySelectorAll('.movie-card'));
    const focusedCard = cards[tvRemoteState.currentCardIndex];

    if (focusedCard) {
        // Trigger click on the focused card
        focusedCard.click();
        exitFocusMode();
    }
}

function handlePosterError(img) {
    const maxRetries = 3;
    let retries = parseInt(img.dataset.retries || '0');

    if (retries < maxRetries) {
        retries++;
        img.dataset.retries = retries;

        // Add a small delay before retrying
        setTimeout(() => {
            const currentSrc = img.src;
            const url = new URL(currentSrc);
            // Add or update retry timestamp to bypass potential browser cache of failed request
            url.searchParams.set('retry', Date.now());
            img.src = url.toString();
        }, 1000 * retries); // 1s, 2s, 3s delay
    } else {
        // Fallback to placeholder after all retries fail
        img.onerror = null; // Prevent infinite loop
        img.parentElement.classList.add('image-error'); // Add class for potential styling
        img.src = 'https://via.placeholder.com/342x513/1a1a1a/808080?text=No+Image';
    }
}
