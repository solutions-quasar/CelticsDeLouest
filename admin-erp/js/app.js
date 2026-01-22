// Firebase Configuration
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, setDoc, getDoc, query, where, orderBy, serverTimestamp } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence, sendPasswordResetEmail } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyCwJOzr9gAAyrkUAbtThkKNWJ1GcJUNx-E",
    authDomain: "celticsdelouest.firebaseapp.com",
    projectId: "celticsdelouest",
    storageBucket: "celticsdelouest.firebasestorage.app",
    messagingSenderId: "1078067192512",
    appId: "1:1078067192512:web:ae3b414f15358d1bfb8325",
    measurementId: "G-N5LFCG1QWT"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

const db = getFirestore(app);

const auth = getAuth(app);
const storage = getStorage(app);

// --- Global Cache for Editing ---
const dataCache = {
    products: {},
    inventory: {},
    players: {},
    board: {},
    referees: {},
    registrations: {},
    coaches: {},
    teams: {},
    fields: {},
    sponsors: {},
    seasons: {},
    admins: {},
    currentSeason: null
};

// Make dataCache globally accessible for search
window.dataCache = dataCache;

// Make Firebase functions globally accessible for other scripts
window.db = db;
window.getDocs = getDocs;
window.collection = collection;
window.deleteDoc = deleteDoc;
window.doc = doc;
window.addDoc = addDoc;
window.updateDoc = updateDoc;
window.serverTimestamp = serverTimestamp;

// --- Rich Text Editors ---
let quillWelcome;
const welcomeMsgEl = document.getElementById('setting-welcome-msg');
if (welcomeMsgEl) {
    quillWelcome = new Quill('#setting-welcome-msg', {
        modules: {
            toolbar: '#editor-toolbar'
        },
        theme: 'snow'
    });
}

// --- Auth Logic ---
const loginForm = document.getElementById('login-form');
const authScreen = document.getElementById('auth-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const initLoader = document.getElementById('init-loader');
const logoutBtn = document.getElementById('logout-btn');
const loginError = document.getElementById('login-error');

// --- Custom Alert/Confirm Functions ---
window.showAlert = function (message, type = 'info') {
    const modal = document.getElementById('custom-alert-modal');
    const messageEl = document.getElementById('alert-message');
    const iconEl = document.getElementById('alert-icon');

    messageEl.textContent = message;

    // Change icon based on type
    if (type === 'success') {
        iconEl.className = 'fas fa-check-circle';
        iconEl.style.color = 'var(--success)';
    } else if (type === 'error') {
        iconEl.className = 'fas fa-exclamation-circle';
        iconEl.style.color = 'var(--danger)';
    } else if (type === 'warning') {
        iconEl.className = 'fas fa-exclamation-triangle';
        iconEl.style.color = 'var(--warning)';
    } else {
        iconEl.className = 'fas fa-info-circle';
        iconEl.style.color = 'var(--primary)';
    }

    modal.classList.add('active');
}

window.showConfirm = function (message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        const messageEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        messageEl.textContent = message;

        const cleanup = () => {
            modal.classList.remove('active');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        okBtn.onclick = () => {
            cleanup();
            resolve(true);
        };

        cancelBtn.onclick = () => {
            cleanup();
            resolve(false);
        };

        modal.classList.add('active');
    });
}

// --- FUZZY SEARCH UTILITY ---
function fuzzyMatch(query, text) {
    if (!query) return true;
    query = query.toLowerCase().trim();
    text = (text || "").toLowerCase();

    // Direct inclusion
    if (text.includes(query)) return true;

    // Fuzzy matching: characters in order
    let qIdx = 0;
    let tIdx = 0;
    while (qIdx < query.length && tIdx < text.length) {
        if (query[qIdx] === text[tIdx]) {
            qIdx++;
        }
        tIdx++;
    }
    return qIdx === query.length;
}

// --- GLOBAL SEARCH LOGIC ---
let searchDebounceTimer;
const globalSearchInput = document.getElementById('global-search-input');
const globalSearchResults = document.getElementById('global-search-results');
const clearSearchBtn = document.getElementById('clear-search');

if (globalSearchInput) {
    globalSearchInput.addEventListener('input', (e) => {
        const value = e.target.value;
        if (clearSearchBtn) clearSearchBtn.style.display = value ? 'block' : 'none';

        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => performGlobalSearch(value), 300);
    });

    document.addEventListener('click', (e) => {
        if (!globalSearchInput.contains(e.target) && !globalSearchResults.contains(e.target)) {
            globalSearchResults.classList.remove('active');
        }
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
        globalSearchInput.focus();
        clearSearchBtn.style.display = 'none';
        globalSearchResults.classList.remove('active');
        globalSearchResults.innerHTML = '';
    });
}

async function performGlobalSearch(queryText) {
    if (!queryText || queryText.trim().length < 2) {
        globalSearchResults.classList.remove('active');
        globalSearchResults.innerHTML = '';
        return;
    }

    globalSearchResults.innerHTML = '<div style="padding: 15px; text-align: center; color: #888;"><i class="fas fa-spinner fa-spin"></i> Recherche...</div>';
    globalSearchResults.classList.add('active');

    const results = [];
    const q = queryText.toLowerCase().trim();

    const searchable = [
        { key: 'players', label: 'Joueurs', icon: 'fa-user-friends', view: 'view-players', modal: 'player-modal', idField: 'player-id', subtitle: (d) => `Saison: ${d.year || d.birthYear || 'N/A'}` },
        { key: 'teams', label: 'Équipes', icon: 'fa-shield-alt', view: 'view-teams', modal: 'team-modal', idField: 'team-id', subtitle: (d) => d.category || 'Catégorie N/A' },
        { key: 'coaches', label: 'Coachs', icon: 'fa-stopwatch', view: 'view-coaches', modal: 'coach-modal', idField: 'coach-id', subtitle: (d) => d.email || '' },
        { key: 'referees', label: 'Arbitres', icon: 'fa-gavel', view: 'view-referees', modal: 'referee-modal', idField: 'referee-id', subtitle: (d) => 'Arbitre' },
        { key: 'products', label: 'Boutique', icon: 'fa-store', view: 'view-boutique', modal: 'product-modal', idField: 'product-id', subtitle: (d) => `$${d.price}` },
        { key: 'board', label: 'C.A.', icon: 'fa-users-cog', view: 'view-board', modal: 'board-modal', idField: 'board-id', subtitle: (d) => d.role || '' },
        { key: 'fields', label: 'Terrains', icon: 'fa-map-marker-alt', view: 'view-fields', modal: 'field-modal', idField: 'field-id', subtitle: (d) => d.location || '' }
    ];

    // Lazy load missing caches if searching
    for (const section of searchable) {
        if (!dataCache[section.key] || Object.keys(dataCache[section.key]).length === 0) {
            try {
                // Determine collection name (mostly same as key, but board is board_members)
                const collName = section.key === 'board' ? 'board_members' : section.key;
                const snap = await getDocs(collection(db, collName));
                dataCache[section.key] = {};
                snap.forEach(doc => dataCache[section.key][doc.id] = doc.data());
            } catch (e) { console.warn(`Silent preload failed for ${section.key}:`, e); }
        }
    }

    searchable.forEach(section => {
        const items = dataCache[section.key] || {};
        const sectionResults = [];

        Object.entries(items).forEach(([id, data]) => {
            const name = (data.name || data.firstName || data.lastName || "").toLowerCase();
            const email = (data.email || "").toLowerCase();
            const category = (data.category || "").toLowerCase();

            if (fuzzyMatch(q, name) || fuzzyMatch(q, email) || fuzzyMatch(q, category)) {
                sectionResults.push({ id, data, ...section });
            }
        });

        if (sectionResults.length > 0) {
            results.push({ section: section.label, items: sectionResults.slice(0, 5) });
        }
    });

    renderSearchResults(results);
}

function renderSearchResults(results) {
    if (results.length === 0) {
        globalSearchResults.innerHTML = '<div style="padding: 15px; text-align: center; color: #888;">Aucun résultat trouvé.</div>';
        return;
    }

    globalSearchResults.innerHTML = '';
    results.forEach(group => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'search-category';
        categoryDiv.textContent = group.section;
        globalSearchResults.appendChild(categoryDiv);

        group.items.forEach(item => {
            const resultItem = document.createElement('div');
            resultItem.className = 'search-result-item';

            const title = item.data.name || `${item.data.firstName || ''} ${item.data.lastName || ''}`.trim() || 'Inconnu';
            const subtitle = item.subtitle(item.data);
            const img = item.data.imageUrl;

            resultItem.innerHTML = `
                ${img ? `<img src="${img}" class="search-result-img">` : `<div class="search-result-icon"><i class="fas ${item.icon}"></i></div>`}
                <div class="search-result-info">
                    <div class="search-result-title">${title}</div>
                    <div class="search-result-subtitle">${subtitle}</div>
                </div>
            `;

            resultItem.addEventListener('click', () => {
                navigateToSearchResult(item);
            });

            globalSearchResults.appendChild(resultItem);
        });
    });
}

function navigateToSearchResult(item) {
    const navBtn = document.querySelector(`.nav-btn[data-target="${item.view}"]`);
    if (navBtn) navBtn.click();

    setTimeout(() => {
        const existingCard = document.querySelector(`[data-id="${item.id}"]`);
        if (existingCard) {
            existingCard.click();
        } else {
            const modal = document.getElementById(item.modal);
            const idInput = document.getElementById(item.idField);
            if (modal && idInput) {
                idInput.value = item.id;
                // Form filling logic would ideally go here, but clicking the card is preferred.
            }
        }
        globalSearchResults.classList.remove('active');
        globalSearchInput.value = '';
        if (clearSearchBtn) clearSearchBtn.style.display = 'none';
    }, 150);
}

// --- HELPER FUNCTIONS ---

function createCard(imageUrl, title, subtitle, id, editClass, deleteClass, defaultIcon = 'fa-cube', isLogo = false) {
    const card = document.createElement('div');
    card.setAttribute('data-id', id);
    card.className = 'product-card-admin';
    card.style.textAlign = 'center';
    card.style.cursor = 'pointer';

    const imgClass = isLogo ? 'admin-card-img logo-img' : 'admin-card-img circle-img';

    // We'll move most styles to CSS, but keep the core logic here
    const imgHtml = imageUrl
        ? `<img src="${imageUrl}" class="${imgClass}">`
        : `<div class="${imgClass} placeholder-img" style="background:#eee; display:flex; align-items:center; justify-content:center; color:#888"><i class="fas ${defaultIcon} fa-2x"></i></div>`;

    card.innerHTML = `
        ${imgHtml}
        <h4>${title}</h4>
        <p>${subtitle}</p>
        <div class="product-actions" style="justify-content:center; gap: 10px;">
            <button class="btn-icon ${editClass}" data-id="${id}" style="color:var(--primary)"><i class="fas fa-pen"></i></button>
            <button class="btn-icon ${deleteClass}" data-id="${id}" style="color:var(--danger)"><i class="fas fa-trash"></i></button>
        </div>
    `;
    return card;
}

function setupDeleteButton(btnClass, collectionName, callback) {
    document.querySelectorAll(btnClass).forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Voulez-vous vraiment supprimer cet élément ?')) {
                const id = e.target.closest('button').getAttribute('data-id');
                await deleteDoc(doc(db, collectionName, id));
                callback();
            }
        });
    });
}

async function uploadAndSave(collectionName, id, data, imageFile) {
    // Default imageUrl to empty string if creating new and no image
    if (!data.imageUrl && !imageFile && !id) data.imageUrl = '';

    // sanitize filename
    if (imageFile) {
        try {
            // Sanitize string: Remove non-alphanumeric chars (keep dots, hyphens)
            const sanitizedName = imageFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const storageRef = ref(storage, `${collectionName}/${Date.now()}_${sanitizedName}`);

            await uploadBytes(storageRef, imageFile);
            const imageUrl = await getDownloadURL(storageRef);
            data.imageUrl = imageUrl;
        } catch (uploadErr) {
            console.error("Upload failed:", uploadErr);
            throw new Error("Échec de l'envoi de l'image : " + uploadErr.message);
        }
    }

    if (id) {
        await updateDoc(doc(db, collectionName, id), data);
    } else {
        await addDoc(collection(db, collectionName), data);
    }
}

// --- Auth Logic ---

const savedEmail = localStorage.getItem('celtics_admin_email');
if (savedEmail && document.getElementById('remember-email')) {
    document.getElementById('email').value = savedEmail;
    document.getElementById('remember-email').checked = true;
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const rememberEmail = document.getElementById('remember-email').checked;
        const rememberMe = document.getElementById('remember-me').checked;

        if (rememberEmail) localStorage.setItem('celtics_admin_email', email);
        else localStorage.removeItem('celtics_admin_email');

        try {
            const mode = rememberMe ? browserLocalPersistence : browserSessionPersistence;
            await setPersistence(auth, mode);
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            console.error("Login Error:", error);
            if (loginError) loginError.textContent = "Erreur: " + error.message;
        }
    });

    const forgotBtn = document.getElementById('forgot-password');
    if (forgotBtn) {


        forgotBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            if (!email) return alert("Entrez votre courriel ci-dessus.");
            try {
                await sendPasswordResetEmail(auth, email);
                alert("Courriel de réinitialisation envoyé.");
            } catch (error) {
                alert("Erreur: " + error.message);
            }
        });
    }
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('celtics_admin_last_view'); // Clear view state on logout
        signOut(auth);
    });
}

onAuthStateChanged(auth, (user) => {
    if (initLoader) {
        initLoader.classList.remove('active');
        initLoader.style.display = 'none';
    }

    if (user) {
        authScreen.classList.remove('active');
        dashboardScreen.classList.add('active');

        // CHECK ROLE
        if (window.checkAdminAndSetupUI) window.checkAdminAndSetupUI(user);

        document.getElementById('user-email').textContent = user.email;

        // Restore last view
        const lastView = localStorage.getItem('celtics_admin_last_view');
        if (lastView) {
            const btn = document.querySelector(`.nav-btn[data-target="${lastView}"]`);
            if (btn) btn.click();
            else loadDashboardData();
        } else {
            loadDashboardData();
        }

        seedDatabase();
    } else {
        dashboardScreen.classList.remove('active');
        authScreen.classList.add('active');
    }
});

// --- Navigation ---
const navBtns = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');
const pageTitle = document.getElementById('page-title');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebar = document.querySelector('.sidebar');

// Mobile Menu Toggle
if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-visible');
    });
}

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 &&
        !sidebar.contains(e.target) &&
        !mobileMenuBtn.contains(e.target) &&
        sidebar.classList.contains('mobile-visible')) {
        sidebar.classList.remove('mobile-visible');
    }
});

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        views.forEach(v => v.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');

        // Save navigation state
        localStorage.setItem('celtics_admin_last_view', targetId);

        document.getElementById(targetId).classList.add('active');
        pageTitle.innerText = btn.innerText;

        // Close mobile sidebar on nav click
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('mobile-visible');
        }

        if (targetId === 'view-dashboard') loadDashboardData();
        if (targetId === 'view-boutique') loadBoutiqueSettings();
        if (targetId === 'view-teams') loadTeams(); // Use new loadTeams instead of loadPlayers
        if (targetId === 'view-players') loadPlayersDirectory();
        if (targetId === 'view-inventory') loadInventory();
        if (targetId === 'view-board') loadBoard();
        if (targetId === 'view-referees') loadReferees();
        if (targetId === 'view-registrations') loadRegistrations();
        if (targetId === 'view-coaches') loadCoaches();
        if (targetId === 'view-settings') loadSettings();
        if (targetId === 'view-matches') loadMatches();
        if (targetId === 'view-fields') loadFields();
        if (targetId === 'view-sponsors') loadSponsors();
        if (targetId === 'view-seasons') loadSeasons();
    });
});

// --- View Toggle Logic ---
document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.view-toggle-btn');
        const targetId = toggleBtn.getAttribute('data-target');
        const viewType = toggleBtn.getAttribute('data-view'); // 'grid' or 'list'
        const container = document.getElementById(targetId);

        // Update Buttons state
        const group = toggleBtn.parentElement;
        group.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
        toggleBtn.classList.add('active');

        // Update Container Class
        if (container) {
            if (targetId === 'matches-view-container') {
                const calView = document.getElementById('calendar-view');
                const listView = document.getElementById('matches-list');

                if (viewType === 'calendar') {
                    calView.style.display = 'block';
                    listView.style.display = 'none';
                    // Trigger resize for FullCalendar
                    setTimeout(() => { if (window.calendarAPI) window.calendarAPI.updateSize(); }, 50);
                } else {
                    calView.style.display = 'none';
                    listView.style.display = 'grid'; // Grid by default for list
                }
            } else {
                container.classList.remove('view-grid', 'view-list');
                container.classList.add(`view-${viewType}`);
            }
        }
    });
});


// --- GENERIC POPUP HANDLER ---
// --- GENERIC POPUP HANDLER ---
function setupClickableCard(cardSelector, cacheKey, modalId, idFieldId, populateCallback) {
    document.querySelectorAll(cardSelector).forEach(card => {
        card.addEventListener('click', async (e) => {
            console.log("Card clicked:", card, "Target:", e.target);

            if (e.target.closest('.btn-delete') ||
                e.target.closest('.delete-board') ||
                e.target.closest('.delete-ref') ||
                e.target.closest('.delete-prod') ||
                e.target.closest('.delete-player') ||
                e.target.closest('.delete-inv') ||
                e.target.closest('.delete-reg') ||
                e.target.closest('.delete-coach') ||
                e.target.closest('a')) {
                console.log("Click ignored due to exclusion");
                return;
            }

            const id = card.getAttribute('data-id');
            console.log("Card ID:", id);
            console.log("Cache Key:", cacheKey);
            console.log("Full Cache:", dataCache);
            const data = dataCache[cacheKey][id];
            console.log("Data found:", data);

            if (data) {
                try {
                    document.getElementById(idFieldId).value = id;
                    await populateCallback(data);
                    const modal = document.getElementById(modalId);
                    const form = modal.querySelector('form');
                    if (form) setLoading(form, false);
                    modal.classList.add('active');
                } catch (err) {
                    console.error("Error opening modal:", err);
                    alert("Erreur lors de l'ouverture du détail: " + err.message);
                }
            } else {
                console.error("DATA NOT FOUND IN CACHE FOR ID:", id);
                alert("Erreur: Données introuvables en cache pour ID " + id);
            }
        });
    });
}

