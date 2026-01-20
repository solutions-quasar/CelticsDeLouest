
// --- GLOBAL FUZZY SEARCH ---
const globalSearchInput = document.getElementById('global-search-input');
const globalSearchResults = document.getElementById('global-search-results');
const clearSearchBtn = document.getElementById('clear-search');

// Fuzzy matching function
function fuzzyMatch(str, pattern) {
    if (!pattern) return true;

    str = str.toLowerCase();
    pattern = pattern.toLowerCase();

    let patternIdx = 0;
    let strIdx = 0;
    let score = 0;

    while (strIdx < str.length && patternIdx < pattern.length) {
        if (str[strIdx] === pattern[patternIdx]) {
            score++;
            patternIdx++;
        }
        strIdx++;
    }

    return patternIdx === pattern.length ? score : 0;
}

// Search across all data
function performGlobalSearch(searchTerm) {
    if (!searchTerm || searchTerm.length < 2) {
        globalSearchResults.classList.remove('active');
        return;
    }

    const results = {
        players: [],
        coaches: [],
        teams: [],
        matches: [],
        inventory: [],
        products: [],
        referees: [],
        sponsors: []
    };

    // Search Players
    Object.entries(dataCache.players || {}).forEach(([id, player]) => {
        const name = (player.firstName || '') + ' ' + (player.lastName || '');
        const score = fuzzyMatch(name.trim(), searchTerm);
        if (score > 0) {
            results.players.push({ id, data: player, name: name.trim(), score, type: 'player' });
        }
    });

    // Search Coaches
    Object.entries(dataCache.coaches || {}).forEach(([id, coach]) => {
        const name = coach.name || ((coach.firstName || '') + ' ' + (coach.lastName || '')).trim();
        const score = fuzzyMatch(name, searchTerm);
        if (score > 0) {
            results.coaches.push({ id, data: coach, name, score, type: 'coach' });
        }
    });

    // Search Teams
    Object.entries(dataCache.teams || {}).forEach(([id, team]) => {
        const name = team.name || '';
        const score = fuzzyMatch(name, searchTerm);
        if (score > 0) {
            results.teams.push({ id, data: team, name, score, type: 'team' });
        }
    });

    // Search Matches
    Object.entries(dataCache.matches || {}).forEach(([id, match]) => {
        const searchStr = (match.category || '') + ' ' + (match.opponent || '') + ' ' + (match.date || '');
        const score = fuzzyMatch(searchStr, searchTerm);
        if (score > 0) {
            results.matches.push({
                id,
                data: match,
                name: match.category + ' vs ' + match.opponent,
                subtitle: match.date,
                score,
                type: 'match'
            });
        }
    });

    // Search Inventory
    Object.entries(dataCache.inventory || {}).forEach(([id, item]) => {
        const name = item.name || '';
        const score = fuzzyMatch(name, searchTerm);
        if (score > 0) {
            results.inventory.push({ id, data: item, name, score, type: 'inventory' });
        }
    });

    // Search Products
    Object.entries(dataCache.products || {}).forEach(([id, product]) => {
        const name = product.name || '';
        const score = fuzzyMatch(name, searchTerm);
        if (score > 0) {
            results.products.push({ id, data: product, name, score, type: 'product' });
        }
    });

    // Search Referees
    Object.entries(dataCache.referees || {}).forEach(([id, ref]) => {
        const name = ref.name || '';
        const score = fuzzyMatch(name, searchTerm);
        if (score > 0) {
            results.referees.push({ id, data: ref, name, score, type: 'referee' });
        }
    });

    // Search Sponsors
    Object.entries(dataCache.sponsors || {}).forEach(([id, sponsor]) => {
        const name = sponsor.name || '';
        const score = fuzzyMatch(name, searchTerm);
        if (score > 0) {
            results.sponsors.push({ id, data: sponsor, name, score, type: 'sponsor' });
        }
    });

    displaySearchResults(results);
}

