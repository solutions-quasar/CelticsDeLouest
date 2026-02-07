// Players Directory View Toggle Handler
document.addEventListener('DOMContentLoaded', () => {
    const playersGridBtn = document.querySelector('[data-target="players-directory-list"][data-view="grid"]');
    const playersListBtn = document.querySelector('[data-target="players-directory-list"][data-view="list"]');

    if (playersGridBtn) {
        playersGridBtn.addEventListener('click', () => {
            const gridContainer = document.getElementById('players-directory-list');
            const tableContainer = document.getElementById('players-table-view');

            gridContainer.style.display = 'grid';
            tableContainer.style.display = 'none';
            loadPlayersDirectory('grid');
        });
    }

    if (playersListBtn) {
        playersListBtn.addEventListener('click', () => {
            const gridContainer = document.getElementById('players-directory-list');
            const tableContainer = document.getElementById('players-table-view');

            gridContainer.style.display = 'none';
            tableContainer.style.display = 'block';
            loadPlayersDirectory('list');
        });
    }

    // Load players on page load if permission exists
    if (document.getElementById('players-directory-list')) {
        const checkAndLoad = () => {
            if (window.currentPermissions && (window.currentPermissions.all === 'edit' || window.currentPermissions.Equipes)) {
                loadPlayersDirectory('grid');
            } else if (!window.currentPermissions) {
                // Wait for permissions to be loaded
                setTimeout(checkAndLoad, 500);
            }
        };
        checkAndLoad();
    }

    // Filter and Search Listeners
    document.getElementById('player-search')?.addEventListener('input', () => {
        const gridContainer = document.getElementById('players-directory-list');
        const isGridView = gridContainer && gridContainer.style.display !== 'none';
        loadPlayersDirectory(isGridView ? 'grid' : 'list');
    });

    document.getElementById('player-filter-season')?.addEventListener('change', () => {
        const gridContainer = document.getElementById('players-directory-list');
        const isGridView = gridContainer && gridContainer.style.display !== 'none';
        loadPlayersDirectory(isGridView ? 'grid' : 'list');
    });
});

