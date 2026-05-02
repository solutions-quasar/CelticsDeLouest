export async function loadSummerCamp() {
    const container = document.getElementById('view-summer-camp');
    if (!container) return;

    console.log("Loading Summer Camp Module...");
    container.innerHTML = `
        <!-- TABS -->
        <div class="tabs" style="margin-bottom: 20px; display: flex; gap: 10px; border-bottom: 2px solid #eee; padding-bottom: 10px;">
            <button class="btn-tab active" data-tab="tab-camp-registrations" style="padding: 10px 20px; border: none; background: var(--primary); color: white; border-radius: 4px; cursor: pointer;">Inscrits</button>
            <button class="btn-tab" data-tab="tab-camp-periods" style="padding: 10px 20px; border: none; background: #eee; cursor: pointer; border-radius: 4px;">Périodes</button>
            <button class="btn-tab" data-tab="tab-camp-settings" style="padding: 10px 20px; border: none; background: #eee; cursor: pointer; border-radius: 4px;">Paramètres</button>
        </div>

        <!-- TAB CONTENT: REGISTRATIONS (default active) -->
        <div id="tab-camp-registrations" class="tab-content" style="display: block;">
            <div class="card">
                <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <h3>Liste des Inscrits au Camp</h3>
                    <button id="export-camp-csv" class="btn-secondary" style="font-size: 0.9rem;"><i class="fas fa-download"></i> Exporter CSV</button>
                </div>
                <div class="card-body">
                    <div class="table-container" style="max-height: 500px; overflow-y: auto;">
                        <table class="table" id="camp-registrations-table">
                            <thead>
                                <tr>
                                    <th>Date d'inscription</th>
                                    <th>Enfant</th>
                                    <th>Âge</th>
                                    <th>Périodes Choisies</th>
                                    <th>Parent</th>
                                    <th>Paiement</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td colspan="7" style="text-align:center;">Chargement...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Registration Details Modal -->
            <div id="modal-camp-reg-details" class="modal" style="padding: 0;">
                <div class="modal-content" style="width: 50%; height: 96vh; max-width: 900px; margin: 2vh auto; padding: 0; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; background: #f8f9fa; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                    <div style="background: white; padding: 15px 20px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.05); z-index: 10;">
                        <h2 style="margin: 0; font-size: 1.2rem; color: var(--primary);">Détails Inscription</h2>
                        <span class="close-modal-btn" style="position: static; font-size: 2rem; line-height: 1; color: #666; cursor: pointer;">&times;</span>
                    </div>
                    <form id="camp-reg-details-form" style="flex: 1; overflow-y: auto; padding: 20px; scroll-behavior: smooth;">
                        <div id="camp-reg-details-content"></div>
                    </form>
                    <div style="background: white; padding: 15px 20px; border-top: 1px solid #ddd; box-shadow: 0 -5px 20px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 10px; z-index: 100; border-radius: 0 0 12px 12px;">
                        <button type="submit" form="camp-reg-details-form" class="btn-save" style="width: 100%; margin: 0; padding: 12px; font-weight: 600; font-size: 1rem;">
                            <i class="fas fa-save"></i> Enregistrer
                        </button>
                        <button type="button" class="btn-close-custom" onclick="document.getElementById('modal-camp-reg-details').classList.remove('active')" style="width: 100%; padding: 12px; background: white; color: var(--primary); border: 2px solid var(--primary); border-radius: 6px; font-size: 1rem; cursor: pointer; font-weight: 600;">
                            Fermer
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- TAB CONTENT: PERIODS -->
        <div id="tab-camp-periods" class="tab-content" style="display: none;">
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <h3>Ajouter une Période</h3>
                </div>
                <div class="card-body">
                    <form id="form-add-camp-period" style="display: flex; gap: 15px; align-items: flex-end; flex-wrap: wrap;">
                        <div class="form-group" style="flex: 1; min-width: 150px;">
                            <label>Date Début</label>
                            <input type="date" id="period-start" class="form-control" required onclick="this.showPicker()" style="cursor: pointer;">
                        </div>
                        <div class="form-group" style="flex: 1; min-width: 150px;">
                            <label>Date Fin</label>
                            <input type="date" id="period-end" class="form-control" required onclick="this.showPicker()" style="cursor: pointer;">
                        </div>
                        <div class="form-group" style="flex: 1; min-width: 150px;">
                            <label>Places Max</label>
                            <input type="number" id="period-max" class="form-control" min="1" required>
                        </div>
                        <button type="submit" class="btn-action" style="height: 42px;"><i class="fas fa-plus"></i> Ajouter</button>
                    </form>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3>Périodes Existantes</h3>
                </div>
                <div class="card-body">
                    <div class="table-container">
                        <table class="table" id="camp-periods-table">
                            <thead>
                                <tr>
                                    <th>Période</th>
                                    <th>Inscrits / Max</th>
                                    <th>Statut</th>
                                    <th>Actions <button id="sync-camp-counts" title="Synchroniser les compteurs" style="background:none; border:none; color:var(--primary); cursor:pointer; margin-left:10px;"><i class="fas fa-sync-alt"></i></button></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td colspan="4" style="text-align:center;">Chargement...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- TAB CONTENT: SETTINGS -->
        <div id="tab-camp-settings" class="tab-content" style="display: none;">
            <div class="card">
                <div class="card-header">
                    <h3>Statut et Tarification</h3>
                </div>
                <div class="card-body">
                    <form id="form-camp-settings">
                        <div class="form-group" style="display: flex; align-items: center; justify-content: space-between; background: #f9f9f9; padding: 15px; border-radius: 8px;">
                            <div>
                                <strong>Inscriptions au camp de soccer</strong>
                                <p style="margin: 0; font-size: 0.85rem; color: #666;">Activer pour permettre au public de s'inscrire</p>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="camp-status-toggle">
                                <span class="slider round"></span>
                            </label>
                        </div>

                        <div class="form-group" style="margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <div>
                                <label>Tarif de base de l'inscription ($)</label>
                                <input type="number" id="camp-base-price" class="form-control" placeholder="ex: 230" required step="0.01">
                                <small>Le montant sera appliqué sans taxes.</small>
                            </div>
                            <div>
                                <label>Rabais 2ème enfant ($)</label>
                                <input type="number" id="camp-discount-2nd" class="form-control" placeholder="ex: 15" required step="0.01">
                                <small>Appliqué au total du 2ème enfant.</small>
                            </div>
                            <div>
                                <label>Rabais 3ème enfant+ ($)</label>
                                <input type="number" id="camp-discount-3rd" class="form-control" placeholder="ex: 20" required step="0.01">
                                <small>Appliqué au 3ème enfant et suivants.</small>
                            </div>
                        </div>

                        <div class="form-group" style="margin-top: 20px;">
                            <label>Texte de présentation (Page publique)</label>
                            <div id="camp-editor-toolbar">
                                <span class="ql-formats"><select class="ql-header"></select></span>
                                <span class="ql-formats">
                                    <button class="ql-bold"></button>
                                    <button class="ql-italic"></button>
                                    <button class="ql-underline"></button>
                                </span>
                                <span class="ql-formats">
                                    <button class="ql-list" value="ordered"></button>
                                    <button class="ql-list" value="bullet"></button>
                                </span>
                                <span class="ql-formats"><button class="ql-link"></button></span>
                            </div>
                            <div id="camp-settings-msg" style="height: 250px; background: white; border-radius: 0 0 4px 4px;"></div>
                        </div>

                        <button type="submit" class="btn-save" style="margin-top: 15px;"><i class="fas fa-save"></i> Enregistrer Paramètres</button>
                    </form>
                </div>
            </div>
        </div>

        <!-- Period Edit/View Modal -->
        <div id="modal-period-edit" class="modal">
            <div class="modal-content" style="max-width:700px; padding:0; overflow:hidden; border-radius:12px;">

                <!-- Header -->
                <div style="background:linear-gradient(135deg, var(--primary) 0%, #1a7a3c 100%); padding:18px 24px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <p style="margin:0; font-size:0.72rem; color:rgba(255,255,255,0.7); text-transform:uppercase; letter-spacing:1px;">Camp de soccer &mdash; Gestion de période</p>
                        <h3 id="modal-period-title" style="margin:4px 0 0; color:white; font-size:1.15rem; font-weight:700;"></h3>
                    </div>
                    <button class="close-modal-btn" style="background:rgba(255,255,255,0.2); border:none; color:white; width:34px; height:34px; border-radius:50%; font-size:1.3rem; cursor:pointer; display:flex; align-items:center; justify-content:center;">&times;</button>
                </div>

                <!-- Body -->
                <div style="padding:20px 24px;">

                    <!-- Edit Form -->
                    <div style="background:#f7faf8; border:1px solid #e0ede5; border-radius:10px; padding:16px 18px; margin-bottom:22px;">
                        <p style="margin:0 0 12px; font-size:0.78rem; font-weight:700; color:#555; text-transform:uppercase; letter-spacing:0.5px;"><i class="fas fa-pencil-alt" style="margin-right:5px; color:var(--primary);"></i>Modifier les paramètres</p>
                        <form id="form-edit-period" style="display:grid; grid-template-columns:1fr 1fr 130px auto; gap:12px; align-items:flex-end;">
                            <input type="hidden" id="edit-period-id">
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:0.82rem;">Date Début</label>
                                <input type="date" id="edit-period-start" class="form-control" required onclick="this.showPicker()" style="cursor:pointer;">
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:0.82rem;">Date Fin</label>
                                <input type="date" id="edit-period-end" class="form-control" required onclick="this.showPicker()" style="cursor:pointer;">
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label style="font-size:0.82rem;">Places Max</label>
                                <input type="number" id="edit-period-max" class="form-control" min="1" required>
                            </div>
                            <button type="submit" class="btn-action" style="height:42px; white-space:nowrap;"><i class="fas fa-save"></i> Sauvegarder</button>
                        </form>
                    </div>

                    <!-- Registrations Section -->
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                        <h4 style="margin:0; color:var(--primary); font-size:0.95rem;"><i class="fas fa-users" style="margin-right:6px;"></i>Inscrits dans cette période</h4>
                        <span id="period-reg-count" style="background:var(--primary); color:white; border-radius:20px; padding:3px 14px; font-size:0.8rem; font-weight:600;"></span>
                    </div>
                    <div id="period-registrations-list" style="max-height:240px; overflow-y:auto; border:1px solid #eee; border-radius:8px;">
                        <p style="color:#888; text-align:center; padding:24px; margin:0;">Chargement...</p>
                    </div>

                    <!-- Footer -->
                    <div style="margin-top:18px; text-align:right;">
                        <button class="close-modal-btn" style="background:#f0f0f0; border:none; color:#333; padding:9px 22px; border-radius:6px; cursor:pointer; font-size:0.9rem;"><i class="fas fa-times" style="margin-right:5px;"></i>Fermer</button>
                    </div>

                </div>
            </div>
        </div>

    `;

    // --- Tab Switching Logic ---
    const tabBtns = container.querySelectorAll('.btn-tab');
    const tabContents = container.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');

            tabBtns.forEach(b => {
                b.classList.remove('active');
                b.style.background = '#eee';
                b.style.color = '#333';
            });
            tabContents.forEach(c => c.style.display = 'none');

            btn.classList.add('active');
            btn.style.background = 'var(--primary)';
            btn.style.color = 'white';
            document.getElementById(target).style.display = 'block';
        });
    });

    // --- Initialize Quill for settings ---
    let campQuill;
    if (document.getElementById('camp-settings-msg')) {
        campQuill = new Quill('#camp-settings-msg', {
            modules: { toolbar: '#camp-editor-toolbar' },
            theme: 'snow'
        });
    }

    // --- Load Data ---
    await loadCampSettings(campQuill);
    loadCampPeriods(); // Now using onSnapshot internally
    await loadCampRegistrations();

    // --- Listeners ---
    document.getElementById('form-camp-settings').onsubmit = (e) => saveCampSettings(e, campQuill);
    document.getElementById('form-add-camp-period').onsubmit = addCampPeriod;
}

