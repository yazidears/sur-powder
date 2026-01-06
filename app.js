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

    // Add click listeners
    container.querySelectorAll('.movie-card').forEach((card, index) => {
        card.addEventListener('click', () => showDetailModal({ ...items[index], media_type: type }));
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
            <img src="${posterUrl}" alt="${title}" class="card-poster" loading="lazy" 
                 onerror="this.src='https://via.placeholder.com/342x513/1a1a1a/808080?text=No+Image'">
            ${type === 'tv' ? '<span class="card-type-badge">Series</span>' : ''}
            <div class="card-info">
                <h3 class="card-title">${title}</h3>
                <div class="card-meta">
                    <span class="rating">★ ${rating}</span>
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
        card.addEventListener('click', () => showDetailModal(state.myList[index]));
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
        card.addEventListener('click', () => {
            const item = itemsWithProgress[index];
            if (item.media_type === 'tv' && item.season && item.episode) {
                playContent(item, item.season, item.episode);
            } else {
                showDetailModal(item);
            }
        });
    });
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
        );

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

function handleKeyboard(e) {
    if (e.key === 'Escape') {
        if (elements.playerModal.classList.contains('active')) {
            closePlayerModal();
        } else if (elements.detailModal.classList.contains('active')) {
            closeDetailModal();
        } else if (elements.searchContainer.classList.contains('active')) {
            toggleSearch();
        }
    }
}
