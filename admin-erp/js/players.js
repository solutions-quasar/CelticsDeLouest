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

    // Load players on page load
    if (document.getElementById('players-directory-list')) {
        loadPlayersDirectory('grid');
    }
});

// Load Players Directory Function
async function loadPlayersDirectory(viewMode = 'grid') {
    const gridContainer = document.getElementById('players-directory-list');
    const tbody = document.getElementById('players-directory-tbody');

    if (!gridContainer && !tbody) return;

    try {
        const playersSnapshot = await window.getDocs(window.collection(window.db, "players"));

        // Update Cache
        if (!window.dataCache.players) window.dataCache.players = {};
        playersSnapshot.forEach(doc => {
            window.dataCache.players[doc.id] = { id: doc.id, ...doc.data() };
        });

        if (viewMode === 'grid' && gridContainer) {
            gridContainer.innerHTML = '';

            playersSnapshot.forEach(doc => {
                const player = doc.data();
                const teamName = player.teamId && window.dataCache.teams[player.teamId] ? window.dataCache.teams[player.teamId].name : 'Non assigné';
                const birthDate = player.birthDate || '-';
                const parentName = player.parentName || (player.parentFirstName && player.parentLastName ? player.parentFirstName + ' ' + player.parentLastName : '-');

                const card = document.createElement('div');
                card.className = 'product-card-admin';
                card.setAttribute('data-id', doc.id);
                card.style.cursor = 'pointer';

                const initials = (player.firstName?.[0] || '?').toUpperCase() + (player.lastName?.[0] || '?').toUpperCase();

                card.innerHTML =
                    '<div class="admin-card-img circle-img" style="background: linear-gradient(135deg, var(--primary), var(--secondary)); color: white; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold;">' + initials + '</div>' +
                    '<h4 style="margin: 10px 0 5px 0; font-size: 1.1rem; color: var(--text-dark);">' + (player.firstName || '') + ' ' + (player.lastName || '') + '</h4>' +
                    '<p style="margin: 5px 0; color: var(--text-light); font-size: 0.85rem; line-height: 1.6;">' +
                    '<i class="fas fa-users" style="width: 16px; margin-right: 5px;"></i> ' + teamName + '<br>' +
                    '<i class="fas fa-birthday-cake" style="width: 16px; margin-right: 5px;"></i> ' + birthDate + '<br>' +
                    '<i class="fas fa-user" style="width: 16px; margin-right: 5px;"></i> ' + parentName +
                    '</p>' +
                    '<div class="product-actions" style="margin-top: 15px; display: flex; gap: 8px; justify-content: center;">' +
                    '<button class="btn-action edit-player" data-id="' + doc.id + '" title="Modifier"><i class="fas fa-edit"></i></button>' +
                    '<button class="btn-danger delete-player" data-id="' + doc.id + '" title="Supprimer"><i class="fas fa-trash"></i></button>' +
                    '</div>';

                gridContainer.appendChild(card);
            });

        } else if (viewMode === 'list' && tbody) {
            tbody.innerHTML = '';

            playersSnapshot.forEach(doc => {
                const player = doc.data();
                const teamName = player.teamId && window.dataCache.teams[player.teamId] ? window.dataCache.teams[player.teamId].name : 'Non assigné';
                const birthDate = player.birthDate || '-';
                const parentName = player.parentName || (player.parentFirstName && player.parentLastName ? player.parentFirstName + ' ' + player.parentLastName : '-');

                const row = document.createElement('tr');
                row.setAttribute('data-id', doc.id);
                row.style.cursor = 'pointer';

                row.innerHTML =
                    '<td>' + (player.lastName || '') + '</td>' +
                    '<td>' + (player.firstName || '') + '</td>' +
                    '<td>' + teamName + '</td>' +
                    '<td>' + birthDate + '</td>' +
                    '<td>' + parentName + '</td>' +
                    '<td class="actions-cell">' +
                    '<button class="btn-action edit-player" data-id="' + doc.id + '" title="Modifier"><i class="fas fa-edit"></i></button>' +
                    '<button class="btn-danger delete-player" data-id="' + doc.id + '" title="Supprimer" onclick="event.stopPropagation()"><i class="fas fa-trash"></i></button>' +
                    '</td>';

                tbody.appendChild(row);
            });
        }

    } catch (error) {
        console.error("Error loading players:", error);
        if (viewMode === 'grid' && gridContainer) {
            gridContainer.innerHTML = '<p style="text-align: center; padding: 20px;">Erreur de chargement</p>';
        } else if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Erreur de chargement</td></tr>';
        }
    }
}