// Display search results
function displaySearchResults(results) {
    let html = '';
    let totalResults = 0;

    const categoryConfig = {
        players: { label: 'Joueurs', icon: 'fa-user-friends', view: 'view-players', modal: 'player-modal', idField: 'player-id' },
        coaches: { label: 'Entraîneurs', icon: 'fa-stopwatch', view: 'view-coaches', modal: 'coach-modal', idField: 'coach-id' },
        teams: { label: 'Équipes', icon: 'fa-users', view: 'view-teams', modal: 'team-modal', idField: 'team-id' },
        matches: { label: 'Matchs', icon: 'fa-futbol', view: 'view-matches', modal: 'match-modal', idField: 'match-id' },
        inventory: { label: 'Inventaire', icon: 'fa-clipboard-list', view: 'view-inventory', modal: 'inventory-modal', idField: 'inv-id' },
        products: { label: 'Produits', icon: 'fa-tshirt', view: 'view-boutique', modal: 'product-modal', idField: 'product-id' },
        referees: { label: 'Arbitres', icon: 'fa-gavel', view: 'view-referees', modal: 'referee-modal', idField: 'referee-id' },
        sponsors: { label: 'Commanditaires', icon: 'fa-handshake', view: 'view-sponsors', modal: 'sponsor-modal', idField: 'sponsor-id' }
    };

    Object.entries(results).forEach(([category, items]) => {
        if (items.length === 0) return;

        // Sort by score (descending)
        items.sort((a, b) => b.score - a.score);

        const config = categoryConfig[category];
        if (!config) return;

        html += '<div class="search-category">' + config.label + ' (' + items.length + ')</div>';

        items.slice(0, 5).forEach(item => {
            totalResults++;
            const imgHtml = item.data.imageUrl
                ? '<img src="' + item.data.imageUrl + '" class="search-result-img" alt="' + item.name + '">'
                : '<div class="search-result-icon"><i class="fas ' + config.icon + '"></i></div>';

            const subtitle = item.subtitle || (item.data.category || item.data.team || '');
            const subtitleHtml = subtitle ? '<div class="search-result-subtitle">' + subtitle + '</div>' : '';

            html += '<div class="search-result-item" data-id="' + item.id + '" data-view="' + config.view + '" data-modal="' + config.modal + '" data-id-field="' + config.idField + '">';
            html += imgHtml;
            html += '<div class="search-result-info">';
            html += '<div class="search-result-title">' + item.name + '</div>';
            html += subtitleHtml;
            html += '</div></div>';
        });
    });

    if (totalResults === 0) {
        html = '<div style="padding: 20px; text-align: center; color: #999;">Aucun résultat trouvé</div>';
    }

    globalSearchResults.innerHTML = html;
    globalSearchResults.classList.add('active');

    // Add click handlers
    document.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            const view = item.dataset.view;

            // Switch to the view
            switchView(view);

            // Open the modal with the item
            setTimeout(() => {
                const card = document.querySelector('[data-id="' + id + '"]');
                if (card) {
                    card.click();
                }

                // Close search
                globalSearchInput.value = '';
                globalSearchResults.classList.remove('active');
                clearSearchBtn.style.display = 'none';
            }, 100);
        });
    });
}

// Event listeners
if (globalSearchInput) {
    globalSearchInput.addEventListener('input', (e) => {
        const value = e.target.value;
        clearSearchBtn.style.display = value ? 'block' : 'none';
        performGlobalSearch(value);
    });

    globalSearchInput.addEventListener('focus', () => {
        if (globalSearchInput.value.length >= 2) {
            globalSearchResults.classList.add('active');
        }
    });
}

if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
        globalSearchInput.value = '';
        globalSearchResults.classList.remove('active');
        clearSearchBtn.style.display = 'none';
        globalSearchInput.focus();
    });
}

// Close search results when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        globalSearchResults.classList.remove('active');
    }
});

// Helper function to switch views
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.add('active');
        const navBtn = document.querySelector('[data-target="' + viewId + '"]');
        if (navBtn) navBtn.classList.add('active');

        // Update page title
        const pageTitle = document.getElementById('page-title');
        if (pageTitle && navBtn) {
            pageTitle.textContent = navBtn.textContent.trim();
        }
    }
}