// --- LOADING HELPER ---
function setLoading(form, isLoading) {
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;

    if (isLoading) {
        if (!btn.hasAttribute('data-original-text')) {
            btn.setAttribute('data-original-text', btn.innerHTML);
        }
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled = true;
    } else {
        const originalText = btn.getAttribute('data-original-text') || 'Enregistrer';
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// --- IMAGE PREVIEW HELPER ---
function setupImagePreview(inputId, previewId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    if (input && preview) {
        input.addEventListener('change', function () {
            const file = this.files[0];
            if (file) {
                // Check size immediately on selection for better UX
                if (file.size > 5 * 1024 * 1024) {
                    alert("L'image est trop volumineuse (Max 5MB).");
                    this.value = ''; // clear input
                    preview.innerHTML = '';
                    return;
                }

                const reader = new FileReader();
                reader.addEventListener("load", function () {
                    preview.innerHTML = `<img src="${this.result}" alt="Aperçu">`;
                });
                reader.readAsDataURL(file);
            } else {
                preview.innerHTML = '';
            }
        });
    }
}

function setExistingPreview(previewId, imageUrl) {
    const preview = document.getElementById(previewId);
    if (preview) {
        if (imageUrl) {
            preview.innerHTML = `<img src="${imageUrl}" alt="Actuelle">`;
        } else {
            preview.innerHTML = '';
        }
    }
}


// --- BOARD LOGIC ---
const boardModal = document.getElementById('board-modal');
const openBoardModalBtn = document.getElementById('open-board-modal');
if (openBoardModalBtn) openBoardModalBtn.addEventListener('click', () => {
    document.getElementById('board-form').reset();
    document.getElementById('board-id').value = '';
    document.getElementById('board-image-preview').innerHTML = '';
    setLoading(document.getElementById('board-form'), false);
    boardModal.classList.add('active');
});
if (boardModal) boardModal.querySelector('.close-modal').addEventListener('click', () => boardModal.classList.remove('active'));

// Setup Preview
setupImagePreview('board-image', 'board-image-preview');

document.getElementById('board-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(form, true);

    try {
        const id = document.getElementById('board-id').value;
        const name = document.getElementById('board-name').value;
        const role = document.getElementById('board-role').value;
        const order = parseInt(document.getElementById('board-order').value) || 99;
        const visible = document.getElementById('board-visible').checked;
        const mandateEnd = document.getElementById('board-mandate').value || null;
        const file = document.getElementById('board-image').files[0];

        if (file && file.size > 5 * 1024 * 1024) throw new Error("L'image est trop volumineuse (Max 5MB).");

        const data = { name, role, order, visible, mandateEnd };
        await uploadAndSave('board_members', id, data, file);

        boardModal.classList.remove('active');
        loadBoard();
    } catch (err) {
        console.error(err);
        alert("Erreur lors de l'enregistrement :\n" + (err.message || err));
    } finally {
        setLoading(form, false);
    }
});

async function loadBoard() {
    const list = document.getElementById('board-list');
    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) list.classList.add('view-grid');
    list.innerHTML = '<p>Chargement...</p>';

    const q = query(collection(db, "board_members"), orderBy("order", "asc"));
    const snapshot = await getDocs(q);
    list.innerHTML = '';
    const boardList = [];
    snapshot.forEach(doc => {
        boardList.push({ id: doc.id, ...doc.data() });
    });

    // Sort: Active first, then by order
    boardList.sort((a, b) => {
        const visA = a.visible !== false;
        const visB = b.visible !== false;
        if (visA !== visB) return visA ? -1 : 1;
        return (a.order || 99) - (b.order || 99);
    });

    boardList.forEach(data => {
        dataCache.board[data.id] = data;
        const isInactive = data.visible === false;

        let subHtml = data.role;
        if (data.mandateEnd) {
            const endDate = new Date(data.mandateEnd);
            const today = new Date();
            const isExpired = endDate < today;
            subHtml += `<br><small style="color:${isExpired ? 'red' : '#666'}"><i class="fas fa-hourglass-end"></i> Fin: ${data.mandateEnd}</small>`;
        }

        const displayName = isInactive ? `${data.name} <small style="color:red">(Inactif)</small>` : data.name;

        const card = createCard(data.imageUrl, displayName, subHtml, data.id, 'edit-board', 'delete-board');
        card.setAttribute('data-id', data.id);
        card.classList.add('clickable-card');
        if (isInactive) card.style.opacity = '0.5';
        list.appendChild(card);
    });

    setupClickableCard('.clickable-card', 'board', 'board-modal', 'board-id', (data) => {
        document.getElementById('board-name').value = data.name;
        document.getElementById('board-role').value = data.role;
        document.getElementById('board-order').value = data.order || 99;
        document.getElementById('board-visible').checked = data.visible !== false;
        document.getElementById('board-mandate').value = data.mandateEnd || '';
        setExistingPreview('board-image-preview', data.imageUrl);
    });
    setupDeleteButton('.delete-board', 'board_members', () => loadBoard());
}

// --- REFEREE LOGIC ---
const refModal = document.getElementById('referee-modal');
const openRefModalBtn = document.getElementById('open-referee-modal');
if (openRefModalBtn) openRefModalBtn.addEventListener('click', () => {
    document.getElementById('referee-form').reset();
    document.getElementById('referee-id').value = '';
    document.getElementById('ref-image-preview').innerHTML = '';
    setLoading(document.getElementById('referee-form'), false);
    refModal.classList.add('active');
});
if (refModal) refModal.querySelector('.close-modal').addEventListener('click', () => refModal.classList.remove('active'));

setupImagePreview('ref-image', 'ref-image-preview');

document.getElementById('referee-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(form, true);

    try {
        const id = document.getElementById('referee-id').value;
        const name = document.getElementById('ref-name').value;
        const visible = document.getElementById('ref-visible').checked;
        const file = document.getElementById('ref-image').files[0];

        if (file && file.size > 5 * 1024 * 1024) throw new Error("L'image est trop volumineuse (Max 5MB).");

        const unavails = document.getElementById('ref-unavails').value.split(',').map(s => s.trim()).filter(s => s);
        const data = { name, visible, unavails };
        await uploadAndSave('referees', id, data, file);

        refModal.classList.remove('active');
        loadReferees();
    } catch (err) {
        console.error(err);
        alert("Erreur: " + (err.message || err));
    } finally {
        setLoading(form, false);
    }
});

async function loadReferees() {
    const list = document.getElementById('referees-list');
    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) list.classList.add('view-grid');
    list.innerHTML = '<p>Chargement...</p>';

    const q = query(collection(db, "referees"), orderBy("name", "asc"));
    const snapshot = await getDocs(q);

    // Fetch all matches to calculate stats
    const matchSnap = await getDocs(collection(db, "matches"));
    const refCounts = {};
    dataCache.allMatches = []; // Store for modal

    matchSnap.forEach(mDoc => {
        const m = mDoc.data();
        dataCache.allMatches.push({ id: mDoc.id, ...m });

        // Filter by current season for stats
        if (dataCache.currentSeason && m.seasonId !== dataCache.currentSeason) {
            // Check if matches have seasonId, if not, we can't filter correctly yet, 
            // but we'll assume they should assuming new matches have it.
            // For now, let's only count if matches belong to active Season.
            // If match has no seasonId, we might count it or not. Let's count it for now if undefined.
            if (m.seasonId) return;
        }

        if (m.refCenter) refCounts[m.refCenter] = (refCounts[m.refCenter] || 0) + 1;
        if (m.refAsst1) refCounts[m.refAsst1] = (refCounts[m.refAsst1] || 0) + 1;
        if (m.refAsst2) refCounts[m.refAsst2] = (refCounts[m.refAsst2] || 0) + 1;
    });

    list.innerHTML = '';
    dataCache.referees = {};

    const refList = [];
    snapshot.forEach(doc => {
        refList.push({ id: doc.id, ...doc.data() });
    });

    // Sort: Active first, then name
    refList.sort((a, b) => {
        const visA = a.visible !== false;
        const visB = b.visible !== false;
        if (visA !== visB) return visA ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    refList.forEach(data => {
        dataCache.referees[data.id] = data;

        const count = refCounts[data.id] || 0;
        const isInactive = data.visible === false;
        const displayName = isInactive ? `${data.name} <small style="color:red">(Inactif)</small>` : data.name;

        const subtitle = `<span style="color:#666; font-size:0.9rem;"><i class="fas fa-whistle"></i> ${count} Match(s)</span>`;

        const card = createCard(data.imageUrl, displayName, subtitle, data.id, 'edit-ref', 'delete-ref', 'fa-flag');
        card.setAttribute('data-id', data.id);
        card.classList.add('ref-card');
        if (isInactive) card.style.opacity = '0.5';
        list.appendChild(card);
    });

    setupClickableCard('.ref-card', 'referees', 'referee-modal', 'referee-id', (data) => {
        document.getElementById('ref-name').value = data.name;
        document.getElementById('ref-visible').checked = data.visible !== false;
        document.getElementById('ref-unavails').value = data.unavails ? data.unavails.join(', ') : '';
        setExistingPreview('ref-image-preview', data.imageUrl);

        const refId = document.getElementById('referee-id').value;
        const matchesListEl = document.getElementById('ref-matches-list');
        const matchSelect = document.getElementById('ref-assign-match-select');
        const assignBtn = document.getElementById('btn-assign-match');

        // Helper to render matches list
        const renderMatchesList = () => {
            matchesListEl.innerHTML = '';
            const myMatches = dataCache.allMatches.filter(m =>
                m.refCenter === refId || m.refAsst1 === refId || m.refAsst2 === refId
            ).sort((a, b) => {
                const dateA = a.date;
                const dateB = b.date;
                if (dateA !== dateB) return dateA.localeCompare(dateB);
                return a.time.localeCompare(b.time);
            });

            if (myMatches.length === 0) {
                matchesListEl.innerHTML = '<p style="color: #888; font-style: italic;">Aucun match assigné.</p>';
            } else {
                myMatches.forEach(m => {
                    let role = 'Arbitre';
                    if (m.refCenter === refId) role = 'Central';
                    else if (m.refAsst1 === refId) role = 'Assistant 1';
                    else if (m.refAsst2 === refId) role = 'Assistant 2';

                    const div = document.createElement('div');
                    div.style.borderBottom = '1px solid #eee';
                    div.style.padding = '5px 0';
                    div.innerHTML = `
                        <div style="font-weight:bold; font-size:0.85rem;">${m.date} à ${m.time} (${role})</div>
                        <div style="font-size:0.8rem;">${m.category} vs ${m.opponent}</div>
                        <div style="font-size:0.75rem; color:#666;">Terrain: ${m.field}</div>
                    `;
                    matchesListEl.appendChild(div);
                });
            }
        };

        // Populate Match Select (Future matches only)
        matchSelect.innerHTML = '<option value="">Choisir un match...</option>';

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        dataCache.allMatches
            .filter(m => m.date >= todayStr)
            .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
            .forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = `${m.date} ${m.time} - ${m.category} vs ${m.opponent}`;
                matchSelect.appendChild(opt);
            });

        // Initialize display
        renderMatchesList();

        // Assign Button Logic
        // Remove old listener if exists to prevent duplicates (simple way: clone/replace or just one global listener? 
        // setupClickableCard adds listener every time? No, it's inside the callback executed ON CLICK of card. 
        // BUT the button is in the modal which is static. Listeners will stack if we add them here.
        // BETTER: assign onclick property to overwite.
        assignBtn.onclick = async () => {
            const matchId = matchSelect.value;
            const role = document.getElementById('ref-assign-role-select').value;

            if (!matchId) return alert("Veuillez choisir un match.");

            const match = dataCache.allMatches.find(m => m.id === matchId);
            if (!match) return;

            // Check conflict: is ref already assigned to another role in this match?
            if ((match.refCenter === refId && role !== 'refCenter') ||
                (match.refAsst1 === refId && role !== 'refAsst1') ||
                (match.refAsst2 === refId && role !== 'refAsst2')) {
                if (!confirm("Cet arbitre est déjà assigné à ce match dans un autre rôle. Voulez-vous changer son rôle ?")) return;
            }

            try {
                // Optimistic UI update
                match[role] = refId;
                // Clear other roles if he was there
                if (role !== 'refCenter' && match.refCenter === refId) match.refCenter = '';
                if (role !== 'refAsst1' && match.refAsst1 === refId) match.refAsst1 = '';
                if (role !== 'refAsst2' && match.refAsst2 === refId) match.refAsst2 = '';

                // Firestore Update
                const updateData = {};
                updateData[role] = refId;
                // If we cleared others, we must update them too. Simpler: update all 3 ref fields to match state
                await updateDoc(doc(db, "matches", matchId), {
                    refCenter: match.refCenter || '',
                    refAsst1: match.refAsst1 || '',
                    refAsst2: match.refAsst2 || ''
                });

                renderMatchesList();
                alert("Match assigné avec succès !");
            } catch (e) {
                console.error(e);
                alert("Erreur lors de l'assignation : " + e.message);
            }
        };

    });
    setupDeleteButton('.delete-ref', 'referees', () => loadReferees());
}

// --- PRODUCTS LOGIC ---
const productModal = document.getElementById('product-modal');
const openProdModalBtn = document.getElementById('open-product-modal');
if (openProdModalBtn) openProdModalBtn.addEventListener('click', () => {
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('prod-image-preview').innerHTML = '';
    setLoading(document.getElementById('product-form'), false);
    productModal.classList.add('active');
});
if (productModal) productModal.querySelector('.close-modal').addEventListener('click', () => productModal.classList.remove('active'));

setupImagePreview('prod-image', 'prod-image-preview');

document.getElementById('product-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(form, true);

    try {
        const id = document.getElementById('product-id').value;
        const name = document.getElementById('prod-name').value;
        const price = parseFloat(document.getElementById('prod-price').value);
        const desc = document.getElementById('prod-desc').value;
        const file = document.getElementById('prod-image').files[0];

        if (file && file.size > 5 * 1024 * 1024) throw new Error("L'image est trop volumineuse (Max 5MB).");

        const data = { name, price, desc };
        await uploadAndSave('products', id, data, file);

        productModal.classList.remove('active');
        loadProducts();
        updateStats();
    } catch (err) {
        console.error(err);
        alert("Erreur: " + (err.message || err));
    } finally {
        setLoading(form, false);
    }
});

async function loadProducts() {
    const list = document.getElementById('products-list');
    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) list.classList.add('view-grid');
    list.innerHTML = '<p>Chargement...</p>';

    const snapshot = await getDocs(collection(db, "products"));
    list.innerHTML = '';
    dataCache.products = {};

    snapshot.forEach(doc => {
        const data = doc.data();
        dataCache.products[doc.id] = data;
        const card = createCard(data.imageUrl, data.name, `$${data.price}`, doc.id, 'edit-prod', 'delete-prod');
        card.setAttribute('data-id', doc.id);
        card.classList.add('prod-card');
        list.appendChild(card);
    });

    setupClickableCard('.prod-card', 'products', 'product-modal', 'product-id', (data) => {
        document.getElementById('prod-name').value = data.name;
        document.getElementById('prod-price').value = data.price;
        document.getElementById('prod-desc').value = data.desc;
        setExistingPreview('prod-image-preview', data.imageUrl);
    });
    setupDeleteButton('.delete-prod', 'products', () => { loadProducts(); updateStats(); });
}

// --- TEAMS LOGIC (Management) ---
const teamModal = document.getElementById('team-modal');
const openTeamModalBtn = document.getElementById('open-team-modal');

if (openTeamModalBtn) openTeamModalBtn.addEventListener('click', async () => {
    document.getElementById('team-form').reset();
    document.getElementById('team-id').value = '';

    selectedTeamCoaches = [];
    renderTeamCoachTags();

    await populateCoachSelect('team-coach-add-select');
    await populateSeasonSelect('team-season');

    const div = document.getElementById('team-players-list');
    if (div) div.innerHTML = '';
    setLoading(document.getElementById('team-form'), false);
    teamModal.classList.add('active');
});

if (teamModal) teamModal.querySelector('.close-modal').addEventListener('click', () => teamModal.classList.remove('active'));

async function populateCoachSelect(selectId, selectedId = null) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    if (!dataCache.coaches || Object.keys(dataCache.coaches).length === 0) {
        const cSnap = await getDocs(collection(db, "coaches"));
        dataCache.coaches = {};
        cSnap.forEach(doc => dataCache.coaches[doc.id] = doc.data());
    }

    sel.innerHTML = '<option value="">-- Aucun --</option>';

    const items = [];
    Object.keys(dataCache.coaches).forEach(key => {
        const c = dataCache.coaches[key];
        const displayName = c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Inconnu';
        items.push({ id: key, name: displayName });
    });
    items.sort((a, b) => a.name.localeCompare(b.name));

    items.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        if (c.id === selectedId) opt.selected = true;
        sel.appendChild(opt);
    });
}

async function populateSeasonSelect(selectId, selectedId = null) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    if (!dataCache.seasons || Object.keys(dataCache.seasons).length === 0) {
        const snapshot = await getDocs(collection(db, "seasons"));
        dataCache.seasons = {};
        snapshot.forEach(doc => dataCache.seasons[doc.id] = doc.data());
    }

    sel.innerHTML = '<option value="">-- Choisir une saison --</option>';

    const items = [];
    Object.keys(dataCache.seasons).forEach(key => {
        items.push({ id: key, name: dataCache.seasons[key].name || 'Saison Sans Nom' });
    });
    items.sort((a, b) => a.name.localeCompare(b.name));

    items.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        if (s.id === selectedId) opt.selected = true;
        sel.appendChild(opt);
    });
}

// Multi-coach management
let selectedTeamCoaches = [];

function renderTeamCoachTags() {
    const container = document.getElementById('team-coaches-list');
    if (!container) return;
    container.innerHTML = '';
    selectedTeamCoaches.forEach(id => {
        const coach = dataCache.coaches[id];
        if (coach) {
            const displayName = coach.name || `${coach.firstName || ''} ${coach.lastName || ''}`.trim() || 'Inconnu';
            const tag = document.createElement('div');
            tag.className = 'tag';
            tag.style.cssText = 'background: var(--primary); color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; display: flex; align-items: center; gap: 8px;';
            tag.innerHTML = `${displayName} <i class="fas fa-times" style="cursor:pointer;" onclick="removeTeamCoach('${id}')"></i>`;
            container.appendChild(tag);
        }
    });
}

window.removeTeamCoach = function (id) {
    selectedTeamCoaches = selectedTeamCoaches.filter(cid => cid !== id);
    renderTeamCoachTags();
};

document.getElementById('btn-add-team-coach')?.addEventListener('click', () => {
    const sel = document.getElementById('team-coach-add-select');
    const id = sel.value;
    if (id && !selectedTeamCoaches.includes(id)) {
        selectedTeamCoaches.push(id);
        renderTeamCoachTags();
        sel.value = '';
    }
});

document.getElementById('team-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(form, true);

    try {
        const id = document.getElementById('team-id').value;
        const category = document.getElementById('team-category').value;
        const gender = document.getElementById('team-gender').value;
        const seasonId = document.getElementById('team-season').value;

        // Auto-generate name: Category + Gender
        let baseName = `${category} ${gender}`;
        let finalName = baseName;

        // Handle duplicates (Equipe 1, 2...)
        const qDup = query(collection(db, "teams"), where("seasonId", "==", seasonId), where("category", "==", category), where("gender", "==", gender));
        const snapDup = await getDocs(qDup);

        let countSame = 0;
        snapDup.forEach(doc => {
            if (doc.id !== id) countSame++;
        });

        if (countSame > 0) {
            finalName = `${baseName} (Équipe ${countSame + 1})`;
        }

        const data = {
            name: finalName,
            category: category,
            gender: gender,
            coachIds: selectedTeamCoaches,
            seasonId: seasonId
        };

        if (id) {
            await updateDoc(doc(db, "teams", id), data);
        } else {
            await addDoc(collection(db, "teams"), data);
        }

        teamModal.classList.remove('active');
        loadTeams();
    } catch (err) {
        console.error(err);
        alert("Erreur: " + (err.message || err));
    } finally {
        setLoading(form, false);
    }
});

// Season filter for teams
const teamFilterSeason = document.getElementById('team-filter-season');

