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
        <div class="card">
            <div class="card-header">
                <h3>Historique des Factures</h3>
                <input type="text" id="billing-search" placeholder="Rechercher par email, nom..." style="padding:8px; border:1px solid #ddd; border-radius:4px; margin-left:auto;">
            </div>
            <div class="card-body">
                <div class="table-container">
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

            // Call Cloud Function
            // Assuming this script runs in the same environment as inscription, or we hardcode URL
            // Since this is ADMIN ERP, it might be same domain.
            // Use window.stripeFunctionUrl if available or hardcode
            const url = 'https://us-central1-celticsdelouest.cloudfunctions.net/createManualInvoice';

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (!res.ok || data.error) throw new Error(data.error || "Erreur inconnue");

            alert("Facture envoyée avec succès !");
            document.getElementById('modal-new-invoice').classList.remove('active');
            e.target.reset();
            refreshBillingData(); // Reload list

        } catch (err) {
            alert("Erreur: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    };
}

async function refreshBillingData() {
    const tbody = document.getElementById('invoices-table').querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Chargement...</td></tr>';

    try {
        // Fetch 'invoices' collection
        // Assuming window.getDocs, window.collection, window.db avail
        const snap = await window.getDocs(window.collection(window.db, "invoices"));

        let totalPaid = 0;
        let totalPending = 0;
        let invoices = [];

        snap.forEach(doc => {
            const d = doc.data();
            d.id = doc.id;
            invoices.push(d);

            if (d.status === 'paid') {
                totalPaid += (d.amountPaid || d.amount) / 100;
            } else if (d.status === 'open' || d.status === 'draft') {
                totalPending += (d.amount || 0) / 100;
            }
        });

        // Update Stats
        document.getElementById('bill-total-paid').innerText = totalPaid.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });
        document.getElementById('bill-total-pending').innerText = totalPending.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });
        document.getElementById('bill-tx-count').innerText = invoices.length;

        // Render Table
        invoices.sort((a, b) => (b.created || 0) - (a.created || 0)); // Descending

        tbody.innerHTML = '';
        if (invoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Aucune facture trouvée.</td></tr>';
            return;
        }

        invoices.forEach(inv => {
            const tr = document.createElement('tr');

            const dateStr = inv.created ? new Date(inv.created * 1000).toLocaleDateString('fr-CA') : 'N/A';
            const amountStr = ((inv.amount || 0) / 100).toFixed(2) + ' $';

            let statusColor = 'gray';
            if (inv.status === 'paid') statusColor = 'green';
            if (inv.status === 'open') statusColor = 'orange';
            if (inv.status === 'void') statusColor = 'red';

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>
                    <div style="font-weight:bold;">${inv.customerEmail || 'Inconnu'}</div>
                    <small style="color:#666;">${inv.id}</small>
                </td>
                <td>${amountStr}</td>
                <td><span class="badge" style="background:${statusColor}; color:white; padding:4px 8px; border-radius:4px;">${inv.status}</span></td>
                <td>
                    ${inv.hostedInvoiceUrl ? `<a href="${inv.hostedInvoiceUrl}" target="_blank" class="btn-icon" title="Voir"><i class="fas fa-external-link-alt"></i></a>` : ''}
                    ${inv.pdfUrl ? `<a href="${inv.pdfUrl}" target="_blank" class="btn-icon" title="PDF"><i class="fas fa-file-pdf"></i></a>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error("Billing Load Error:", e);
        tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Erreur: ${e.message}</td></tr>`;
    }
}
