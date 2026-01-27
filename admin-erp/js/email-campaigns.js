
// --- EMAIL CAMPAIGNS LOGIC ---

let quillCampaign = null;

// Initialize when view is loaded (or on first access)
function initCampaignModule() {
    if (quillCampaign) return; // Already init

    if (document.getElementById('camp-editor')) {
        quillCampaign = new Quill('#camp-editor', {
            theme: 'snow',
            modules: {
                toolbar: '#camp-editor-toolbar'
            }
        });
    }

    // Attach Event Listeners
    document.getElementById('camp-audience-type')?.addEventListener('change', updateAudienceUI);
    document.getElementById('btn-new-campaign')?.addEventListener('click', () => openCampaignEditor());
    document.getElementById('btn-save-draft')?.addEventListener('click', () => saveCampaign('draft'));
    document.getElementById('btn-send-campaign')?.addEventListener('click', () => confirmAndSend());
    document.getElementById('btn-test-campaign')?.addEventListener('click', sendTestEmail);

    // Filters
    document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            loadCampaigns(e.target.dataset.filter);
        });
    });

    // Populate Teams if needed
    populateTeamSelectCampaign();
}

async function populateTeamSelectCampaign() {
    const sel = document.getElementById('camp-audience-team');
    if (!sel) return;

    // Check global cache or fetch
    let teams = window.dataCache.teams;
    if (!teams || Object.keys(teams).length === 0) {
        const snap = await window.getDocs(window.collection(window.db, "teams"));
        teams = {};
        snap.forEach(d => teams[d.id] = d.data());
        window.dataCache.teams = teams;
    }

    sel.innerHTML = '<option value="">Choisir une équipe...</option>';
    Object.keys(teams).forEach(id => {
        const t = teams[id];
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = `${t.name} (${t.category})`;
        sel.appendChild(opt);
    });
}

function updateAudienceUI() {
    const type = document.getElementById('camp-audience-type').value;
    const teamWrapper = document.getElementById('camp-audience-team-wrapper');
    const specificWrapper = document.getElementById('camp-audience-specific-wrapper');
    const display = document.getElementById('camp-audience-estimate');

    teamWrapper.style.display = (type === 'team') ? 'block' : 'none';
    specificWrapper.style.display = (type === 'specific') ? 'block' : 'none';

    // Estimate Count
    calculateAudience(type).then(count => {
        display.textContent = `Estimation: ${count} destinataires`;
    });
}

async function calculateAudience(type) {
    // Quick estimation based on local cache or query count
    // Real implementation would be more robust
    if (type === 'specific') return 'Manuel';

    try {
        if (type === 'all_active') {
            const snap = await window.getCountFromServer(window.collection(window.db, "players")); // Simple count, assumes most have emails
            return snap.data().count; // Approx
        }
        if (type === 'coaches') {
            const snap = await window.getCountFromServer(window.collection(window.db, "coaches"));
            return snap.data().count;
        }
        if (type === 'team') {
            const tid = document.getElementById('camp-audience-team').value;
            if (!tid) return 0;
            const q = window.query(window.collection(window.db, "players"), window.where("teamId", "==", tid));
            const snap = await window.getCountFromServer(q);
            return snap.data().count;
        }
    } catch (e) {
        console.warn("Est failed", e);
        return '?';
    }
    return '?';
}