// Add click handlers for edit and delete buttons
document.addEventListener('click', (e) => {
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

        // Find the player modal and populate it
        const modal = document.getElementById('player-modal');
        const playerIdInput = document.getElementById('player-id');

        if (modal && playerIdInput && window.dataCache.players && window.dataCache.players[playerId]) {
            const player = window.dataCache.players[playerId];

            // Load teams first
            loadTeamsIntoPlayerSelect();

            document.getElementById('player-modal-title').textContent = 'Modifier le Joueur';

            // Populate the form
            playerIdInput.value = playerId;
            if (document.getElementById('player-first-name')) document.getElementById('player-first-name').value = player.firstName || '';
            if (document.getElementById('player-last-name')) document.getElementById('player-last-name').value = player.lastName || '';
            if (document.getElementById('player-birth-date')) document.getElementById('player-birth-date').value = player.birthDate || '';
            if (document.getElementById('player-team')) document.getElementById('player-team').value = player.teamId || '';
            if (document.getElementById('player-parent-first-name')) document.getElementById('player-parent-first-name').value = player.parentFirstName || '';
            if (document.getElementById('player-parent-last-name')) document.getElementById('player-parent-last-name').value = player.parentLastName || '';
            if (document.getElementById('player-parent-email')) document.getElementById('player-parent-email').value = player.parentEmail || '';
            if (document.getElementById('player-parent-phone')) document.getElementById('player-parent-phone').value = player.parentPhone || '';

            // Open modal
            modal.classList.add('active');
        }
    }

    // Delete player button
    if (e.target.closest('.delete-player')) {
        const btn = e.target.closest('.delete-player');
        const playerId = btn.dataset.id;

        if (confirm('Êtes-vous sûr de vouloir supprimer ce joueur ?')) {
            window.deleteDoc(window.doc(window.db, 'players', playerId))
                .then(() => {
                    alert('Joueur supprimé avec succès');
                    // Reload the current view
                    const gridContainer = document.getElementById('players-directory-list');
                    const isGridView = gridContainer && gridContainer.style.display !== 'none';
                    loadPlayersDirectory(isGridView ? 'grid' : 'list');
                })
                .catch(error => {
                    console.error('Error deleting player:', error);
                    alert('Erreur lors de la suppression du joueur');
                });
        }
    }
});

// Load teams into select
function loadTeamsIntoPlayerSelect() {
    const teamSelect = document.getElementById('player-team');
    if (!teamSelect) return;

    // Clear existing options (keep the first one)
    while (teamSelect.options.length > 1) {
        teamSelect.remove(1);
    }

    if (window.dataCache && window.dataCache.teams) {
        const teams = Object.entries(window.dataCache.teams).map(([id, team]) => ({ id, ...team }));
        teams.sort((a, b) => a.name.localeCompare(b.name));

        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team.id;
            option.textContent = team.name + (team.category ? ' (' + team.category + ')' : '');
            teamSelect.appendChild(option);
        });
    }
}

// Add Player Modal Handlers
document.addEventListener('DOMContentLoaded', () => {
    // Add Player Button
    const addPlayerBtn = document.getElementById('open-player-modal-directory');
    if (addPlayerBtn) {
        addPlayerBtn.addEventListener('click', () => {
            const form = document.getElementById('player-form');
            if (form) form.reset();

            const idInput = document.getElementById('player-id');
            if (idInput) idInput.value = '';

            const title = document.getElementById('player-modal-title');
            if (title) title.textContent = 'Ajouter un Joueur';

            loadTeamsIntoPlayerSelect();
            const modal = document.getElementById('player-modal');
            if (modal) modal.classList.add('active');
        });
    }

    // Close Modal Button
    const playerModal = document.getElementById('player-modal');
    if (playerModal) {
        const closeBtns = playerModal.querySelectorAll('.close-modal, .close-modal-btn');
        closeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                playerModal.classList.remove('active');
            });
        });

        // Close on click outside
        window.addEventListener('click', (e) => {
            if (e.target === playerModal) {
                playerModal.classList.remove('active');
            }
        });
    }

    // Form Submit
    const playerForm = document.getElementById('player-form');
    if (playerForm) {
        playerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = document.getElementById('player-id').value;
            const data = {
                firstName: document.getElementById('player-first-name').value,
                lastName: document.getElementById('player-last-name').value,
                birthDate: document.getElementById('player-birth-date').value,
                teamId: document.getElementById('player-team').value,
                parentFirstName: document.getElementById('player-parent-first-name').value,
                parentLastName: document.getElementById('player-parent-last-name').value,
                parentEmail: document.getElementById('player-parent-email').value,
                parentPhone: document.getElementById('player-parent-phone').value,
                updatedAt: window.serverTimestamp()
            };

            try {
                if (id) {
                    // Update
                    await window.updateDoc(window.doc(window.db, 'players', id), data);
                    alert('Joueur mis à jour avec succès');
                } else {
                    // Create
                    data.createdAt = window.serverTimestamp();
                    await window.addDoc(window.collection(window.db, 'players'), data);
                    alert('Joueur créé avec succès');
                }

                if (playerModal) playerModal.classList.remove('active');

                // Refresh list
                const gridContainer = document.getElementById('players-directory-list');
                const isGridView = gridContainer && gridContainer.style.display !== 'none';
                loadPlayersDirectory(isGridView ? 'grid' : 'list');

            } catch (error) {
                console.error("Error saving player:", error);
                alert("Erreur lors de l'enregistrement: " + error.message);
            }
        });
    }
});