async function loadTeamFilterSeasons() {
    if (!teamFilterSeason) return;

    teamFilterSeason.innerHTML = '<option value="">Toutes les saisons</option>';

    try {
        const q = query(collection(db, "seasons"), orderBy("year", "desc"));
        const snapshot = await getDocs(q);

        snapshot.forEach(doc => {
            const season = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = season.name || `${season.type === 'summer' ? 'Été' : 'Hiver'} ${season.year}`;
            if (season.active) {
                option.selected = true;
            }
            teamFilterSeason.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading filter seasons:", error);
    }
}

if (teamFilterSeason) {
    teamFilterSeason.addEventListener('change', () => {
        loadTeams();
    });
}

async function loadTeams() {
    const list = document.getElementById('teams-list');
    if (!list) return;

    // Ensure a layout class is present, default to grid
    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) {
        list.classList.add('view-grid');
    }

    list.innerHTML = '<p>Chargement...</p>';

    try {
        // Load filter seasons first
        await loadTeamFilterSeasons();

        const selectedSeason = teamFilterSeason?.value || '';

        let q;
        if (selectedSeason) {
            // Filter by season only, sort client-side to avoid composite index requirement
            q = query(collection(db, "teams"), where("seasonId", "==", selectedSeason));
        } else {
            q = query(collection(db, "teams"));
        }

        const snapshot = await getDocs(q);

        // Load coaches and seasons for display
        const coachesSnap = await getDocs(collection(db, "coaches"));
        const seasonsSnap = await getDocs(collection(db, "seasons"));

        const coachesMap = {};
        const seasonsMap = {};

        coachesSnap.forEach(doc => {
            const coach = doc.data();
            coachesMap[doc.id] = (coach.name || `${coach.firstName || ''} ${coach.lastName || ''}`).trim() || 'Inconnu';
        });

        seasonsSnap.forEach(doc => {
            const season = doc.data();
            seasonsMap[doc.id] = season.name || `${season.type === 'summer' ? 'Été' : 'Hiver'} ${season.year}`;
        });

        list.innerHTML = '';
        dataCache.teams = {};

        if (snapshot.empty) {
            list.innerHTML = '<p>Aucune équipe trouvée.</p>';
            return;
        }

        // Convert to array and sort client-side
        const teams = [];
        snapshot.forEach(doc => {
            teams.push({ id: doc.id, data: doc.data() });
        });

        // Sort by name
        teams.sort((a, b) => (a.data.name || '').localeCompare(b.data.name || ''));

        teams.forEach(({ id, data }) => {
            dataCache.teams[id] = data;

            // Get coach names
            let coachNames = 'Non assigné';
            if (data.coachIds && Array.isArray(data.coachIds) && data.coachIds.length > 0) {
                coachNames = data.coachIds.map(id => coachesMap[id] || 'N/A').join(', ');
            }

            const seasonName = data.seasonId && seasonsMap[data.seasonId] ? seasonsMap[data.seasonId] : 'N/A';

            const subtitle = `
                <div style="font-size:0.85rem; text-align:left; margin-top:5px;">
                    <strong>${data.category || 'N/A'} - ${data.gender || 'N/A'}</strong><br>
                    Saison: ${seasonName}<br>
                    Coach: ${coachNames}
                </div>
            `;

            const card = createCard(null, data.name, subtitle, id, 'edit-team', 'delete-team', 'fa-shield-alt');
            card.classList.add('team-card');
            card.setAttribute('data-id', id);
            list.appendChild(card);
        });

        setupClickableCard('.team-card', 'teams', 'team-modal', 'team-id', async (data) => {
            document.getElementById('team-category').value = data.category || '';
            document.getElementById('team-gender').value = data.gender || '';

            await populateSeasonSelect('team-season', data.seasonId);
            await populateCoachSelect('team-coach-add-select');

            // Set selected coaches
            selectedTeamCoaches = data.coachIds || [];
            renderTeamCoachTags();

            // Load team players
            loadTeamPlayers(document.getElementById('team-id').value);
            // Populate available players for addition
            populateTeamPlayerSelect('team-add-player-select');
        });

        setupDeleteButton('.delete-team', 'teams', () => loadTeams());

    } catch (e) {
        console.error("Error loading teams:", e);
        list.innerHTML = `<p style="color:red">Erreur: ${e.message}</p>`;
    }
}

async function populateTeamPlayerSelect(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    sel.innerHTML = '<option value="">Chargement...</option>';

    try {
        // Fetch all players to filter client-side (more flexible for "unassigned")
        const q = query(collection(db, "players"));
        const snapshot = await getDocs(q);

        const players = [];
        snapshot.forEach(doc => {
            const p = doc.data();
            // Only include players NOT assigned to a team
            if (!p.teamId) {
                players.push({ id: doc.id, ...p });
            }
        });

        // Sort by name
        players.sort((a, b) => {
            const nA = (a.name || a.lastName || '').toLowerCase();
            const nB = (b.name || b.lastName || '').toLowerCase();
            return nA.localeCompare(nB);
        });

        sel.innerHTML = '<option value="">Ajouter un joueur...</option>';
        players.forEach(p => {
            const name = p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim();
            const year = p.birthYear || p.year || '?';
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${name} (${year})`;
            sel.appendChild(opt);
        });

    } catch (e) {
        console.error("Error loading available players", e);
        sel.innerHTML = '<option value="">Erreur chargement</option>';
    }
}

// Global listener for adding player to team
document.getElementById('btn-add-player-to-team')?.addEventListener('click', async () => {
    const teamId = document.getElementById('team-id').value;
    const playerSelect = document.getElementById('team-add-player-select');
    const playerId = playerSelect.value;

    if (!teamId) return alert("Aucune équipe sélectionnée.");
    if (!playerId) return alert("Veuillez sélectionner un joueur.");

    const btn = document.getElementById('btn-add-player-to-team');
    const originalIcon = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        await updateDoc(doc(db, "players", playerId), { teamId: teamId });
        // Refresh lists
        loadTeamPlayers(teamId);
        populateTeamPlayerSelect('team-add-player-select'); // Refresh dropdown to remove added player
        playerSelect.value = '';
    } catch (e) {
        console.error("Error adding player to team:", e);
        alert("Erreur: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalIcon;
    }
});

async function loadTeamPlayers(teamId) {
    const container = document.getElementById('team-players-list');
    if (!container || !teamId) return;

    container.innerHTML = '<p>Chargement...</p>';

    try {
        const q = query(collection(db, "players"), where("teamId", "==", teamId));
        const snapshot = await getDocs(q);

        container.innerHTML = '';

        if (snapshot.empty) {
            container.innerHTML = '<p style="color:#888; font-style:italic;">Aucun joueur assigné.</p>';
            return;
        }

        const players = [];
        snapshot.forEach(doc => players.push({ id: doc.id, ...doc.data() }));

        // Sort by name
        players.sort((a, b) => {
            const nA = (a.name || a.lastName || '').toLowerCase();
            const nB = (b.name || b.lastName || '').toLowerCase();
            return nA.localeCompare(nB);
        });

        players.forEach(player => {
            const name = player.name || `${player.firstName || ''} ${player.lastName || ''}`.trim();
            const div = document.createElement('div');
            div.style.cssText = 'padding: 8px; background: #f9f9f9; border-radius: 6px; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center;';
            div.innerHTML = `
                <span><i class="fas fa-user" style="color:#666; margin-right:8px;"></i> ${name}</span>
                <button class="btn-delete-player" data-player-id="${player.id}" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
            `;
            container.appendChild(div);
        });

        // Setup delete player from team
        container.querySelectorAll('.btn-delete-player').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const playerId = btn.getAttribute('data-player-id');
                if (confirm('Retirer ce joueur de l\'équipe?')) {
                    try {
                        await updateDoc(doc(db, "players", playerId), { teamId: null });
                        loadTeamPlayers(teamId);
                        populateTeamPlayerSelect('team-add-player-select'); // Make available again
                    } catch (error) {
                        console.error("Error removing player:", error);
                        alert("Erreur: " + error.message);
                    }
                }
            });
        });

    } catch (error) {
        console.error("Error loading team players:", error);
        container.innerHTML = '<p style="color:red;">Erreur de chargement</p>';
    }
}




async function loadPlayersDirectory(searchTerm = '') {
    const tbody = document.getElementById('players-directory-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Chargement...</td></tr>';

    // Ensure teams are cached for team name display
    if (!dataCache.teams || Object.keys(dataCache.teams).length === 0) {
        try {
            const teamsSnap = await getDocs(collection(db, "teams"));
            dataCache.teams = {};
            teamsSnap.forEach(doc => {
                dataCache.teams[doc.id] = doc.data();
            });
        } catch (e) {
            console.error("Error pre-loading teams for player directory:", e);
        }
    }

    try {
        // Fetch all players to avoid index issues or missing fields
        const q = query(collection(db, "players"));
        const snapshot = await getDocs(q);
        console.log("Fetched players count:", snapshot.size);

        tbody.innerHTML = '';
        const term = (searchTerm || document.getElementById('player-search')?.value || '').toLowerCase();

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Aucun joueur trouvé.</td></tr>';
            return;
        }

        const docs = [];
        snapshot.forEach(doc => docs.push(doc));

        // Sort by name (fallback to lastName)
        docs.sort((a, b) => {
            const dA = a.data();
            const dB = b.data();
            const nA = (dA.name || dA.lastName || '').toLowerCase();
            const nB = (dB.name || dB.lastName || '').toLowerCase();
            return nA.localeCompare(nB);
        });

        let count = 0;
        docs.forEach(doc => {
            const data = doc.data();
            dataCache.players[doc.id] = data; // Cache player

            // Filter client-side
            const fullName = (data.name || `${data.firstName || ''} ${data.lastName || ''}`).toLowerCase();
            if (term && !fullName.includes(term)) return;

            count++;
            const teamName = data.teamId && dataCache.teams[data.teamId] ? dataCache.teams[data.teamId].name : 'Non assigné';

            // Handle name splitting for display if only 'name' exists
            let fName = data.firstName || '';
            let lName = data.lastName || '';
            if (!fName && !lName && data.name) {
                const parts = data.name.split(' ');
                if (parts.length > 0) fName = parts[0];
                if (parts.length > 1) lName = parts.slice(1).join(' ');
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${lName}</td>
                <td>${fName}</td>
                <td>${teamName}</td>
                <td>${data.birthDate || data.birthYear || '-'}</td>
                <td>${data.parentEmail || '-'}</td>
                <td>
                    <button class="btn-action edit-player-dir" data-id="${doc.id}" style="background:var(--primary); color:white; padding:4px 8px; border-radius:4px; border:none; cursor:pointer;"><i class="fas fa-edit"></i></button>
                    <button class="btn-action delete-player-dir" data-id="${doc.id}" style="background:#e74c3c; color:white; padding:4px 8px; border-radius:4px; border:none; cursor:pointer;"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (count === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Aucun résultat pour cette recherche.</td></tr>';
        }

        // Setup Actions
        document.querySelectorAll('.edit-player-dir').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').getAttribute('data-id');
                // Ensure openPlayerModal is defined (it is below)
                if (typeof openPlayerModal === 'function') openPlayerModal(id);
                else {
                    // Fallback if not yet defined/hoisted (though function declarations are hoisted)
                    console.warn("openPlayerModal not ready");
                }
            });
        });

        document.querySelectorAll('.delete-player-dir').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (!confirm("Supprimer ce joueur ?")) return;
                const id = e.target.closest('button').getAttribute('data-id');
                try {
                    await deleteDoc(doc(db, "players", id));
                    loadPlayersDirectory(term);
                } catch (err) {
                    alert("Erreur: " + err.message);
                }
            });
        });

    } catch (error) {
        console.error("Error loading players directory:", error);
        tbody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Erreur: ${error.message}</td></tr>`;
    }
}

// --- PLAYERS LOGIC ---
const playerModal = document.getElementById('player-modal');
const openPlayerModalBtn = document.getElementById('open-player-modal');
const openPlayerModalDirBtn = document.getElementById('open-player-modal-directory');

async function populateTeamSelect(selectedId = null) {
    const sel = document.getElementById('player-team');
    if (!sel) return;

    // ensure teams loaded
    if (!dataCache.teams || Object.keys(dataCache.teams).length === 0) {
        const snap = await getDocs(collection(db, "teams"));
        dataCache.teams = {};
        snap.forEach(d => dataCache.teams[d.id] = d.data());
    }

    sel.innerHTML = '<option value="">-- Aucune --</option>';
    const items = [];
    Object.keys(dataCache.teams).forEach(key => {
        const t = dataCache.teams[key];
        items.push({ id: key, name: t.name || 'Équipe Sans Nom' });
    });
    items.sort((a, b) => a.name.localeCompare(b.name));

    items.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        if (t.id === selectedId) opt.selected = true;
        sel.appendChild(opt);
    });
}

async function openPlayerModal() {
    document.getElementById('player-form').reset();
    document.getElementById('player-id').value = '';
    document.getElementById('player-image-preview').innerHTML = '';

    await populateTeamSelect();

    const form = document.getElementById('player-form');
    if (form) setLoading(form, false);

    const modal = document.getElementById('player-modal');
    if (modal) modal.classList.add('active');
}

if (openPlayerModalBtn) openPlayerModalBtn.addEventListener('click', openPlayerModal);
if (openPlayerModalDirBtn) openPlayerModalDirBtn.addEventListener('click', openPlayerModal);


if (playerModal) playerModal.querySelector('.close-modal').addEventListener('click', () => playerModal.classList.remove('active'));

setupImagePreview('player-image', 'player-image-preview');


/* 
document.getElementById('player-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log("Submitting player form...");
    const form = e.target;
    setLoading(form, true);

    try {
        const id = document.getElementById('player-id').value;
        const file = document.getElementById('player-image').files[0];

        if (file && file.size > 5 * 1024 * 1024) throw new Error("L'image est trop volumineuse (Max 5MB).");

        const data = {
            name: document.getElementById('player-name').value,
            year: parseInt(document.getElementById('player-year').value),
            skill: parseInt(document.getElementById('player-skill').value),
            pos: document.getElementById('player-pos').value,
            teamId: document.getElementById('player-team').value
        };
        await uploadAndSave('players', id, data, file);
        console.log("Player uploaded successfully");

        const modal = document.getElementById('player-modal');
        if (modal) modal.classList.remove('active');

        loadPlayers(); // Refresh Teams View
        loadPlayersDirectory(); // Refresh Directory View
        if (typeof updateStats === 'function') updateStats();
    } catch (err) {
        console.error(err);
        alert("Erreur: " + (err.message || err));
    } finally {
        setLoading(form, false);
    }
});
*/

async function loadPlayers() {
    let targetList = document.getElementById('players-table-container');
    if (!targetList) {
        const oldTable = document.getElementById('players-table');
        if (oldTable) {
            const parent = oldTable.parentElement;
            parent.id = "players-table-container";
            parent.classList.add('view-grid');
            oldTable.remove();
            targetList = parent;
        }
    }
    if (!targetList) return;

    targetList.innerHTML = '<p>Chargement...</p>';
    const snapshot = await getDocs(collection(db, "players"));
    targetList.innerHTML = '';
    window.allPlayers = [];
    dataCache.players = {};

    snapshot.forEach(doc => {
        const data = doc.data();
        window.allPlayers.push({ id: doc.id, ...data });
        dataCache.players[doc.id] = data;

        const subtitle = `Niveau: ${data.skill} | ${data.pos}`;

        const card = createCard(data.imageUrl, data.name, subtitle, doc.id, 'edit-player', 'delete-player', 'fa-user-graduate');
        card.setAttribute('data-id', doc.id);
        card.classList.add('player-card');
        targetList.appendChild(card);
    });

    setupClickableCard('.player-card', 'players', 'player-modal', 'player-id', async (data) => {
        document.getElementById('player-name').value = data.name;
        document.getElementById('player-year').value = data.year;
        document.getElementById('player-skill').value = data.skill;
        document.getElementById('player-pos').value = data.pos;
        await populateTeamSelect(data.teamId);
        setExistingPreview('player-image-preview', data.imageUrl);
    });
    setupDeleteButton('.delete-player', 'players', () => { loadPlayers(); updateStats(); });
}



document.getElementById('player-search')?.addEventListener('input', (e) => {
    loadPlayersDirectory(e.target.value);
});


// Removed Duplicated Setup
// setupDeleteButton('.delete-player-dir', 'players', () => { loadPlayersDirectory(); updateStats(); });

// --- INVENTORY LOGIC ---
const inventoryModal = document.getElementById('inventory-modal');
const openInvModalBtn = document.getElementById('open-inventory-modal');

// Tab Switching logic for Inventory
if (inventoryModal) {
    const tabs = inventoryModal.querySelectorAll('.tab-link');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-tab');
            tabs.forEach(t => t.classList.remove('active'));
            inventoryModal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(target).classList.add('active');
        });
    });
}

function resetInventoryModalTabs() {
    const tabs = inventoryModal.querySelectorAll('.tab-link');
    const contents = inventoryModal.querySelectorAll('.tab-content');
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));
    if (tabs[0]) tabs[0].classList.add('active');
    if (contents[0]) contents[0].classList.add('active');
}

function switchToInventoryStockTab() {
    const tabs = inventoryModal.querySelectorAll('.tab-link');
    const contents = inventoryModal.querySelectorAll('.tab-content');
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));
    if (tabs[1]) tabs[1].classList.add('active');
    if (contents[1]) contents[1].classList.add('active');
}

async function ensurePeopleData() {
    if (!dataCache.players || Object.keys(dataCache.players).length === 0) {
        const pSnap = await getDocs(collection(db, "players"));
        dataCache.players = {};
        pSnap.forEach(doc => dataCache.players[doc.id] = doc.data());
    }
    if (!dataCache.coaches || Object.keys(dataCache.coaches).length === 0) {
        const cSnap = await getDocs(collection(db, "coaches"));
        dataCache.coaches = {};
        cSnap.forEach(doc => dataCache.coaches[doc.id] = doc.data());
    }
}

if (openInvModalBtn) openInvModalBtn.addEventListener('click', () => {
    document.getElementById('inventory-form').reset();
    document.getElementById('inv-id').value = '';
    document.getElementById('inv-id').removeAttribute('data-is-batch');
    document.getElementById('inv-batch-badge').style.display = 'none';

    // Reset new fields
    document.getElementById('inv-model').value = '';
    document.getElementById('inv-size').value = '';
    document.getElementById('inv-number').value = '';
    document.getElementById('inv-number').disabled = false;
    document.getElementById('inv-qty').disabled = false;

    // Reset Distribution UI
    document.getElementById('dist-type').value = '';
    document.getElementById('dist-target').innerHTML = '<option value="">Sélectionner...</option>';
    document.getElementById('dist-target').disabled = true;
    document.getElementById('inv-distributions-list').innerHTML = '<p style="color: #888; font-style: italic; font-size: 0.9rem;">Aucune distribution enregistrée.</p>';
    document.getElementById('inv-stock-remaining').textContent = 'Stock disponible: -';
    document.getElementById('inv-dist-helper-form').style.display = 'flex';
    document.getElementById('inv-dist-label').style.display = 'block';

    // Hide batch delete button for new items
    const delBatchBtn = document.getElementById('btn-delete-batch');
    if (delBatchBtn) delBatchBtn.style.display = 'none';

    resetInventoryModalTabs();
    setLoading(document.getElementById('inventory-form'), false);
    inventoryModal.classList.add('active');
});

// --- BATCH INVENTORY LOGIC ---
const inventoryBatchModal = document.getElementById('inventory-batch-modal');
const openInvBatchModalBtn = document.getElementById('open-inventory-batch-modal');