// Load Players Directory Function
window.loadPlayersDirectory = async function (viewMode = 'grid') {
    const gridContainer = document.getElementById('players-directory-list');
    const tbody = document.getElementById('players-directory-tbody');

    if (!gridContainer && !tbody) return;

    try {
        const searchInput = document.getElementById('player-search');
        const filterSeason = document.getElementById('player-filter-season');
        const query = searchInput?.value.toLowerCase() || '';
        const seasonId = filterSeason?.value || 'all';

        // Use global cache updated by real-time listener
        let players = Object.values(window.dataCache.players || {});

        // Filter by season
        if (seasonId !== 'all') {
            players = players.filter(p => p.seasonId === seasonId);
        }

        // Filter by search query
        if (query) {
            players = players.filter(p => {
                const fullName = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
                return fullName.includes(query);
            });
        }

        if (viewMode === 'grid' && gridContainer) {
            gridContainer.innerHTML = '';

            if (players.length === 0) {
                gridContainer.innerHTML = '<p style="text-align: center; padding: 20px; grid-column: 1/-1;">Aucun joueur trouvé.</p>';
                return;
            }

            players.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '')).forEach(player => {
                const teamName = player.teamId && window.dataCache.teams[player.teamId] ? window.dataCache.teams[player.teamId].name : 'Non assigné';
                const birthDate = player.birthDate || '-';
                const parentName = player.parentName || (player.parentFirstName && player.parentLastName ? player.parentFirstName + ' ' + player.parentLastName : '-');

                const card = document.createElement('div');
                card.className = 'product-card-admin';
                card.setAttribute('data-id', player.id);
                card.style.cursor = 'pointer';

                const initials = (player.firstName?.[0] || '?').toUpperCase() + (player.lastName?.[0] || '?').toUpperCase();

                // Photo consent indicator
                const photoWarning = player.noPhotoConsent ? '<span style="display: inline-block; background: #e74c3c; color: white; padding: 3px 8px; border-radius: 12px; font-size: 0.7rem; margin-left: 8px; font-weight: 600;"><i class="fas fa-camera-slash"></i> Pas de photos</span>' : '';

                card.innerHTML =
                    '<div class="admin-card-img circle-img" style="background: linear-gradient(135deg, var(--primary), var(--secondary)); color: white; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold;">' + initials + '</div>' +
                    '<h4 style="margin: 10px 0 5px 0; font-size: 1.1rem; color: var(--text-dark);">' + (player.firstName || '') + ' ' + (player.lastName || '') + photoWarning + '</h4>' +
                    '<p style="margin: 5px 0; color: var(--text-light); font-size: 0.85rem; line-height: 1.6;">' +
                    '<i class="fas fa-users" style="width: 16px; margin-right: 5px;"></i> ' + teamName + '<br>' +
                    '<i class="fas fa-birthday-cake" style="width: 16px; margin-right: 5px;"></i> ' + birthDate + '<br>' +
                    '<i class="fas fa-user" style="width: 16px; margin-right: 5px;"></i> ' + parentName +
                    '</p>' +
                    '<div class="product-actions" style="margin-top: 15px; display: flex; gap: 8px; justify-content: center;">' +
                    '<button class="btn-action edit-player" data-id="' + player.id + '" title="Modifier"><i class="fas fa-edit"></i></button>' +
                    '<button class="btn-danger delete-player" data-id="' + player.id + '" title="Supprimer"><i class="fas fa-trash"></i></button>' +
                    '</div>';

                gridContainer.appendChild(card);
            });

        } else if (viewMode === 'list' && tbody) {
            tbody.innerHTML = '';

            if (players.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Aucun joueur trouvé.</td></tr>';
                return;
            }

            players.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '')).forEach(player => {
                const teamName = player.teamId && window.dataCache.teams[player.teamId] ? window.dataCache.teams[player.teamId].name : 'Non assigné';
                const birthDate = player.birthDate || '-';
                const parentName = player.parentName || (player.parentFirstName && player.parentLastName ? player.parentFirstName + ' ' + player.parentLastName : '-');

                // Photo consent indicator
                const photoIcon = player.noPhotoConsent ? ' <i class="fas fa-camera-slash" style="color: #e74c3c;" title="Pas de diffusion de photos"></i>' : '';

                const row = document.createElement('tr');
                row.setAttribute('data-id', player.id);
                row.style.cursor = 'pointer';

                row.innerHTML =
                    '<td>' + (player.lastName || '') + photoIcon + '</td>' +
                    '<td>' + (player.firstName || '') + '</td>' +
                    '<td>' + teamName + '</td>' +
                    '<td>' + birthDate + '</td>' +
                    '<td>' + parentName + '</td>' +
                    '<td class="actions-cell">' +
                    '<button class="btn-action edit-player" data-id="' + player.id + '" title="Modifier"><i class="fas fa-edit"></i></button>' +
                    '<button class="btn-danger delete-player" data-id="' + player.id + '" title="Supprimer" onclick="event.stopPropagation()"><i class="fas fa-trash"></i></button>' +
                    '</td>';

                tbody.appendChild(row);
            });
        }

    } catch (error) {
        console.error("Error rendering players:", error);
    }
}

// Add click handlers for edit and delete buttons
document.addEventListener('click', async (e) => {
    // List View Row OR Grid View Card Click
    const clickableItem = e.target.closest('#players-directory-tbody tr') || e.target.closest('.product-card-admin');
    if (clickableItem && !e.target.closest('button') && !e.target.closest('.btn-action') && !e.target.closest('.btn-danger')) {
        const editBtn = clickableItem.querySelector('.edit-player');
        if (editBtn) editBtn.click();
        return;
    }

    // Edit player button
    if (e.target.closest('.edit-player')) {
        const btn = e.target.closest('.edit-player');
        const playerId = btn.dataset.id;

        if (window.dataCache.players && window.dataCache.players[playerId]) {
            const player = window.dataCache.players[playerId];
            if (typeof window.openPlayerModal === 'function') {
                window.openPlayerModal(player);
            } else {
                console.error("openPlayerModal function not found on window object.");
            }
        }
    }

    // Delete player button
    if (e.target.closest('.delete-player')) {
        const btn = e.target.closest('.delete-player');
        const playerId = btn.dataset.id;

        const confirmed = await window.showConfirm('Êtes-vous sûr de vouloir supprimer ce joueur ?');
        if (confirmed) {
            try {
                await window.deleteDoc(window.doc(window.db, 'players', playerId));
                // Reload the current view
                const gridContainer = document.getElementById('players-directory-list');
                const isGridView = gridContainer && gridContainer.style.display !== 'none';
                loadPlayersDirectory(isGridView ? 'grid' : 'list');
            } catch (error) {
                console.error('Error deleting player:', error);
                window.showAlert('Erreur lors de la suppression du joueur', 'error');
            }
        }
    }
});
