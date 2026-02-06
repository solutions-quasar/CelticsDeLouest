// --- AUTOMATION DOCUMENTATION MODULE ---
// Handles the "Automations" tab documentation with rich text editor

let quillAutoDoc = null;
let currentEditingDocId = null;

window.initAutomationsModule = function () {
    // Initialize Quill editor for automation documentation
    if (document.getElementById('auto-doc-editor')) {
        quillAutoDoc = new Quill('#auto-doc-editor', {
            theme: 'snow',
            modules: {
                toolbar: '#auto-doc-toolbar'
            }
        });
    }

    loadAutomationNotes();

    // Event listeners
    const btnAdd = document.getElementById('btn-add-auto-note');
    if (btnAdd) btnAdd.addEventListener('click', () => openAutomationDocModal());

    const btnSave = document.getElementById('save-auto-doc-btn');
    if (btnSave) btnSave.addEventListener('click', saveAutomationDoc);

    const btnCancel = document.getElementById('cancel-auto-doc-btn');
    if (btnCancel) btnCancel.addEventListener('click', closeAutomationDocModal);

    const btnClose = document.getElementById('close-auto-doc-btn');
    if (btnClose) btnClose.addEventListener('click', closeAutomationDocModal);
}

async function loadAutomationNotes() {
    const list = document.getElementById('automation-notes-list');
    if (!list) return;

    try {
        const q = window.query(window.collection(window.db, "automation_notes"), window.orderBy("createdAt", "desc"));
        const snapshot = await window.getDocs(q);

        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = '<p style="color:#888; font-style:italic;">Aucune documentation ajoutée.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const el = document.createElement('div');
            el.className = 'card automation-note-card';
            el.style.cssText = 'padding: 15px; border-left: 4px solid var(--primary); background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); cursor: pointer; transition: transform 0.2s;';
            el.dataset.id = doc.id;

            // Create a preview of the description (strip HTML tags for preview)
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = data.description || '';
            const preview = tempDiv.textContent.substring(0, 150) + (tempDiv.textContent.length > 150 ? '...' : '');

            el.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <h5 style="margin:0; font-size:1.05rem; color:#333;">${data.title}</h5>
                    <button class="btn-icon delete-note" data-id="${doc.id}" style="color:#e74c3c; background:none; border:none; cursor:pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <p style="margin:0; color:#666; font-size:0.95rem; line-height:1.5;">${preview}</p>
            `;

            // Click to edit (except delete button)
            el.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-note')) {
                    openAutomationDocModal(doc.id, data);
                }
            });

            list.appendChild(el);
        });

        // Attach delete listeners
        list.querySelectorAll('.delete-note').forEach(b => {
            b.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent opening modal
                deleteAutomationNote(e.currentTarget.dataset.id);
            });
        });

    } catch (e) {
        console.error("Error loading automation notes:", e);
        list.innerHTML = '<p style="color:red">Erreur chargement.</p>';
    }
}

function openAutomationDocModal(docId = null, data = null) {
    const modal = document.getElementById('automation-doc-modal');
    const titleInput = document.getElementById('auto-doc-title');

    if (!modal || !titleInput || !quillAutoDoc) return;

    currentEditingDocId = docId;

    if (data) {
        // Edit mode
        titleInput.value = data.title || '';
        quillAutoDoc.root.innerHTML = data.description || '';
    } else {
        // Create mode
        titleInput.value = '';
        quillAutoDoc.root.innerHTML = '';
    }

    modal.classList.add('active');
    setTimeout(() => titleInput.focus(), 100);
}

function closeAutomationDocModal() {
    const modal = document.getElementById('automation-doc-modal');
    if (modal) modal.classList.remove('active');
    currentEditingDocId = null;
}

async function saveAutomationDoc() {
    const title = document.getElementById('auto-doc-title').value.trim();
    const description = quillAutoDoc.root.innerHTML;

    if (!title) {
        alert("Le titre est requis.");
        return;
    }

    try {
        const docData = {
            title,
            description,
            updatedAt: window.serverTimestamp()
        };

        if (currentEditingDocId) {
            // Update existing
            await window.updateDoc(window.doc(window.db, "automation_notes", currentEditingDocId), docData);
        } else {
            // Create new
            docData.createdAt = window.serverTimestamp();
            await window.addDoc(window.collection(window.db, "automation_notes"), docData);
        }

        closeAutomationDocModal();
        loadAutomationNotes();
    } catch (e) {
        console.error(e);
        alert("Erreur: " + e.message);
    }
}

async function deleteAutomationNote(id) {
    if (!confirm("Supprimer cette note ?")) return;
    try {
        await window.deleteDoc(window.doc(window.db, "automation_notes", id));
        loadAutomationNotes();
    } catch (e) {
        console.error(e);
        alert("Erreur: " + e.message);
    }
}