if (openInvBatchModalBtn) openInvBatchModalBtn.addEventListener('click', () => {
    document.getElementById('inventory-batch-form').reset();
    setLoading(document.getElementById('inventory-batch-form'), false);
    inventoryBatchModal.classList.add('active');
});

if (inventoryBatchModal) inventoryBatchModal.querySelector('.close-modal').addEventListener('click', () => inventoryBatchModal.classList.remove('active'));

document.getElementById('inventory-batch-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;

    const baseName = document.getElementById('batch-inv-name').value;
    const model = document.getElementById('batch-inv-model').value;
    const size = document.getElementById('batch-inv-size').value;
    const startNum = parseInt(document.getElementById('batch-num-start').value);
    const endNum = parseInt(document.getElementById('batch-num-end').value);
    const category = document.getElementById('batch-inv-cat').value;
    const exclusionsStr = document.getElementById('batch-inv-exclusions').value;

    // Parse exclusions
    const exclusions = exclusionsStr.split(',')
        .map(s => parseInt(s.trim()))
        .filter(n => !isNaN(n));

    if (isNaN(startNum) || isNaN(endNum)) {
        return showAlert('Veuillez entrer des numéros valides.', 'error');
    }

    if (startNum > endNum) {
        return showAlert('Le numéro de début doit être inférieur au numéro de fin.', 'error');
    }

    let actualCount = 0;
    const totalCount = endNum - startNum + 1;

    if (!confirm(`Vous allez créer environ ${totalCount} articles (moins les exclusions éventuelles). Continuer ?`)) return;

    const batchId = 'batch_' + Date.now();
    setLoading(form, true);

    try {
        for (let i = startNum; i <= endNum; i++) {
            if (exclusions.includes(i)) continue;

            actualCount++;
            const data = {
                name: `${baseName} #${i}`,
                model: model,
                size: size,
                number: i,
                quantity: 1,
                category: category,
                status: "Neuf",
                batchId: batchId,
                distributions: []
            };
            // Pass empty ID to create new doc
            await uploadAndSave('inventory', '', data, null);
        }

        inventoryBatchModal.classList.remove('active');
        showAlert(`${actualCount} articles ont été créés avec succès !`, 'success');
        loadInventory();
        updateStats();
    } catch (err) {
        console.error(err);
        showAlert("Erreur lors de la création du lot : " + (err.message || err), 'error');
    } finally {
        setLoading(form, false);
    }
});

if (inventoryModal) inventoryModal.querySelector('.close-modal').addEventListener('click', () => inventoryModal.classList.remove('active'));

document.getElementById('inventory-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(form, true);

    try {
        const id = document.getElementById('inv-id').value;
        const isBatch = document.getElementById('inv-id').hasAttribute('data-is-batch');

        if (isBatch) {
            // Update all items in batch with common details
            const batchId = id;
            // We need the items array or fetch from cache
            const toUpdate = Object.values(dataCache.inventory).filter(item => item.batchId === batchId);

            const commonData = {
                category: document.getElementById('inv-cat').value,
                model: document.getElementById('inv-model').value || "",
                size: document.getElementById('inv-size').value || "",
                status: document.getElementById('inv-status').value
            };

            for (const item of toUpdate) {
                await updateDoc(doc(db, "inventory", item.id), commonData);
            }
            showAlert(`Lot mis à jour (${toUpdate.length} articles).`, "success");
        } else {
            // Preserve distributions if editing existing item
            let distributions = [];
            if (id && dataCache.inventory && dataCache.inventory[id] && dataCache.inventory[id].distributions) {
                distributions = dataCache.inventory[id].distributions;
            }

            const data = {
                name: document.getElementById('inv-name').value,
                category: document.getElementById('inv-cat').value,
                quantity: parseInt(document.getElementById('inv-qty').value),
                status: document.getElementById('inv-status').value,
                model: document.getElementById('inv-model').value || "",
                size: document.getElementById('inv-size').value || "",
                number: parseInt(document.getElementById('inv-number').value) || null,
                distributions: distributions // Keep existing distributions
            };

            const file = document.getElementById('inv-image').files[0];
            if (file && file.size > 5 * 1024 * 1024) throw new Error("L'image est trop volumineuse (Max 5MB).");

            await uploadAndSave('inventory', id, data, file);
        }

        inventoryModal.classList.remove('active');
        loadInventory();
        updateStats();
    } catch (err) {
        console.error(err);
        alert("Erreur: " + (err.message || err));
    } finally {
        setLoading(form, false);
    }
});

async function loadInventory() {
    let targetList = document.getElementById('inventory-container-div');
    if (!targetList) {
        const oldTable = document.getElementById('inventory-table');
        if (oldTable) {
            const parent = oldTable.parentElement;
            parent.id = 'inventory-container-div';
            oldTable.remove();
            parent.classList.add('view-grid');
            targetList = parent;
        }
    }
    if (!targetList) return;

    targetList.innerHTML = '<p>Chargement...</p>';
    await ensurePeopleData();

    const snapshot = await getDocs(collection(db, "inventory"));
    targetList.innerHTML = '';
    dataCache.inventory = {};
    const items = [];
    snapshot.forEach(doc => {
        const d = doc.data();
        d.id = doc.id;
        items.push(d);
        dataCache.inventory[doc.id] = d;
    });

    // --- RENDER SINGLES & BATCHES AS ITEMS ---
    // We group by CATEGORY now
    const categories = {};

    // Helper to group by batch
    const batchesMap = {};
    const singles = [];

    items.forEach(item => {
        if (item.batchId) {
            if (!batchesMap[item.batchId]) batchesMap[item.batchId] = [];
            batchesMap[item.batchId].push(item);
        } else {
            singles.push(item);
        }
    });

    // Add Singles to Categories
    singles.forEach(item => {
        const cat = item.category || 'Non classé';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push({ type: 'single', data: item });
    });

    // Add Batches to Categories
    Object.keys(batchesMap).forEach(batchId => {
        const batchItems = batchesMap[batchId];
        if (batchItems.length === 0) return;

        // Sort items in batch by number
        batchItems.sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0));

        const first = batchItems[0];
        const last = batchItems[batchItems.length - 1];
        const cat = first.category || 'Non classé';
        if (!categories[cat]) categories[cat] = [];

        // Aggregate Data
        const totalQty = batchItems.reduce((sum, i) => sum + (parseInt(i.quantity) || 0), 0);

        let distributedCount = 0;
        batchItems.forEach(item => {
            let distributions = item.distributions || [];
            if ((!distributions || distributions.length === 0) && item.assignedType && item.assignedType !== 'none' && item.assignedTo) {
                distributedCount += 1;
            } else {
                distributions.forEach(d => distributedCount += (parseInt(d.qty) || 0));
            }
        });

        // Construct a "Leader" object for display
        // Name should be the base name, e.g. "Maillot" from "Maillot #1"
        let baseName = first.name;
        // Try to strip the # number content from the name for the group title
        // Regex looks for " #123" at the end or mid string
        baseName = baseName.replace(/ #\d+.*$/, '').trim();

        const batchObj = {
            type: 'batch',
            id: batchId, // Use batchId as the ID for the card
            data: first, // Keep ref to first item for metadata like image, model, etc.
            batchItems: batchItems,
            title: `${baseName} (Lot #${first.number} - #${last.number})`,
            totalQty: totalQty,
            distributedCount: distributedCount,
            stockRemaining: totalQty - distributedCount
        };
        categories[cat].push(batchObj);
    });

    Object.keys(categories).sort().forEach(cat => {
        // Create Category Header
        const header = document.createElement('h3');
        header.style.gridColumn = '1 / -1';
        header.style.marginTop = '20px';
        header.style.color = 'var(--primary)';
        header.style.borderBottom = '2px solid #eee';
        header.style.paddingBottom = '5px';
        header.innerText = cat;
        targetList.appendChild(header);

        // Sort items in category (Batches and Singles mixed)
        categories[cat].sort((a, b) => {
            const nameA = a.type === 'batch' ? a.title : a.data.name;
            const nameB = b.type === 'batch' ? b.title : b.data.name;
            return nameA.localeCompare(nameB);
        });

        categories[cat].forEach(itemObj => {
            if (itemObj.type === 'single') {
                const data = itemObj.data;
                let distributedCount = 0;
                let distributions = data.distributions || [];

                if ((!distributions || distributions.length === 0) && data.assignedType && data.assignedType !== 'none' && data.assignedTo) {
                    distributedCount = 1;
                } else {
                    distributions.forEach(d => distributedCount += (parseInt(d.qty) || 0));
                }

                const stockRemaining = (parseInt(data.quantity) || 0) - distributedCount;

                // Build Subtitle
                let subtitle = '';
                if (data.model) {
                    subtitle += `<span style="color:#666; font-size:0.9rem;">Modèle: ${data.model}</span><br>`;
                }
                if (data.size) {
                    subtitle += `<strong style="font-size:1.1em;">Taille: ${data.size}</strong><br>`;
                }
                subtitle += `<span style="${stockRemaining < 5 ? 'color:red;font-weight:bold;' : ''}">${stockRemaining} en stock</span> / ${data.quantity} total`;

                if (distributedCount > 0) subtitle += `<br><span style="color:var(--primary); font-size:0.85rem;"><i class="fas fa-share-alt"></i> ${distributedCount} distribué(s)</span>`;

                const card = createCard(data.imageUrl, data.name, subtitle, data.id, 'edit-inv', 'delete-inv', 'fa-box');
                card.setAttribute('data-id', data.id);
                card.classList.add('inv-card');

                // Add click handler for single item
                card.addEventListener('click', (e) => {
                    // Check if edit/delete was clicked (handled globally but let's be safe)
                    if (e.target.closest('.btn-icon')) return;

                    // Helper to open single modal
                    openSingleInventoryModal(data);
                });

                targetList.appendChild(card);
            } else {
                // RENDER BATCH
                const b = itemObj;
                const data = b.data; // First item data for img/metadata

                let subtitle = '';
                if (data.model) {
                    subtitle += `<span style="color:#666; font-size:0.9rem;">Modèle: ${data.model}</span><br>`;
                }
                if (data.size) {
                    subtitle += `<strong style="font-size:1.1em;">Taille: ${data.size}</strong><br>`;
                }
                subtitle += `<span style="${b.stockRemaining < 5 ? 'color:red;font-weight:bold;' : ''}">${b.stockRemaining} en stock</span> / ${b.totalQty} total`;

                if (b.distributedCount > 0) subtitle += `<br><span style="color:var(--primary); font-size:0.85rem;"><i class="fas fa-share-alt"></i> ${b.distributedCount} distribué(s)</span>`;

                // Use the batch title
                const card = createCard(data.imageUrl, b.title, subtitle, b.id, 'edit-inv-batch', 'delete-inv-batch', 'fa-boxes');
                card.setAttribute('data-id', b.id);
                card.setAttribute('data-batch-id', b.id);
                card.classList.add('inv-batch-card');

                // Special Badge style for batch card
                card.style.border = '2px solid var(--secondary)';

                targetList.appendChild(card);
            }
        });
    });

    // Refresh stats when deleted
    setupDeleteButton('.delete-inv', 'inventory', () => { loadInventory(); updateStats(); });

    // Handle batch deletion
    const batchDelBtns = document.querySelectorAll('.delete-inv-batch');
    batchDelBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const bid = btn.getAttribute('data-id');
            if (confirm("Supprimer tout ce lot d'articles ? Cette action est irréversible.")) {
                try {
                    const toDelete = items.filter(item => item.batchId === bid);
                    for (const item of toDelete) {
                        await deleteDoc(doc(db, "inventory", item.id));
                    }
                    showAlert("Lot supprimé avec succès.", "success");
                    loadInventory();
                    updateStats();
                } catch (err) {
                    console.error(err);
                    showAlert("Erreur lors de la suppression du lot.", "error");
                }
            }
        });
    });

    // Handle batch click - Open Modal with List
    document.querySelectorAll('.inv-batch-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Avoid triggers on delete buttons
            if (e.target.closest('.btn-icon')) return;

            const batchId = card.getAttribute('data-batch-id');
            const allItems = Object.values(dataCache.inventory);
            const batchItems = allItems.filter(item => item.batchId === batchId);

            if (batchItems.length === 0) return alert("Erreur: Lot vide.");

            batchItems.sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0));
            const first = batchItems[0];

            inventoryModal.classList.add('active');
            resetInventoryModalTabs();

            document.getElementById('inv-batch-badge').style.display = 'inline-block';
            document.getElementById('inv-id').value = batchId;
            document.getElementById('inv-id').setAttribute('data-is-batch', 'true');

            // Fill Header info with first item data
            document.getElementById('inv-name').value = first.name.replace(/ #\d+.*$/, '').trim();
            document.getElementById('inv-cat').value = first.category;
            document.getElementById('inv-qty').value = batchItems.length;
            document.getElementById('inv-qty').disabled = true; // Cannot change total qty easily here

            // Ensure Stock Display is coherent
            if (document.getElementById('inv-qty-stock')) {
                document.getElementById('inv-qty-stock').value = batchItems.length;
                document.getElementById('inv-qty-stock').disabled = true;
            }

            document.getElementById('inv-status').value = first.status;
            document.getElementById('inv-model').value = first.model || "";
            document.getElementById('inv-size').value = first.size || "";
            document.getElementById('inv-number').value = `${first.number} - ${batchItems[batchItems.length - 1].number}`;
            document.getElementById('inv-number').disabled = true;

            // Hide single item distribution helper
            document.getElementById('inv-dist-helper-form').style.display = 'none';
            document.getElementById('inv-dist-label').style.display = 'none';

            // Show Batch Delete Button
            const delBatchBtn = document.getElementById('btn-delete-batch');
            if (delBatchBtn) {
                delBatchBtn.style.display = 'inline-block';
                // Remove old listeners to avoid duplicates (naive approach: clone)
                const newBtn = delBatchBtn.cloneNode(true);
                delBatchBtn.parentNode.replaceChild(newBtn, delBatchBtn);

                newBtn.addEventListener('click', async () => {
                    if (confirm("Voulez-vous vraiment supprimer tout ce lot (" + batchItems.length + " articles) ? Cette action est irréversible.")) {
                        try {
                            setLoading(document.getElementById('inventory-form'), true);
                            for (const item of batchItems) {
                                await deleteDoc(doc(db, "inventory", item.id));
                            }
                            inventoryModal.classList.remove('active');
                            showAlert("Lot supprimé avec succès.", "success");
                            loadInventory();
                            updateStats();
                        } catch (err) {
                            console.error("Error deleting batch:", err);
                            showAlert("Erreur lors de la suppression du lot.", "error");
                            setLoading(document.getElementById('inventory-form'), false);
                        }
                    }
                });
            }

            // Render batch list view (Stock Tab most relevant)
            switchToInventoryStockTab();
            renderBatchStockList(batchItems);
        });
    });

    // Helper used by SINGLE items click
    function openSingleInventoryModal(data) {
        document.getElementById('inv-batch-badge').style.display = 'none';
        document.getElementById('inv-id').value = data.id;
        document.getElementById('inv-id').removeAttribute('data-is-batch');

        // Hide batch delete button
        const delBatchBtn = document.getElementById('btn-delete-batch');
        if (delBatchBtn) delBatchBtn.style.display = 'none';

        fillInventoryModal(data);
        inventoryModal.classList.add('active');
    }

    function renderBatchStockList(batchItems) {
        const listEl = document.getElementById('inv-distributions-list');
        const stockEl = document.getElementById('inv-stock-remaining');

        listEl.innerHTML = `
            <div style="margin-bottom: 20px; font-weight: 600; color: #555; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-list-ol"></i> Liste des articles du lot (${batchItems.length})
            </div>
            <div class="batch-items-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px;">
            </div>
        `;

        const grid = listEl.querySelector('.batch-items-grid');
        let libres = 0;

        batchItems.forEach(item => {
            const isDist = item.distributions && item.distributions.length > 0;
            if (!isDist) libres++;

            const card = document.createElement('div');
            card.className = "batch-item-row";
            card.style.cssText = 'background: white; border: 1px solid #eee; padding: 12px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; transition: all 0.3s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.02);';

            let assignedTo = isDist ? item.distributions[0].name : '<span style="color: #28a745; font-style: italic;">Disponible</span>';

            card.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="width: 40px; height: 40px; background: #f0f4f8; color: var(--primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; border: 2px solid #e1e8ef;">
                        ${item.number}
                    </div>
                    <div>
                        <div style="font-weight: 600; color: #333; font-size: 0.95rem;">Article n°${item.number}</div>
                        <div style="font-size: 0.85rem; color: #777;">${assignedTo}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button type="button" class="btn-manage-individual" style="background: ${isDist ? '#f1f3f5' : 'var(--primary)'}; color: ${isDist ? '#495057' : 'white'}; border: none; padding: 8px 15px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; font-weight: 600; transition: transform 0.2s;">
                        ${isDist ? 'Gérer' : 'Associer'}
                    </button>
                    <button type="button" class="btn-delete-individual" style="background: white; color: var(--danger); border: 1px solid var(--danger); padding: 8px 10px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;" title="Supprimer cet article">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;

            grid.appendChild(card);

            card.querySelector('.btn-manage-individual').addEventListener('click', () => {
                // To manage an individual item, we just re-open the modal as a single item
                document.getElementById('inv-batch-badge').style.display = 'none';
                document.getElementById('inv-id').value = item.id;
                document.getElementById('inv-id').removeAttribute('data-is-batch');

                const cardEl = document.querySelector(`.inv-card[data-id="${item.id}"]`);
                if (cardEl) {
                    cardEl.click();
                } else {
                    fillInventoryModal(item);
                }
                // Ensure we stay on Stock tab
                switchToInventoryStockTab();
            });

            card.querySelector('.btn-delete-individual').addEventListener('click', async () => {
                if (confirm(`Supprimer définitivement l'article n°${item.number} de ce lot ?`)) {
                    try {
                        const row = card.closest('.batch-item-row');
                        row.style.opacity = '0.5';
                        row.style.pointerEvents = 'none';

                        await deleteDoc(doc(db, "inventory", item.id));
                        showAlert(`Article n°${item.number} supprimé.`, "success");

                        // Close modal and refresh or just refresh list? 
                        // If we are in the batch modal, we should probably stay but update.
                        // However, loadInventory() is global.

                        // To keep it simple and clean, let's close and refresh
                        inventoryModal.classList.remove('active');
                        loadInventory();
                        updateStats();
                    } catch (err) {
                        console.error(err);
                        showAlert("Erreur lors de la suppression.", "error");
                    }
                }
            });
        });

        stockEl.textContent = `Libres: ${libres} / ${batchItems.length}`;
        stockEl.style.background = libres > 0 ? 'var(--primary)' : 'var(--danger)';
    }

    function fillInventoryModal(data) {
        document.getElementById('inv-name').value = data.name;
        document.getElementById('inv-cat').value = data.category;
        document.getElementById('inv-qty').value = data.quantity;
        document.getElementById('inv-qty').disabled = false;
        if (document.getElementById('inv-qty-stock')) {
            document.getElementById('inv-qty-stock').value = data.quantity;
            document.getElementById('inv-qty-stock').disabled = false;
        }
        document.getElementById('inv-status').value = data.status;
        document.getElementById('inv-model').value = data.model || "";
        document.getElementById('inv-size').value = data.size || "";
        document.getElementById('inv-number').value = data.number || "";
        document.getElementById('inv-number').disabled = false;

        document.getElementById('inv-dist-helper-form').style.display = 'flex';
        document.getElementById('inv-dist-label').style.display = 'block';

        // switchToInventoryStockTab is handled by the caller or needed here if manual
        // but for safety we don't reset to 0 if we want to stay
        // resetInventoryModalTabs(); <--- Removed reset to allow staying on current tab

        // Distribution logic refresh (borrowed from setupClickableCard handler)
        renderSingleInventoryDistributions(data);
    }

    function renderSingleInventoryDistributions(data) {
        const currentInvId = data.id;
        let distributions = data.distributions || [];
        // Migration logic for UI
        if ((!distributions || distributions.length === 0) && data.assignedType && data.assignedType !== 'none' && data.assignedTo) {
            let name = "Inconnu";
            if (data.assignedType === 'coach' && dataCache.coaches[data.assignedTo]) name = dataCache.coaches[data.assignedTo].name;
            if (data.assignedType === 'player' && dataCache.players[data.assignedTo]) name = dataCache.players[data.assignedTo].name;
            distributions = [{
                type: data.assignedType,
                id: data.assignedTo,
                qty: 1,
                name: name
            }];
        }

        const distTypeSel = document.getElementById('dist-type');
        const distTargetSel = document.getElementById('dist-target');
        const distQtyInput = document.getElementById('dist-qty');
        const btnAddDist = document.getElementById('btn-add-dist');
        const listEl = document.getElementById('inv-distributions-list');
        const stockEl = document.getElementById('inv-stock-remaining');

        const renderDistributions = () => {
            listEl.innerHTML = '';
            let distributedCount = 0;
            const totalQty = parseInt(document.getElementById('inv-qty').value) || 0;

            if (!distributions || distributions.length === 0) {
                listEl.innerHTML = '<p style="color: #888; font-style: italic; font-size: 0.9rem;">Aucune distribution.</p>';
            } else {
                distributions.forEach((d, index) => {
                    distributedCount += (parseInt(d.qty) || 0);
                    let name = d.name || 'Inconnu';
                    if (d.type === 'coach' && dataCache.coaches && dataCache.coaches[d.id]) name = dataCache.coaches[d.id].name;
                    if (d.type === 'player' && dataCache.players && dataCache.players[d.id]) name = dataCache.players[d.id].name;

                    const div = document.createElement('div');
                    div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding: 10px 0; font-size: 0.9rem;';
                    div.innerHTML = `
                        <span>
                            <span style="font-weight:700; color: var(--primary); background: #eef2f7; padding: 2px 8px; border-radius: 4px; margin-right: 10px;">x${d.qty}</span> 
                            <span style="font-weight: 500;">${name}</span> <i style="font-size:0.8em; color:#999; margin-left: 5px;">(${d.type === 'coach' ? 'Coach' : 'Joueur'})</i>
                        </span>
                        <button type="button" class="del-dist-btn" data-index="${index}" style="background:none; border:none; color:#dc3545; cursor:pointer; font-size: 1.1rem;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                     `;
                    listEl.appendChild(div);
                });

                listEl.querySelectorAll('.del-dist-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        if (!await showConfirm('Annuler cette distribution ?')) return;
                        const idx = parseInt(btn.getAttribute('data-index'));
                        distributions.splice(idx, 1);
                        await saveDistributions();
                        renderDistributions();
                    });
                });
            }

            const remaining = totalQty - distributedCount;
            stockEl.textContent = `Stock: ${remaining}`;
            stockEl.style.backgroundColor = remaining > 0 ? 'var(--primary)' : 'var(--danger)';
        };

        const saveDistributions = async () => {
            try {
                await updateDoc(doc(db, "inventory", currentInvId), {
                    distributions: distributions,
                    assignedType: 'mixed',
                    assignedTo: 'mixed'
                });
                dataCache.inventory[currentInvId].distributions = distributions; // Sync cache
            } catch (e) {
                console.error(e);
                showAlert('Erreur sauvegarde distribution: ' + e.message, 'error');
            }
        };

        distTypeSel.value = '';
        distTargetSel.innerHTML = '<option value="">Sélectionner...</option>';
        distTargetSel.disabled = true;
        distQtyInput.value = '1';

        distTypeSel.onchange = () => {
            const type = distTypeSel.value;
            distTargetSel.innerHTML = '<option value="">Sélectionner...</option>';
            if (!type) { distTargetSel.disabled = true; return; }
            distTargetSel.disabled = false;

            let source = [];
            if (type === 'coach') source = Object.keys(dataCache.coaches || {}).map(k => ({ id: k, ...dataCache.coaches[k] }));
            else if (type === 'player') source = dataCache.allPlayers || Object.keys(dataCache.players || {}).map(k => ({ id: k, ...dataCache.players[k] }));

            source.forEach(item => {
                if (!item.name) {
                    item.name = (item.firstName && item.lastName) ? `${item.firstName} ${item.lastName}` : (item.name || 'Sans Nom');
                }
            });
            source.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            source.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.textContent = item.name;
                distTargetSel.appendChild(opt);
            });
        };

        btnAddDist.onclick = async () => {
            const type = distTypeSel.value;
            const targetId = distTargetSel.value;
            const qty = parseInt(distQtyInput.value);

            if (!type || !targetId || !qty || qty <= 0) return showAlert('Veuillez remplir tous les champs.', 'warning');

            let currentDist = 0;
            distributions.forEach(d => currentDist += (parseInt(d.qty) || 0));
            const total = parseInt(document.getElementById('inv-qty').value) || 0;
            if (currentDist + qty > total) {
                if (!await showConfirm(`Attention: Stock insuffisant (${total - currentDist} restants). Continuer ?`)) return;
            }

            let name = distTargetSel.options[distTargetSel.selectedIndex].text;
            distributions.push({ type, id: targetId, name, qty, date: new Date().toISOString() });
            await saveDistributions();
            renderDistributions();
            distQtyInput.value = '1';
        };

        renderDistributions();
    }

    setupClickableCard('.inv-card', 'inventory', 'inventory-modal', 'inv-id', async (data) => {
        const currentInvId = document.getElementById('inv-id').value;

        const nameInput = document.getElementById('inv-name');
        if (nameInput) nameInput.value = data.name || "";

        document.getElementById('inv-cat').value = data.category;
        document.getElementById('inv-qty').value = data.quantity;
        document.getElementById('inv-status').value = data.status;
        const modelInput = document.getElementById('inv-model');
        if (modelInput) modelInput.value = data.model || "";

        const sizeInput = document.getElementById('inv-size');
        if (sizeInput) sizeInput.value = data.size || "";

        const numInput = document.getElementById('inv-number');
        if (numInput) numInput.value = data.number || "";

        // Only reset tabs if we are not explicitly staying on Stock tab
        // However, usually we want to reset. But for batch click we want to skip.
        // The most robust way is to check a global or pass it?
        // Actually, renderBatchStockList calls switchToInventoryStockTab AFTER the click handler is done.
        resetInventoryModalTabs();

        // --- DISTRIBUTION LOGIC ---

        // 1. Prepare Distributions Data
        let distributions = data.distributions || [];
        // Migration logic for UI
        if ((!distributions || distributions.length === 0) && data.assignedType && data.assignedType !== 'none' && data.assignedTo) {
            let name = "Inconnu";
            if (data.assignedType === 'coach' && dataCache.coaches[data.assignedTo]) name = dataCache.coaches[data.assignedTo].name;
            if (data.assignedType === 'player' && dataCache.players[data.assignedTo]) name = dataCache.players[data.assignedTo].name;
            distributions = [{
                type: data.assignedType,
                id: data.assignedTo,
                qty: 1,
                name: name
            }];
        }

        // 2. Elements
        const distTypeSel = document.getElementById('dist-type');
        const distTargetSel = document.getElementById('dist-target');
        const distQtyInput = document.getElementById('dist-qty');
        const btnAddDist = document.getElementById('btn-add-dist');
        const listEl = document.getElementById('inv-distributions-list');
        const stockEl = document.getElementById('inv-stock-remaining');

        distQtyInput.value = '1';

        // 3. Render Function
        const renderDistributions = () => {
            listEl.innerHTML = '';
            let distributedCount = 0;
            const totalQty = parseInt(document.getElementById('inv-qty').value) || 0;

            if (!distributions || distributions.length === 0) {
                listEl.innerHTML = '<p style="color: #888; font-style: italic; font-size: 0.9rem;">Aucune distribution.</p>';
            } else {
                distributions.forEach((d, index) => {
                    distributedCount += (parseInt(d.qty) || 0);

                    // Resolve Name if missing/stale
                    let name = d.name || 'Inconnu';
                    if (d.type === 'coach' && dataCache.coaches && dataCache.coaches[d.id]) name = dataCache.coaches[d.id].name;
                    if (d.type === 'player' && dataCache.players && dataCache.players[d.id]) name = dataCache.players[d.id].name;

                    const div = document.createElement('div');
                    div.style.display = 'flex';
                    div.style.justifyContent = 'space-between';
                    div.style.alignItems = 'center';
                    div.style.borderBottom = '1px solid #eee';
                    div.style.padding = '4px 0';
                    div.style.fontSize = '0.9rem';

                    div.innerHTML = `
                        <span>
                            <span style="font-weight:600; color: var(--primary);">x${d.qty}</span> 
                            ${name} <i style="font-size:0.8em; color:#888;">(${d.type === 'coach' ? 'Coach' : 'Joueur'})</i>
                        </span>
                        <button type="button" class="del-dist-btn" data-index="${index}" style="background:none; border:none; color:#dc3545; cursor:pointer;">
                            <i class="fas fa-times"></i>
                        </button>
                     `;
                    listEl.appendChild(div);
                });

                // Attach delete handlers
                listEl.querySelectorAll('.del-dist-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        if (!window.confirm('Annuler cette distribution ?')) return; // Could use showConfirm if available
                        const idx = parseInt(btn.getAttribute('data-index'));
                        distributions.splice(idx, 1);
                        await saveDistributions();
                        renderDistributions();
                    });
                });
            }

            const remaining = totalQty - distributedCount;
            stockEl.textContent = `Stock: ${remaining}`;
            stockEl.style.backgroundColor = remaining > 0 ? 'var(--primary)' : 'var(--danger)';

            // Disable add button if no stock (optional, maybe allow negative for adjustments?) 
            // Let's allow but warn or show negative stock.
        };

        // 4. Helper to Save
        const saveDistributions = async () => {
            try {
                await updateDoc(doc(db, "inventory", currentInvId), {
                    distributions: distributions,
                    assignedType: 'mixed', // Legacy flag update
                    assignedTo: 'mixed'
                });
                // Update Cache logic if needed
            } catch (e) {
                console.error(e);
                alert('Erreur sauvegarde distribution: ' + e.message);
            }
        };

        // 5. Populate Dropdowns on Type Change
        distTypeSel.value = '';
        distTargetSel.innerHTML = '<option value="">Sélectionner...</option>';
        distTargetSel.disabled = true;
        distQtyInput.value = '1';

        distTypeSel.onchange = () => {
            const type = distTypeSel.value;
            distTargetSel.innerHTML = '<option value="">Sélectionner...</option>';
            if (!type) {
                distTargetSel.disabled = true;
                return;
            }
            distTargetSel.disabled = false;

            let source = [];
            if (type === 'coach') {
                source = Object.keys(dataCache.coaches || {}).map(k => ({ id: k, ...dataCache.coaches[k] }));
            } else if (type === 'player') {
                // If dataCache.allPlayers exists (from team modal logic), use it. Else fall back to cache.players
                if (dataCache.allPlayers) source = dataCache.allPlayers;
                else source = Object.keys(dataCache.players || {}).map(k => ({ id: k, ...dataCache.players[k] }));
            }

            source.forEach(item => {
                if (!item.name) {
                    item.name = (item.firstName && item.lastName) ? `${item.firstName} ${item.lastName}` : (item.name || 'Sans Nom');
                }
            });
            source.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            source.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.textContent = item.name;
                distTargetSel.appendChild(opt);
            });
        };

        // 6. Add Button Logic
        btnAddDist.onclick = async () => {
            const type = distTypeSel.value;
            const targetId = distTargetSel.value;
            const qty = parseInt(distQtyInput.value);

            if (!type || !targetId || !qty || qty <= 0) {
                alert('Veuillez remplir tous les champs correctement.');
                return;
            }

            // Check stock?
            let currentDist = 0;
            distributions.forEach(d => currentDist += (parseInt(d.qty) || 0));
            const total = parseInt(document.getElementById('inv-qty').value) || 0;
            if (currentDist + qty > total) {
                if (!confirm(`Attention: Stock insuffisant (${total - currentDist} restants). Continuer quand même ?`)) return;
            }

            // Get Name
            let name = distTargetSel.options[distTargetSel.selectedIndex].text;

            distributions.push({
                type: type,
                id: targetId,
                name: name,
                qty: qty,
                date: new Date().toISOString()
            });

            await saveDistributions();
            renderDistributions();

            // Reset fields
            distQtyInput.value = '1';
            // keep selection for fast input? maybe not
        };

        // Initial Render
        renderDistributions();
    });

    // Refresh stats when deleted
    setupDeleteButton('.delete-inv', 'inventory', () => { loadInventory(); updateStats(); });
}