// Data loaders and savers
async function loadCampSettings(editor) {
    try {
        const docRef = window.doc(window.db, "settings", "camp_ete");
        const docSnap = await window.getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('camp-status-toggle').checked = !!data.registrationOpen;
            if (data.basePrice) {
                document.getElementById('camp-base-price').value = data.basePrice;
            }
            if (data.discount2nd) {
                document.getElementById('camp-discount-2nd').value = data.discount2nd;
            }
            if (data.discount3rd) {
                document.getElementById('camp-discount-3rd').value = data.discount3rd;
            }
            if (data.presentationText && editor) {
                editor.root.innerHTML = data.presentationText;
            }
        }
    } catch (e) {
        console.error("Error loading camp settings:", e);
    }
}

async function saveCampSettings(e, editor) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
    btn.disabled = true;

    try {
        const isOpen = document.getElementById('camp-status-toggle').checked;
        const text = editor ? editor.root.innerHTML : '';
        const price = parseFloat(document.getElementById('camp-base-price').value) || 0;
        const discount2nd = parseFloat(document.getElementById('camp-discount-2nd').value) || 0;
        const discount3rd = parseFloat(document.getElementById('camp-discount-3rd').value) || 0;

        await window.setDoc(window.doc(window.db, "settings", "camp_ete"), {
            registrationOpen: isOpen,
            presentationText: text,
            basePrice: price,
            discount2nd: discount2nd,
            discount3rd: discount3rd,
            updatedAt: window.serverTimestamp()
        }, { merge: true });

        window.showAlert("Paramètres du camp enregistrés !", "success");
    } catch (err) {
        console.error("Error saving settings:", err);
        window.showAlert("Erreur lors de la sauvegarde: " + err.message, "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function loadCampPeriods() {
    const tbody = document.querySelector('#camp-periods-table tbody');
    if (!tbody) return;

    // Cleanup previous listener if any
    if (window.campPeriodsUnsubscribe) {
        window.campPeriodsUnsubscribe();
    }

    try {
        const qP = window.query(window.collection(window.db, "camp_periods"), window.orderBy("startDate", "asc"));

        window.campPeriodsUnsubscribe = window.onSnapshot(qP, (snapshotP) => {
            tbody.innerHTML = '';
            if (snapshotP.empty) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Aucune période définie.</td></tr>';
                return;
            }

            snapshotP.forEach(doc => {
                const data = doc.data();
                const start = new Date(data.startDate + 'T12:00:00').toLocaleDateString('fr-CA');
                const end = new Date(data.endDate + 'T12:00:00').toLocaleDateString('fr-CA');

                // Source of truth is the currentRegistrations counter
                const current = data.currentRegistrations || 0;
                const max = data.maxCapacity || 0;
                const isFull = current >= max;

                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.title = 'Cliquer pour modifier cette période';
                tr.setAttribute('data-id', doc.id);
                tr.setAttribute('data-start', data.startDate);
                tr.setAttribute('data-end', data.endDate);
                tr.setAttribute('data-max', max);
                tr.innerHTML = `
                    <td>Du ${start} au ${end}</td>
                    <td>
                        <div style="width: 100%; background: #eee; height: 10px; border-radius: 5px; margin-bottom: 5px; overflow: hidden;">
                            <div style="width: ${max > 0 ? Math.min(100, (current / max) * 100) : 0}%; background: ${isFull ? '#e74c3c' : 'var(--primary)'}; height: 100%;"></div>
                        </div>
                        ${current} / ${max}
                    </td>
                    <td>${isFull ? '<span style="color:#e74c3c; font-weight:bold;">Complet</span>' : '<span style="color:var(--primary);">Ouvert</span>'}</td>
                    <td>
                        <button class="btn-action btn-delete-period" data-id="${doc.id}" title="Supprimer" style="background: white; color: #e74c3c; border: 1px solid #e74c3c; padding: 5px 10px; font-size: 0.8rem;"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                tr.onclick = () => openPeriodModal(
                    tr.getAttribute('data-id'),
                    tr.getAttribute('data-start'),
                    tr.getAttribute('data-end'),
                    tr.getAttribute('data-max')
                );
                tbody.appendChild(tr);
            });

            // Re-bind delete listeners (stopPropagation so row click doesn't fire)
            tbody.querySelectorAll('.btn-delete-period').forEach(btn => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    if (await window.showConfirm("Êtes-vous sûr de vouloir supprimer cette période ?")) {
                        await window.deleteDoc(window.doc(window.db, "camp_periods", btn.getAttribute('data-id')));
                        window.showAlert("Période supprimée", "success");
                    }
                };
            });
        }, (err) => {
            console.error("Error listening to periods:", err);
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Erreur: ${err.message}</td></tr>`;
        });

        // Add sync listener
        const syncBtn = document.getElementById('sync-camp-counts');
        if (syncBtn) {
            syncBtn.onclick = async () => {
                syncBtn.classList.add('fa-spin');
                try {
                    await synchronizeCampCounts();
                    window.showAlert("Compteurs synchronisés !", "success");
                } catch (e) {
                    console.error(e);
                    window.showAlert("Erreur sync: " + e.message, "error");
                } finally {
                    syncBtn.classList.remove('fa-spin');
                }
            };
        }

    } catch (err) {
        console.error("Error setting up periods listener:", err);
    }
}

async function addCampPeriod(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
        const start = document.getElementById('period-start').value;
        const end = document.getElementById('period-end').value;
        const max = parseInt(document.getElementById('period-max').value, 10);

        if (start > end) {
            throw new Error("La date de début doit être avant la date de fin.");
        }

        await window.addDoc(window.collection(window.db, "camp_periods"), {
            startDate: start,
            endDate: end,
            maxCapacity: max,
            currentRegistrations: 0,
            createdAt: window.serverTimestamp()
        });

        window.showAlert("Période ajoutée avec succès !", "success");
        e.target.reset();
        loadCampPeriods();
    } catch (err) {
        console.error("Error adding period:", err);
        window.showAlert(err.message, "error");
    } finally {
        btn.disabled = false;
    }
}

async function loadCampRegistrations() {
    const tbody = document.querySelector('#camp-registrations-table tbody');
    if (!tbody) return;

    try {
        // Build periods lookup map
        const periodsSnapshot = await window.getDocs(window.collection(window.db, "camp_periods"));
        const periodsMap = {};
        window.allPeriodsCache = []; // Store full data for modal select
        periodsSnapshot.forEach(doc => {
            const p = doc.data();
            const startStr = p.startDate ? new Date(p.startDate + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) : '?';
            const endStr = p.endDate ? new Date(p.endDate + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) : '?';
            const display = `Du ${startStr} au ${endStr}`;
            periodsMap[doc.id] = {
                display: display,
                startDate: p.startDate || '9999-99-99'
            };
            window.allPeriodsCache.push({
                id: doc.id,
                display: display,
                startDate: p.startDate
            });
        });
        // Sort periods by date for the selector
        window.allPeriodsCache.sort((a, b) => a.startDate.localeCompare(b.startDate));

        const q = window.query(window.collection(window.db, "camp_registrations"), window.orderBy("timestamp", "desc"));
        const snapshot = await window.getDocs(q);

        tbody.innerHTML = '';
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Aucun inscrit pour le moment.</td></tr>';
            return;
        }

        const registrations = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const regId = doc.id;

            // Calculate earliest period start date for sorting
            const periodsIds = data.weeksSelected || data.selectedPeriodsId || [];
            let earliestDate = '9999-99-99';
            periodsIds.forEach(id => {
                if (periodsMap[id] && periodsMap[id].startDate < earliestDate) {
                    earliestDate = periodsMap[id].startDate;
                }
            });

            // Calculate age for sorting
            const age = data.childAge || (new Date().getFullYear() - (data.yearOfBirth || parseInt((data.dob || '').split('-')[0]) || 0));

            registrations.push({ id: regId, data, earliestDate, age });
        });

        // Sort: 1. By Period Start Date, 2. By Age
        registrations.sort((a, b) => {
            if (a.earliestDate !== b.earliestDate) {
                return a.earliestDate.localeCompare(b.earliestDate);
            }
            return (a.age || 0) - (b.age || 0);
        });

        window.campRegCache = {}; // Simple local cache for modal

        registrations.forEach(reg => {
            const data = reg.data;
            const docId = reg.id;
            window.campRegCache[docId] = data;

            let dateStr = 'Inconnu';
            if (data.timestamp && data.timestamp.toDate) {
                dateStr = data.timestamp.toDate().toLocaleDateString('fr-CA');
            }

            const periodsIds = data.weeksSelected || data.selectedPeriodsId || [];
            const periodsDisplay = periodsIds.map(id => periodsMap[id] ? periodsMap[id].display : `ID: ${id}`).join('<br>');
            const price = data.totalPaid || data.finalPrice || '0.00';
            const payStatus = data.status || data.paymentStatus || 'En attente';
            const statusBadge = payStatus === 'Paid' ? '<span class="badge" style="background:#2ecc71; color:white;">Payé</span>' : '<span class="badge" style="background:#f39c12; color:white;">En attente</span>';

            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.title = 'Cliquer pour voir les détails';
            tr.innerHTML = `
                <td>${dateStr}</td>
                <td><strong>${data.childFirstName} ${data.childLastName}</strong></td>
                <td>${reg.age} ans</td>
                <td style="font-size: 0.85rem; line-height: 1.2;">${periodsDisplay || 'Aucune'}</td>
                <td>
                    <div style="font-size: 0.85rem;"><strong>${data.parent1Name || (data.parentFirstName + ' ' + data.parentLastName)}</strong></div>
                    <small>${data.parent1Email || data.parentEmail}</small>
                </td>
                <td>${price} $ ${statusBadge}</td>
                <td>
                    <button class="btn-action btn-del-reg" data-id="${docId}" title="Supprimer" style="background: white; color: #e74c3c; border: 1px solid #e74c3c; padding: 5px 10px; font-size: 0.8rem;"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tr.onclick = () => showRegDetails(docId);
            tbody.appendChild(tr);
        });

        // Listeners — delete button stops propagation so row click doesn't also fire
        tbody.querySelectorAll('.btn-del-reg').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                if (await window.showConfirm("Supprimer cette inscription ? Cela libérera automatiquement les places dans les périodes correspondantes.")) {
                    const regId = btn.getAttribute('data-id');
                    try {
                        await window.deleteDoc(window.doc(window.db, "camp_registrations", regId));
                        loadCampRegistrations();
                        window.showAlert("Inscription supprimée (les places seront libérées automatiquement)", "success");
                    } catch (e) {
                        console.error("Error deleting registration:", e);
                        window.showAlert("Erreur: " + e.message, "error");
                    }
                }
            };
        });

    } catch (err) {
        console.error("Error loading camp registrations:", err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red;">Erreur: ${err.message}</td></tr>`;
    }
}