function openCampaignEditor(campaign = null) {
    // Switch Tabs
    document.querySelector('[data-tab="tab-campaign-list"]').classList.remove('active');
    document.getElementById('tab-campaign-list').classList.remove('active');

    const editTab = document.querySelector('[data-tab="tab-campaign-editor"]');
    editTab.style.display = 'block';
    editTab.classList.add('active');
    document.getElementById('tab-campaign-editor').classList.add('active');

    // Reset Form
    if (!campaign) {
        document.getElementById('camp-id').value = '';
        document.getElementById('camp-status').value = 'draft';
        document.getElementById('camp-subject').value = '';
        quillCampaign.root.innerHTML = '';
        document.getElementById('camp-schedule-at').value = '';
        document.getElementById('camp-recurrence').value = '';
        document.getElementById('camp-audience-type').value = 'all_active';
        updateAudienceUI();
    } else {
        document.getElementById('camp-id').value = campaign.id;
        document.getElementById('camp-status').value = campaign.status;
        document.getElementById('camp-subject').value = campaign.subject;
        document.getElementById('camp-category').value = campaign.category || 'info';
        quillCampaign.root.innerHTML = campaign.content || '';

        // Audience
        if (campaign.audience) {
            document.getElementById('camp-audience-type').value = campaign.audience.type;
            if (campaign.audience.type === 'team') {
                document.getElementById('camp-audience-team').value = campaign.audience.teamId;
            } else if (campaign.audience.type === 'specific') {
                document.getElementById('camp-specific-emails').value = (campaign.audience.emails || []).join(', ');
            }
        }
        updateAudienceUI();

        // Schedule
        if (campaign.scheduledAt) {
            // Convert Timestamp to value compatible with input type=datetime-local (YYYY-MM-DDTHH:mm)
            const date = campaign.scheduledAt.toDate(); // Firestore Timestamp
            // Format to local ISO string part
            const iso = date.getFullYear() + '-' +
                String(date.getMonth() + 1).padStart(2, '0') + '-' +
                String(date.getDate()).padStart(2, '0') + 'T' +
                String(date.getHours()).padStart(2, '0') + ':' +
                String(date.getMinutes()).padStart(2, '0');
            document.getElementById('camp-schedule-at').value = iso;
        }

        document.getElementById('camp-recurrence').value = campaign.recurrence || '';
    }

    // Read-only mode for Sent campaigns
    const isSent = campaign && campaign.status === 'sent';
    const inputs = document.querySelectorAll('#tab-campaign-editor input, #tab-campaign-editor select, #tab-campaign-editor button.btn-primary');
    inputs.forEach(el => el.disabled = isSent);

    // Quill editor read-only
    if (quillCampaign) {
        quillCampaign.enable(!isSent);
    }

    // Hide/Show appropriate actions
    const btnSend = document.getElementById('btn-send-campaign');
    const btnSave = document.getElementById('btn-save-draft');
    if (btnSend) btnSend.style.display = isSent ? 'none' : 'inline-block';
    if (btnSave) btnSave.style.display = isSent ? 'none' : 'inline-block';
}

async function saveCampaign(targetStatus = 'draft') {
    const id = document.getElementById('camp-id').value;
    const subject = document.getElementById('camp-subject').value;
    const content = quillCampaign.root.innerHTML;
    const category = document.getElementById('camp-category').value;
    const scheduleVal = document.getElementById('camp-schedule-at').value;
    const recurrence = document.getElementById('camp-recurrence').value;

    // Audience
    const audType = document.getElementById('camp-audience-type').value;
    const audience = { type: audType };
    if (audType === 'team') audience.teamId = document.getElementById('camp-audience-team').value;
    if (audType === 'specific') {
        const raw = document.getElementById('camp-specific-emails').value;
        audience.emails = raw.split(',').map(e => e.trim()).filter(e => e.includes('@'));
    }

    if (!subject) return alert("Sujet requis !");

    const data = {
        subject,
        content,
        category,
        audience,
        recurrence,
        status: targetStatus,
        updatedAt: window.serverTimestamp()
    };

    if (targetStatus === 'scheduled') {
        if (!scheduleVal) return alert("Date de programmation requise !");
        data.scheduledAt = window.Timestamp.fromDate(new Date(scheduleVal));
    } else if (!id && targetStatus === 'draft') {
        data.createdAt = window.serverTimestamp();
        data.stats = { sentCount: 0, openCount: 0, clickCount: 0 };
    }

    try {
        if (id) {
            await window.updateDoc(window.doc(window.db, "campaigns", id), data);
        } else {
            const ref = await window.addDoc(window.collection(window.db, "campaigns"), data);
            document.getElementById('camp-id').value = ref.id; // set ID
        }

        if (targetStatus === 'draft') alert("Brouillon sauvegardé !");
        return true;
    } catch (e) {
        console.error(e);
        alert("Erreur sauvegarde: " + e.message);
        return false;
    }
}

