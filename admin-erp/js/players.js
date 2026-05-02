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

// ==========================================
// PLAYER EXPORT FUNCTIONALITY
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const btnExportPlayers = document.getElementById('btn-export-players');
    const exportModal = document.getElementById('player-export-modal');
    const exportForm = document.getElementById('player-export-form');
    const optionalFieldsContainer = document.getElementById('export-optional-fields-container');
    const btnSelectAll = document.getElementById('btn-export-select-all');
    const btnDeselectAll = document.getElementById('btn-export-deselect-all');
    const exportTeamFilter = document.getElementById('export-team-filter');

    // EXCLUDE THESE MANDATORY OR INTERNAL FIELDS FROM DYNAMIC OPTIONS
    const excludedKeys = ['id', 'firstName', 'lastName', 'birthDate', 'dob', 'searchTerms', 'createdAt', 'updatedAt'];

    // Nice labels for known keys
    const fieldLabels = {
        'email': 'Courriel',
        'phone': 'Téléphone',
        'parentName': 'Nom complet du parent',
        'parentFirstName': 'Prénom du parent',
        'parentLastName': 'Nom de famille du parent',
        'parentEmail': 'Courriel du parent',
        'parentPhone': 'Téléphone du parent',
        'teamId': 'ID de l\'équipe',
        'seasonId': 'ID de la saison',
        'gender': 'Sexe',
        'category': 'Catégorie',
        'address': 'Adresse',
        'city': 'Ville',
        'zipCode': 'Code postal',
        'medicalInfo': 'Info. médicale',
        'noPhotoConsent': 'Refus photo',
        'registrationDate': 'Date d\'inscription',
        'status': 'Statut',
        'jerseySize': 'Taille du chandail',
        'medicalCondition': 'Condition médicale',
        'medical': 'Infos. médicales supplémentaires',
        'name': 'Nom complet personnalisé',
        'parent1Email': 'Courriel du parent 1',
        'parent1Name': 'Nom du parent 1',
        'parent2Email': 'Courriel du parent 2',
        'parent2Name': 'Nom du parent 2',
        'pos': 'Position',
        'shortOption': 'Option de short',
        'shortSize': 'Taille du short',
        'socksOption': 'Option de bas',
        'socksQuantity': 'Quantité de bas',
        'socksSize': 'Taille des bas',
        'sourceRegistrationId': 'ID de l\'inscription source',
        'specialRequests': 'Demandes spéciales',
        'year': 'Année de naissance',
        'photoAuth': 'Autorisation photo',
        'postalCode': 'Code postal (alt)',
        'skill': 'Niveau/Compétence'
    };


    if (btnExportPlayers) {
        btnExportPlayers.addEventListener('click', () => {
            // Check if players exist in cache
            if (!window.dataCache || !window.dataCache.players) {
                if (window.showAlert) window.showAlert("Aucun joueur n'est chargé en mémoire.", "warning");
                return;
            }

            // Populate Team Filter Dropdown
            if (exportTeamFilter) {
                // Keep the "Toutes les équipes" option
                exportTeamFilter.innerHTML = '<option value="all">Toutes les équipes</option>';

                if (window.dataCache.teams) {
                    const teams = Object.values(window.dataCache.teams).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    teams.forEach(team => {
                        if (!team) return;
                        const option = document.createElement('option');
                        option.value = team.id;
                        option.textContent = team.name || team.id;
                        exportTeamFilter.appendChild(option);
                    });
                }
            }

            const players = Object.values(window.dataCache.players);
            if (players.length === 0) {
                if (window.showAlert) window.showAlert("La liste des joueurs est vide.", "info");
                return;
            }

            // Extract all unique keys from all players
            const allKeys = new Set();
            players.forEach(player => {
                Object.keys(player).forEach(key => {
                    // Filter out excluded keys and complex objects (arrays/objects) if any
                    // For simplicity we will assume string/number/boolean values are exportable
                    if (!excludedKeys.includes(key)) {
                        allKeys.add(key);
                    }
                });
            });

            // Build checkboxes dynamically
            optionalFieldsContainer.innerHTML = '';
            const sortedKeys = Array.from(allKeys).sort();

            sortedKeys.forEach(key => {
                const labelText = fieldLabels[key] || key;

                const labelEl = document.createElement('label');
                labelEl.style.display = 'flex';
                labelEl.style.alignItems = 'center';
                labelEl.style.justifyContent = 'flex-start';
                labelEl.style.gap = '8px';
                labelEl.style.fontSize = '0.9rem';
                labelEl.style.cursor = 'pointer';
                labelEl.style.fontWeight = '500';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'export-field-cb';
                checkbox.value = key;
                checkbox.style.margin = '0';
                checkbox.style.width = 'auto';
                checkbox.style.flex = 'none';
                // Pre-check fields that are known/important, off by default for rest
                checkbox.checked = !!fieldLabels[key];

                labelEl.appendChild(checkbox);
                labelEl.appendChild(document.createTextNode(labelText));

                optionalFieldsContainer.appendChild(labelEl);
            });

            // If no optional fields found
            if (sortedKeys.length === 0) {
                optionalFieldsContainer.innerHTML = '<p style="color: #666; font-style: italic; font-size: 0.9rem;">Aucune information supplémentaire disponible.</p>';
            }

            // Show modal
            exportModal.classList.add('active');
        });

        // Close modal logic
        const closeModalBtn = exportModal.querySelector('.close-modal');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                exportModal.classList.remove('active');
            });
        }
    }

    if (btnSelectAll) {
        btnSelectAll.addEventListener('click', () => {
            const checkboxes = optionalFieldsContainer.querySelectorAll('.export-field-cb');
            checkboxes.forEach(cb => cb.checked = true);
        });
    }

    if (btnDeselectAll) {
        btnDeselectAll.addEventListener('click', () => {
            const checkboxes = optionalFieldsContainer.querySelectorAll('.export-field-cb');
            checkboxes.forEach(cb => cb.checked = false);
        });
    }

    if (exportForm) {
        exportForm.addEventListener('submit', (e) => {
            e.preventDefault();

            // 1. Determine selected optional fields
            const checkboxes = optionalFieldsContainer.querySelectorAll('.export-field-cb');
            const selectedOptionalKeys = [];
            checkboxes.forEach(cb => {
                if (cb.checked) {
                    selectedOptionalKeys.push(cb.value);
                }
            });

            // 2. Determine format
            const format = document.getElementById('export-format').value;

            // 3. Process data
            let players = Object.values(window.dataCache.players || {});

            // Apply current filters if needed (optional: we can export only filtered view or all - let's export all based on current season filter)
            const filterSeason = document.getElementById('player-filter-season');
            const seasonId = filterSeason?.value || 'all';
            if (seasonId !== 'all') {
                players = players.filter(p => p.seasonId === seasonId);
            }

            // Apply Team Filter from the export modal
            const teamId = exportTeamFilter ? exportTeamFilter.value : 'all';
            if (teamId !== 'all') {
                players = players.filter(p => p.teamId === teamId);
            }

            if (players.length === 0) {
                if (window.showAlert) window.showAlert("Aucun joueur à exporter avec le filtre actuel.", "warning");
                return;
            }

            // Map data to Flat Array for SheetJS
            const exportData = players.map(player => {
                const row = {
                    'Prénom': player.firstName || '',
                    'Nom': player.lastName || '',
                    'Date de naissance': player.birthDate || player.dob || ''
                };

                selectedOptionalKeys.forEach(key => {
                    const labelText = fieldLabels[key] || key;
                    const val = player[key];
                    // Format boolean to Oui/Non to be cleaner
                    if (typeof val === 'boolean') {
                        row[labelText] = val ? 'Oui' : 'Non';
                    } else if (Array.isArray(val)) {
                        row[labelText] = val.join(', ');
                    } else if (val && typeof val === 'object' && val.seconds) { // Firestore timestamp
                        row[labelText] = new Date(val.seconds * 1000).toLocaleDateString();
                    } else {
                        row[labelText] = val || '';
                    }
                });

                return row;
            });

            // 4. Generate File
            try {
                const ws = XLSX.utils.json_to_sheet(exportData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Joueurs");

                const dateStr = new Date().toISOString().split('T')[0];
                const fileName = `Export_Joueurs_${dateStr}.${format}`;

                if (format === 'csv') {
                    XLSX.writeFile(wb, fileName, { bookType: "csv" });
                } else {
                    // xlsx
                    XLSX.writeFile(wb, fileName, { bookType: "xlsx" });
                }

                exportModal.classList.remove('active');
                if (window.showAlert) window.showAlert("Exportation réussie !", "success");

            } catch (err) {
                console.error("Erreur lors de l'exportation:", err);
                if (window.showAlert) window.showAlert("Erreur lors de la génération du fichier.", "error");
            }
        });
    }
});