function showRegDetails(id) {
    const data = window.campRegCache[id];
    if (!data) return;

    const content = document.getElementById('camp-reg-details-content');
    content.innerHTML = `
        <input type="hidden" id="edit-reg-id" value="${id}">
        
        <!-- 1. Enfant -->
        <div style="background:#f0f8ff; padding:15px; border-radius:8px; margin-bottom:15px;">
            <h4 style="margin-top:0; color:#333; margin-bottom:10px;"><i class="fas fa-child"></i> Enfant</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                <div class="form-group">
                    <label>Prénom</label>
                    <input type="text" id="edit-reg-child-first" value="${data.childFirstName || ''}">
                </div>
                <div class="form-group">
                    <label>Nom</label>
                    <input type="text" id="edit-reg-child-last" value="${data.childLastName || ''}">
                </div>
                <div class="form-group">
                    <label>Date de Naissance</label>
                    <input type="date" id="edit-reg-dob" value="${data.dob || ''}" onclick="this.showPicker()" style="cursor: pointer;">
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 15px;">
                <div class="form-group">
                    <label>Sexe</label>
                    <select id="edit-reg-gender">
                        <option value="M" ${data.gender === 'M' ? 'selected' : ''}>Masculin</option>
                        <option value="F" ${data.gender === 'F' ? 'selected' : ''}>Féminin</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Médical / Allergies</label>
                    <input type="text" id="edit-reg-medical" value="${data.medical || 'Aucune'}">
                </div>
            </div>
        </div>

        <!-- 2. Parents & Contact -->
        <div style="background:#fff3e0; padding:15px; border-radius:8px; margin-bottom:15px;">
            <h4 style="margin-top:0; color:#333; margin-bottom:10px;"><i class="fas fa-users"></i> Parents & Contact</h4>
            <div class="form-group" style="margin-bottom:10px;">
                <label>Nom Parent(s)</label>
                <input type="text" id="edit-reg-parent-name" value="${data.parent1Name || (data.parentFirstName + ' ' + data.parentLastName)}">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div class="form-group">
                    <label>Courriel</label>
                    <input type="email" id="edit-reg-parent-email" value="${data.parent1Email || data.parentEmail}">
                </div>
                <div class="form-group">
                    <label>Téléphone Famille</label>
                    <input type="tel" id="edit-reg-phone" value="${data.phoneFamily || data.parentPhone}">
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top:10px;">
                <div class="form-group">
                    <label>Adresse</label>
                    <input type="text" id="edit-reg-address" value="${data.address || ''}">
                </div>
                <div class="form-group">
                    <label>Ville</label>
                    <input type="text" id="edit-reg-city" value="${data.city || ''}">
                </div>
                <div class="form-group">
                    <label>Code Postal</label>
                    <input type="text" id="edit-reg-postal" value="${data.postalCode || ''}">
                </div>
            </div>
            <div class="form-group" style="margin-top:10px;">
                <label>Personnes Autorisées / Urgence</label>
                <textarea id="edit-reg-authorized" rows="2" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px; font-family:inherit;">${data.authorizedPersons || ''}</textarea>
            </div>
        </div>

        <!-- 3. Sélection & Options -->
        <div style="background:#e8f5e9; padding:15px; border-radius:8px; margin-bottom:15px;">
            <h4 style="margin-top:0; color:#333; margin-bottom:10px;"><i class="fas fa-calendar-week"></i> Sélection & Options</h4>
            <div class="form-group">
                <label>Périodes Sélectionnées</label>
                <div id="edit-reg-periods-container" style="background: white; border: 1px solid #ddd; border-radius: 6px; padding: 10px; max-height: 150px; overflow-y: auto; display: grid; gap: 8px;">
                    ${(window.allPeriodsCache || []).map(p => {
        const isSelected = (data.weeksSelected || data.selectedPeriodsId || []).includes(p.id);
        return `
                            <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.9rem; gap: 8px;">
                                <input type="checkbox" class="period-checkbox" value="${p.id}" ${isSelected ? 'checked' : ''} style="width: 18px; height: 18px;">
                                <span>${p.display}</span>
                            </label>
                        `;
    }).join('')}
                    ${(!window.allPeriodsCache || window.allPeriodsCache.length === 0) ? '<p style="color:#888; font-size:0.8rem; margin:0;">Aucune période définie.</p>' : ''}
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top:10px;">
                <div class="form-group">
                    <label>Consentement Photo</label>
                    <select id="edit-reg-photo">
                        <option value="Oui" ${data.photoAuth === 'Oui' ? 'selected' : ''}>Accepté</option>
                        <option value="Non" ${data.photoAuth === 'Non' ? 'selected' : ''}>Refusé</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- 4. Demandes Particulières -->
        <div style="background:#fff8e1; padding:15px; border-radius:8px; margin-bottom:15px; border-left: 4px solid #f59e0b;">
            <h4 style="margin-top:0; color:#92400e; margin-bottom:10px;"><i class="fas fa-exclamation-circle"></i> Demandes Particulières</h4>
            <textarea id="edit-reg-special" rows="2" style="width:100%; padding:10px; border:1px solid #f59e0b; border-radius:6px; background:#fffbf2; font-family:inherit;">${data.specialRequests || 'Aucune'}</textarea>
        </div>

        <!-- 5. Administration -->
        <div style="background:#ddd; padding:15px; border-radius:8px; margin-bottom:15px;">
            <h4 style="margin-top:0; color:#333; margin-bottom:10px;"><i class="fas fa-cogs"></i> Administration</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                <div class="form-group">
                    <label>Total Payé ($)</label>
                    <input type="number" step="0.01" id="edit-reg-total" value="${data.totalPaid || data.finalPrice || '0.00'}">
                </div>
                <div class="form-group">
                    <label>Statut</label>
                    <select id="edit-reg-status">
                        <option value="Paid" ${data.status === 'Paid' || data.paymentStatus === 'Paid' ? 'selected' : ''}>Payé</option>
                        <option value="En attente" ${data.status === 'En attente' || data.paymentStatus === 'En attente' ? 'selected' : ''}>En attente</option>
                        <option value="Annulé" ${data.status === 'Annulé' ? 'selected' : ''}>Annulé</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Stripe ID</label>
                    <input type="text" id="edit-reg-stripe" value="${data.stripePaymentIntentId || ''}" readonly style="background:#eee; font-size:0.8rem;">
                </div>
            </div>
        </div>
    `;

    // Bind save logic
    const form = document.getElementById('camp-reg-details-form');
    form.onsubmit = async (e) => {
        e.preventDefault();
        await saveCampReg(id);
    };

    document.getElementById('modal-camp-reg-details').classList.add('active');
}