async function confirmAndSend() {
    const scheduled = document.getElementById('camp-schedule-at').value;
    const action = scheduled ? "PROGRAMMER" : "ENVOYER IMMÉDIATEMENT";

    if (!confirm(`Voulez-vous vraiment ${action} cette campagne ?`)) return;

    if (await saveCampaign(scheduled ? 'scheduled' : 'sending')) {
        // If immediate send, call backend function
        if (!scheduled) {
            const id = document.getElementById('camp-id').value;
            // Call Cloud Function "sendCampaign"
            // We can use fetch to call the HTTPS endpoint
            // TODO: Replace URL with your actual Cloud Function URL
            // const functionUrl = "https://us-central1-celtics-de-louest.cloudfunctions.net/sendCampaign";
            const functionUrl = "http://127.0.0.1:5001/celticsdelouest/us-central1/sendCampaign";

            try {
                // Show loading state
                document.getElementById('btn-send-campaign').disabled = true;
                document.getElementById('btn-send-campaign').textContent = "Envoi...";

                // Note: CORS issues might occur if not testing on localhost correctly
                // or if functions not deployed with cors=true.
                const res = await fetch(functionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ campaignId: id })
                });

                const result = await res.json();
                if (result.success) {
                    alert("Campagne envoyée avec succès !");
                    closeEditor();
                    loadCampaigns('sent');
                } else {
                    alert("Erreur lors de l'envoi: " + (result.error || result.message));
                }
            } catch (e) {
                alert("Erreur communication serveur: " + e.message);
            } finally {
                document.getElementById('btn-send-campaign').disabled = false;
            }
        } else {
            alert("Campagne programmée !");
            closeEditor();
            loadCampaigns('scheduled');
        }
    }
}

async function sendTestEmail() {
    const email = prompt("Entrez l'email de test:", "votre@email.com");
    if (!email) return;

    const subject = document.getElementById('camp-subject').value;
    const content = quillCampaign.root.innerHTML;

    // USE LOCAL EMULATOR URL FOR DEV
    // const functionUrl = "https://us-central1-celtics-de-louest.cloudfunctions.net/sendCampaign";
    const functionUrl = "http://127.0.0.1:5001/celticsdelouest/us-central1/sendCampaign";

    try {
        const res = await fetch(functionUrl, {

            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                testEmail: email,
                testSubject: subject,
                testContent: content
            })
        });
        const result = await res.json();
        if (result.success) alert("Test envoyé !");
        else alert("Erreur test: " + result.error);
    } catch (e) {
        alert("Erreur: " + e.message);
    }
}

async function loadCampaigns(filter) {
    const container = document.getElementById('campaigns-list-container');
    container.innerHTML = '<p>Chargement...</p>';

    let q = window.query(window.collection(window.db, "campaigns"), window.orderBy("createdAt", "desc"));
    if (filter && filter !== 'all') {
        q = window.query(window.collection(window.db, "campaigns"), window.where("status", "==", filter), window.orderBy("createdAt", "desc"));
    }

    try {
        const snap = await window.getDocs(q);
        container.innerHTML = '';
        if (snap.empty) {
            container.innerHTML = '<p>Aucune campagne trouvée.</p>';
            return;
        }

        snap.forEach(doc => {
            const data = doc.data();
            const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString() : '?';
            const stats = data.stats || { sentCount: 0, openCount: 0 };

            // Calculate open rate
            const openRate = stats.sentCount > 0 ? Math.round((stats.openCount / stats.sentCount) * 100) : 0;

            const card = document.createElement('div');
            card.className = 'campaign-card card';
            card.style.cssText = 'padding:15px; border:1px solid #eee; border-radius:8px; cursor:pointer; transition:shadow 0.2s;';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <strong style="font-size:1.1rem;">${data.subject}</strong>
                    <span class="badge" style="background:${getStatusColor(data.status)}; padding:4px 8px; border-radius:4px; color:white; font-size:0.8rem;">${data.status}</span>
                </div>
                <div style="color:#666; font-size:0.9rem; margin:8px 0;">
                    <i class="fas fa-calendar"></i> ${date} &bull; ${data.category || 'Info'}
                </div>
                <div style="display:flex; gap:15px; font-size:0.9rem;">
                    <span><i class="fas fa-paper-plane"></i> ${stats.sentCount}</span>
                    <span><i class="fas fa-envelope-open"></i> ${openRate}% (${stats.openCount})</span>
                </div>
            `;

            card.addEventListener('click', () => {
                if (data.status === 'sent') {
                    // Maybe show read-only or stats view? for now open editor
                    // Ideally we should have a "View Report" mode.
                    // Let's just open editor for now but maybe warn
                    openCampaignEditor({ id: doc.id, ...data });
                } else {
                    openCampaignEditor({ id: doc.id, ...data });
                }
            });

            container.appendChild(card);
        });
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="color:red">Erreur chargement.</p>';
    }
}

function getStatusColor(status) {
    if (status === 'draft') return '#f39c12'; // orange
    if (status === 'sent') return '#27ae60'; // green
    if (status === 'scheduled') return '#3498db'; // blue
    return '#95a5a6'; // grey
}

function closeEditor() {
    document.querySelector('[data-tab="tab-campaign-editor"]').style.display = 'none';
    document.querySelector('[data-tab="tab-campaign-list"]').click();
}