// --- REGISTRATIONS LOGIC ---
const regModal = document.getElementById('registration-modal');
const openRegModalBtn = document.getElementById('open-registration-modal');
if (openRegModalBtn) openRegModalBtn.addEventListener('click', () => {
    document.getElementById('registration-form-admin').reset();
    document.getElementById('reg-id').value = '';
    setLoading(document.getElementById('registration-form-admin'), false);
    regModal.classList.add('active');
});
if (regModal) regModal.querySelector('.close-modal').addEventListener('click', () => regModal.classList.remove('active'));

document.getElementById('registration-form-admin')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(form, true);

    try {
        const id = document.getElementById('reg-id').value;
        const data = {
            childFirstName: document.getElementById('reg-child-first').value,
            childLastName: document.getElementById('reg-child-last').value,
            parentFirstName: document.getElementById('reg-parent-first').value,
            parentLastName: document.getElementById('reg-parent-last').value,
            email: document.getElementById('reg-email').value,
            phone: document.getElementById('reg-phone').value,
            program: document.getElementById('reg-program').value,
            status: document.getElementById('reg-status').value
        };

        // Timestamp for new ones
        if (!id) data.timestamp = new Date();

        await uploadAndSave('registrations', id, data, null);

        regModal.classList.remove('active');
        loadRegistrations();
    } catch (err) {
        console.error(err);
        alert("Erreur: " + (err.message || err));
    } finally {
        setLoading(form, false);
    }
});

async function loadRegistrations() {
    const tbody = document.querySelector('#registrations-table tbody');
    if (!tbody) return;

    // Filter values
    const filterTeam = document.getElementById('reg-filter-team')?.value || 'all';
    const searchText = document.getElementById('reg-search')?.value.toLowerCase() || '';

    tbody.innerHTML = '<tr><td colspan="5">Chargement...</td></tr>';

    // Ensure teams loaded for filter dropdown
    if (!dataCache.teams || Object.keys(dataCache.teams).length === 0) {
        const tSnap = await getDocs(collection(db, 'teams'));
        dataCache.teams = {};
        tSnap.forEach(d => dataCache.teams[d.id] = d.data());
    }

    // Populate Filter if empty
    const teamSelect = document.getElementById('reg-filter-team');
    // Only populate if we have 'all' option only (length 1) to avoid duplicating
    if (teamSelect && teamSelect.options.length <= 1) {
        // Sort teams by name
        const sortedTeams = Object.entries(dataCache.teams).map(([id, t]) => ({ id, name: t.name || 'Sans Nom' }))
            .sort((a, b) => a.name.localeCompare(b.name));
        sortedTeams.forEach((t) => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            teamSelect.appendChild(opt);
        });
    }

    const q = query(collection(db, "registrations"), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);

    tbody.innerHTML = '';
    dataCache.registrations = {};

    let count = 0;
    snapshot.forEach(doc => {
        const data = doc.data();
        dataCache.registrations[doc.id] = data;

        // Filtering
        if (filterTeam !== 'all' && data.teamId !== filterTeam) return;

        const fullName = `${data.childFirstName} ${data.childLastName}`.toLowerCase();
        if (searchText && !fullName.includes(searchText)) return;

        const date = data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().toLocaleDateString() : 'N/A';
        const teamName = data.teamId && dataCache.teams[data.teamId] ? dataCache.teams[data.teamId].name : '-';

        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.setAttribute('data-id', doc.id);
        row.className = 'reg-row';

        row.innerHTML = `<td>${date}</td>
                         <td><strong>${data.childFirstName} ${data.childLastName}</strong><br><small>Né(e): ${data.birthYear || '?'}</small></td>
                         <td>${data.program}<br><small>${teamName}</small></td>
                         <td>${data.parentFirstName} ${data.parentLastName}<br><small>${data.email}</small></td>
                         <td class="actions-cell">
                             <a href="mailto:${data.email}" class="btn-action" title="Envoyer courriel" onclick="event.stopPropagation()"><i class="fas fa-envelope"></i></a>
                             <button class="delete-reg" data-id="${doc.id}" title="Supprimer" onclick="event.stopPropagation()"><i class="fas fa-trash"></i></button>
                         </td>`;
        tbody.appendChild(row);
        count++;
    });

    if (count === 0) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Aucune inscription trouvée.</td></tr>';

    // Add Click Listener
    setupClickableCard('.reg-row', 'registrations', 'registration-modal', 'reg-id', (data) => {
        document.getElementById('reg-child-first').value = data.childFirstName || '';
        document.getElementById('reg-child-last').value = data.childLastName || '';
        document.getElementById('reg-parent-first').value = data.parentFirstName || '';
        document.getElementById('reg-parent-last').value = data.parentLastName || '';
        document.getElementById('reg-email').value = data.email || '';
        document.getElementById('reg-phone').value = data.phone || '';
        document.getElementById('reg-program').value = data.program || 'U4-U6';
        document.getElementById('reg-status').value = data.status || 'New';
    });

    setupDeleteButton('.delete-reg', 'registrations', () => loadRegistrations());
}

// Add Listeners
document.getElementById('reg-filter-team')?.addEventListener('change', loadRegistrations);
document.getElementById('reg-search')?.addEventListener('input', loadRegistrations);




// --- Rest of General Logic ---
async function updateStats() {
    const list = ['products', 'players', 'inventory'];
    for (const c of list) {
        const snap = await getDocs(collection(db, c));
        const el = document.getElementById(`stat-${c}`);
        if (el) el.innerText = snap.size;
    }
}