async function saveCampReg(id) {
    const btn = document.querySelector('#modal-camp-reg-details .btn-save');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';

    try {
        const updateData = {
            childFirstName: document.getElementById('edit-reg-child-first').value,
            childLastName: document.getElementById('edit-reg-child-last').value,
            dob: document.getElementById('edit-reg-dob').value,
            gender: document.getElementById('edit-reg-gender').value,
            medical: document.getElementById('edit-reg-medical').value,
            parent1Name: document.getElementById('edit-reg-parent-name').value,
            parent1Email: document.getElementById('edit-reg-parent-email').value,
            phoneFamily: document.getElementById('edit-reg-phone').value,
            address: document.getElementById('edit-reg-address').value,
            city: document.getElementById('edit-reg-city').value,
            postalCode: document.getElementById('edit-reg-postal').value,
            authorizedPersons: document.getElementById('edit-reg-authorized').value,
            weeksSelected: Array.from(document.querySelectorAll('.period-checkbox:checked')).map(cb => cb.value),
            photoAuth: document.getElementById('edit-reg-photo').value,
            specialRequests: document.getElementById('edit-reg-special').value,
            totalPaid: parseFloat(document.getElementById('edit-reg-total').value),
            status: document.getElementById('edit-reg-status').value
        };

        await window.updateDoc(window.doc(window.db, "camp_registrations", id), updateData);

        // Update cache locally
        window.campRegCache[id] = { ...window.campRegCache[id], ...updateData };

        window.showAlert("Inscription mise à jour !", "success");
        loadCampRegistrations(); // Refresh list
        document.getElementById('modal-camp-reg-details').classList.remove('active');
    } catch (err) {
        console.error("Error saving registration:", err);
        window.showAlert("Erreur: " + err.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
}

// Close Modal logic — delegated so it works after innerHTML injection
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.close-modal-btn');
    if (btn) {
        const modal = btn.closest('.modal');
        if (modal) modal.classList.remove('active');
    }
});

