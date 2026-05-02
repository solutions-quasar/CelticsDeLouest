// BILLING MODULE

// State for sorting and caching
window.cachedInvoices = [];
window.cachedStats = null;
window.currentSort = { field: 'date', direction: 'desc' };

export async function loadBilling() {
    const container = document.getElementById('view-billing');
    if (!container) return;

    console.log("Loading Billing Module...");
    container.innerHTML = `
        <div class="dashboard-header">
            <h2><i class="fas fa-file-invoice-dollar"></i> Facturation & Revenus</h2>
            <button class="btn-action" id="btn-new-invoice"><i class="fas fa-plus"></i> Nouvelle Facture</button>
        </div>

        <!-- STATS CARDS -->
        <div style="display:flex; gap:20px; margin-bottom:20px;">
            <div class="card" style="flex:1; background: linear-gradient(135deg, #2ecc71, #27ae60); color:white;">
                <div class="card-body" style="text-align:center;">
                    <h3>Revenus Encaissés</h3>
                    <div style="font-size:2rem; font-weight:800;" id="bill-total-paid">0.00 $</div>
                    <small>Total payé (Stripe)</small>
                </div>
            </div>
            <div class="card" style="flex:1; background: linear-gradient(135deg, #f39c12, #d35400); color:white;">
                <div class="card-body" style="text-align:center;">
                    <h3>En Attente</h3>
                    <div style="font-size:2rem; font-weight:800;" id="bill-total-pending">0.00 $</div>
                    <small>Factures ouvertes / Versements futurs</small>
                </div>
            </div>
            <div class="card" style="flex:1;">
                <div class="card-body" style="text-align:center;">
                    <h3>Transactions</h3>
                    <div style="font-size:2rem; font-weight:800;" id="bill-tx-count">0</div>
                    <small>Nombre de paiements</small>
                </div>
            </div>
        </div>

        <!-- INVOICES TABLE -->
        <div class="card" style="margin-bottom:20px;">
            <div class="card-header" style="display:flex; align-items:center; gap:10px; flex-wrap: wrap;">
                <h3>Historique des Factures (Stripe)</h3>
                <select id="billing-status-filter" style="padding:10px; border:1px solid #ddd; border-radius:8px; outline:none;">
                    <option value="all">Tous les statuts</option>
                    <option value="paid">Payés</option>
                    <option value="draft">Brouillons (Futur)</option>
                    <option value="open">En attente (Ouvert)</option>
                    <option value="void">Annulés</option>
                    <option value="uncollectible">Impayés</option>
                </select>
                <div class="search-container" style="margin-left:auto; position:relative; min-width:300px;">
                    <div class="search-input-wrapper" style="display:flex; align-items:center; background:#f1f3f4; border-radius:8px; padding:0 10px;">
                        <i class="fas fa-search" style="color:#666;"></i>
                        <input type="text" id="billing-search" placeholder="Rechercher un client ou email..." style="width:100%; border:none; background:none; padding:10px; outline:none;">
                    </div>
                    <div id="search-suggestions" class="search-results-overlay" style="position:absolute; top:100%; left:0; right:0; background:white; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.1); z-index:1000; display:none; max-height:200px; overflow-y:auto; margin-top:5px; border:1px solid #eee;"></div>
                </div>
            </div>
            <div class="card-body">
                <div class="table-container" style="max-height: 500px; overflow-y: auto;">
                    <table class="table" id="invoices-table">
                        <thead>
                            <tr>
                                <th class="sortable-header" data-sort="date" style="cursor:pointer; white-space:nowrap;">Date <i class="fas fa-sort" id="sort-icon-date"></i></th>
                                <th class="sortable-header" data-sort="customer" style="cursor:pointer; white-space:nowrap;">Client / Email <i class="fas fa-sort" id="sort-icon-customer"></i></th>
                                <th class="sortable-header" data-sort="amount" style="cursor:pointer; white-space:nowrap;">Montant <i class="fas fa-sort" id="sort-icon-amount"></i></th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colspan="5" style="text-align:center;">
                                    <div class="loading-container">
                                        <div class="billing-loader"></div>
                                        <span>Récupération des factures depuis Stripe...</span>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- SCHEDULED PAYMENTS TABLE -->
        <div class="card">
            <div class="card-header">
                <h3>Paiements Planifiés (Versements à venir)</h3>
            </div>
            <div class="card-body">
                <div class="table-container">
                    <table class="table" id="scheduled-payments-table">
                        <thead>
                            <tr>
                                <th>Date d'échéance</th>
                                <th>Client / Session</th>
                                <th>Montant</th>
                                <th>Description</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colspan="5" style="text-align:center;">
                                    <div class="loading-container">
                                        <div class="billing-loader"></div>
                                        <span>Analyse des échéanciers...</span>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- NEW INVOICE MODAL -->
        <div id="modal-new-invoice" class="modal">
            <div class="modal-content" style="max-width:600px;">
                <div class="modal-header">
                    <h3>Nouvelle Facture</h3>
                    <p>Envoyer une demande de paiement Stripe par courriel.</p>
                </div>
                <div class="card-body">
                    <form id="form-new-invoice">
                        <div class="form-group">
                            <label>Nom du Client</label>
                            <input type="text" id="inv-name" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label>Email du Client</label>
                            <input type="email" id="inv-email" class="form-control" required>
                        </div>
                        <hr>
                        <label>Détails de la facture</label>
                        <div class="form-group" style="display:flex; gap:10px;">
                            <input type="text" id="inv-desc" class="form-control" placeholder="Description (ex: Chandail supplémentaire)" style="flex:2;" required>
                            <input type="number" id="inv-amount" class="form-control" placeholder="Montant ($)" style="flex:1;" step="0.01" required>
                        </div>
                        <div class="form-group">
                            <label>Échéance (Optionnel)</label>
                            <input type="date" id="inv-due" class="form-control" onclick="this.showPicker()" style="cursor: pointer;">
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-secondary close-inv-modal">Annuler</button>
                            <button type="submit" class="btn-action">Envoyer Facture</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    // Initialize Listeners
    document.getElementById('btn-new-invoice').onclick = () => {
        document.getElementById('modal-new-invoice').classList.add('active');
    };
    document.querySelectorAll('.close-inv-modal').forEach(b => b.onclick = () => {
        document.getElementById('modal-new-invoice').classList.remove('active');
    });

    document.getElementById('form-new-invoice').onsubmit = handleNewInvoice;

    document.getElementById('billing-search').addEventListener('input', (e) => {
        handleSearchInput(e.target.value);
    });
    document.getElementById('billing-status-filter').addEventListener('change', () => {
        renderTables();
    });

    document.querySelectorAll('.sortable-header').forEach(header => {
        header.addEventListener('click', () => {
            const field = header.dataset.sort;
            if (window.currentSort.field === field) {
                window.currentSort.direction = window.currentSort.direction === 'desc' ? 'asc' : 'desc';
            } else {
                window.currentSort.field = field;
                window.currentSort.direction = 'desc';
            }
            updateSortIcons();
            renderTables();
        });
    });

    document.addEventListener('click', (e) => {
        const suggestions = document.getElementById('search-suggestions');
        if (suggestions && !e.target.closest('.search-container')) {
            suggestions.style.display = 'none';
        }
    });

    // Initial load
    await refreshBillingData();
}

async function handleNewInvoice(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Envoi...";

    try {
        const payload = {
            name: document.getElementById('inv-name').value,
            email: document.getElementById('inv-email').value,
            dueDate: document.getElementById('inv-due').value,
            items: [
                {
                    description: document.getElementById('inv-desc').value,
                    amount: Math.round(parseFloat(document.getElementById('inv-amount').value) * 100)
                }
            ]
        };

        const url = 'https://us-central1-celticsdelouest.cloudfunctions.net/createManualInvoice';
        const token = await window.auth.currentUser.getIdToken();

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'x-environment': window.activeConfig ? window.activeConfig.env : 'staging'
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok || data.error) throw new Error(data.error || "Erreur inconnue");

        window.showAlert("Facture envoyée avec succès !", "success");
        document.getElementById('modal-new-invoice').classList.remove('active');
        e.target.reset();
        await refreshBillingData();
    } catch (err) {
        window.showAlert("Erreur: " + err.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

export async function refreshBillingData() {
    const tbody = document.querySelector('#invoices-table tbody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="5" style="text-align:center;">
                <div class="loading-container">
                    <div class="billing-loader"></div>
                    <span>Synchronisation Cloud Stripe...</span>
                </div>
            </td>
        </tr>
    `;

    try {
        const idToken = await window.auth.currentUser.getIdToken();
        const [invRes, statsRes] = await Promise.all([
            fetch('https://us-central1-celticsdelouest.cloudfunctions.net/listStripeInvoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ limit: 100 })
            }),
            fetch('https://us-central1-celticsdelouest.cloudfunctions.net/getStripeStats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` }
            })
        ]);

        const invData = await invRes.json();
        const statsData = await statsRes.json();

        if (!invData.success) throw new Error(invData.error || "Failed to fetch invoices");

        window.cachedInvoices = invData.data || [];
        window.cachedStats = statsData.success ? statsData : null;

        renderTables();
    } catch (e) {
        console.error("Error refreshing billing data:", e);
        tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Erreur: ${e.message}</td></tr>`;
    }
}

export function renderTables() {
    const tbody = document.querySelector('#invoices-table tbody');
    const stbody = document.querySelector('#scheduled-payments-table tbody');
    if (!tbody || !stbody) return;

    const search = (document.getElementById('billing-search')?.value || "").toLowerCase().trim();
    const statusFilter = document.getElementById('billing-status-filter')?.value || "all";
    const searchTerms = search.split(/\s+/).filter(t => t.length > 0);

    let processed = window.cachedInvoices.map(inv => {
        if (inv.customer && typeof inv.customer === 'object') {
            inv.customer_name = inv.customer.name || inv.customer_name;
            inv.customer_email = inv.customer.email || inv.customer_email;
        }
        return inv;
    }).filter(inv => {
        const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
        if (!matchesStatus) return false;

        if (searchTerms.length === 0) return true;
        const name = (inv.customer_name || '').toLowerCase();
        const email = (inv.customer_email || '').toLowerCase();
        return searchTerms.every(term => name.includes(term) || email.includes(term));
    });

    // Sort
    processed.sort((a, b) => {
        let valA, valB;
        if (window.currentSort.field === 'date') {
            valA = a.created; valB = b.created;
        } else if (window.currentSort.field === 'amount') {
            valA = a.amount_due; valB = b.amount_due;
        } else if (window.currentSort.field === 'customer') {
            valA = (a.customer_name || '').toLowerCase(); valB = (b.customer_name || '').toLowerCase();
        }
        if (valA < valB) return window.currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return window.currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    // Render Invoices
    tbody.innerHTML = processed.length === 0 ? `<tr><td colspan="5" style="text-align:center;">Aucune facture trouvée.</td></tr>` : '';
    processed.forEach(inv => {
        const date = new Date(inv.created * 1000).toLocaleDateString();
        const amount = (inv.amount_due / 100).toFixed(2);
        let statusClass = 'status-void';
        let statusLabel = inv.status;

        if (inv.status === 'paid') { statusClass = 'status-paid'; statusLabel = 'Payé'; }
        else if (inv.status === 'open') { statusClass = 'status-pending'; statusLabel = 'À payer (Ouvert)'; }
        else if (inv.status === 'draft') { statusClass = 'status-pending'; statusLabel = 'Brouillon'; }
        else if (inv.status === 'void') { statusClass = 'status-void'; statusLabel = 'Annulé'; }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${date}</td>
            <td>
                <div style="font-weight:600;">${inv.customer_name || 'Client'}</div>
                <div style="font-size:0.8rem; color:#666;">${inv.customer_email || ''}</div>
            </td>
            <td style="font-weight:600;">${amount} $</td>
            <td><span class="badge ${statusClass}">${statusLabel}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-success" onclick="window.open('${inv.hosted_invoice_url}', '_blank')">
                    <i class="fas fa-external-link-alt"></i> Voir
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Render Scheduled
    const scheduled = statusFilter === 'all' ? window.cachedInvoices.filter(inv => ['draft', 'open'].includes(inv.status)) : [];
    const scheduledTable = document.getElementById('scheduled-payments-table').closest('.card');
    if (scheduledTable) scheduledTable.style.display = (statusFilter === 'all') ? 'block' : 'none';

    stbody.innerHTML = scheduled.length === 0 ? `<tr><td colspan="5" style="text-align:center;">Aucun versement planifié.</td></tr>` : '';
    scheduled.forEach(inv => {
        const date = new Date(inv.created * 1000).toLocaleDateString();
        const amount = (inv.amount_due / 100).toFixed(2);
        const desc = inv.description || (inv.lines?.data[0]?.description) || 'Inscription';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${date}</td>
            <td>
                <div style="font-weight:600;">${inv.customer_name || 'Client'}</div>
                <div style="font-size:0.8rem; color:#666;">${inv.customer_email || ''}</div>
            </td>
            <td style="font-weight:600;">${amount} $</td>
            <td><small>${desc}</small></td>
            <td><span class="badge status-pending">${inv.status === 'draft' ? 'Brouillon' : 'À payer'}</span></td>
        `;
        stbody.appendChild(row);
    });

    // Update Stats
    if (window.cachedStats) {
        document.getElementById('bill-total-paid').textContent = (window.cachedStats.totalPaidRecent / 100).toLocaleString('fr-CA') + ' $';
        document.getElementById('bill-total-pending').textContent = (window.cachedStats.totalPendingRecent / 100).toLocaleString('fr-CA') + ' $';
        document.getElementById('bill-tx-count').textContent = window.cachedStats.countPaid;
    }
}

