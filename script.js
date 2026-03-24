// ============================================
// LINKVAULT - Personal Link Manager
// Complete Fixed Version with Demo Mode
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        STORAGE_KEYS: {
            API_URL: 'https://script.google.com/macros/s/AKfycbwHHmMizRS-Jvi2z6v6Vmz5Dyt0uOPZymCI2XdwnhAWcUn_SmbCNrlfs7JMC6qek16u/exec',
            AUTH: 'linkVault_auth',
            THEME: 'linkVault_theme',
            DEMO_LINKS: 'linkVault_demoLinks',
            DEMO_USER: 'linkVault_demoUser'
        },
        TOKEN_EXPIRY: 24 * 60 * 60 * 1000,
        TOAST_DURATION: 4000,
        SEARCH_DEBOUNCE: 300
    };

    // ============================================
    // STATE
    // ============================================
    const state = {
        apiUrl: null,
        isDemoMode: false,
        user: null,
        token: null,
        links: [],
        filteredLinks: [],
        allTags: [],
        currentView: 'grid',
        isLoading: false,
        editingLinkId: null,
        deleteTargetId: null
    };

    // ============================================
    // DOM CACHE
    // ============================================
    let DOM = {};

    function cacheDOMElements() {
        DOM = {
            // Loading & Toast
            loadingOverlay: document.getElementById('loading-overlay'),
            toastContainer: document.getElementById('toast-container'),
            
            // Sections
            setupSection: document.getElementById('setup-section'),
            authSection: document.getElementById('auth-section'),
            dashboardSection: document.getElementById('dashboard-section'),
            
            // Setup
            setupForm: document.getElementById('setup-form'),
            apiUrlInput: document.getElementById('api-url-input'),
            demoModeBtn: document.getElementById('demo-mode-btn'),
            
            // Auth
            loginForm: document.getElementById('login-form'),
            registerForm: document.getElementById('register-form'),
            showRegisterLink: document.getElementById('show-register'),
            showLoginLink: document.getElementById('show-login'),
            
            // Dashboard
            demoBanner: document.getElementById('demo-banner'),
            exitDemoBtn: document.getElementById('exit-demo'),
            linksContainer: document.getElementById('links-container'),
            linksCount: document.getElementById('links-count'),
            emptyState: document.getElementById('empty-state'),
            noResults: document.getElementById('no-results'),
            
            // Navigation
            settingsBtn: document.getElementById('settings-btn'),
            userMenu: document.getElementById('user-menu'),
            userEmail: document.getElementById('user-email'),
            logoutBtn: document.getElementById('logout-btn'),
            themeToggle: document.getElementById('theme-toggle'),
            
            // Search & Filter
            searchInput: document.getElementById('search-input'),
            clearSearch: document.getElementById('clear-search'),
            tagFilter: document.getElementById('tag-filter'),
            sortSelect: document.getElementById('sort-select'),
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
            deleteLinkTitle: document.querySelector('.delete-link-title'),
            
            // Settings Modal
            settingsModal: document.getElementById('settings-modal'),
            settingsApiUrl: document.getElementById('settings-api-url'),
            currentMode: document.getElementById('current-mode'),
            clearDataBtn: document.getElementById('clear-data-btn'),
            saveSettingsBtn: document.getElementById('save-settings')
        };
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    function showLoading() {
        state.isLoading = true;
        DOM.loadingOverlay?.classList.remove('hidden');
    }

    function hideLoading() {
        state.isLoading = false;
        DOM.loadingOverlay?.classList.add('hidden');
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        DOM.toastContainer?.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, CONFIG.TOAST_DURATION);
    }

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    function sanitizeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return 'Unknown';
        }
    }

    function getFaviconUrl(url) {
        try {
            const urlObj = new URL(url);
            return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
        } catch {
            return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔗</text></svg>';
        }
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    function isValidUrl(string) {
        try {
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    }

    // ============================================
    // STORAGE FUNCTIONS
    // ============================================

    function saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error('Storage error:', e);
        }
    }

    function getFromStorage(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch {
            return null;
        }
    }

    function removeFromStorage(key) {
        localStorage.removeItem(key);
    }

    // ============================================
    // API URL MANAGEMENT
    // ============================================

    function getApiUrl() {
        return getFromStorage(CONFIG.STORAGE_KEYS.API_URL);
    }

    function saveApiUrl(url) {
        saveToStorage(CONFIG.STORAGE_KEYS.API_URL, url);
        state.apiUrl = url;
    }

    function isApiConfigured() {
        const url = getApiUrl();
        return url && url.includes('script.google.com');
    }

    // ============================================
    // AUTH STORAGE
    // ============================================

    function saveAuthData(user, token) {
        const authData = {
            user,
            token,
            expiry: Date.now() + CONFIG.TOKEN_EXPIRY
        };
        saveToStorage(CONFIG.STORAGE_KEYS.AUTH, authData);
    }

    function getAuthData() {
        const data = getFromStorage(CONFIG.STORAGE_KEYS.AUTH);
        if (data && data.expiry > Date.now()) {
            return data;
        }
        removeFromStorage(CONFIG.STORAGE_KEYS.AUTH);
        return null;
    }

    function clearAuthData() {
        removeFromStorage(CONFIG.STORAGE_KEYS.AUTH);
    }

    // ============================================
    // THEME
    // ============================================

    function initTheme() {
        const theme = getFromStorage(CONFIG.STORAGE_KEYS.THEME) || 'light';
        document.documentElement.setAttribute('data-theme', theme);
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        saveToStorage(CONFIG.STORAGE_KEYS.THEME, newTheme);
    }

    // ============================================
    // API FUNCTIONS
    // ============================================

    async function apiRequest(action, method = 'GET', data = null) {
        if (state.isDemoMode) {
            return demoApiRequest(action, method, data);
        }

        const apiUrl = state.apiUrl || getApiUrl();
        
        if (!apiUrl) {
            throw new Error('API URL not configured');
        }

        const requestBody = {
            action,
            method,
            ...data
        };

        if (state.token) {
            requestBody.token = state.token;
        }

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain'
                },
                body: JSON.stringify(requestBody)
            });

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
    // DEMO MODE FUNCTIONS
    // ============================================

    function enableDemoMode() {
        state.isDemoMode = true;
        state.user = { user_id: 'demo_user', email: 'demo@linkvault.app' };
        state.token = 'demo_token';
        
        // Initialize demo links if not exists
        if (!getFromStorage(CONFIG.STORAGE_KEYS.DEMO_LINKS)) {
            const sampleLinks = [
                {
                    link_id: generateId(),
                    user_id: 'demo_user',
                    title: 'Google',
                    url: 'https://www.google.com',
                    tags: 'search, tools',
                    notes: 'The most popular search engine',
                    created_at: new Date().toISOString()
                },
                {
                    link_id: generateId(),
                    user_id: 'demo_user',
                    title: 'GitHub',
                    url: 'https://github.com',
                    tags: 'development, code',
                    notes: 'Code hosting platform',
                    created_at: new Date(Date.now() - 86400000).toISOString()
                },
                {
                    link_id: generateId(),
                    user_id: 'demo_user',
                    title: 'MDN Web Docs',
                    url: 'https://developer.mozilla.org',
                    tags: 'documentation, learning',
                    notes: 'Web development documentation',
                    created_at: new Date(Date.now() - 172800000).toISOString()
                }
            ];
            saveToStorage(CONFIG.STORAGE_KEYS.DEMO_LINKS, sampleLinks);
        }
        
        saveToStorage(CONFIG.STORAGE_KEYS.DEMO_USER, state.user);
        showDashboard();
    }

    function exitDemoMode() {
        state.isDemoMode = false;
        state.user = null;
        state.token = null;
        state.links = [];
        removeFromStorage(CONFIG.STORAGE_KEYS.DEMO_USER);
        showSetup();
    }

    function demoApiRequest(action, method, data) {
        return new Promise((resolve) => {
            setTimeout(() => {
                let links = getFromStorage(CONFIG.STORAGE_KEYS.DEMO_LINKS) || [];
                
                switch (action) {
                    case 'getLinks':
                        resolve({ success: true, links });
                        break;
                        
                    case 'addLink':
                        const newLink = {
                            link_id: generateId(),
                            user_id: 'demo_user',
                            ...data.link,
                            created_at: new Date().toISOString()
                        };
                        links.unshift(newLink);
                        saveToStorage(CONFIG.STORAGE_KEYS.DEMO_LINKS, links);
                        resolve({ success: true, link: newLink });
                        break;
                        
                    case 'updateLink':
                        const updateIndex = links.findIndex(l => l.link_id === data.link_id);
                        if (updateIndex !== -1) {
                            links[updateIndex] = { ...links[updateIndex], ...data.link };
                            saveToStorage(CONFIG.STORAGE_KEYS.DEMO_LINKS, links);
                            resolve({ success: true, link: links[updateIndex] });
                        } else {
                            resolve({ success: false, error: 'Link not found' });
                        }
                        break;
                        
                    case 'deleteLink':
                        links = links.filter(l => l.link_id !== data.link_id);
                        saveToStorage(CONFIG.STORAGE_KEYS.DEMO_LINKS, links);
                        resolve({ success: true, deleted: true });
                        break;
                        
                    default:
                        resolve({ success: false, error: 'Unknown action' });
                }
            }, 300);
        });
    }

    // ============================================
    // AUTHENTICATION
    // ============================================

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

    function logoutUser() {
        state.user = null;
        state.token = null;
        state.links = [];
        state.filteredLinks = [];
        state.isDemoMode = false;
        
        clearAuthData();
        removeFromStorage(CONFIG.STORAGE_KEYS.DEMO_USER);
        
        if (isApiConfigured()) {
            showAuth();
        } else {
            showSetup();
        }
        
        showToast('Logged out successfully', 'success');
    }

    // ============================================
    // LINK OPERATIONS
    // ============================================

    async function fetchLinks() {
        showLoading();
        
        try {
            const result = await apiRequest('getLinks', 'GET');
            
            state.links = result.links || [];
            state.filteredLinks = [...state.links];
            
            updateAllTags();
            applyFilters();
            updateLinksCount();
        } catch (error) {
            showToast('Failed to fetch links', 'error');
        } finally {
            hideLoading();
        }
    }

    async function addLink(linkData) {
        showLoading();
        
        try {
            const result = await apiRequest('addLink', 'POST', { link: linkData });
            
            state.links.unshift(result.link);
            state.filteredLinks = [...state.links];
            
            updateAllTags();
            applyFilters();
            updateLinksCount();
            closeModal();
            
            showToast('Link added successfully!', 'success');
        } catch (error) {
            showToast(error.message || 'Failed to add link', 'error');
        } finally {
            hideLoading();
        }
    }

    async function updateLink(linkId, linkData) {
        showLoading();
        
        try {
            const result = await apiRequest('updateLink', 'PUT', { 
                link_id: linkId, 
                link: linkData 
            });
            
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

    async function deleteLink(linkId) {
        showLoading();
        
        try {
            await apiRequest('deleteLink', 'DELETE', { link_id: linkId });
            
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
    // UI SECTION MANAGEMENT
    // ============================================

    function hideAllSections() {
        DOM.setupSection?.classList.add('hidden');
        DOM.authSection?.classList.add('hidden');
        DOM.dashboardSection?.classList.add('hidden');
        DOM.userMenu?.classList.add('hidden');
    }

    function showSetup() {
        hideAllSections();
        DOM.setupSection?.classList.remove('hidden');
    }

    function showAuth() {
        hideAllSections();
        DOM.authSection?.classList.remove('hidden');
        DOM.loginForm?.classList.remove('hidden');
        DOM.registerForm?.classList.add('hidden');
    }

    function showDashboard() {
        hideAllSections();
        DOM.dashboardSection?.classList.remove('hidden');
        DOM.userMenu?.classList.remove('hidden');
        
        if (DOM.userEmail) {
            DOM.userEmail.textContent = state.user?.email || '';
        }
        
        // Show demo banner if in demo mode
        if (state.isDemoMode && DOM.demoBanner) {
            DOM.demoBanner.classList.remove('hidden');
        } else if (DOM.demoBanner) {
            DOM.demoBanner.classList.add('hidden');
        }
        
        fetchLinks();
    }

    // ============================================
    // RENDERING
    // ============================================

    function updateLinksCount() {
        const count = state.filteredLinks.length;
        if (DOM.linksCount) {
            DOM.linksCount.textContent = `${count} link${count !== 1 ? 's' : ''} saved`;
        }
    }

    function updateAllTags() {
        const tagsSet = new Set();
        
        state.links.forEach(link => {
            if (link.tags) {
                link.tags.split(',').map(t => t.trim()).filter(t => t).forEach(tag => tagsSet.add(tag));
            }
        });
        
        state.allTags = Array.from(tagsSet).sort();
        
        if (DOM.tagFilter) {
            const currentValue = DOM.tagFilter.value;
            DOM.tagFilter.innerHTML = '<option value="">All Tags</option>';
            state.allTags.forEach(tag => {
                const option = document.createElement('option');
                option.value = tag;
                option.textContent = tag;
                DOM.tagFilter.appendChild(option);
            });
            DOM.tagFilter.value = currentValue;
        }
    }

    function renderLinks() {
        if (!DOM.linksContainer) return;
        
        DOM.linksContainer.innerHTML = '';
        
        if (state.filteredLinks.length === 0) {
            if (state.links.length === 0) {
                DOM.emptyState?.classList.remove('hidden');
                DOM.noResults?.classList.add('hidden');
            } else {
                DOM.emptyState?.classList.add('hidden');
                DOM.noResults?.classList.remove('hidden');
            }
            return;
        }
        
        DOM.emptyState?.classList.add('hidden');
        DOM.noResults?.classList.add('hidden');
        
        state.filteredLinks.forEach(link => {
            const card = createLinkCard(link);
            DOM.linksContainer.appendChild(card);
        });
    }

    function createLinkCard(link) {
        const card = document.createElement('article');
        card.className = 'link-card';
        card.dataset.linkId = link.link_id;
        
        const tags = link.tags ? link.tags.split(',').map(t => t.trim()).filter(t => t) : [];
        
        const tagsHTML = tags.length > 0 
            ? `<div class="card-tags">${tags.map(tag => `<span class="tag">${sanitizeHTML(tag)}</span>`).join('')}</div>` 
            : '';
        
        const notesHTML = link.notes 
            ? `<p class="card-notes">${sanitizeHTML(link.notes)}</p>` 
            : '';
        
        const faviconUrl = getFaviconUrl(link.url);
        const defaultIcon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔗</text></svg>';
        
        card.innerHTML = `
            <div class="card-header">
                <img 
                    src="${faviconUrl}" 
                    alt="" 
                    class="favicon"
                    onerror="this.src='${defaultIcon}'"
                    loading="lazy"
                >
                <div class="card-title-section">
                    <h3 class="card-title">${sanitizeHTML(link.title)}</h3>
                    <div class="card-url">
                        <a href="${sanitizeHTML(link.url)}" target="_blank" rel="noopener noreferrer">
                            ${sanitizeHTML(link.url)}
                        </a>
                        <button class="copy-url" title="Copy URL" data-url="${sanitizeHTML(link.url)}">📋</button>
                    </div>
                </div>
            </div>
            ${notesHTML}
            ${tagsHTML}
            <div class="card-footer">
                <span class="card-date">${formatDate(link.created_at)}</span>
                <div class="card-actions">
                    <button class="card-action-btn edit" title="Edit" data-link-id="${link.link_id}">✏️</button>
                    <button class="card-action-btn delete" title="Delete" data-link-id="${link.link_id}">🗑️</button>
                </div>
            </div>
        `;
        
        return card;
    }

    // ============================================
    // FILTERING & SORTING
    // ============================================

    function applyFilters() {
        const searchTerm = DOM.searchInput?.value.toLowerCase().trim() || '';
        const selectedTag = DOM.tagFilter?.value || '';
        const sortBy = DOM.sortSelect?.value || 'newest';
        
        state.filteredLinks = state.links.filter(link => {
            const matchesSearch = !searchTerm || 
                link.title.toLowerCase().includes(searchTerm) ||
                link.url.toLowerCase().includes(searchTerm) ||
                (link.notes && link.notes.toLowerCase().includes(searchTerm)) ||
                (link.tags && link.tags.toLowerCase().includes(searchTerm));
            
            const matchesTag = !selectedTag || 
                (link.tags && link.tags.split(',').map(t => t.trim()).includes(selectedTag));
            
            return matchesSearch && matchesTag;
        });
        
        // Sort
        state.filteredLinks.sort((a, b) => {
            switch (sortBy) {
                case 'oldest':
                    return new Date(a.created_at) - new Date(b.created_at);
                case 'title':
                    return a.title.localeCompare(b.title);
                case 'newest':
                default:
                    return new Date(b.created_at) - new Date(a.created_at);
            }
        });
        
        renderLinks();
        updateLinksCount();
        
        // Toggle clear search button
        if (DOM.clearSearch) {
            DOM.clearSearch.classList.toggle('hidden', !searchTerm);
        }
    }

    const debouncedFilter = debounce(applyFilters, CONFIG.SEARCH_DEBOUNCE);

    // ============================================
    // MODALS
    // ============================================

    function openAddModal() {
        state.editingLinkId = null;
        if (DOM.modalTitle) DOM.modalTitle.textContent = 'Add New Link';
        DOM.linkForm?.reset();
        if (DOM.linkIdInput) DOM.linkIdInput.value = '';
        DOM.linkModal?.classList.remove('hidden');
        DOM.linkUrlInput?.focus();
    }

    function openEditModal(linkId) {
        const link = state.links.find(l => l.link_id === linkId);
        if (!link) return;
        
        state.editingLinkId = linkId;
        if (DOM.modalTitle) DOM.modalTitle.textContent = 'Edit Link';
        
        if (DOM.linkIdInput) DOM.linkIdInput.value = link.link_id;
        if (DOM.linkUrlInput) DOM.linkUrlInput.value = link.url;
        if (DOM.linkTitleInput) DOM.linkTitleInput.value = link.title;
        if (DOM.linkTagsInput) DOM.linkTagsInput.value = link.tags || '';
        if (DOM.linkNotesInput) DOM.linkNotesInput.value = link.notes || '';
        
        DOM.linkModal?.classList.remove('hidden');
        DOM.linkTitleInput?.focus();
    }

    function closeModal() {
        DOM.linkModal?.classList.add('hidden');
        DOM.linkForm?.reset();
        state.editingLinkId = null;
    }

    function openDeleteModal(linkId) {
        const link = state.links.find(l => l.link_id === linkId);
        if (!link) return;
        
        state.deleteTargetId = linkId;
        if (DOM.deleteLinkTitle) {
            DOM.deleteLinkTitle.textContent = link.title;
        }
        DOM.deleteModal?.classList.remove('hidden');
    }

    function closeDeleteModal() {
        DOM.deleteModal?.classList.add('hidden');
        state.deleteTargetId = null;
    }

    function openSettingsModal() {
        if (DOM.settingsApiUrl) {
            DOM.settingsApiUrl.value = getApiUrl() || '';
        }
        if (DOM.currentMode) {
            if (state.isDemoMode) {
                DOM.currentMode.textContent = '🎮 Demo Mode (data stored locally)';
            } else if (isApiConfigured()) {
                DOM.currentMode.textContent = '🌐 Connected to Google Apps Script';
            } else {
                DOM.currentMode.textContent = '❌ Not configured';
            }
        }
        DOM.settingsModal?.classList.remove('hidden');
    }

    function closeSettingsModal() {
        DOM.settingsModal?.classList.add('hidden');
    }

    // ============================================
    // CLIPBOARD
    // ============================================

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('URL copied to clipboard!', 'success');
        } catch {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            
            try {
                document.execCommand('copy');
                showToast('URL copied to clipboard!', 'success');
            } catch {
                showToast('Failed to copy URL', 'error');
            }
            
            document.body.removeChild(textarea);
        }
    }

    // ============================================
    // AUTO-FETCH TITLE
    // ============================================

    function fetchPageTitle() {
        const url = DOM.linkUrlInput?.value.trim();
        
        if (!url) {
            showToast('Please enter a URL first', 'warning');
            return;
        }
        
        if (!isValidUrl(url)) {
            showToast('Please enter a valid URL (starting with http:// or https://)', 'error');
            return;
        }
        
        try {
            const urlObj = new URL(url);
            // Use domain name as title
            let title = urlObj.hostname.replace('www.', '');
            // Capitalize first letter
            title = title.charAt(0).toUpperCase() + title.slice(1);
            
            if (DOM.linkTitleInput) {
                DOM.linkTitleInput.value = title;
            }
            
            showToast('Title set from domain name', 'success');
        } catch {
            showToast('Could not parse URL', 'error');
        }
    }

    // ============================================
    // VIEW TOGGLE
    // ============================================

    function setViewMode(mode) {
        state.currentView = mode;
        
        if (DOM.linksContainer) {
            DOM.linksContainer.classList.toggle('grid-view', mode === 'grid');
            DOM.linksContainer.classList.toggle('list-view', mode === 'list');
        }
        
        DOM.gridViewBtn?.classList.toggle('active', mode === 'grid');
        DOM.listViewBtn?.classList.toggle('active', mode === 'list');
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    function initEventListeners() {
        // Setup form
        DOM.setupForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            const url = DOM.apiUrlInput?.value.trim();
            
            if (!url) {
                showToast('Please enter an API URL', 'error');
                return;
            }
            
            if (!url.includes('script.google.com')) {
                showToast('Please enter a valid Google Apps Script URL', 'error');
                return;
            }
            
            saveApiUrl(url);
            showToast('API URL saved!', 'success');
            showAuth();
        });
        
        // Demo mode
        DOM.demoModeBtn?.addEventListener('click', enableDemoMode);
        DOM.exitDemoBtn?.addEventListener('click', exitDemoMode);
        
        // Auth switching
        DOM.showRegisterLink?.addEventListener('click', (e) => {
            e.preventDefault();
            DOM.loginForm?.classList.add('hidden');
            DOM.registerForm?.classList.remove('hidden');
        });
        
        DOM.showLoginLink?.addEventListener('click', (e) => {
            e.preventDefault();
            DOM.registerForm?.classList.add('hidden');
            DOM.loginForm?.classList.remove('hidden');
        });
        
        // Login
        DOM.loginForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email')?.value.trim();
            const password = document.getElementById('login-password')?.value;
            
            if (!email || !password) {
                showToast('Please fill in all fields', 'warning');
                return;
            }
            
            await loginUser(email, password);
        });
        
        // Register
        DOM.registerForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('register-email')?.value.trim();
            const password = document.getElementById('register-password')?.value;
            const confirm = document.getElementById('register-confirm')?.value;
            
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
        DOM.logoutBtn?.addEventListener('click', logoutUser);
        
        // Theme
        DOM.themeToggle?.addEventListener('click', toggleTheme);
        
        // Settings
        DOM.settingsBtn?.addEventListener('click', openSettingsModal);
        
        document.querySelectorAll('.close-settings-modal').forEach(btn => {
            btn.addEventListener('click', closeSettingsModal);
        });
        
        DOM.settingsModal?.querySelector('.modal-overlay')?.addEventListener('click', closeSettingsModal);
        
        DOM.saveSettingsBtn?.addEventListener('click', () => {
            const url = DOM.settingsApiUrl?.value.trim();
            
            if (url && !url.includes('script.google.com')) {
                showToast('Please enter a valid Google Apps Script URL', 'error');
                return;
            }
            
            if (url) {
                saveApiUrl(url);
            }
            
            closeSettingsModal();
            showToast('Settings saved!', 'success');
            
            // Reload if needed
            if (url && !state.isDemoMode) {
                location.reload();
            }
        });
        
        DOM.clearDataBtn?.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all local data? This cannot be undone.')) {
                localStorage.clear();
                location.reload();
            }
        });
        
        // Add link
        DOM.addLinkBtn?.addEventListener('click', openAddModal);
        
        // Search
        DOM.searchInput?.addEventListener('input', debouncedFilter);
        
        DOM.clearSearch?.addEventListener('click', () => {
            if (DOM.searchInput) DOM.searchInput.value = '';
            applyFilters();
        });
        
        // Filters
        DOM.tagFilter?.addEventListener('change', applyFilters);
        DOM.sortSelect?.addEventListener('change', applyFilters);
        
        // View toggle
        DOM.gridViewBtn?.addEventListener('click', () => setViewMode('grid'));
        DOM.listViewBtn?.addEventListener('click', () => setViewMode('list'));
        
        // Link form
        DOM.linkForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const url = DOM.linkUrlInput?.value.trim();
            const title = DOM.linkTitleInput?.value.trim();
            
            if (!url) {
                showToast('Please enter a URL', 'error');
                return;
            }
            
            if (!isValidUrl(url)) {
                showToast('Please enter a valid URL (starting with http:// or https://)', 'error');
                DOM.linkUrlInput?.focus();
                return;
            }
            
            if (!title) {
                showToast('Please enter a title', 'error');
                return;
            }
            
            const linkData = {
                url,
                title,
                tags: DOM.linkTagsInput?.value.trim() || '',
                notes: DOM.linkNotesInput?.value.trim() || ''
            };
            
            if (state.editingLinkId) {
                await updateLink(state.editingLinkId, linkData);
            } else {
                await addLink(linkData);
            }
        });
        
        // Fetch title
        DOM.fetchTitleBtn?.addEventListener('click', fetchPageTitle);
        
        // Close modals
        DOM.closeModalBtn?.addEventListener('click', closeModal);
        DOM.cancelModalBtn?.addEventListener('click', closeModal);
        DOM.linkModal?.querySelector('.modal-overlay')?.addEventListener('click', closeModal);
        
        // Delete modal
        document.querySelectorAll('.close-delete-modal').forEach(btn => {
            btn.addEventListener('click', closeDeleteModal);
        });
        
        DOM.deleteModal?.querySelector('.modal-overlay')?.addEventListener('click', closeDeleteModal);
        
        DOM.confirmDeleteBtn?.addEventListener('click', async () => {
            if (state.deleteTargetId) {
                await deleteLink(state.deleteTargetId);
            }
        });
        
        // Password toggle
        document.querySelectorAll('.toggle-password').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = btn.parentElement?.querySelector('input');
                if (input) {
                    const type = input.type === 'password' ? 'text' : 'password';
                    input.type = type;
                    btn.textContent = type === 'password' ? '👁️' : '🙈';
                }
            });
        });
        
        // Links container delegation
        DOM.linksContainer?.addEventListener('click', async (e) => {
            const target = e.target;
            
            if (target.classList.contains('copy-url')) {
                const url = target.dataset.url;
                if (url) await copyToClipboard(url);
                return;
            }
            
            if (target.classList.contains('edit')) {
                const linkId = target.dataset.linkId;
                if (linkId) openEditModal(linkId);
                return;
            }
            
            if (target.classList.contains('delete')) {
                const linkId = target.dataset.linkId;
                if (linkId) openDeleteModal(linkId);
                return;
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (!DOM.linkModal?.classList.contains('hidden')) closeModal();
                if (!DOM.deleteModal?.classList.contains('hidden')) closeDeleteModal();
                if (!DOM.settingsModal?.classList.contains('hidden')) closeSettingsModal();
            }
            
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                DOM.searchInput?.focus();
            }
        });
        
        // Set year
        const yearEl = document.getElementById('current-year');
        if (yearEl) yearEl.textContent = new Date().getFullYear();
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    function init() {
        cacheDOMElements();
        initTheme();
        initEventListeners();
        
        // Check for demo mode first
        const demoUser = getFromStorage(CONFIG.STORAGE_KEYS.DEMO_USER);
        if (demoUser) {
            state.isDemoMode = true;
            state.user = demoUser;
            state.token = 'demo_token';
            showDashboard();
            return;
        }
        
        // Check if API is configured
        state.apiUrl = getApiUrl();
        
        if (!isApiConfigured()) {
            showSetup();
            return;
        }
        
        // Check for existing session
        const authData = getAuthData();
        
        if (authData) {
            state.user = authData.user;
            state.token = authData.token;
            showDashboard();
        } else {
            showAuth();
        }
    }

    // Start app
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
