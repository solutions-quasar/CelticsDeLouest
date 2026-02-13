// BILLING MODULE

// Add to global scope or export if module
// We assume this is loaded as a module or script that can access window.db

export async function loadBilling() {
    const container = document.getElementById('view-billing');
    if (!container) return; // Should be there

    console.log("Loading Billing Module...");
    container.innerHTML = `
        <div class="dashboard-header">
            <h2><i class="fas fa-file-invoice-dollar"></i> Facturation & Revenus</h2>
            <button class="btn-action" id="btn-new-invoice"><i class="fas fa-plus"></i> Nouvelle Facture</button>
        </div>

        <!-- STATS CARDS -->
        <div class="row" style="display:flex; gap:20px; margin-bottom:20px;">
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
            <div class="card-header">
                <h3>Historique des Factures (Stripe)</h3>
                <input type="text" id="billing-search" placeholder="Rechercher par email..." style="padding:8px; border:1px solid #ddd; border-radius:4px; margin-left:auto;">
            </div>
            <div class="card-body">
                <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                    <table class="table" id="invoices-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Client / Email</th>
                                <th>Montant</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td colspan="5" style="text-align:center;">Chargement...</td></tr>
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
                            <tr><td colspan="5" style="text-align:center;">Chargement...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- NEW INVOICE MODAL (Injected here or main HTML) -->
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
                            <input type="date" id="inv-due" class="form-control">
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

    // Calculate Stats & Load Table
    await refreshBillingData();

    // Listeners
    document.getElementById('btn-new-invoice').onclick = () => {
        document.getElementById('modal-new-invoice').classList.add('active');
    };
    document.querySelectorAll('.close-inv-modal').forEach(b => b.onclick = () => {
        document.getElementById('modal-new-invoice').classList.remove('active');
    });

    document.getElementById('form-new-invoice').onsubmit = async (e) => {
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
                        amount: Math.round(parseFloat(document.getElementById('inv-amount').value) * 100) // cents
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
            // refreshBillingData() will be called by real-time listener if invoice is added to Firestore
            // but we call it here just in case or for immediate feedback if listener takes time
            refreshBillingData();

        } catch (err) {
            window.showAlert("Erreur: " + err.message, "error");
        } finally {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    };
}

export async function refreshBillingData() {
    const tbody = document.getElementById('invoices-table')?.querySelector('tbody');
    const schedTbody = document.getElementById('scheduled-payments-table')?.querySelector('tbody');

    if (!tbody || !schedTbody) return;

    try {
        const invoices = Object.values(window.dataCache.invoices || {});
        const scheduled = Object.values(window.dataCache.scheduled_payments || {});

        // 1. RENDER INVOICES
        tbody.innerHTML = '';
        if (invoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Aucune facture trouvée.</td></tr>';
        } else {
            invoices.sort((a, b) => {
                const timeA = a.createdAt?.seconds || a.created || 0;
                const timeB = b.createdAt?.seconds || b.created || 0;
                return timeB - timeA;
            }).forEach(data => {
                let date = '-';
                const timestamp = data.createdAt || data.created;
                if (timestamp) {
                    if (timestamp.toDate) date = timestamp.toDate().toLocaleDateString();
                    else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000).toLocaleDateString();
                    else if (typeof timestamp === 'number') {
                        // Stripe timestamps are in seconds, but could be ms if from elsewhere
                        const dateObj = timestamp > 10000000000 ? new Date(timestamp) : new Date(timestamp * 1000);
                        date = dateObj.toLocaleDateString();
                    }
                }
                const amount = ((data.amount || 0) / 100).toFixed(2);

                let limitStatus = data.status || 'pending';
                if (limitStatus === 'paid') limitStatus = 'Payé';
                else if (limitStatus === 'pending') limitStatus = 'En attente';
                else if (limitStatus === 'failed') limitStatus = 'Échoué';

                const tr = document.createElement('tr');
                tr.classList.add('clickable-row');
                tr.style.cursor = 'pointer';
                tr.innerHTML = `
                    <td>${date}</td>
                    <td><strong>${data.customerName || 'Inconnu'}</strong><br><small>${data.customerEmail}</small></td>
                    <td>${amount} $</td>
                    <td><span class="badge" style="background:${data.status === 'paid' ? '#2ecc71' : '#f39c12'}; color:white; padding:4px 8px; border-radius:4px;">${limitStatus}</span></td>
                    <td>
                        <a href="${data.invoiceUrl || '#'}" target="_blank" class="btn-action" style="padding:4px 8px; font-size:0.8rem;"><i class="fas fa-external-link-alt"></i> Voir</a>
                    </td>
                `;
                tr.addEventListener('click', (e) => {
                    if (!e.target.closest('a') && data.invoiceUrl) {
                        window.open(data.invoiceUrl, '_blank');
                    }
                });
                tbody.appendChild(tr);
            });
        }

        // 2. RENDER SCHEDULED PAYMENTS
        schedTbody.innerHTML = '';
        if (scheduled.length === 0) {
            schedTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Aucun paiement planifié.</td></tr>';
        } else {
            scheduled.sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || ''))).forEach(data => {
                let dateStr = 'N/A';
                if (data.dueDate) {
                    if (data.dueDate.toDate) dateStr = data.dueDate.toDate().toLocaleDateString();
                    else if (data.dueDate.seconds) dateStr = new Date(data.dueDate.seconds * 1000).toLocaleDateString();
                    else dateStr = data.dueDate;
                }

                let sStatus = data.status || 'pending';
                if (sStatus === 'paid') sStatus = 'Payé';
                else if (sStatus === 'pending') sStatus = 'En attente';
                else if (sStatus === 'failed') sStatus = 'Échoué';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${dateStr}</td>
                    <td>${data.customerName || 'Client'}<br><small>${data.registrationId || ''}</small></td>
                    <td>${((data.amount || 0) / 100).toFixed(2)} $</td>
                    <td>${data.description || 'Paiement versement'}</td>
                    <td><span class="badge" style="background:${data.status === 'paid' ? '#2ecc71' : '#eee'}; color:${data.status === 'paid' ? 'white' : '#333'}; padding:4px 8px; border-radius:4px;">${sStatus}</span></td>
                `;
                schedTbody.appendChild(tr);
            });
        }

        // 3. UPDATE STATS
        let totalPaid = 0;
        let totalPending = 0;
        let txCount = 0;

        invoices.forEach(inv => {
            if (inv.status === 'paid') {
                totalPaid += (inv.amount || 0) / 100;
                txCount++;
            } else if (inv.status === 'pending' || inv.status === 'open') {
                totalPending += (inv.amount || 0) / 100;
            }
        });

        // Add pending scheduled payments to the 'En Attente' total
        scheduled.forEach(pay => {
            if (pay.status === 'pending') {
                totalPending += (pay.amount || 0) / 100;
            }
        });

        const paidEl = document.getElementById('bill-total-paid');
        const pendingEl = document.getElementById('bill-total-pending');
        const countEl = document.getElementById('bill-tx-count');

        if (paidEl) paidEl.textContent = `${totalPaid.toFixed(2)} $`;
        if (pendingEl) pendingEl.textContent = `${totalPending.toFixed(2)} $`;
        if (countEl) countEl.textContent = txCount;

    } catch (e) {
        console.error("Error refreshing billing data:", e);
        tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Erreur: ${e.message}</td></tr>`;
    }
}