async function loadDashboardData() {
    console.log("🚀 Starting LoadDashboardData...");
    console.time("DashboardLoad");

    // helper to wrap tasks with logging and error handling
    const wrap = async (name, task) => {
        console.time(`DashTask:${name}`);
        try {
            await task();
            console.log(`✅ ${name} loaded.`);
        } catch (e) {
            console.error(`❌ ${name} failed:`, e);
        } finally {
            console.timeEnd(`DashTask:${name}`);
        }
    };

    // Run updateStats in background
    updateStats().catch(err => console.error("Stats Update Error:", err));

    // 1. Season Task (Needed for some but let's not block other widgets)
    const seasonTask = wrap("Season", async () => {
        if (!dataCache.currentSeason) {
            const qActive = query(collection(db, "seasons"), where("active", "==", true));
            const snapActive = await getDocs(qActive);
            if (!snapActive.empty) {
                dataCache.currentSeason = snapActive.docs[0].id;
            }
        }
    });

    // 2. Players Task
    const playersTask = wrap("Players", async () => {
        const playersCountEl = document.getElementById('dash-players-count');
        const qPlayers = query(collection(db, "players"));
        const snapPlayers = await getDocs(qPlayers);
        dataCache.players = {};
        snapPlayers.forEach(doc => dataCache.players[doc.id] = doc.data());
        if (playersCountEl) playersCountEl.textContent = `${snapPlayers.size} joueurs au total`;
    });

    // 3. Coaches Task
    const coachesTask = wrap("Coaches", async () => {
        const coachContainer = document.getElementById('dash-coach-alerts');
        if (!coachContainer) return;

        coachContainer.innerHTML = '<p style="text-align:center;">Analyse des données...</p>';
        const snapCoaches = await getDocs(collection(db, "coaches"));
        dataCache.coaches = {};
        snapCoaches.forEach(doc => dataCache.coaches[doc.id] = doc.data());

        coachContainer.innerHTML = '';
        const now = new Date();
        const sixMonthsFromNow = new Date();
        sixMonthsFromNow.setMonth(now.getMonth() + 6);

        let alertCount = 0;
        snapCoaches.forEach(doc => {
            const c = doc.data();
            const expiry = c.policeExpiry ? new Date(c.policeExpiry) : null;
            const displayName = c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Inconnu';

            if (!expiry || expiry < sixMonthsFromNow) {
                const status = !expiry ? "Manquante" : "Expire le " + expiry.toLocaleDateString();
                const color = !expiry ? "#e74c3c" : "#f39c12";
                coachContainer.innerHTML += `
                    <div style="padding: 12px; margin-bottom: 8px; border-left: 5px solid ${color}; background: #fff; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        <strong style="color: #333;">${displayName}</strong><br>
                        <span style="font-size: 0.85rem; color: #666;"><i class="fas fa-id-card"></i> Enquête : ${status}</span>
                    </div>
                `;
                alertCount++;
            }
        });
        if (alertCount === 0) coachContainer.innerHTML = '<p style="color: green; text-align:center;">Toutes les enquêtes sont à jour.</p>';
    });

    // 4. Referees Task
    const refereesTask = wrap("Referees", async () => {
        const refTbody = document.getElementById('dash-ref-stats');
        if (!refTbody) return;

        refTbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Calcul...</td></tr>';
        const [snapMatches, snapRefs] = await Promise.all([
            getDocs(collection(db, "matches")),
            getDocs(collection(db, "referees"))
        ]);

        dataCache.referees = {};
        snapRefs.forEach(doc => dataCache.referees[doc.id] = doc.data());

        const refCounts = {};
        snapMatches.forEach(doc => {
            const m = doc.data();
            [m.refCenter, m.refAsst1, m.refAsst2].forEach(id => {
                if (id) refCounts[id] = (refCounts[id] || 0) + 1;
            });
        });

        refTbody.innerHTML = '';
        snapRefs.forEach(doc => {
            const r = doc.data();
            const count = refCounts[doc.id] || 0;
            const fullName = r.name || `${r.firstName || ''} ${r.lastName || ''}`.trim() || 'Inconnu';
            refTbody.innerHTML += `<tr><td>${fullName}</td><td style="text-align:center; font-weight:bold;">${count}</td></tr>`;
        });
    });

    // Fire all tasks in parallel
    await Promise.all([seasonTask, playersTask, coachesTask, refereesTask]);
    console.timeEnd("DashboardLoad");
}

async function seedDatabase() { /* ... existing seeder ... */ }

// --- ADMIN MANAGEMENT LOGIC ---
const adminModal = document.getElementById('admin-modal');
const openAdminModalBtn = document.getElementById('open-admin-modal');
const navAdminsBtn = document.getElementById('nav-admins-btn');

if (openAdminModalBtn) openAdminModalBtn.addEventListener('click', () => {
    document.getElementById('admin-form').reset();
    document.getElementById('admin-id').value = '';
    setLoading(document.getElementById('admin-form'), false);
    adminModal.classList.add('active');
});
if (adminModal) adminModal.querySelector('.close-modal').addEventListener('click', () => adminModal.classList.remove('active'));

document.getElementById('admin-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(form, true);

    try {
        const id = document.getElementById('admin-id').value;
        const email = document.getElementById('admin-email').value;
        const name = document.getElementById('admin-name').value;

        // Collect roles from checkboxes
        const roles = [];
        document.querySelectorAll('#roles-checkbox-group input[type="checkbox"]:checked').forEach(cb => {
            roles.push(cb.value);
        });

        if (roles.length === 0) throw new Error("Veuillez sélectionner au moins un rôle.");

        // Check if email already exists (if new)
        if (!id) {
            const q = query(collection(db, "admins"), where("email", "==", email));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) throw new Error("Cet email est déjà enregistré comme administrateur.");
        }

        const data = { email, name, role: roles }; // saved as array

        if (id) {
            await updateDoc(doc(db, "admins", id), data);
        } else {
            await addDoc(collection(db, "admins"), data);
        }

        adminModal.classList.remove('active');
        loadAdmins();
    } catch (err) {
        console.error(err);
        alert("Erreur: " + (err.message || err));
    } finally {
        setLoading(form, false);
    }
});

async function loadAdmins() {
    const table = document.getElementById('admins-table')?.querySelector('tbody');
    if (!table) return;

    table.innerHTML = '<tr><td colspan="4">Chargement...</td></tr>';

    try {
        // Fetch Firestore Admins
        const snapshot = await getDocs(collection(db, "admins"));
        table.innerHTML = '';
        dataCache.admins = {};

        if (snapshot.empty) {
            table.innerHTML = '<tr><td colspan="4">Aucun administrateur trouvé.</td></tr>';
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            dataCache.admins[doc.id] = data;
            const row = document.createElement('tr');

            // Handle legacy strings vs modern arrays
            const rolesArray = Array.isArray(data.role) ? data.role : [data.role];
            const rolesHtml = rolesArray.map(r => `
                <span class="badge ${r === 'SuperAdmin' ? 'badge-primary' : 'badge-secondary'}" style="margin-right:5px; margin-bottom:5px; display:inline-block;">
                    ${r}
                </span>
            `).join('');

            row.innerHTML = `
                <td>${data.email}</td>
                <td>${data.name}</td>
                <td>${rolesHtml}</td>
                <td>
                    <button class="btn-icon edit-admin" data-id="${doc.id}" style="margin-right:8px;"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete-admin" data-id="${doc.id}" style="color:red;"><i class="fas fa-trash"></i></button>
                </td>
            `;
            table.appendChild(row);
        });

        // Setup Edit
        table.querySelectorAll('.edit-admin').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const data = dataCache.admins[id];
                if (data) {
                    document.getElementById('admin-id').value = id;
                    document.getElementById('admin-email').value = data.email;
                    document.getElementById('admin-name').value = data.name;

                    // Set Checks
                    const rolesArray = Array.isArray(data.role) ? data.role : [data.role];
                    document.querySelectorAll('#roles-checkbox-group input[type="checkbox"]').forEach(cb => {
                        cb.checked = rolesArray.includes(cb.value);
                    });

                    adminModal.classList.add('active');
                }
            });
        });

        // Setup Delete
        table.querySelectorAll('.delete-admin').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm("Supprimer cet administrateur ?")) {
                    const id = btn.getAttribute('data-id');
                    try {
                        await deleteDoc(doc(db, "admins", id));
                        loadAdmins();
                    } catch (e) {
                        alert("Erreur: " + e.message);
                    }
                }
            });
        });
    } catch (e) {
        console.error("Erreur loadAdmins:", e);
        table.innerHTML = `<tr><td colspan="4" style="color:red">Erreur: ${e.message}</td></tr>`;
    }
}

// --- GLOBAL ROLE CHECK ---
async function getUserRole(email) {
    // 1. Hardcoded SuperAdmins (God Mode)
    const lowerEmail = email.toLowerCase();
    const hardcodedSuperAdmins = ['admin@celtics.com', 'celtics.portneuf@gmail.com', 'bensult78@gmail.com'];
    if (hardcodedSuperAdmins.includes(lowerEmail)) return ['SuperAdmin'];

    // 2. Check Firestore
    try {
        const q = query(collection(db, "admins"), where("email", "==", email));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const roleData = snapshot.docs[0].data().role;
            return Array.isArray(roleData) ? roleData : [roleData]; // Always array
        }
    } catch (e) {
        console.warn("Error checking admin role:", e);
    }
    return []; // No roles
}

// Ensure Benjamin is in the DB list for visibility
async function ensureBenjaminInDb() {
    const email = "bensult78@gmail.com";
    try {
        const q = query(collection(db, "admins"), where("email", "==", email));
        const snap = await getDocs(q);
        if (snap.empty) {
            await addDoc(collection(db, "admins"), {
                email: email,
                name: "Benjamin Sultan",
                role: ["SuperAdmin"]
            });
            console.log("Benjamin auto-added to DB");
        }
    } catch (e) {
        console.error("Auto-add Benjamin failed", e);
    }
}

// Hook into Nav clicks to load Admins
document.getElementById('nav-admins-btn')?.addEventListener('click', loadAdmins);

// EXPORT to window for button usage if needed, or re-run role check
window.checkAdminAndSetupUI = async (user) => {
    if (!user) return;

    // Auto-ensure Benjamin is in DB (just in case)
    if (user.email.toLowerCase() === 'bensult78@gmail.com') {
        await ensureBenjaminInDb();
    }

    const roles = await getUserRole(user.email);
    console.log("User Roles:", roles);

    const isSuper = roles.includes('SuperAdmin');

    if (isSuper) {
        if (navAdminsBtn) navAdminsBtn.style.display = 'block';
    } else {
        if (navAdminsBtn) navAdminsBtn.style.display = 'none';

        // If user is on admin view but dropped rights, redirect
        if (document.getElementById('view-admins').classList.contains('active')) {
            const dashboardBtn = document.querySelector('.nav-btn[data-target="view-dashboard"]');
            if (dashboardBtn) dashboardBtn.click();
        }
    }
    return roles;
};

// --- COACHES LOGIC ---
const coachModal = document.getElementById('coach-modal');
const openCoachModalBtn = document.getElementById('open-coach-modal');

if (openCoachModalBtn) openCoachModalBtn.addEventListener('click', () => {
    document.getElementById('coach-form').reset();
    document.getElementById('coach-id').value = '';
    document.getElementById('coach-image-preview').innerHTML = '';
    setLoading(document.getElementById('coach-form'), false);
    coachModal.classList.add('active');
});

if (coachModal) {
    coachModal.querySelector('.close-modal').addEventListener('click', () => coachModal.classList.remove('active'));
    // New Close Button
    const closeBtn = document.getElementById('close-coach-modal-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => coachModal.classList.remove('active'));
}

// Setup Preview
setupImagePreview('coach-image', 'coach-image-preview');

document.getElementById('coach-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(form, true);

    try {
        const id = document.getElementById('coach-id').value;
        const name = document.getElementById('coach-name').value;
        const policeExpiry = document.getElementById('coach-police-expiry').value;
        const sportRespectExpiry = document.getElementById('coach-sport-respect-expiry').value;
        const visible = document.getElementById('coach-visible').checked;
        const file = document.getElementById('coach-image').files[0];

        if (file && file.size > 5 * 1024 * 1024) throw new Error("L'image est trop volumineuse (Max 5MB).");

        const data = { name, policeExpiry, sportRespectExpiry, visible };
        await uploadAndSave('coaches', id, data, file);

        coachModal.classList.remove('active');
        loadCoaches();
    } catch (err) {
        console.error(err);
        alert("Erreur: " + (err.message || err));
    } finally {
        setLoading(form, false);
    }
});

async function loadCoaches() {
    const list = document.getElementById('coaches-list');
    if (!list) return;

    list.innerHTML = '<p>Chargement...</p>';
    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) {
        list.classList.add('view-grid');
    }

    const q = query(collection(db, "coaches"));
    const snapshot = await getDocs(q);
    list.innerHTML = '';
    dataCache.coaches = {};

    const coachesList = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        dataCache.coaches[doc.id] = data;
        coachesList.push({ id: doc.id, ...data });
    });

    // Custom Sort: Active first, then Empty policeExpiry first, then chronological
    coachesList.sort((a, b) => {
        const visA = a.visible !== false;
        const visB = b.visible !== false;
        if (visA !== visB) return visA ? -1 : 1;

        const noDateA = !a.policeExpiry;
        const noDateB = !b.policeExpiry;

        if (noDateA && noDateB) {
            const nameA = (a.name || `${a.firstName || ''} ${a.lastName || ''}`).trim().toLowerCase();
            const nameB = (b.name || `${b.firstName || ''} ${b.lastName || ''}`).trim().toLowerCase();
            return nameA.localeCompare(nameB);
        }
        if (noDateA) return -1;
        if (noDateB) return 1;

        return new Date(a.policeExpiry) - new Date(b.policeExpiry);
    });

    list.innerHTML = '';

    if (coachesList.length === 0) {
        list.innerHTML = '<p>Aucun entraîneur.</p>';
        return;
    }

    coachesList.forEach(data => {
        let subtitle = '';
        if (data.policeExpiry) {
            const exp = new Date(data.policeExpiry);
            const now = new Date();
            const isExp = exp < now;
            subtitle += `<span style="color:${isExp ? 'red' : 'green'}"><i class="fas fa-shield-alt"></i> Enquête: ${isExp ? 'Expirée' : 'Valide'}</span><br>`;
        } else {
            subtitle += `<span style="color:red"><i class="fas fa-shield-alt"></i> Enquête Manquante</span><br>`;
        }

        if (data.visible === false) {
            subtitle += `<span style="badge badge-secondary">Inactif</span>`;
        }

        const card = createCard(data.imageUrl, `${data.name}`, subtitle, data.id, 'edit-coach', 'delete-coach', 'fa-user-tie');
        list.appendChild(card);
    });

    setupClickableCard('#coaches-list .product-card-admin', 'coaches', 'coach-modal', 'coach-id', async (data) => {
        document.getElementById('coach-name').value = data.name;
        document.getElementById('coach-police-expiry').value = data.policeExpiry || '';
        document.getElementById('coach-sport-respect-expiry').value = data.sportRespectExpiry || '';
        document.getElementById('coach-visible').checked = data.visible !== false;

        setExistingPreview('coach-image-preview', data.imageUrl);

        const coachId = document.getElementById('coach-id').value; // Use ID from hidden field

        // Load assigned inventory
        const invList = document.getElementById('coach-inventory-list');
        if (invList) {
            invList.innerHTML = '<p>Chargement...</p>';
            try {
                const qInv = query(collection(db, "inventory"), where("assignedTo", "==", coachId), where("assignedType", "==", "coach"));
                const snapInv = await getDocs(qInv);
                invList.innerHTML = '';
                if (snapInv.empty) invList.innerText = "Aucun inventaire assigné.";
                snapInv.forEach(d => {
                    const item = d.data();
                    const div = document.createElement('div');
                    div.style.borderBottom = "1px solid #eee"; div.style.padding = "4px";
                    div.innerHTML = `<strong>${item.name}</strong> <small>(Qté: 1)</small>`;
                    invList.appendChild(div);
                });
            } catch (e) { console.error(e); invList.innerText = "Erreur chargement inventaire."; }
        }

        // Load assigned teams (Support array-contains for coachIds)
        const teamList = document.getElementById('coach-teams-list');
        if (teamList) {
            teamList.innerHTML = '<p>Chargement...</p>';
            try {
                const qTeam = query(collection(db, "teams"), where("coachIds", "array-contains", coachId));
                const snapTeam = await getDocs(qTeam);

                // Fallback for legacy single coachId if needed, but array-contains is safer if we migrated
                // If we want to be super safe we could do two queries or client filter, but let's stick to new standard.

                teamList.innerHTML = '';
                if (snapTeam.empty) {
                    teamList.innerText = "Aucune équipe.";

                    // Optional: Check legacy field if array query failed to find anything? 
                    // Unlikely needed if we save correctly.
                } else {
                    snapTeam.forEach(d => {
                        const t = d.data();
                        const div = document.createElement('div');
                        div.innerHTML = `<strong>${t.name}</strong> <small>(${t.category})</small>`;
                        div.style.borderBottom = "1px solid #eee"; div.style.padding = "4px";
                        teamList.appendChild(div);
                    });
                }
            } catch (e) { console.error(e); teamList.innerText = "Erreur chargement équipes."; }
        }
    });

    setupDeleteButton('.delete-coach', 'coaches', () => loadCoaches());
}

const addPriceRowBtn = document.getElementById('add-price-row-btn');

let quillBoutique = null;
if (document.getElementById('boutique-editor')) {
    quillBoutique = new Quill('#boutique-editor', {
        theme: 'snow',
        modules: { toolbar: '#boutique-editor-toolbar' }
    });
}

function loadBoutiqueSettings() {
    // Also load products
    if (typeof loadProducts === 'function') loadProducts();

    getDoc(doc(db, "settings", "boutique")).then(docSnap => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (document.getElementById('boutique-link')) document.getElementById('boutique-link').value = data.link || '';
            if (quillBoutique) quillBoutique.root.innerHTML = data.description || '';
        }
    }).catch(console.error);
}

const saveBoutiqueBtn = document.getElementById('save-boutique-btn');

if (saveBoutiqueBtn) {
    saveBoutiqueBtn.addEventListener('click', async () => {
        saveBoutiqueBtn.disabled = true;
        saveBoutiqueBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sauvegarde...';
        try {
            const data = {
                link: document.getElementById('boutique-link').value,
                description: quillBoutique ? quillBoutique.root.innerHTML : ''
            };
            await setDoc(doc(db, "settings", "boutique"), data);
            alert("Configuration boutique sauvegardée !");
        } catch (e) {
            console.error(e);
            alert("Erreur: " + e.message);
        } finally {
            saveBoutiqueBtn.disabled = false;
            saveBoutiqueBtn.innerHTML = '<i class="fas fa-save"></i> Sauvegarder';
        }
    });
}

if (addPriceRowBtn) {
    addPriceRowBtn.addEventListener('click', () => {
        addPriceRow(null);
    });
}

function addPriceRow(data) {
    const tbody = document.getElementById('pricing-tbody');
    const tr = document.createElement('tr');

    // Default values
    const year = data ? data.year : "2022";
    const cat = data ? data.category : "Timbits";
    const price = data ? data.price : 75;

    tr.innerHTML = `
        <td><input type="text" class="price-year" value="${year}" style="width:80px;"></td>
        <td><input type="text" class="price-cat" value="${cat}"></td>
        <td><input type="number" class="price-val" value="${price}" style="width:80px;"></td>
        <td><button class="btn-icon text-danger remove-row"><i class="fas fa-trash"></i></button></td>
    `;

    tr.querySelector('.remove-row').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
}

const saveSettingsBtn = document.getElementById('save-settings-btn');

