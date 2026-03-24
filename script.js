// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    // Replace with your deployed Google Apps Script Web App URL
    API_BASE_URL: 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL',
    
    // Token expiry time (24 hours in milliseconds)
    TOKEN_EXPIRY: 24 * 60 * 60 * 1000,
    
    // Toast notification duration (ms)
    TOAST_DURATION: 4000,
    
    // Debounce delay for search (ms)
    SEARCH_DEBOUNCE: 300
};

// ============================================
// STATE MANAGEMENT
// ============================================
const state = {
    user: null,
    token: null,
    links: [],
    filteredLinks: [],
    allTags: [],
    currentView: 'grid',
    isLoading: false,
    editingLinkId: null
};

// ============================================
// DOM ELEMENTS
// ============================================
const DOM = {
    // Loading
    loadingOverlay: document.getElementById('loading-overlay'),
    
    // Toast
    toastContainer: document.getElementById('toast-container'),
    
    // Auth
    authSection: document.getElementById('auth-section'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    showRegisterLink: document.getElementById('show-register'),
    showLoginLink: document.getElementById('show-login'),
    
    // Dashboard
    dashboardSection: document.getElementById('dashboard-section'),
    linksContainer: document.getElementById('links-container'),
    linksCount: document.getElementById('links-count'),
    emptyState: document.getElementById('empty-state'),
    noResults: document.getElementById('no-results'),
    
    // Navigation
    userMenu: document.getElementById('user-menu'),
    userEmail: document.getElementById('user-email'),
    logoutBtn: document.getElementById('logout-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    
    // Search & Filter
    searchInput: document.getElementById('search-input'),
    clearSearch: document.getElementById('clear-search'),
    tagFilter: document.getElementById('tag-filter'),
    gridViewBtn: document.getElementById('grid-view'),
    listViewBtn: document.getElementById('list-view'),
    
    // Add Link
    addLinkBtn: document.getElementById('add-link-btn'),
    
    // Link Modal
    linkModal: document.getElementById('link-modal'),
    modalTitle: document.getElementById('modal-title'),
    linkForm: document.getElementById('link-form'),
    linkIdInput: document.getElementById('link-id'),
    linkUrlInput: document.getElementById('link-url'),
    linkTitleInput: document.getElementById('link-title'),
    linkTagsInput: document.getElementById('link-tags'),
    linkNotesInput: document.getElementById('link-notes'),
    fetchTitleBtn: document.getElementById('fetch-title'),
    closeModalBtn: document.getElementById('close-modal'),
    cancelModalBtn: document.getElementById('cancel-modal'),
    
    // Delete Modal
    deleteModal: document.getElementById('delete-modal'),
    confirmDeleteBtn: document.getElementById('confirm-delete'),
    deleteModalCloseButtons: document.querySelectorAll('.close-delete-modal'),
    deleteLinkTitle: document.querySelector('.delete-link-title')
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Show loading overlay
 */
function showLoading() {
    state.isLoading = true;
    DOM.loadingOverlay.classList.remove('hidden');
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    state.isLoading = false;
    DOM.loadingOverlay.classList.add('hidden');
}

/**
 * Show toast notification
 * @param {string} message - Toast message
 * @param {string} type - Toast type (success, error, warning, info)
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    DOM.toastContainer.appendChild(toast);
    
    // Remove toast after duration
    setTimeout(() => {
        toast.style.animation = 'slideIn var(--transition-normal) ease-out reverse';
        setTimeout(() => toast.remove(), 250);
    }, CONFIG.TOAST_DURATION);
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Sanitize HTML to prevent XSS
 * @param {string} str - String to sanitize
 */
function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Format date to readable string
 * @param {string} dateStr - ISO date string
 */
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

/**
 * Get favicon URL for a given URL
 * @param {string} url - Website URL
 */
function getFaviconUrl(url) {
    try {
        const urlObj = new URL(url);
        return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
    } catch {
        return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔗</text></svg>';
    }
}

/**
 * Generate a unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ============================================
// LOCAL STORAGE FUNCTIONS
// ============================================

/**
 * Save authentication data to localStorage
 */
function saveAuthData(user, token) {
    const authData = {
        user,
        token,
        expiry: Date.now() + CONFIG.TOKEN_EXPIRY
    };
    localStorage.setItem('linkVault_auth', JSON.stringify(authData));
}

/**
 * Get authentication data from localStorage
 */
function getAuthData() {
    try {
        const data = JSON.parse(localStorage.getItem('linkVault_auth'));
        if (data && data.expiry > Date.now()) {
            return data;
        }
        // Token expired, clear it
        localStorage.removeItem('linkVault_auth');
        return null;
    } catch {
        return null;
    }
}

/**
 * Clear authentication data
 */
function clearAuthData() {
    localStorage.removeItem('linkVault_auth');
}

/**
 * Save theme preference
 */
function saveTheme(theme) {
    localStorage.setItem('linkVault_theme', theme);
}

/**
 * Get theme preference
 */
function getTheme() {
    return localStorage.getItem('linkVault_theme') || 'light';
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Make API request
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {object} data - Request data
 */
async function apiRequest(endpoint, method = 'GET', data = null) {
    const options = {
        method: method === 'GET' ? 'GET' : 'POST',
        headers: {
            'Content-Type': 'text/plain'
        }
    };
    
    // Build request body
    const requestBody = {
        action: endpoint,
        method: method,
        ...data
    };
    
    // Add token if available
    if (state.token) {
        requestBody.token = state.token;
    }
    
    // For Apps Script, we use POST for all data operations
    if (method !== 'GET' || data) {
        options.method = 'POST';
        options.body = JSON.stringify(requestBody);
    }
    
    // Build URL
    let url = CONFIG.API_BASE_URL;
    if (method === 'GET' && !data) {
        url += `?action=${endpoint}`;
        if (state.token) {
            url += `&token=${state.token}`;
        }
    }
    
    try {
        const response = await fetch(url, options);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'API request failed');
        }
        
        return result;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================

/**
 * Register new user
 */
async function registerUser(email, password) {
    showLoading();
    
    try {
        const result = await apiRequest('register', 'POST', { email, password });
        
        state.user = result.user;
        state.token = result.token;
        
        saveAuthData(state.user, state.token);
        
        showToast('Account created successfully!', 'success');
        showDashboard();
        
    } catch (error) {
        showToast(error.message || 'Registration failed', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Login user
 */
async function loginUser(email, password) {
    showLoading();
    
    try {
        const result = await apiRequest('login', 'POST', { email, password });
        
        state.user = result.user;
        state.token = result.token;
        
        saveAuthData(state.user, state.token);
        
        showToast('Logged in successfully!', 'success');
        showDashboard();
        
    } catch (error) {
        showToast(error.message || 'Login failed', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Logout user
 */
function logoutUser() {
    state.user = null;
    state.token = null;
    state.links = [];
    state.filteredLinks = [];
    
    clearAuthData();
    
    showAuth();
    showToast('Logged out successfully', 'success');
}

/**
 * Check and restore session
 */
function restoreSession() {
    const authData = getAuthData();
    
    if (authData) {
        state.user = authData.user;
        state.token = authData.token;
        showDashboard();
    } else {
        showAuth();
    }
}

// ============================================
// LINK CRUD FUNCTIONS
// ============================================

/**
 * Fetch all links for current user
 */
async function fetchLinks() {
    showLoading();
    
    try {
        const result = await apiRequest('getLinks', 'GET');
        
        state.links = result.links || [];
        state.filteredLinks = [...state.links];
        
        updateAllTags();
        renderLinks();
        updateLinksCount();
        
    } catch (error) {
        showToast('Failed to fetch links', 'error');
        console.error('Fetch links error:', error);
    } finally {
        hideLoading();
    }
}

/**
 * Add new link
 */
async function addLink(linkData) {
    showLoading();
    
    try {
        const result = await apiRequest('addLink', 'POST', { link: linkData });
        
        state.links.unshift(result.link);
        state.filteredLinks = [...state.links];
        
        updateAllTags();
        renderLinks();
        updateLinksCount();
        closeModal();
        
        showToast('Link added successfully!', 'success');
        
    } catch (error) {
        showToast(error.message || 'Failed to add link', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Update existing link
 */
async function updateLink(linkId, linkData) {
    showLoading();
    
    try {
        const result = await apiRequest('updateLink', 'PUT', { 
            link_id: linkId, 
            link: linkData 
        });
        
        // Update local state
        const index = state.links.findIndex(l => l.link_id === linkId);
        if (index !== -1) {
            state.links[index] = result.link;
        }
        
        state.filteredLinks = [...state.links];
        
        updateAllTags();
        applyFilters();
        closeModal();
        
        showToast('Link updated successfully!', 'success');
        
    } catch (error) {
        showToast(error.message || 'Failed to update link', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Delete link
 */
async function deleteLink(linkId) {
    showLoading();
    
    try {
        await apiRequest('deleteLink', 'DELETE', { link_id: linkId });
        
        // Remove from local state
        state.links = state.links.filter(l => l.link_id !== linkId);
        state.filteredLinks = state.filteredLinks.filter(l => l.link_id !== linkId);
        
        updateAllTags();
        renderLinks();
        updateLinksCount();
        closeDeleteModal();
        
        showToast('Link deleted successfully!', 'success');
        
    } catch (error) {
        showToast(error.message || 'Failed to delete link', 'error');
    } finally {
        hideLoading();
    }
}

// ============================================
// UI RENDERING FUNCTIONS
// ============================================

/**
 * Show authentication section
 */
function showAuth() {
    DOM.authSection.classList.remove('hidden');
    DOM.dashboardSection.classList.add('hidden');
    DOM.userMenu.classList.add('hidden');
}

/**
 * Show dashboard section
 */
function showDashboard() {
    DOM.authSection.classList.add('hidden');
    DOM.dashboardSection.classList.remove('hidden');
    DOM.userMenu.classList.remove('hidden');
    
    DOM.userEmail.textContent = state.user?.email || '';
    
    fetchLinks();
}

/**
 * Update links count display
 */
function updateLinksCount() {
    const count = state.filteredLinks.length;
    DOM.linksCount.textContent = `${count} link${count !== 1 ? 's' : ''} saved`;
}

/**
 * Update all tags list
 */
function updateAllTags() {
    const tagsSet = new Set();
    
    state.links.forEach(link => {
        if (link.tags) {
            const tags = link.tags.split(',').map(t => t.trim()).filter(t => t);
            tags.forEach(tag => tagsSet.add(tag));
        }
    });
    
    state.allTags = Array.from(tagsSet).sort();
    
    // Update tag filter dropdown
    DOM.tagFilter.innerHTML = '<option value="">All Tags</option>';
    state.allTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        DOM.tagFilter.appendChild(option);
    });
}

/**
 * Render links to the container
 */
function renderLinks() {
    DOM.linksContainer.innerHTML = '';
    
    if (state.filteredLinks.length === 0) {
        if (state.links.length === 0) {
            DOM.emptyState.classList.remove('hidden');
            DOM.noResults.classList.add('hidden');
        } else {
            DOM.emptyState.classList.add('hidden');
            DOM.noResults.classList.remove('hidden');
        }
        return;
    }
    
    DOM.emptyState.classList.add('hidden');
    DOM.noResults.classList.add('hidden');
    
    state.filteredLinks.forEach(link => {
        const card = createLinkCard(link);
        DOM.linksContainer.appendChild(card);
    });
}

/**
 * Create a link card element
 */
function createLinkCard(link) {
    const card = document.createElement('article');
    card.className = 'link-card';
    card.dataset.linkId = link.link_id;
    
    // Parse tags
    const tags = link.tags 
        ? link.tags.split(',').map(t => t.trim()).filter(t => t) 
        : [];
    
    // Create tags HTML
    const tagsHTML = tags.length > 0 
        ? `<div class="card-tags">${tags.map(tag => 
            `<span class="tag">${sanitizeHTML(tag)}</span>`
          ).join('')}</div>` 
        : '';
    
    // Create notes HTML
    const notesHTML = link.notes 
        ? `<p class="card-notes">${sanitizeHTML(link.notes)}</p>` 
        : '';
    
    card.innerHTML = `
        <div class="card-header">
            <img 
                src="${getFaviconUrl(link.url)}" 
                alt="" 
                class="favicon"
                onerror="this.src='data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><text y=\".9em\" font-size=\"90\">🔗</text></svg>'"
            >
            <div class="card-title-section">
                <h3 class="card-title">${sanitizeHTML(link.title)}</h3>
                <div class="card-url">
                    <a href="${sanitizeHTML(link.url)}" target="_blank" rel="noopener noreferrer">
                        ${sanitizeHTML(link.url)}
                    </a>
                    <button class="copy-url" title="Copy URL" data-url="${sanitizeHTML(link.url)}">
                        📋
                    </button>
                </div>
            </div>
        </div>
        ${notesHTML}
        ${tagsHTML}
        <div class="card-footer">
            <span class="card-date">${formatDate(link.created_at)}</span>
            <div class="card-actions">
                <button class="card-action-btn edit" title="Edit" data-link-id="${link.link_id}">
                    ✏️
                </button>
                <button class="card-action-btn delete" title="Delete" data-link-id="${link.link_id}">
                    🗑️
                </button>
            </div>
        </div>
    `;
    
    return card;
}

// ============================================
// FILTER & SEARCH FUNCTIONS
// ============================================

/**
 * Apply all filters (search and tag)
 */
function applyFilters() {
    const searchTerm = DOM.searchInput.value.toLowerCase().trim();
    const selectedTag = DOM.tagFilter.value;
    
    state.filteredLinks = state.links.filter(link => {
        // Search filter
        const matchesSearch = !searchTerm || 
            link.title.toLowerCase().includes(searchTerm) ||
            link.url.toLowerCase().includes(searchTerm) ||
            (link.notes && link.notes.toLowerCase().includes(searchTerm)) ||
            (link.tags && link.tags.toLowerCase().includes(searchTerm));
        
        // Tag filter
        const matchesTag = !selectedTag || 
            (link.tags && link.tags.split(',').map(t => t.trim()).includes(selectedTag));
        
        return matchesSearch && matchesTag;
    });
    
    renderLinks();
    updateLinksCount();
    
    // Show/hide clear search button
    DOM.clearSearch.classList.toggle('hidden', !searchTerm);
}

// Debounced search function
const debouncedSearch = debounce(applyFilters, CONFIG.SEARCH_DEBOUNCE);

// ============================================
// MODAL FUNCTIONS
// ============================================

/**
 * Open link modal for adding
 */
function openAddModal() {
    state.editingLinkId = null;
    DOM.modalTitle.textContent = 'Add New Link';
    DOM.linkForm.reset();
    DOM.linkIdInput.value = '';
    DOM.linkModal.classList.remove('hidden');
    DOM.linkUrlInput.focus();
}

/**
 * Open link modal for editing
 */
function openEditModal(linkId) {
    const link = state.links.find(l => l.link_id === linkId);
    if (!link) return;
    
    state.editingLinkId = linkId;
    DOM.modalTitle.textContent = 'Edit Link';
    
    DOM.linkIdInput.value = link.link_id;
    DOM.linkUrlInput.value = link.url;
    DOM.linkTitleInput.value = link.title;
    DOM.linkTagsInput.value = link.tags || '';
    DOM.linkNotesInput.value = link.notes || '';
    
    DOM.linkModal.classList.remove('hidden');
    DOM.linkTitleInput.focus();
}

/**
 * Close link modal
 */
function closeModal() {
    DOM.linkModal.classList.add('hidden');
    DOM.linkForm.reset();
    state.editingLinkId = null;
}

/**
 * Open delete confirmation modal
 */
function openDeleteModal(linkId) {
    const link = state.links.find(l => l.link_id === linkId);
    if (!link) return;
    
    state.editingLinkId = linkId;
    DOM.deleteLinkTitle.textContent = link.title;
    DOM.deleteModal.classList.remove('hidden');
}

/**
 * Close delete modal
 */
function closeDeleteModal() {
    DOM.deleteModal.classList.add('hidden');
    state.editingLinkId = null;
}

// ============================================
// THEME FUNCTIONS
// ============================================

/**
 * Initialize theme
 */
function initTheme() {
    const theme = getTheme();
    document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Toggle theme
 */
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    saveTheme(newTheme);
}

// ============================================
// VIEW TOGGLE FUNCTIONS
// ============================================

/**
 * Set view mode
 */
function setViewMode(mode) {
    state.currentView = mode;
    
    if (mode === 'grid') {
        DOM.linksContainer.classList.add('grid-view');
        DOM.linksContainer.classList.remove('list-view');
        DOM.gridViewBtn.classList.add('active');
        DOM.listViewBtn.classList.remove('active');
    } else {
        DOM.linksContainer.classList.remove('grid-view');
        DOM.linksContainer.classList.add('list-view');
        DOM.gridViewBtn.classList.remove('active');
        DOM.listViewBtn.classList.add('active');
    }
}

// ============================================
// COPY TO CLIPBOARD
// ============================================

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('URL copied to clipboard!', 'success');
    } catch {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            showToast('URL copied to clipboard!', 'success');
        } catch {
            showToast('Failed to copy URL', 'error');
        }
        
        document.body.removeChild(textArea);
    }
}

// ============================================
// AUTO-FETCH TITLE (Using CORS proxy or fallback)
// ============================================

/**
 * Attempt to fetch page title
 * Note: This may not work for all URLs due to CORS restrictions
 */
async function fetchPageTitle() {
    const url = DOM.linkUrlInput.value.trim();
    
    if (!url) {
        showToast('Please enter a URL first', 'warning');
        return;
    }
    
    try {
        // Extract domain as fallback title
        const urlObj = new URL(url);
        const fallbackTitle = urlObj.hostname.replace('www.', '');
        
        // Try to use a CORS proxy (this is a simple example)
        // In production, you might want to handle this server-side
        DOM.linkTitleInput.value = fallbackTitle;
        showToast('Title set to domain name (auto-fetch limited by browser security)', 'warning');
        
    } catch (error) {
        showToast('Invalid URL format', 'error');
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

/**
 * Initialize all event listeners
 */
function initEventListeners() {
    // Auth form switching
    DOM.showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        DOM.loginForm.classList.add('hidden');
        DOM.registerForm.classList.remove('hidden');
    });
    
    DOM.showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        DOM.registerForm.classList.add('hidden');
        DOM.loginForm.classList.remove('hidden');
    });
    
    // Login form submission
    DOM.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        
        if (!email || !password) {
            showToast('Please fill in all fields', 'warning');
            return;
        }
        
        await loginUser(email, password);
    });
    
    // Register form submission
    DOM.registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm').value;
        
        if (!email || !password || !confirm) {
            showToast('Please fill in all fields', 'warning');
            return;
        }
        
        if (password !== confirm) {
            showToast('Passwords do not match', 'error');
            return;
        }
        
        if (password.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }
        
        await registerUser(email, password);
    });
    
    // Logout
    DOM.logoutBtn.addEventListener('click', logoutUser);
    
    // Theme toggle
    DOM.themeToggle.addEventListener('click', toggleTheme);
    
    // Add link button
    DOM.addLinkBtn.addEventListener('click', openAddModal);
    
    // Search input
    DOM.searchInput.addEventListener('input', debouncedSearch);
    
    // Clear search
    DOM.clearSearch.addEventListener('click', () => {
        DOM.searchInput.value = '';
        applyFilters();
    });
    
    // Tag filter
    DOM.tagFilter.addEventListener('change', applyFilters);
    
    // View toggle
    DOM.gridViewBtn.addEventListener('click', () => setViewMode('grid'));
    DOM.listViewBtn.addEventListener('click', () => setViewMode('list'));
    
    // Link form submission
    DOM.linkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const linkData = {
            url: DOM.linkUrlInput.value.trim(),
            title: DOM.linkTitleInput.value.trim(),
            tags: DOM.linkTagsInput.value.trim(),
            notes: DOM.linkNotesInput.value.trim()
        };
        
        // Validate URL
        try {
            new URL(linkData.url);
        } catch {
            showToast('Please enter a valid URL', 'error');
            return;
        }
        
        if (!linkData.title) {
            showToast('Please enter a title', 'error');
            return;
        }
        
        if (state.editingLinkId) {
            await updateLink(state.editingLinkId, linkData);
        } else {
            await addLink(linkData);
        }
    });
    
    // Fetch title button
    DOM.fetchTitleBtn.addEventListener('click', fetchPageTitle);
    
    // Close modal
    DOM.closeModalBtn.addEventListener('click', closeModal);
    DOM.cancelModalBtn.addEventListener('click', closeModal);
    
    // Close modal on overlay click
    DOM.linkModal.querySelector('.modal-overlay').addEventListener('click', closeModal);
    
    // Delete modal
    DOM.deleteModalCloseButtons.forEach(btn => {
        btn.addEventListener('click', closeDeleteModal);
    });
    
    DOM.deleteModal.querySelector('.modal-overlay').addEventListener('click', closeDeleteModal);
    
    DOM.confirmDeleteBtn.addEventListener('click', async () => {
        if (state.editingLinkId) {
            await deleteLink(state.editingLinkId);
        }
    });
    
    // Password visibility toggle
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.parentElement.querySelector('input');
            const type = input.type === 'password' ? 'text' : 'password';
            input.type = type;
            btn.textContent = type === 'password' ? '👁️' : '🙈';
        });
    });
    
    // Links container event delegation
    DOM.linksContainer.addEventListener('click', async (e) => {
        const target = e.target;
        
        // Copy URL button
        if (target.classList.contains('copy-url')) {
            const url = target.dataset.url;
            await copyToClipboard(url);
            return;
        }
        
        // Edit button
        if (target.classList.contains('edit')) {
            const linkId = target.dataset.linkId;
            openEditModal(linkId);
            return;
        }
        
        // Delete button
        if (target.classList.contains('delete')) {
            const linkId = target.dataset.linkId;
            openDeleteModal(linkId);
            return;
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape to close modals
        if (e.key === 'Escape') {
            if (!DOM.linkModal.classList.contains('hidden')) {
                closeModal();
            }
            if (!DOM.deleteModal.classList.contains('hidden')) {
                closeDeleteModal();
            }
        }
        
        // Ctrl/Cmd + K to focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            DOM.searchInput.focus();
        }
        
        // Ctrl/Cmd + N to add new link
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            if (!DOM.dashboardSection.classList.contains('hidden')) {
                openAddModal();
            }
        }
    });
    
    // Set current year in footer
    document.getElementById('current-year').textContent = new Date().getFullYear();
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize the application
 */
function init() {
    initTheme();
    initEventListeners();
    restoreSession();
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ============================================
// EXPORT FOR TESTING (if needed)
// ============================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        state,
        sanitizeHTML,
        formatDate,
        getFaviconUrl
    };
}