async function synchronizeCampCounts() {
    console.log("Synchronizing camp counts...");
    const periodsSnap = await window.getDocs(window.collection(window.db, "camp_periods"));
    const regsSnap = await window.getDocs(window.collection(window.db, "camp_registrations"));

    const counts = {};
    regsSnap.forEach(doc => {
        const data = doc.data();
        const selected = data.weeksSelected || data.selectedPeriodsId || [];
        selected.forEach(pId => { counts[pId] = (counts[pId] || 0) + 1; });
    });

    const batch = [];
    periodsSnap.forEach(pDoc => {
        const realCount = counts[pDoc.id] || 0;
        const pRef = window.doc(window.db, "camp_periods", pDoc.id);
        batch.push(window.updateDoc(pRef, { currentRegistrations: realCount }));
    });
    await Promise.all(batch);
}

async function openPeriodModal(periodId, startDate, endDate, maxCapacity) {
    // Populate edit form
    document.getElementById('edit-period-id').value = periodId;
    document.getElementById('edit-period-start').value = startDate;
    document.getElementById('edit-period-end').value = endDate;
    document.getElementById('edit-period-max').value = maxCapacity;

    const startFr = new Date(startDate + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('modal-period-title').textContent = `Période : ${startFr}`;

    // Show modal
    document.getElementById('modal-period-edit').classList.add('active');

    // Load registrations for this period
    const listEl = document.getElementById('period-registrations-list');
    listEl.innerHTML = '<p style="color:#888; text-align:center; padding:20px;">Chargement...</p>';

    try {
        const regsSnap = await window.getDocs(window.collection(window.db, "camp_registrations"));
        const matched = [];
        regsSnap.forEach(doc => {
            const data = doc.data();
            const weeks = data.weeksSelected || data.selectedPeriodsId || [];
            if (weeks.includes(periodId)) matched.push({ id: doc.id, ...data });
        });

        const countBadge = document.getElementById('period-reg-count');

        if (matched.length === 0) {
            if (countBadge) countBadge.textContent = '0 inscrit';
            listEl.innerHTML = '<p style="color:#888; text-align:center; padding:24px; margin:0;">Aucun inscrit pour cette période.</p>';
            return;
        }

        if (countBadge) countBadge.textContent = `${matched.length} inscrit${matched.length > 1 ? 's' : ''}`;

        listEl.innerHTML = `
            <table class="table" style="font-size:0.88rem;">
                <thead><tr>
                    <th>Enfant</th>
                    <th>Âge</th>
                    <th>Parent</th>
                    <th>Courriel</th>
                    <th>Statut</th>
                </tr></thead>
                <tbody>
                    ${matched.map(r => {
            const age = new Date().getFullYear() - parseInt((r.dob || '').split('-')[0]);
            const payStatus = r.status === 'Paid'
                ? '<span class="badge" style="background:#2ecc71;color:white;">Payé</span>'
                : '<span class="badge" style="background:#f39c12;color:white;">En attente</span>';
            return `<tr>
                            <td><strong>${r.childFirstName} ${r.childLastName}</strong></td>
                            <td>${isNaN(age) ? '—' : age + ' ans'}</td>
                            <td>${r.parentFirstName || ''} ${r.parentLastName || ''}</td>
                            <td><small>${r.parentEmail || ''}</small></td>
                            <td>${payStatus}</td>
                        </tr>`;
        }).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        listEl.innerHTML = `<p style="color:red;">Erreur: ${e.message}</p>`;
    }

    // Bind save form
    const editForm = document.getElementById('form-edit-period');
    editForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = editForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            const newStart = document.getElementById('edit-period-start').value;
            const newEnd = document.getElementById('edit-period-end').value;
            const newMax = parseInt(document.getElementById('edit-period-max').value, 10);
            if (newStart > newEnd) throw new Error("La date de début doit être avant la date de fin.");

            await window.updateDoc(window.doc(window.db, "camp_periods", periodId), {
                startDate: newStart,
                endDate: newEnd,
                maxCapacity: newMax
            });
            window.showAlert("Période mise à jour !", "success");
            document.getElementById('modal-period-edit').classList.remove('active');
        } catch (err) {
            window.showAlert("Erreur: " + err.message, "error");
        } finally {
            btn.disabled = false;
        }
    };
}