if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
        saveSettingsBtn.disabled = true;
        saveSettingsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sauvegarde...';

        try {
            const regOpen = document.getElementById('reg-status-toggle').checked;
            const targetSeason = document.getElementById('reg-target-season').value;
            const targetYear = document.getElementById('reg-target-year').value;

            if (regOpen) {
                if (!confirm(`CONFIRMATION REQUISE :\n\nVous êtes sur le point d'OUVRIR les inscriptions pour la saison :\n${targetSeason} ${targetYear}\n\nConfirmez-vous cette action ?`)) {
                    saveSettingsBtn.disabled = false;
                    saveSettingsBtn.innerHTML = '<i class="fas fa-save"></i> Sauvegarder Tout';
                    return;
                }
            }

            const settings = {
                registrationOpen: regOpen,
                targetSeason: targetSeason,
                targetYear: targetYear,
                welcomeMessage: quillWelcome ? quillWelcome.root.innerHTML : '',
                discount2nd: parseFloat(document.getElementById('setting-discount-2').value) || 0,
                discount3rd: parseFloat(document.getElementById('setting-discount-3').value) || 0,
                pricingGrid: []
            };

            document.querySelectorAll('#pricing-tbody tr').forEach(tr => {
                settings.pricingGrid.push({
                    year: tr.querySelector('.price-year').value,
                    category: tr.querySelector('.price-cat').value,
                    price: parseFloat(tr.querySelector('.price-val').value) || 0
                });
            });

            // Use a fixed ID 'current_season' for easy retrieval
            await setDoc(doc(db, "settings", "current_season"), settings);
            alert("Configuration sauvegardée avec succès !");

        } catch (e) {
            console.error(e);
            alert("Erreur de sauvegarde: " + e.message);
        } finally {
            saveSettingsBtn.disabled = false;
            saveSettingsBtn.innerHTML = '<i class="fas fa-save"></i> Sauvegarder Tout';
        }
    });
}

async function loadSettings() {
    try {
        const docRef = doc(db, "settings", "current_season");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('reg-status-toggle').checked = data.registrationOpen || false;
            document.getElementById('reg-target-season').value = data.targetSeason || 'Été';
            document.getElementById('reg-target-year').value = data.targetYear || '2025';

            if (quillWelcome) {
                quillWelcome.root.innerHTML = data.welcomeMessage || '';
            }

            document.getElementById('setting-discount-2').value = data.discount2nd || 15;
            document.getElementById('setting-discount-3').value = data.discount3rd || 20;

            const tbody = document.getElementById('pricing-tbody');
            tbody.innerHTML = '';
            if (data.pricingGrid && Array.isArray(data.pricingGrid)) {
                // Sort by year desc (if numbers) or keep order
                data.pricingGrid.forEach(item => addPriceRow(item));
            }
        } else {
            // Seed defaults with 2025 Rates provided by User
            addPriceRow({ year: '2022', category: 'Timbits', price: 75 });
            addPriceRow({ year: '2021', category: 'Timbits', price: 75 });
            addPriceRow({ year: '2020', category: 'Timbits', price: 75 });
            addPriceRow({ year: '2019', category: 'U7', price: 140 });
            addPriceRow({ year: '2018', category: 'U8', price: 140 });
            addPriceRow({ year: '2017', category: 'U9', price: 160 });
            addPriceRow({ year: '2016', category: 'U10', price: 160 });
            addPriceRow({ year: '2015', category: 'U11', price: 170 });
            addPriceRow({ year: '2014', category: 'U12', price: 170 });
            addPriceRow({ year: '2013', category: 'U13', price: 190 });
            addPriceRow({ year: '2012', category: 'U14', price: 190 });
            addPriceRow({ year: '2011', category: 'U15', price: 190 });
            addPriceRow({ year: '2010', category: 'U16', price: 200 });
            addPriceRow({ year: '2009', category: 'U17', price: 200 });
            addPriceRow({ year: '2008', category: 'U18', price: 200 });
            addPriceRow({ year: '2007+', category: 'Senior', price: 230 });

            // Special Options
            addPriceRow({ year: 'Option', category: 'Senior Réserviste (4 parties)', price: 80 });
            addPriceRow({ year: 'Option', category: 'Entrainement Seul (U7-U12)', price: 30 });
            addPriceRow({ year: 'Option', category: 'Entrainement Seul (U13+)', price: 40 });
        }
    } catch (e) {
        console.error("Error loading settings", e);
    }
}

// --- MATCHES LOGIC ---
const matchModal = document.getElementById('match-modal');
const openMatchModalBtn = document.getElementById('open-match-modal');

let selectedMatchFields = []; // Array to store selected field IDs

if (openMatchModalBtn) openMatchModalBtn.addEventListener('click', () => {
    document.getElementById('match-form').reset();
    document.getElementById('match-id').value = '';
    selectedMatchFields = []; // Reset selected fields
    renderMatchFieldTags();
    loadRefereesIntoSelects(); // Refresh referees list
    loadFieldsIntoAddSelect(); // Refresh fields list
    setLoading(document.getElementById('match-form'), false);
    matchModal.classList.add('active');
});

if (matchModal) matchModal.querySelector('.close-modal').addEventListener('click', () => matchModal.classList.remove('active'));

async function loadFieldsIntoAddSelect() {
    const sel = document.getElementById('match-field-add-select');
    if (!sel) return;

    try {
        const q = query(collection(db, "fields"), orderBy("name", "asc"));
        const snapshot = await getDocs(q);

        // Store fields in cache for later use
        if (!dataCache.fields) dataCache.fields = {};

        sel.innerHTML = '<option value="">Ajouter un terrain...</option>';
        snapshot.forEach(doc => {
            const f = doc.data();
            dataCache.fields[doc.id] = f;
            const opt = document.createElement('option');
            opt.value = doc.id;
            opt.textContent = f.name + (f.location ? ` (${f.location})` : '');
            sel.appendChild(opt);
        });
    } catch (e) {
        console.error("Error loading fields", e);
    }
}

function renderMatchFieldTags() {
    const container = document.getElementById('match-fields-list');
    if (!container) return;

    container.innerHTML = '';

    if (selectedMatchFields.length === 0) {
        container.innerHTML = '<p style="color: #888; font-style: italic; margin: 0;">Aucun terrain sélectionné</p>';
        return;
    }

    selectedMatchFields.forEach(fieldId => {
        const field = dataCache.fields?.[fieldId];
        if (!field) return;

        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.style.cssText = 'display: inline-flex; align-items: center; gap: 5px; background: var(--primary); color: white; padding: 5px 10px; border-radius: 15px; font-size: 0.85rem;';
        tag.innerHTML = `
            ${field.name}
            <i class="fas fa-times" style="cursor: pointer;" data-field-id="${fieldId}"></i>
        `;

        tag.querySelector('i').addEventListener('click', () => {
            selectedMatchFields = selectedMatchFields.filter(id => id !== fieldId);
            renderMatchFieldTags();
        });

        container.appendChild(tag);
    });
}

// Add field button logic
document.getElementById('btn-add-match-field')?.addEventListener('click', () => {
    const sel = document.getElementById('match-field-add-select');
    const fieldId = sel.value;

    if (!fieldId) {
        alert('Veuillez sélectionner un terrain');
        return;
    }

    if (selectedMatchFields.includes(fieldId)) {
        alert('Ce terrain est déjà ajouté');
        return;
    }

    selectedMatchFields.push(fieldId);
    renderMatchFieldTags();
    sel.value = ''; // Reset selection
});

async function loadRefereesIntoSelects() {
    // Populate the 3 selects with referee names
    const q = query(collection(db, "referees"), orderBy("name", "asc"));
    const snapshot = await getDocs(q);

    // Helper to fill a select
    const fillSelect = (id) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        // Keep first option
        sel.innerHTML = '<option value="">-- Non assigné --</option>';
        snapshot.forEach(doc => {
            const r = doc.data();
            const opt = document.createElement('option');
            opt.value = doc.id; // Store ID
            opt.textContent = r.name;
            sel.appendChild(opt);
        });
    };

    fillSelect('match-ref-center');
    fillSelect('match-ref-asst1');
    fillSelect('match-ref-asst2');
}

document.getElementById('match-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(form, true);

    try {
        const id = document.getElementById('match-id').value;

        // Generate field names string from selected fields
        const fieldNames = selectedMatchFields.map(fid => {
            const field = dataCache.fields?.[fid];
            return field ? field.name : fid;
        }).join(', ');

        const data = {
            date: document.getElementById('match-date').value,
            time: document.getElementById('match-time').value,
            category: document.getElementById('match-category').value,
            opponent: document.getElementById('match-opponent').value,
            fieldIds: selectedMatchFields, // Array of field IDs
            fields: fieldNames, // Comma-separated field names for display
            refCenter: document.getElementById('match-ref-center').value,
            refAsst1: document.getElementById('match-ref-asst1').value,
            refAsst2: document.getElementById('match-ref-asst2').value,
            played: document.getElementById('match-played').checked,
            timestamp: serverTimestamp() // To sort by creation or date? Better sort by date field in query
        };


        // --- CONFLICT DETECTION ---
        // Check for overlaps on any of the selected fields within +/- 60 minutes
        if (selectedMatchFields.length > 0 && dataCache.matches) {
            const newStart = new Date(`${data.date}T${data.time}`).getTime();
            const conflictWindow = 60 * 60 * 1000; // 60 mins assumption

            const conflicts = Object.values(dataCache.matches).filter(m => {
                if (m.id === id) return false; // Ignore self
                if (m.date !== data.date) return false; // Different day (simple check)

                // Check if any of the match's fields overlap with our selected fields
                const matchFieldIds = m.fieldIds || (m.fieldId ? [m.fieldId] : []);
                const hasFieldOverlap = matchFieldIds.some(mfid => selectedMatchFields.includes(mfid));

                if (!hasFieldOverlap) return false; // No field overlap

                const matchStart = new Date(`${m.date}T${m.time}`).getTime();
                const diff = Math.abs(newStart - matchStart);
                return diff < conflictWindow;
            });

            if (conflicts.length > 0) {
                const conflictMsg = conflicts.map(c => `- ${c.time} : ${c.category} vs ${c.opponent} (${c.fields || c.field})`).join('\n');
                if (!confirm(`⚠️ CONFLIT D'HORAIRE DÉTECTÉ !\n\nIl y a déjà ${conflicts.length} match(s) sur un ou plusieurs terrains sélectionnés dans un intervalle de 60 minutes :\n${conflictMsg}\n\nVoulez-vous vraiment sauvegarder ce match malgré le conflit ?`)) {
                    setLoading(form, false);
                    return;
                }
            }
        }
        // ---------------------------

        if (id) {
            await updateDoc(doc(db, "matches", id), data);
        } else {
            await addDoc(collection(db, "matches"), data);
        }

        matchModal.classList.remove('active');
        loadMatches();
    } catch (err) {
        console.error(err);
        alert("Erreur: " + (err.message || err));
    } finally {
        setLoading(form, false);
    }
});

async function loadMatches() {
    const list = document.getElementById('matches-list');
    const calEl = document.getElementById('calendar');

    // Init List View
    if (!list.classList.contains('view-grid')) list.classList.add('view-grid');

    // Init Calendar
    // We destroy previous instance to apply new config if needed (e.g. user navigation)
    if (window.calendarAPI) {
        window.calendarAPI.destroy();
        window.calendarAPI = null;
    }

    if (typeof FullCalendar !== 'undefined' && calEl) {
        window.calendarAPI = new FullCalendar.Calendar(calEl, {
            initialView: 'timeGridWeek',
            locale: 'fr',
            buttonText: {
                today: "Aujourd'hui",
                month: 'Mois',
                week: 'Semaine',
                day: 'Jour',
                list: 'Liste',
                year: 'Année'
            },
            height: 'auto',
            editable: true, // Enable Drag & Drop
            droppable: true,
            slotMinTime: '17:00:00',
            slotMaxTime: '23:00:00',
            // Custom Content (Teams + Field)
            eventContent: function (arg) {
                let italicContent = document.createElement('div');
                italicContent.style.fontStyle = 'italic';
                italicContent.style.fontSize = '0.9em';
                italicContent.innerText = '📍 ' + (arg.event.extendedProps.field || '?');

                let titleContent = document.createElement('div');
                titleContent.style.fontWeight = 'bold';
                titleContent.innerText = arg.timeText;

                let descContent = document.createElement('div');
                descContent.innerText = `${arg.event.extendedProps.category} vs ${arg.event.extendedProps.opponent}`;

                let arrayOfDomNodes = [titleContent, descContent, italicContent];
                return { domNodes: arrayOfDomNodes };
            },
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'multiMonthYear,dayGridMonth,timeGridWeek,listMonth'
            },
            dayMaxEvents: false, // Show all events
            // Open Modal on Date Click (Create)
            dateClick: (info) => {
                const form = document.getElementById('match-form');
                if (form) form.reset();
                document.getElementById('match-id').value = '';

                // Handle Date and Time extraction
                const dateObj = info.date;
                const yyyy = dateObj.getFullYear();
                const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                const dd = String(dateObj.getDate()).padStart(2, '0');
                const dateStr = `${yyyy}-${mm}-${dd}`;

                let timeStr = '19:00';
                // If the view has time (e.g. timeGridWeek), or dateStr contains T
                if (info.allDay === false || info.view.type.includes('time') || info.dateStr.includes('T')) {
                    const hh = String(dateObj.getHours()).padStart(2, '0');
                    const min = String(dateObj.getMinutes()).padStart(2, '0');
                    timeStr = `${hh}:${min}`;
                }

                document.getElementById('match-date').value = dateStr;
                document.getElementById('match-time').value = timeStr;

                loadRefereesIntoSelects().then(() => {
                    populateFieldSelect().then(() => {
                        document.getElementById('match-modal').classList.add('active');
                    });
                });
            },
            // Open Modal on Event Click (Edit)
            eventClick: (info) => {
                const matchId = info.event.id;
                if (dataCache.matches && dataCache.matches[matchId]) {
                    const data = dataCache.matches[matchId];
                    loadRefereesIntoSelects().then(() => {
                        loadFieldsIntoAddSelect().then(() => {
                            document.getElementById('match-id').value = matchId;
                            document.getElementById('match-date').value = data.date;
                            document.getElementById('match-time').value = data.time;
                            document.getElementById('match-category').value = data.category;
                            document.getElementById('match-opponent').value = data.opponent;

                            // Populate selected fields from data
                            selectedMatchFields = data.fieldIds || (data.fieldId ? [data.fieldId] : []);
                            renderMatchFieldTags();

                            document.getElementById('match-ref-center').value = data.refCenter || '';
                            document.getElementById('match-ref-asst1').value = data.refAsst1 || '';
                            document.getElementById('match-ref-asst2').value = data.refAsst2 || '';
                            document.getElementById('match-played').checked = data.played || false;

                            document.getElementById('match-modal').classList.add('active');
                        });
                    });
                }
            },
            // Handle Drag & Drop (Update Date/Time)
            eventDrop: async (info) => {
                const matchId = info.event.id;
                const newDate = info.event.start;

                // Format Date YYYY-MM-DD
                const yyyy = newDate.getFullYear();
                const mm = String(newDate.getMonth() + 1).padStart(2, '0');
                const dd = String(newDate.getDate()).padStart(2, '0');
                const dateStr = `${yyyy}-${mm}-${dd}`;

                // Format Time HH:MM
                const hh = String(newDate.getHours()).padStart(2, '0');
                const min = String(newDate.getMinutes()).padStart(2, '0');
                const timeStr = `${hh}:${min}`;

                try {
                    const docRef = doc(db, "matches", matchId);
                    await updateDoc(docRef, {
                        date: dateStr,
                        time: timeStr
                    });
                    // Update Cache
                    if (dataCache.matches[matchId]) {
                        dataCache.matches[matchId].date = dateStr;
                        dataCache.matches[matchId].time = timeStr;
                    }
                    console.log("Match updated via drag & drop");
                } catch (e) {
                    console.error("Error updating match drop:", e);
                    alert("Erreur lors du déplacement du match: " + e.message);
                    info.revert();
                }
            }
        });
        window.calendarAPI.render();
    }

    try {
        const q = query(collection(db, "matches"));
        const snapshot = await getDocs(q);

        // Load Referees
        if (!dataCache.referees || Object.keys(dataCache.referees).length === 0) {
            const refSnap = await getDocs(collection(db, "referees"));
            dataCache.referees = {};
            refSnap.forEach(r => dataCache.referees[r.id] = r.data());
        }

        list.innerHTML = '';
        dataCache.matches = {};
        const events = [];
        const matchDocs = [];

        // Add Referee Unavailabilities to Calendar
        if (dataCache.referees) {
            Object.values(dataCache.referees).forEach(ref => {
                if (ref.unavails && Array.isArray(ref.unavails)) {
                    ref.unavails.forEach(dateStr => {
                        // Validate date format slightly?
                        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            events.push({
                                title: '🚫 ' + ref.name,
                                start: dateStr,
                                allDay: true,
                                color: '#e74c3c',
                                display: 'block',
                                editable: false,
                                extendedProps: { type: 'unavailability' }
                            });
                        }
                    });
                }
            });
        }

        snapshot.forEach(doc => matchDocs.push({ id: doc.id, ...doc.data() }));

        // Sort client-side to avoid index issues
        matchDocs.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.time.localeCompare(b.time);
        });

        if (matchDocs.length === 0) {
            list.innerHTML = '<p>Aucun match prévu.</p>';
        } else {
            matchDocs.forEach(data => {
                dataCache.matches[data.id] = data;

                // Calendar Event
                const startStr = `${data.date}T${data.time}`;
                events.push({
                    id: data.id,
                    title: `${data.category} vs ${data.opponent}`,
                    start: startStr,
                    color: '#008744',
                    extendedProps: {
                        category: data.category,
                        opponent: data.opponent,
                        field: data.field
                    }
                });

                // List Item
                const getRefName = (rid) => (rid && dataCache.referees[rid]) ? dataCache.referees[rid].name : (rid ? 'non assigné' : 'non assigné');

                const subtitle = `
                    <div style="font-size:0.85rem; text-align:left; margin-top:5px;">
                        <strong><i class="fas fa-clock"></i> ${data.date} à ${data.time}</strong><br>
                        Vs ${data.opponent} (${data.category})<br>
                        Terrain(s): ${data.fields || data.field || 'Non spécifié'}
                    </div>
                    <div style="font-size:0.8rem; text-align:left; margin-top:8px; border-top:1px solid #eee; padding-top:5px;">
                        <i class="fas fa-flag"></i> C: ${getRefName(data.refCenter)}<br>
                        <i class="fas fa-flag-checkered"></i> A1: ${getRefName(data.refAsst1)}<br>
                        <i class="fas fa-flag-checkered"></i> A2: ${getRefName(data.refAsst2)}
                    </div>
                `;

                const card = createCard(null, `${data.category} vs ${data.opponent}`, subtitle, data.id, 'edit-match', 'delete-match', 'fa-futbol');
                card.querySelector('p').style.whiteSpace = 'normal';
                card.style.height = 'auto';
                card.setAttribute('data-id', data.id);
                card.classList.add('match-card');
                list.appendChild(card);
            });
        }

        // Update Calendar Events
        if (window.calendarAPI) {
            window.calendarAPI.removeAllEvents();
            window.calendarAPI.addEventSource(events);
        }

    } catch (e) {
        console.error("Error loading matches:", e);
        list.innerHTML = `<p style="color:red">Erreur chargement: ${e.message}</p>`;
    }

    setupClickableCard('.match-card', 'matches', 'match-modal', 'match-id', async (data) => {
        await loadRefereesIntoSelects();
        await loadFieldsIntoAddSelect(); // Load fields into add select

        document.getElementById('match-date').value = data.date;
        document.getElementById('match-time').value = data.time;
        document.getElementById('match-category').value = data.category;
        document.getElementById('match-opponent').value = data.opponent;

        // Populate selected fields from data
        selectedMatchFields = data.fieldIds || (data.fieldId ? [data.fieldId] : []);
        renderMatchFieldTags();

        document.getElementById('match-ref-center').value = data.refCenter || '';
        document.getElementById('match-ref-asst1').value = data.refAsst1 || '';
        document.getElementById('match-ref-asst2').value = data.refAsst2 || '';
        document.getElementById('match-played').checked = data.played || false; // Set checkbox
    });

    setupDeleteButton('.delete-match', 'matches', () => loadMatches());
}