function updateSortIcons() {
    ['date', 'customer', 'amount'].forEach(field => {
        const icon = document.getElementById(`sort-icon-${field}`);
        if (!icon) return;
        if (window.currentSort.field === field) {
            icon.className = window.currentSort.direction === 'desc' ? 'fas fa-sort-down' : 'fas fa-sort-up';
            icon.style.color = 'var(--primary)';
        } else {
            icon.className = 'fas fa-sort';
            icon.style.color = '#ccc';
        }
    });
}

let searchDebounce;
function handleSearchInput(val) {
    clearTimeout(searchDebounce);
    const suggestions = document.getElementById('search-suggestions');
    if (!val || val.length < 2) {
        suggestions.style.display = 'none';
        renderTables();
        return;
    }

    searchDebounce = setTimeout(() => {
        const searchNorm = val.toLowerCase();
        const matches = [];
        const seen = new Set();

        window.cachedInvoices.forEach(inv => {
            const name = inv.customer_name || 'Client';
            const email = inv.customer_email || '';
            const key = `${name}|${email}`;
            if (!seen.has(key) && (name.toLowerCase().includes(searchNorm) || email.toLowerCase().includes(searchNorm))) {
                matches.push({ name, email });
                seen.add(key);
            }
        });

        if (matches.length > 0) {
            suggestions.innerHTML = matches.slice(0, 5).map(m => `
                <div class="suggestion-item" style="padding:10px 15px; cursor:pointer; border-bottom:1px solid #f9f9f9;" onclick="selectSuggestion('${m.name}', '${m.email}')">
                    <div style="font-weight:600; font-size:0.9rem;">${m.name}</div>
                    <div style="font-size:0.8rem; color:#666;">${m.email}</div>
                </div>
            `).join('');
            suggestions.style.display = 'block';
        } else {
            suggestions.style.display = 'none';
        }
        renderTables();
    }, 200);
}

window.selectSuggestion = function (name, email) {
    const input = document.getElementById('billing-search');
    input.value = email || name;
    document.getElementById('search-suggestions').style.display = 'none';
    renderTables();
};