// --- SPONSORS LOGIC ---
const sponsorModal = document.getElementById('sponsor-modal');
const openSponsorModalBtn = document.getElementById('open-sponsor-modal');
if (openSponsorModalBtn) openSponsorModalBtn.addEventListener('click', () => {
    document.getElementById('sponsor-form').reset();
    document.getElementById('sponsor-id').value = '';
    document.getElementById('sponsor-image-preview').innerHTML = '';
    setLoading(document.getElementById('sponsor-form'), false);
    sponsorModal.classList.add('active');
});
if (sponsorModal) sponsorModal.querySelector('.close-modal').addEventListener('click', () => sponsorModal.classList.remove('active'));

setupImagePreview('sponsor-image', 'sponsor-image-preview');

document.getElementById('sponsor-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(form, true);

    try {
        const id = document.getElementById('sponsor-id').value;
        const file = document.getElementById('sponsor-image').files[0];

        if (file && file.size > 2 * 1024 * 1024) throw new Error("L'image est trop volumineuse (Max 2MB).");

        const data = {
            name: document.getElementById('sponsor-name').value,
            url: document.getElementById('sponsor-url').value,
            visible: document.getElementById('sponsor-visible').checked
        };
        await uploadAndSave('sponsors', id, data, file);

        sponsorModal.classList.remove('active');
        loadSponsors();
    } catch (err) {
        console.error(err);
        alert("Erreur: " + (err.message || err));
    } finally {
        setLoading(form, false);
    }
});

async function loadSponsors() {
    const list = document.getElementById('sponsors-list');
    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) list.classList.add('view-grid');
    list.innerHTML = '<p>Chargement...</p>';

    try {
        const q = query(collection(db, "sponsors"), orderBy("name", "asc"));
        const snapshot = await getDocs(q);
        list.innerHTML = '';
        dataCache.sponsors = {};

        if (snapshot.empty) {
            list.innerHTML = '<p>Aucun commanditaire.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            dataCache.sponsors[doc.id] = data;

            const subtitle = data.visible ? '<span style="color:green">Visible</span>' : '<span style="color:red">Caché</span>';
            const card = createCard(data.imageUrl, data.name, subtitle, doc.id, 'edit-sponsor', 'delete-sponsor', 'fa-handshake', true);
            card.classList.add('sponsor-card');
            card.setAttribute('data-id', doc.id);
            list.appendChild(card);
        });

        setupClickableCard('.sponsor-card', 'sponsors', 'sponsor-modal', 'sponsor-id', (data) => {
            document.getElementById('sponsor-name').value = data.name;
            document.getElementById('sponsor-url').value = data.url || '';
            document.getElementById('sponsor-visible').checked = data.visible !== false;
            setExistingPreview('sponsor-image-preview', data.imageUrl);
        });
        setupDeleteButton('.delete-sponsor', 'sponsors', () => loadSponsors());

    } catch (e) {
        console.error(e);
        list.innerHTML = '<p style="color:red">Erreur lors du chargement.</p>';
    }
}

// --- SEASONS LOGIC ---
const seasonModal = document.getElementById('season-modal');
const openSeasonModalBtn = document.getElementById('open-season-modal');

// Tab Switching logic
if (seasonModal) {
    const tabs = seasonModal.querySelectorAll('.tab-link');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-tab');

            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            seasonModal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab and target content
            tab.classList.add('active');
            document.getElementById(target).classList.add('active');
        });
    });
}

function resetSeasonModalTabs() {
    const tabs = seasonModal.querySelectorAll('.tab-link');
    const contents = seasonModal.querySelectorAll('.tab-content');

    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));

    if (tabs[0]) tabs[0].classList.add('active');
    if (contents[0]) contents[0].classList.add('active');
}

if (openSeasonModalBtn) openSeasonModalBtn.addEventListener('click', () => {
    document.getElementById('season-form').reset();
    document.getElementById('season-id').value = '';
    // Set default year
    document.getElementById('season-year').value = new Date().getFullYear();
    document.getElementById('season-stats-container').style.display = 'none';

    // Reset lists
    document.getElementById('season-teams-list').innerHTML = '<p style="color:#888; font-style:italic;">Aucune équipe pour cette saison.</p>';
    document.getElementById('season-matches-list').innerHTML = '<p style="color:#888; font-style:italic;">Aucun match enregistré pour cette période.</p>';
    document.getElementById('season-team-count-badge').textContent = "0 équipes";

    resetSeasonModalTabs();
    setLoading(document.getElementById('season-form'), false);
    seasonModal.classList.add('active');
});

if (seasonModal) seasonModal.querySelector('.close-modal').addEventListener('click', () => seasonModal.classList.remove('active'));

document.getElementById('season-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(form, true);

    try {
        const id = document.getElementById('season-id').value;
        const type = document.getElementById('season-type').value;
        const year = parseInt(document.getElementById('season-year').value);
        const name = document.getElementById('season-name').value;
        const start = document.getElementById('season-start').value;
        const end = document.getElementById('season-end').value;
        const active = document.getElementById('season-active').checked;

        const data = { type, year, name, start, end, active };

        if (id) {
            await updateDoc(doc(db, "seasons", id), data);
        } else {
            await addDoc(collection(db, "seasons"), data);
        }

        seasonModal.classList.remove('active');
        loadSeasons();
    } catch (err) {
        console.error(err);
        alert("Erreur: " + (err.message || err));
    } finally {
        setLoading(form, false);
    }
});

async function loadSeasons() {
    const list = document.getElementById('seasons-list');
    if (!list) return;
    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) list.classList.add('view-grid');
    list.innerHTML = '<p>Chargement...</p>';

    try {
        const q = query(collection(db, "seasons"), orderBy("year", "desc"));
        const snapshot = await getDocs(q);

        list.innerHTML = '';
        dataCache.seasons = {};

        if (snapshot.empty) {
            list.innerHTML = '<p>Aucune saison trouvée.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            dataCache.seasons[doc.id] = data;

            const icon = data.type === 'summer' ? 'fa-sun' : 'fa-snowflake';
            const color = data.type === 'summer' ? '#f39c12' : '#3498db';
            const status = data.active ? '<span style="color:var(--success); font-weight:bold;">Active</span>' : 'Terminée';

            const subtitle = `
                <span style="color:${color}"><i class="fas ${icon}"></i> ${data.type === 'summer' ? 'Été' : 'Hiver'}</span><br>
                ${data.start} - ${data.end}<br>
                ${status}
            `;

            // We assume createCard handles null image URL by showing the iconClass
            const card = createCard(null, data.name, subtitle, doc.id, 'edit-season', 'delete-season', 'fa-calendar-alt');
            card.setAttribute('data-id', doc.id);
            // Override styles for season card specifically
            const imgDiv = card.firstElementChild;
            if (imgDiv) {
                imgDiv.style.width = '100%';
                imgDiv.style.height = '100px';
                imgDiv.style.borderRadius = '8px 8px 0 0';
                imgDiv.style.margin = '0 0 10px 0';
                imgDiv.style.backgroundColor = color;
                imgDiv.style.display = 'flex';
                imgDiv.style.alignItems = 'center';
                imgDiv.style.justifyContent = 'center';
                imgDiv.innerHTML = `<i class="fas ${icon}" style="font-size:3rem; color:white;"></i>`;
            }

            card.classList.add('season-card');
            list.appendChild(card);
        });

        setupClickableCard('.season-card', 'seasons', 'season-modal', 'season-id', (data) => {
            document.getElementById('season-type').value = data.type;
            document.getElementById('season-year').value = data.year;
            document.getElementById('season-name').value = data.name;
            document.getElementById('season-start').value = data.start;
            document.getElementById('season-end').value = data.end;
            document.getElementById('season-active').checked = data.active;

            resetSeasonModalTabs();

            const statsContainer = document.getElementById('season-stats-container');
            const seasonId = document.getElementById('season-id').value;

            if (statsContainer && seasonId) {
                statsContainer.style.display = 'block';

                // Load teams and calculate stats for this season
                const renderSeasonData = async () => {
                    const teamsListEl = document.getElementById('season-teams-list');
                    teamsListEl.innerHTML = '<p>Chargement des données...</p>';

                    try {
                        // Get Teams for this season
                        const qTeams = query(collection(db, "teams"), where("seasonId", "==", seasonId));
                        const tSnap = await getDocs(qTeams);

                        teamsListEl.innerHTML = '';
                        let playerCount = 0;
                        let teamIds = [];

                        if (tSnap.empty) {
                            teamsListEl.innerHTML = '<p style="color:#888; font-style:italic;">Aucune équipe pour cette saison.</p>';
                            document.getElementById('season-stats-teams').textContent = "0";
                            document.getElementById('season-team-count-badge').textContent = "0 équipes";
                            document.getElementById('season-stats-players').textContent = "0";
                        } else {
                            document.getElementById('season-stats-teams').textContent = tSnap.size;
                            document.getElementById('season-team-count-badge').textContent = `${tSnap.size} équipes`;

                            tSnap.forEach(tDoc => {
                                const tData = tDoc.data();
                                teamIds.push(tDoc.id);
                                const div = document.createElement('div');
                                div.style.padding = '8px 12px';
                                div.style.borderBottom = '1px solid #eee';
                                div.style.background = '#fff';
                                div.style.marginBottom = '5px';
                                div.style.borderRadius = '6px';
                                div.innerHTML = `<strong><i class="fas fa-shield-alt"></i> ${tData.name}</strong> <span style="font-size:0.8rem; color:#888; margin-left:10px;">${tData.category}</span>`;
                                teamsListEl.appendChild(div);
                            });

                            // Calculate Player Count (simplified estimate or full fetch)
                            // For accuracy, we'd need to fetch players with teamId in teamIds
                            // But Firestore doesn't support 'in' with more than 30 values easily in some contexts.
                            // We'll do a quick probe of the players collection if possible or just use a placeholder
                            document.getElementById('season-stats-players').textContent = "...";

                            const qPlayers = query(collection(db, "players")); // We fetch all then filter for count if we want to be safe but slow
                            const pSnap = await getDocs(qPlayers);
                            let seasonPlayers = 0;
                            pSnap.forEach(pDoc => {
                                if (teamIds.includes(pDoc.data().teamId)) seasonPlayers++;
                            });
                            document.getElementById('season-stats-players').textContent = seasonPlayers;
                        }

                        // Matches stats & Preview
                        const matchesListEl = document.getElementById('season-matches-list');
                        matchesListEl.innerHTML = '<p>Recherche des matchs...</p>';

                        try {
                            const qMatches = query(collection(db, "matches"),
                                where("date", ">=", data.start),
                                where("date", "<=", data.end)
                            );
                            const mSnap = await getDocs(qMatches);
                            matchesListEl.innerHTML = '';

                            if (mSnap.empty) {
                                matchesListEl.innerHTML = '<p style="color:#888; font-style:italic;">Aucun match trouvé pour ces dates.</p>';
                                document.getElementById('season-stats-matches').textContent = "0";
                                document.getElementById('season-stats-progress').textContent = "0%";
                            } else {
                                document.getElementById('season-stats-matches').textContent = mSnap.size;

                                // Calculate progress (matches with score vs total)
                                let playedCount = 0;
                                mSnap.forEach(mDoc => {
                                    const mData = mDoc.data();
                                    if (mData.scoreHome !== undefined && mData.scoreAway !== undefined) playedCount++;

                                    const div = document.createElement('div');
                                    div.style.padding = '8px 12px';
                                    div.style.borderBottom = '1px solid #eee';
                                    div.style.background = '#fff';
                                    div.style.marginBottom = '5px';
                                    div.style.borderRadius = '6px';
                                    div.style.fontSize = '0.9rem';
                                    div.innerHTML = `
                                        <strong>${mData.date}</strong> - ${mData.homeTeam} vs ${mData.awayTeam} 
                                        ${mData.scoreHome !== undefined ? `<span class="badge" style="background:#eee; color:#333; margin-left:10px;">${mData.scoreHome} - ${mData.scoreAway}</span>` : '<span class="badge" style="background:var(--primary); color:white; padding:2px 6px; border-radius:4px;">À venir</span>'}
                                    `;
                                    matchesListEl.appendChild(div);
                                });

                                const progress = Math.round((playedCount / mSnap.size) * 100);
                                document.getElementById('season-stats-progress').textContent = `${progress}%`;
                            }
                        } catch (errMatch) {
                            console.error(errMatch);
                            matchesListEl.innerHTML = '<p style="color:#888;">Impossible de charger les matchs par date.</p>';
                        }

                    } catch (e) {
                        console.error(e);
                        teamsListEl.innerHTML = '<p style="color:red">Erreur lors du chargement des statistiques.</p>';
                    }
                };

                renderSeasonData();
            }
        });

        setupDeleteButton('.delete-season', 'seasons', () => loadSeasons());

    } catch (e) {
        console.error(e);
        list.innerHTML = `<p style="color:red">Erreur: ${e.message}</p>`;
    }
}

// --- FIELDS LOGIC ---


async function populateFieldSelect(selectedId = null) {
    const select = document.getElementById('match-field');
    if (!select) return;

    select.innerHTML = '<option value="">Sélectionner un terrain...</option>';

    const snapshot = await getDocs(collection(db, "fields"));
    snapshot.forEach(doc => {
        const data = doc.data();
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = data.name;
        if (selectedId && doc.id === selectedId) option.selected = true;
        select.appendChild(option);
    });
}

// Field Form Logic
const fieldModal = document.getElementById('field-modal');
const openFieldModalBtn = document.getElementById('open-field-modal');

if (openFieldModalBtn) {
    openFieldModalBtn.addEventListener('click', () => {
        document.getElementById('field-form').reset();
        document.getElementById('field-id').value = '';
        fieldModal.classList.add('active');
    });
}

if (fieldModal) {
    fieldModal.querySelector('.close-modal').addEventListener('click', () => fieldModal.classList.remove('active'));
}

document.getElementById('field-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('field-id').value;
    const data = {
        name: document.getElementById('field-name').value,
        location: document.getElementById('field-location').value,
        type: document.getElementById('field-type').value
    };

    const form = e.target;
    setLoading(form, true);
    await uploadAndSave('fields', id, data, null);
    setLoading(form, false);

    fieldModal.classList.remove('active');
    loadFields();
});


async function loadFields() {
    const list = document.getElementById('fields-list');
    if (!list) return;
    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) list.classList.add('view-grid');
    list.innerHTML = '<p>Chargement...</p>';

    try {
        const s = await getDocs(collection(db, "fields"));
        list.innerHTML = '';
        dataCache.fields = {};

        if (s.empty) {
            list.innerHTML = '<p>Aucun terrain.</p>';
            return;
        }

        s.forEach(doc => {
            const d = doc.data();
            dataCache.fields[doc.id] = d;
            const card = createCard(null, d.name, `${d.type || '-'} <br> <small>${d.location || ''}</small>`, doc.id, 'edit-field', 'delete-field', 'fa-map-marker-alt');
            list.appendChild(card);
        });

        // Setup Edit/Delete Handlers
        setupClickableCard('#fields-list .product-card-admin', 'fields', 'field-modal', 'field-id', (data) => {
            document.getElementById('field-name').value = data.name;
            document.getElementById('field-location').value = data.location || '';
            document.getElementById('field-type').value = data.type || 'gazon';
        });
        setupDeleteButton('.delete-field', 'fields', () => loadFields());

    } catch (err) {
        console.error("Error loading fields:", err);
        list.innerHTML = '<p style="color:red">Erreur de chargement.</p>';
    }
}


// --- AUTOMATIONS LOGIC ---
const autoContainer = document.getElementById('view-automations');
if (autoContainer) {
    const tabs = autoContainer.querySelectorAll('.tab-link');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-tab');
            tabs.forEach(t => t.classList.remove('active'));
            autoContainer.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(target).classList.add('active');
        });
    });
}

document.getElementById('send-bulk-email-btn')?.addEventListener('click', async () => {
    const target = document.getElementById('auto-email-target').value;
    const subject = document.getElementById('auto-email-subject').value;
    const body = document.getElementById('auto-email-body').value;

    if (!subject || !body) return alert("Veuillez remplir le sujet et le message.");

    if (confirm(`Confirmez-vous l'envoi de ce courriel à la cible : ${target} ?`)) {
        alert("Envoi en cours... (Simulation)");
        // Simulate delay
        setTimeout(() => {
            alert("Courriels envoyés avec succès (Simulation) !");
            document.getElementById('auto-email-subject').value = '';
            document.getElementById('auto-email-body').value = '';
        }, 1000);
    }
});


// --- DASHBOARD PLAYERS MODAL ---
const dashboardPlayersCard = document.getElementById('dashboard-players-card');
const playersListModal = document.getElementById('players-list-modal');

if (dashboardPlayersCard && playersListModal) {
    dashboardPlayersCard.addEventListener('click', async () => {
        playersListModal.classList.add('active');
        const buffer = document.getElementById('modal-players-list');
        buffer.innerHTML = '<tr><td colspan="4" style="text-align:center;">Chargement...</td></tr>';

        try {
            // Remove orderBy to avoid index issues with missing fields
            const qPlayers = query(collection(db, "players"));
            const snapPlayers = await getDocs(qPlayers);

            buffer.innerHTML = '';
            let count = 0;

            // Client-side sort
            const sortedDocs = snapPlayers.docs.sort((a, b) => {
                const pA = a.data();
                const pB = b.data();
                const nA = (pA.name || pA.lastName || '').toLowerCase();
                const nB = (pB.name || pB.lastName || '').toLowerCase();
                return nA.localeCompare(nB);
            });

            sortedDocs.forEach(doc => {
                const p = doc.data();

                // Extract firstName/lastName from 'name' if necessary
                let fName = p.firstName || '';
                let lName = p.lastName || '';
                if (!fName && !lName && p.name) {
                    const parts = p.name.split(' ');
                    fName = parts[0] || '';
                    lName = parts.slice(1).join(' ') || '';
                }

                buffer.innerHTML += `
                    <tr>
                        <td>${fName}</td>
                        <td>${lName}</td>
                        <td>${p.teamName || 'N/A'}</td>
                        <td>${p.birthYear || p.year || 'N/A'}</td>
                    </tr>
                `;
                count++;
            });

            if (count === 0) buffer.innerHTML = '<tr><td colspan="4" style="text-align:center;">Aucun joueur trouvé.</td></tr>';

        } catch (error) {
            console.error("Error loading players for modal:", error);
            buffer.innerHTML = `<tr><td colspan="4" style="color:red; text-align:center;">Erreur: ${error.message}</td></tr>`;
        }
    });

    // Close modal logic
    playersListModal.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => playersListModal.classList.remove('active'));
    });


    // Close on click outside
    window.addEventListener('click', (e) => {
        if (e.target === playersListModal) {
            playersListModal.classList.remove('active');
        }
    });
}

// --- VIEW TOGGLE FUNCTIONALITY ---
document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const viewType = btn.dataset.view;
        const targetElement = document.getElementById(targetId);

        if (!targetElement) return;

        // Toggle active state on buttons
        const siblingBtns = btn.parentElement.querySelectorAll('.view-toggle-btn');
        siblingBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Toggle view classes
        targetElement.classList.remove('view-grid', 'view-list');
        targetElement.classList.add(`view-${viewType}`);
    });
});
