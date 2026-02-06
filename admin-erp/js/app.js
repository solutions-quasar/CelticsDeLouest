// Firebase Configuration
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, setDoc, getDoc, query, where, orderBy, serverTimestamp, getCountFromServer, Timestamp, onSnapshot } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence, sendPasswordResetEmail } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { loadBilling } from "./billing.js";

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
    matches: {},
    settings: {}, // Global settings like current_season, boutique
    campaigns: {},
    invoices: {},
    currentSeason: null
};

// --- Custom Calendar State ---
window.calendarCurrentDate = new Date();
window.calendarSettings = {
    startHour: 8,
    endHour: 22,
    slotDuration: 15, // minutes
    defaultDuration: 60 // minutes
};

// Make dataCache globally accessible for search
window.dataCache = dataCache;

// Make Firebase functions globally accessible for other scripts
window.db = db;
window.auth = auth;
window.getDocs = getDocs;
window.collection = collection;
window.deleteDoc = deleteDoc;
window.doc = doc;
window.addDoc = addDoc;
window.updateDoc = updateDoc;
window.serverTimestamp = serverTimestamp;
window.query = query;
window.where = where;
window.orderBy = orderBy;
window.getCountFromServer = getCountFromServer;
window.Timestamp = Timestamp;

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
const togglePassword = document.getElementById('toggle-password');
const passwordInput = document.getElementById('password');

if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        togglePassword.classList.toggle('fa-eye');
        togglePassword.classList.toggle('fa-eye-slash');
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
    let imgHtml = '';
    if (imageUrl !== false) {
        imgHtml = imageUrl
            ? `<img src="${imageUrl}" class="${imgClass}">`
            : `<div class="${imgClass} placeholder-img" style="background:#eee; display:flex; align-items:center; justify-content:center; color:#888"><i class="fas ${defaultIcon} fa-2x"></i></div>`;
    }

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
            if (await showConfirm('Voulez-vous vraiment supprimer cet élément ?')) {
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

// --- REAL-TIME SYNCHRONIZATION ---
let activeUnsubscribes = [];

function syncCollection(collectionName, cacheKey, refreshCallback) {
    const q = collection(db, collectionName);
    const unsub = onSnapshot(q, (snapshot) => {
        dataCache[cacheKey] = {};
        snapshot.forEach(doc => {
            dataCache[cacheKey][doc.id] = { id: doc.id, ...doc.data() };
        });
        if (refreshCallback) refreshCallback();
    }, (error) => {
        // Only log errors if we are still authenticated (prevents noise on logout)
        if (auth.currentUser) {
            console.error(`Error syncing ${collectionName}:`, error);
        }
    });
    activeUnsubscribes.push(unsub);
}

function stopRealTimeListeners() {
    activeUnsubscribes.forEach(unsub => unsub());
    activeUnsubscribes = [];
}

function initRealTimeListeners() {
    // Clear old listeners if any
    activeUnsubscribes.forEach(unsub => unsub());
    activeUnsubscribes = [];

    // Setup Sync for each collection
    syncCollection("players", "players", () => {
        const view = document.getElementById('view-players');
        if (view && view.classList.contains('active')) loadPlayersDirectory();
        if (typeof updateStats === 'function') updateStats();
    });

    syncCollection("teams", "teams", () => {
        const view = document.getElementById('view-teams');
        if (view && view.classList.contains('active')) loadTeams();
    });

    syncCollection("matches", "matches", () => {
        const view = document.getElementById('view-matches');
        if (view && view.classList.contains('active')) loadMatches();
        if (window.calendarAPI && document.getElementById('calendar-view')?.style.display !== 'none') {
            window.calendarAPI.refetchEvents();
        }
    });

    syncCollection("fields", "fields", () => {
        const view = document.getElementById('view-fields');
        if (view && view.classList.contains('active')) loadFields();

        // Also refresh matches view if active, as calendar depends on fields
        const matchesView = document.getElementById('view-matches');
        if (matchesView && matchesView.classList.contains('active') && typeof loadMatches === 'function') {
            loadMatches();
        }
    });

    syncCollection("seasons", "seasons", () => {
        const view = document.getElementById('view-seasons');
        if (view && view.classList.contains('active')) loadSeasons();
        if (typeof loadTeamFilterSeasons === 'function') loadTeamFilterSeasons();
    });

    syncCollection("settings", "settings", () => {
        const view = document.getElementById('view-settings');
        if (view && view.classList.contains('active')) loadSettings();
    });

    syncCollection("coaches", "coaches", () => {
        const view = document.getElementById('view-coaches');
        if (view && view.classList.contains('active')) loadCoaches();
    });

    syncCollection("referees", "referees", () => {
        const view = document.getElementById('view-referees');
        if (view && view.classList.contains('active')) loadReferees();
    });

    syncCollection("board_members", "board", () => {
        const view = document.getElementById('view-board');
        if (view && view.classList.contains('active')) loadBoard();
    });

    syncCollection("sponsors", "sponsors", () => {
        const view = document.getElementById('view-sponsors');
        if (view && view.classList.contains('active')) loadSponsors();
    });

    syncCollection("inventory", "inventory", () => {
        const view = document.getElementById('view-inventory');
        if (view && view.classList.contains('active')) loadInventory();
        if (typeof updateStats === 'function') updateStats();
    });

    syncCollection("products", "products", () => {
        const view = document.getElementById('view-boutique');
        if (view && view.classList.contains('active')) loadBoutiqueSettings(); // loadProducts is part of it
        if (typeof updateStats === 'function') updateStats();
    });

    syncCollection("registrations", "registrations", () => {
        const view = document.getElementById('view-registrations');
        if (view && view.classList.contains('active')) loadRegistrations();
    });

    syncCollection("campaigns", "campaigns", () => {
        const view = document.getElementById('view-email-campaigns');
        if (view && view.classList.contains('active') && typeof window.loadCampaigns === 'function') {
            window.loadCampaigns('all');
        }
    });

    syncCollection("invoices", "invoices", () => {
        const view = document.getElementById('view-billing');
        if (view && view.classList.contains('active')) loadBilling();
    });

    syncCollection("scheduled_payments", "scheduled_payments", () => {
        const view = document.getElementById('view-billing');
        if (view && view.classList.contains('active')) loadBilling();
    });

    syncCollection("admins", "admins", () => {
        if (typeof loadAdmins === 'function') loadAdmins();
    });
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
            if (!email) return showAlert("Entrez votre courriel ci-dessus.", "warning");
            try {
                await sendPasswordResetEmail(auth, email);
                showAlert("Courriel de réinitialisation envoyé.", "success");
            } catch (error) {
                showAlert("Erreur: " + error.message, "error");
            }
        });
    }
}

// Password reset function for admins
window.resetAdminPassword = async function (email) {
    const confirmed = await showConfirm(
        `Envoyer un lien de réinitialisation à ${email} ?`,
        'Le lien sera valide pendant 1 heure.'
    );

    if (!confirmed) return;

    try {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch('https://us-central1-celticsdelouest.cloudfunctions.net/sendAdminPasswordReset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ email })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur inconnue');
        }

        showAlert(`Email de réinitialisation envoyé à ${email}`, 'success');

    } catch (error) {
        console.error('Error:', error);
        showAlert('Erreur: ' + error.message, 'error');
    }
};


if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('celtics_admin_last_view'); // Clear view state on logout
        signOut(auth);
    });
}

onAuthStateChanged(auth, async (user) => {
    if (initLoader) {
        initLoader.classList.remove('active');
        initLoader.style.display = 'none';
    }

    if (user) {
        authScreen.classList.remove('active');
        dashboardScreen.classList.add('active');

        // CHECK ROLE
        if (window.checkAdminAndSetupUI) await window.checkAdminAndSetupUI(user);

        document.getElementById('user-email').textContent = user.email;

        // Initialize Real-time Listeners
        initRealTimeListeners();

        // Determine allowed views
        const allowedViews = [];
        document.querySelectorAll('.nav-btn').forEach(btn => {
            if (btn.style.display !== 'none') allowedViews.push(btn.dataset.target);
        });

        // Restore last view OR Redirect to first allowed view
        let lastView = localStorage.getItem('celtics_admin_last_view');

        // If last view is stored but not allowed anymore (e.g. role changed), clear it
        if (lastView && !allowedViews.includes(lastView)) {
            lastView = null;
        }

        if (lastView && allowedViews.includes(lastView)) {
            const btn = document.querySelector(`.nav-btn[data-target="${lastView}"]`);
            if (btn) btn.click();
            else if (allowedViews.includes('view-dashboard')) loadDashboardData();
        } else {
            // Redirect to the first permitted view
            if (allowedViews.length > 0) {
                const firstTarget = allowedViews[0];
                const firstBtn = document.querySelector(`.nav-btn[data-target="${firstTarget}"]`);
                if (firstBtn) firstBtn.click();
                else if (firstTarget === 'view-dashboard') loadDashboardData();
            } else {
                // Fallback if nothing allowed (weird case)
                loadDashboardData();
            }
        }

        seedDatabase();
        await loadSettings(); // Load global settings (including calendar)
    } else {
        dashboardScreen.classList.remove('active');
        authScreen.classList.add('active');
        stopRealTimeListeners();
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

// Sidebar Collapse Toggle
const collapseBtn = document.getElementById('sidebar-collapse-btn');
if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        // Save state to local storage if preferred? Let's just keep it simple for now.
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
        if (targetId === 'view-billing') loadBilling();

        // Init Email Campaigns
        if (targetId === 'view-email-campaigns') {
            if (typeof initCampaignModule === 'function') initCampaignModule();
            if (typeof loadCampaigns === 'function') loadCampaigns('all');
        }
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

                // If it's the teams list, propagate to sub-containers (columns)
                if (targetId === 'teams-list') {
                    container.querySelectorAll('.team-gender-column > div').forEach(sub => {
                        sub.classList.remove('view-grid', 'view-list');
                        sub.classList.add(`view-${viewType}`);
                    });
                }
            }
        }
    });
});


// --- GENERIC POPUP HANDLER ---
// --- GENERIC POPUP HANDLER ---
function setupClickableCard(cardSelector, cacheKey, modalId, idFieldId, populateCallback) {
    document.querySelectorAll(cardSelector).forEach(card => {
        card.addEventListener('click', async (e) => {
            if (e.target.closest('.btn-delete') ||
                e.target.closest('.delete-board') ||
                e.target.closest('.delete-ref') ||
                e.target.closest('.delete-prod') ||
                e.target.closest('.delete-player') ||
                e.target.closest('.delete-inv') ||
                e.target.closest('.delete-reg') ||
                e.target.closest('.delete-coach') ||
                e.target.closest('.delete-admin') ||
                e.target.closest('.edit-admin') ||
                e.target.closest('.btn-icon') ||
                e.target.closest('.btn-action') ||
                e.target.closest('button') ||
                e.target.closest('a')) {
                return;
            }

            const id = card.getAttribute('data-id');
            const data = dataCache[cacheKey][id];


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
                    showAlert("Erreur lors de l'ouverture du détail: " + err.message, "error");
                }
            } else {
                console.error("DATA NOT FOUND IN CACHE FOR ID:", id);
                showAlert("Erreur: Données introuvables en cache pour ID " + id, "error");
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
                    showAlert("L'image est trop volumineuse (Max 5MB).", "warning");
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

        const email = document.getElementById('board-email').value;
        const phone = document.getElementById('board-phone').value;

        if (file && file.size > 5 * 1024 * 1024) throw new Error("L'image est trop volumineuse (Max 5MB).");

        const data = { name, email, phone, role, order, visible, mandateEnd };
        await uploadAndSave('board_members', id, data, file);

        boardModal.classList.remove('active');
        loadBoard();
    } catch (err) {
        console.error(err);
        showAlert("Erreur lors de l'enregistrement :\n" + (err.message || err), "error");
    } finally {
        setLoading(form, false);
    }
});

async function loadBoard() {
    const list = document.getElementById('board-list');
    if (!list) return;
    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) list.classList.add('view-grid');
    list.innerHTML = '';

    const boardList = Object.values(dataCache.board || {});

    const sortBy = document.getElementById('board-sort')?.value || 'name';

    // Sorting Logic
    boardList.sort((a, b) => {
        if (sortBy === 'active') {
            const visA = a.visible !== false;
            const visB = b.visible !== false;
            if (visA !== visB) return visA ? -1 : 1;
        } else if (sortBy === 'email') {
            return (a.email || '').localeCompare(b.email || '');
        }
        return (a.name || '').localeCompare(b.name || '');
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
        document.getElementById('board-name').value = data.name || '';
        document.getElementById('board-email').value = data.email || '';
        document.getElementById('board-phone').value = data.phone || '';
        document.getElementById('board-role').value = data.role || '';
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

        const email = document.getElementById('ref-email').value;
        const phone = document.getElementById('ref-phone').value;

        if (file && file.size > 5 * 1024 * 1024) throw new Error("L'image est trop volumineuse (Max 5MB).");

        const unavails = document.getElementById('ref-unavails').value.split(',').map(s => s.trim()).filter(s => s);
        const data = { name, email, phone, visible, unavails };
        await uploadAndSave('referees', id, data, file);

        refModal.classList.remove('active');
        loadReferees();
    } catch (err) {
        console.error(err);
        showAlert("Erreur: " + (err.message || err), "error");
    } finally {
        setLoading(form, false);
    }
});

async function loadReferees() {
    const list = document.getElementById('referees-list');
    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) list.classList.add('view-grid');

    const refList = Object.values(dataCache.referees || {});
    const matches = Object.values(dataCache.matches || {});

    const refCounts = {};
    dataCache.allMatches = []; // Store for modal

    matches.forEach(m => {
        dataCache.allMatches.push({ id: m.id, ...m });

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

    if (refList.length === 0) {
        list.innerHTML = '<p>Aucun arbitre.</p>';
        return;
    }

    const sortBy = document.getElementById('ref-sort')?.value || 'name';

    // Sorting Logic
    refList.sort((a, b) => {
        if (sortBy === 'active') {
            const visA = a.visible !== false;
            const visB = b.visible !== false;
            if (visA !== visB) return visA ? -1 : 1;
        } else if (sortBy === 'email') {
            return (a.email || '').localeCompare(b.email || '');
        }
        return (a.name || '').localeCompare(b.name || '');
    });

    refList.forEach(data => {
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
        document.getElementById('ref-name').value = data.name || '';
        document.getElementById('ref-email').value = data.email || '';
        document.getElementById('ref-phone').value = data.phone || '';
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

            if (!matchId) return showAlert("Veuillez choisir un match.", "warning");

            const match = dataCache.allMatches.find(m => m.id === matchId);
            if (!match) return;

            // Check conflict: is ref already assigned to another role in this match?
            if ((match.refCenter === refId && role !== 'refCenter') ||
                (match.refAsst1 === refId && role !== 'refAsst1') ||
                (match.refAsst2 === refId && role !== 'refAsst2')) {
                if (!await showConfirm("Cet arbitre est déjà assigné à ce match dans un autre rôle. Voulez-vous changer son rôle ?")) return;
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
                showAlert("Match assigné avec succès !", "success");
            } catch (e) {
                console.error(e);
                showAlert("Erreur lors de l'assignation : " + e.message, "error");
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
        showAlert("Erreur: " + (err.message || err), "error");
    } finally {
        setLoading(form, false);
    }
});

async function loadProducts() {
    const list = document.getElementById('products-list');
    if (!list) return;
    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) list.classList.add('view-grid');
    list.innerHTML = '';

    const products = Object.values(dataCache.products || {});

    products.forEach(data => {
        const id = data.id;
        const card = createCard(data.imageUrl, data.name, `$${data.price}`, id, 'edit-prod', 'delete-prod');
        card.setAttribute('data-id', id);
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

    const coaches = Object.values(dataCache.coaches || {});

    sel.innerHTML = '<option value="">-- Aucun --</option>';

    const items = coaches.map(c => ({
        id: c.id,
        name: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Inconnu'
    }));

    items.sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
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

    const seasons = Object.values(dataCache.seasons || {});

    sel.innerHTML = '<option value="">-- Choisir une saison --</option>';

    const items = seasons.map(s => ({
        id: s.id,
        name: s.name || `${s.type || ''} ${s.year || ''}` || 'Saison Sans Nom'
    }));

    items.sort((a, b) => b.name.localeCompare(a.name)).forEach(s => {
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

// --- TEAM GENERATION & VISUAL EDITOR ---

const btnGenerateTeams = document.getElementById('btn-generate-teams');
const teamGenModal = document.getElementById('team-gen-confirm-modal');
const btnConfirmGenerate = document.getElementById('btn-confirm-generate');
const btnCancelGenerate = document.getElementById('btn-cancel-generate');
const btnOpenVisualEditor = document.getElementById('btn-open-visual-editor');
const teamVisualModal = document.getElementById('team-visual-modal');
const btnCloseVisual = document.getElementById('btn-close-visual');
const btnVisualAssignments = document.getElementById('btn-visual-assignments');
const visualContainer = document.getElementById('visual-teams-container');

// --- GENERATION LOGIC ---
if (btnGenerateTeams) {
    btnGenerateTeams.addEventListener('click', async () => {
        const seasonId = document.getElementById('team-filter-season').value;
        if (!seasonId) return showAlert("Veuillez sélectionner une saison.", "warning");

        const players = Object.values(dataCache.players || {}).filter(p => p.seasonId === seasonId && !p.teamId);

        document.getElementById('gen-unassigned-count').textContent = players.length;

        if (players.length === 0) {
            showAlert("Tous les joueurs ont déjà une équipe !", "info");
            return;
        }

        teamGenModal.classList.add('active');
    });
}

if (btnCancelGenerate) btnCancelGenerate.addEventListener('click', () => teamGenModal.classList.remove('active'));
if (teamGenModal) teamGenModal.querySelector('.close-modal').addEventListener('click', () => teamGenModal.classList.remove('active'));

if (btnConfirmGenerate) {
    btnConfirmGenerate.addEventListener('click', async () => {
        const seasonId = document.getElementById('team-filter-season').value;
        if (!seasonId) return;

        setLoading(btnConfirmGenerate.parentElement, true);

        try {
            const players = Object.values(dataCache.players || {}).filter(p => p.seasonId === seasonId && !p.teamId);

            // Group by Category and Gender
            const groups = {};
            players.forEach(p => {
                const key = `${p.category || 'Inconnu'}_${p.gender || 'X'}`;
                if (!groups[key]) groups[key] = [];
                groups[key].push(p);
            });

            const batch = writeBatch(db);
            let opCount = 0;
            const MAX_BATCH = 450;

            // Create Teams and Assign
            for (const key of Object.keys(groups)) {
                const [cat, gender] = key.split('_');
                const groupPlayers = groups[key];

                // Create Team
                const teamRef = doc(collection(db, "teams"));
                const teamName = `Équipe ${cat} ${gender === 'M' ? 'Gars' : (gender === 'F' ? 'Filles' : 'Mixte')}`;

                batch.set(teamRef, {
                    name: teamName,
                    category: cat,
                    gender: gender,
                    seasonId: seasonId,
                    createdAt: serverTimestamp()
                });
                opCount++;

                // Assign Players
                groupPlayers.forEach(p => {
                    const pRef = doc(db, "players", p.id);
                    batch.update(pRef, { teamId: teamRef.id });
                    opCount++;

                    if (opCount >= MAX_BATCH) {
                        // In a real app we'd commit and start new, but here simplified
                    }
                });
            }

            await batch.commit();
            showAlert("Équipes générées avec succès !", "success");
            teamGenModal.classList.remove('active');
            // Refresh logic will happen via listeners
        } catch (e) {
            console.error(e);
            showAlert("Erreur: " + e.message, "error");
        } finally {
            setLoading(btnConfirmGenerate.parentElement, false);
        }
    });
}

// --- VISUAL EDITOR LOGIC ---

let visualEditorMode = false; // false = view, true = reassign
let visualSelectedTeams = new Set();

if (btnOpenVisualEditor) {
    btnOpenVisualEditor.addEventListener('click', () => {
        const seasonId = document.getElementById('team-filter-season').value;
        if (!seasonId) return showAlert("Veuillez sélectionner une saison.", "warning");

        visualEditorMode = false;
        visualSelectedTeams.clear();
        updateVisualEditorUI();
        renderVisualTeams();
        teamVisualModal.style.display = 'flex';
        // Populate filters
        populateVisualFilters();
    });
}

if (btnCloseVisual) btnCloseVisual.addEventListener('click', () => teamVisualModal.style.display = 'none');

if (btnVisualAssignments) {
    btnVisualAssignments.addEventListener('click', () => {
        if (visualSelectedTeams.size === 0) return showAlert("Sélectionnez au moins une équipe.", "warning");
        visualEditorMode = !visualEditorMode;
        updateVisualEditorUI();
        renderVisualTeams();
    });
}

function updateVisualEditorUI() {
    if (visualEditorMode) {
        btnVisualAssignments.innerHTML = '<i class="fas fa-check"></i> Terminer';
        btnVisualAssignments.style.background = '#2ecc71';
        document.getElementById('visual-filter-category').disabled = true;
        document.getElementById('visual-filter-gender').disabled = true;
    } else {
        btnVisualAssignments.innerHTML = '<i class="fas fa-exchange-alt"></i> Modifier l\'assignation';
        btnVisualAssignments.style.background = 'var(--primary)';
        document.getElementById('visual-filter-category').disabled = false;
        document.getElementById('visual-filter-gender').disabled = false;
    }
}

function populateVisualFilters() {
    const catSel = document.getElementById('visual-filter-category');
    const genderSel = document.getElementById('visual-filter-gender');

    // Extract unique categories from visible teams
    const seasonId = document.getElementById('team-filter-season').value;
    const teams = Object.values(dataCache.teams || {}).filter(t => t.seasonId === seasonId);
    const cats = [...new Set(teams.map(t => t.category))].sort();

    // Populate Categories
    catSel.innerHTML = '<option value="">Toutes Catégories</option>';
    cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        catSel.appendChild(opt);
    });

    // Populate Gender (Ensure logic matches)
    if (genderSel) {
        genderSel.innerHTML = `
            <option value="">Tous Sexes</option>
            <option value="Masculin">Masculin</option>
            <option value="Féminin">Féminin</option>
            <option value="Mixte">Mixte</option>
        `;
        genderSel.onchange = renderVisualTeams;
    }

    catSel.onchange = renderVisualTeams;
}

function renderVisualTeams() {
    visualContainer.innerHTML = '';
    const seasonId = document.getElementById('team-filter-season').value;
    let teams = Object.values(dataCache.teams || {}).filter(t => t.seasonId === seasonId);

    // Filters
    if (!visualEditorMode) {
        const catFilter = document.getElementById('visual-filter-category').value;
        const genderFilter = document.getElementById('visual-filter-gender').value;

        if (catFilter) teams = teams.filter(t => t.category === catFilter);

        if (genderFilter) {
            teams = teams.filter(t => {
                const g = t.gender || 'Mixte';
                if (genderFilter === 'Masculin') return g === 'Masculin' || g === 'M';
                if (genderFilter === 'Féminin') return g === 'Féminin' || g === 'F';
                return g === genderFilter;
            });
        }
    } else {
        // Edit mode: only show selected
        teams = teams.filter(t => visualSelectedTeams.has(t.id));
    }

    teams.sort((a, b) => a.name.localeCompare(b.name));

    teams.forEach(team => {
        const players = Object.values(dataCache.players || {}).filter(p => p.teamId === team.id);
        const isSelected = visualSelectedTeams.has(team.id);

        const card = document.createElement('div');
        card.className = 'visual-team-card';
        card.style.cssText = 'border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); display: flex; flex-direction: column; overflow: hidden; height: ' + (visualEditorMode ? '600px' : 'auto') + '; transition: all 0.3s;';

        if (visualEditorMode) {
            card.style.border = '2px solid var(--primary)';
            card.style.background = 'white';
        } else {
            card.style.border = isSelected ? '2px solid #ffb74d' : '1px solid transparent';
            card.style.background = isSelected ? '#fff3e0' : 'white';
        }

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding: 15px; background: inherit; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; cursor: pointer;';

        const checkHtml = visualEditorMode ? '' : `<input type="checkbox" class="team-select-cb" value="${team.id}" ${isSelected ? 'checked' : ''} style="transform: scale(1.2); cursor: pointer;">`;

        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                ${checkHtml}
                <div>
                    <h4 style="margin: 0; font-size: 1.1rem;">${team.name}</h4>
                    <div style="font-size: 0.85rem; color: #666;">${team.category} • ${players.length} Joueurs</div>
                </div>
            </div>
            <i class="fas fa-chevron-down state-icon" style="transition:transform 0.3s;"></i>
        `;

        if (!visualEditorMode) {
            header.onclick = (e) => {
                // 1. Expand/Collapse ONLY on Chevron
                if (e.target.classList.contains('state-icon') || e.target.closest('.state-icon')) {
                    const body = card.querySelector('.team-players-body');
                    const isOpen = body.style.display !== 'none';
                    body.style.display = isOpen ? 'none' : 'block';
                    header.querySelector('.state-icon').style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
                    return;
                }

                // 2. Selection on Click (Avoid double toggle if clicking directly on checkbox)
                const cb = header.querySelector('.team-select-cb');
                if (cb) {
                    if (e.target !== cb) {
                        cb.checked = !cb.checked;
                    }
                    if (cb.checked) {
                        visualSelectedTeams.add(team.id);
                        card.style.background = '#fff3e0';
                        card.style.border = '2px solid #ffb74d';
                    } else {
                        visualSelectedTeams.delete(team.id);
                        card.style.background = 'white';
                        card.style.border = '1px solid transparent';
                    }
                }
            };
        }

        // Body
        const body = document.createElement('div');
        body.className = 'team-players-body';
        body.style.cssText = 'padding: 10px; overflow-y: auto; flex: 1; background: ' + (visualEditorMode ? '#fff' : '#fafafa') + '; display: ' + (visualEditorMode ? 'block' : 'none') + ';';

        // Drag Target Ops
        if (visualEditorMode) {
            body.ondragover = (e) => { e.preventDefault(); body.style.background = '#e8f5e9'; };
            body.ondragleave = (e) => { body.style.background = '#fff'; };
            body.ondrop = async (e) => {
                e.preventDefault();
                body.style.background = '#fff';
                const playerId = e.dataTransfer.getData('text/plain');
                if (!playerId) return;

                // Optimistic Move
                const player = dataCache.players[playerId];
                const oldTeamId = player.teamId;
                if (oldTeamId === team.id) return; // Dropped on same team

                try {
                    // Update DB
                    await updateDoc(doc(db, "players", playerId), { teamId: team.id });

                    // Check if old team empty
                    const oldTeamPlayers = Object.values(dataCache.players).filter(p => p.teamId === oldTeamId && p.id !== playerId);
                    if (oldTeamPlayers.length === 0) {
                        // Custom confirmation
                        if (await confirmEmptyTeamDeletion()) {
                            await deleteDoc(doc(db, "teams", oldTeamId));
                            visualSelectedTeams.delete(oldTeamId);
                        }
                    }
                    renderVisualTeams(); // Re-render all to update counts
                } catch (err) {
                    console.error(err);
                    showAlert("Erreur lors du déplacement : " + err.message, "error");
                }
            };
        }

        players.forEach(p => {
            const row = document.createElement('div');
            row.style.cssText = 'padding: 8px; margin-bottom: 5px; background: white; border: 1px solid #eee; border-radius: 4px; font-size: 0.9rem; display: flex; align-items: center; gap: 8px;';
            if (visualEditorMode) {
                row.draggable = true;
                row.style.cursor = 'grab';
                row.ondragstart = (e) => {
                    e.dataTransfer.setData('text/plain', p.id);
                };
            }

            row.innerHTML = `
                <div style="width: 25px; height: 25px; background: #eee; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: #555;">
                    ${p.firstName ? p.firstName.charAt(0) : 'U'}
                </div>
                <div>${p.firstName} ${p.lastName}</div>
            `;
            body.appendChild(row);
        });

        card.appendChild(header);
        card.appendChild(body);
        visualContainer.appendChild(card);
    });
}

function confirmEmptyTeamDeletion() {
    return new Promise((resolve) => {
        const modal = document.getElementById('empty-team-confirm-modal');
        const btnKeep = document.getElementById('btn-keep-empty-team');
        const btnDelete = document.getElementById('btn-delete-empty-team');
        const close = modal.querySelector('.close-modal');

        const cleanup = () => {
            modal.classList.remove('active');
            btnKeep.onclick = null;
            btnDelete.onclick = null;
            close.onclick = null;
        };

        btnKeep.onclick = () => { cleanup(); resolve(false); };
        btnDelete.onclick = () => { cleanup(); resolve(true); };
        close.onclick = () => { cleanup(); resolve(false); };

        modal.classList.add('active');
    });
}

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
        const snapDup = Object.values(dataCache.teams || {}).filter(t =>
            t.seasonId === seasonId &&
            t.category === category &&
            t.gender === gender
        );

        let countSame = 0;
        snapDup.forEach(t => {
            if (t.id !== id) countSame++;
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
        showAlert("Erreur: " + (err.message || err), "error");
    } finally {
        setLoading(form, false);
    }
});

// Season filter for teams
const teamFilterSeason = document.getElementById('team-filter-season');

async function loadTeamFilterSeasons() {
    if (!teamFilterSeason) return;

    const currentVal = teamFilterSeason.value;
    teamFilterSeason.innerHTML = '<option value="">Toutes les saisons</option>';

    try {
        const seasons = Object.values(dataCache.seasons || {});
        seasons.sort((a, b) => (b.year || 0) - (a.year || 0)).forEach(season => {
            const option = document.createElement('option');
            option.value = season.id;
            option.textContent = season.name || `${season.type === 'summer' ? 'Été' : 'Hiver'} ${season.year}`;

            if (currentVal) {
                if (season.id === currentVal) option.selected = true;
            } else if (season.active) {
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
        const selectedSeason = teamFilterSeason?.value || '';

        // Filter from cache
        let teamsArr = Object.values(dataCache.teams);
        if (selectedSeason) {
            teamsArr = teamsArr.filter(t => t.seasonId === selectedSeason);
        }

        // COACH FILTER: If current user is a coach (and not super-admin), show only their teams
        if (window.currentUserCoachId && window.currentUserMainRole !== 'super-admin') {
            teamsArr = teamsArr.filter(t => (t.coachIds || []).includes(window.currentUserCoachId));
        }

        const coachesMap = {};
        const seasonsMap = {};

        Object.values(dataCache.coaches).forEach(coach => {
            coachesMap[coach.id] = (coach.name || `${coach.firstName || ''} ${coach.lastName || ''}`).trim() || 'Inconnu';
        });

        Object.values(dataCache.seasons).forEach(season => {
            seasonsMap[season.id] = season.name || `${season.type === 'summer' ? 'Été' : 'Hiver'} ${season.year}`;
        });

        list.innerHTML = '';

        if (teamsArr.length === 0) {
            list.innerHTML = '<p>Aucune équipe trouvée.</p>';
            return;
        }

        // Convert to array
        let teams = [];
        teamsArr.forEach(t => {
            teams.push({ id: t.id, data: t });
        });

        // Define Category Order
        const catOrder = ["U4", "U5", "U6", "U7", "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "Senior"];
        const getCatIndex = (cat) => {
            const index = catOrder.indexOf(cat);
            return index === -1 ? 999 : index;
        };

        // Group by Gender
        const groups = {
            'Masculin': [],
            'Féminin': [],
            'Mixte': []
        };

        teams.forEach(t => {
            const g = t.data.gender || 'Mixte';
            if (groups[g]) groups[g].push(t);
            else groups['Mixte'].push(t);
        });

        // Clear and prepare main container
        list.innerHTML = '';
        list.classList.remove('view-grid', 'view-list'); // Remove grid/list from parent

        const mainWrapper = document.createElement('div');
        mainWrapper.className = 'teams-columns-container';
        list.appendChild(mainWrapper);

        const viewMode = document.querySelector('.view-toggle-btn.active[data-target="teams-list"]')?.getAttribute('data-view') || 'grid';

        // Render Each Column
        ['Masculin', 'Féminin', 'Mixte'].forEach(gender => {
            const groupTeams = groups[gender];
            // Sort by category index, then by name
            groupTeams.sort((a, b) => {
                const idxA = getCatIndex(a.data.category);
                const idxB = getCatIndex(b.data.category);
                if (idxA !== idxB) return idxA - idxB;
                return (a.data.name || '').localeCompare(b.data.name || '');
            });

            const colId = `column-${gender.toLowerCase().replace('é', 'e')}`;
            const col = document.createElement('div');
            col.className = `team-gender-column ${colId}`;
            col.innerHTML = `<h4 class="column-title">${gender}</h4>`;

            const cardsContainer = document.createElement('div');
            cardsContainer.className = `view-${viewMode}`; // Respect current view mode
            col.appendChild(cardsContainer);

            groupTeams.forEach(({ id, data }) => {
                let coachNames = 'Non assigné';
                if (data.coachIds && Array.isArray(data.coachIds) && data.coachIds.length > 0) {
                    coachNames = data.coachIds.map(cid => coachesMap[cid] || 'N/A').join(', ');
                }

                const seasonName = data.seasonId && seasonsMap[data.seasonId] ? seasonsMap[data.seasonId] : 'N/A';

                const subtitle = `
                    <div style="font-size:0.85rem; text-align:left; margin-top:5px;">
                        Saison: ${seasonName}<br>
                        Coach: ${coachNames}
                    </div>
                `;

                let teamTitle = data.name;
                const hasCoach = data.coachIds && Array.isArray(data.coachIds) && data.coachIds.length > 0;
                if (!hasCoach) {
                    teamTitle = `<span style="color:red;">${data.name}</span>`;
                }

                const card = createCard(false, teamTitle, subtitle, id, 'edit-team', 'delete-team');
                card.classList.add('team-card');
                card.setAttribute('data-id', id);
                cardsContainer.appendChild(card);
            });

            if (groupTeams.length === 0) {
                cardsContainer.innerHTML = '<p style="text-align:center; color:#999; font-style:italic; padding:10px;">Aucune équipe</p>';
            }

            mainWrapper.appendChild(col);
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

    sel.innerHTML = '<option value="">Sélectionner un joueur...</option>';

    try {
        const players = Object.values(dataCache.players || {}).filter(p => !p.teamId);

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

    if (!teamId) return showAlert("Aucune équipe sélectionnée.", "warning");
    if (!playerId) return showAlert("Veuillez sélectionner un joueur.", "warning");

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
        showAlert("Erreur: " + e.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalIcon;
    }
});

async function loadTeamPlayers(teamId) {
    const container = document.getElementById('team-players-list');
    if (!container || !teamId) return;

    container.innerHTML = '';

    try {
        const players = Object.values(dataCache.players || {}).filter(p => p.teamId === teamId);

        if (players.length === 0) {
            container.innerHTML = '<p style="color:#888; font-style:italic;">Aucun joueur assigné.</p>';
            return;
        }

        // Sort by name
        players.sort((a, b) => {
            const nA = (a.name || a.lastName || '').toLowerCase();
            const nB = (b.name || b.lastName || '').toLowerCase();
            return nA.localeCompare(nB);
        });

        const isCoach = window.currentUserMainRole === 'coach-general' || window.currentUserCoachId;

        players.forEach(player => {
            const name = player.name || `${player.firstName || ''} ${player.lastName || ''}`.trim();
            const div = document.createElement('div');

            let playerDetails = '';
            if (isCoach) {
                const dob = player.dob || player.birthDate || '-';
                const health = player.medical || player.medicalCondition || 'Aucune';
                const parents = player.parentName || `${player.parentFirstName || ''} ${player.parentLastName || ''}`.trim() || '-';
                const phone = player.phone || player.parentPhone || '-';
                const email = player.parentEmail || '-';

                playerDetails = `
                    <div style="font-size: 0.8rem; color: #666; margin-top: 5px; padding-left: 20px;">
                        <div><i class="fas fa-birthday-cake" style="width:14px;"></i> <b>Né(e):</b> ${dob}</div>
                        <div><i class="fas fa-heartbeat" style="width:14px;"></i> <b>Santé:</b> ${health}</div>
                        <div><i class="fas fa-user-friends" style="width:14px;"></i> <b>Parent:</b> ${parents} (${phone}, ${email})</div>
                    </div>
                `;
            }

            div.style.cssText = 'padding: 10px; background: white; border: 1px solid #eee; border-radius: 6px; margin-bottom: 8px;';
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 500;"><i class="fas fa-user" style="color:#666; margin-right:8px;"></i> ${name}</span>
                    ${!isCoach ? `
                    <button class="btn-delete-player" data-player-id="${player.id}" style="background: #e74c3c; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-times"></i>
                    </button>
                    ` : ''}
                </div>
                ${playerDetails}
            `;
            container.appendChild(div);
        });

        // Hide Add Player controls for Coaches
        const addControls = document.querySelector('#team-players-container div[style*="border-top: 1px dashed"]');
        if (addControls) {
            addControls.style.display = isCoach ? 'none' : 'flex';
        }

        // Setup delete player from team
        container.querySelectorAll('.btn-delete-player').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const playerId = btn.getAttribute('data-player-id');
                if (await showConfirm('Retirer ce joueur de l\'équipe?')) {
                    try {
                        await updateDoc(doc(db, "players", playerId), { teamId: null });
                        loadTeamPlayers(teamId);
                        populateTeamPlayerSelect('team-add-player-select'); // Make available again
                    } catch (error) {
                        console.error("Error removing player:", error);
                        showAlert("Erreur: " + error.message, "error");
                    }
                }
            });
        });

    } catch (error) {
        console.error("Error loading team players:", error);
        container.innerHTML = '<p style="color:red;">Erreur de chargement</p>';
    }
}




// --- PLAYERS LOGIC ---
const playerModal = document.getElementById('player-modal');
const openPlayerModalBtn = document.getElementById('open-player-modal');
const openPlayerModalDirBtn = document.getElementById('open-player-modal-directory');

async function populateTeamSelect(selectedId = null) {
    const sel = document.getElementById('player-team');
    if (!sel) return;

    const teamsArr = Object.values(dataCache.teams || {});

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

window.openPlayerModal = async function (data = null) {
    const form = document.getElementById('player-form');
    if (!form) return;
    form.reset();
    document.getElementById('player-id').value = '';

    // Reset Tabs
    const tabIdentity = document.querySelector('.tab-link[data-tab="tab-identity"]');
    if (tabIdentity) window.switchPlayerTab(tabIdentity, 'tab-identity');

    // Populate Teams
    await populateTeamSelect();

    if (data) {
        document.getElementById('player-id').value = data.id || '';
        document.getElementById('ep-firstname').value = data.firstName || '';
        document.getElementById('ep-lastname').value = data.lastName || '';
        document.getElementById('ep-gender').value = data.gender || 'M';
        document.getElementById('ep-dob').value = data.birthDate || data.dob || '';
        document.getElementById('ep-medical').value = data.medicalCondition || data.medical || '';

        document.getElementById('ep-address').value = data.address || '';
        document.getElementById('ep-city').value = data.city || '';
        document.getElementById('ep-postal').value = data.postalCode || '';
        document.getElementById('ep-phone').value = data.phone || data.phoneFamily || '';

        document.getElementById('ep-p1-name').value = data.parent1Name || data.parentName || '';
        document.getElementById('ep-p1-email').value = data.parent1Email || data.parentEmail || '';
        document.getElementById('ep-p2-name').value = data.parent2Name || '';
        document.getElementById('ep-p2-email').value = data.parent2Email || '';

        document.getElementById('ep-jersey-size').value = data.jerseySize || '';
        document.getElementById('ep-short-size').value = data.shortSize || '';
        document.getElementById('ep-short-opt').value = data.shortOption || '';
        document.getElementById('ep-socks-opt').value = data.socksOption || 'Non';
        document.getElementById('ep-socks-size').value = data.socksSize || '';
        document.getElementById('ep-socks-qty').value = data.socksQuantity || 1;

        document.getElementById('ep-photo-auth').value = data.photoAuth || 'Oui';
        document.getElementById('ep-requests').value = data.specialRequests || '';

        const teamSelect = document.getElementById('ep-team');
        if (teamSelect) teamSelect.value = data.teamId || '';
    }

    setLoading(form, false);
    const modal = document.getElementById('player-modal');
    if (modal) modal.classList.add('active');
}


if (openPlayerModalBtn) openPlayerModalBtn.addEventListener('click', () => openPlayerModal(null));
if (openPlayerModalDirBtn) openPlayerModalDirBtn.addEventListener('click', () => openPlayerModal(null));


document.getElementById('player-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(form, true);

    try {
        const id = document.getElementById('player-id').value;

        const data = {
            firstName: document.getElementById('ep-firstname').value,
            lastName: document.getElementById('ep-lastname').value,
            gender: document.getElementById('ep-gender').value,
            birthDate: document.getElementById('ep-dob').value,
            dob: document.getElementById('ep-dob').value, // Dual store for compatibility
            medicalCondition: document.getElementById('ep-medical').value,

            address: document.getElementById('ep-address').value,
            city: document.getElementById('ep-city').value,
            postalCode: document.getElementById('ep-postal').value,
            phone: document.getElementById('ep-phone').value,

            parent1Name: document.getElementById('ep-p1-name').value,
            parent1Email: document.getElementById('ep-p1-email').value,
            parentName: document.getElementById('ep-p1-name').value, // Compat
            parentEmail: document.getElementById('ep-p1-email').value, // Compat

            parent2Name: document.getElementById('ep-p2-name').value,
            parent2Email: document.getElementById('ep-p2-email').value,

            jerseySize: document.getElementById('ep-jersey-size').value,
            shortSize: document.getElementById('ep-short-size').value,
            shortOption: document.getElementById('ep-short-opt').value,
            socksOption: document.getElementById('ep-socks-opt').value,
            socksSize: document.getElementById('ep-socks-size').value,
            socksQuantity: parseInt(document.getElementById('ep-socks-qty').value) || 1,

            photoAuth: document.getElementById('ep-photo-auth').value,
            specialRequests: document.getElementById('ep-requests').value,

            teamId: document.getElementById('ep-team').value || null
        };

        if (id) {
            await updateDoc(doc(db, "players", id), data);
        } else {
            // New Player
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, "players"), data);
        }

        showAlert("Joueur enregistré avec succès !", "success");

        const modal = document.getElementById('player-modal');
        if (modal) modal.classList.remove('active');

        // Reload views if they exist/are active
        if (typeof loadPlayers === 'function') loadPlayers();
        if (typeof loadTeamPlayers === 'function' && data.teamId) loadTeamPlayers(data.teamId);

    } catch (err) {
        console.error("Error saving player:", err);
        showAlert("Erreur: " + err.message, "error");
    } finally {
        setLoading(form, false);
    }
});

window.switchPlayerTab = function (element, tabId) {
    // Remove active class from all tabs
    const headers = element.parentElement.querySelectorAll('.tab-link');
    headers.forEach(h => {
        h.classList.remove('active');
        h.style.color = '#666';
        h.style.borderBottom = '2px solid transparent';
    });

    // Add active class to clicked tab
    element.classList.add('active');
    element.style.color = 'var(--primary)';
    element.style.borderBottom = '2px solid var(--primary)';

    // Hide all contents
    const form = document.getElementById('player-form');
    form.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

    // Show target content
    document.getElementById(tabId).style.display = 'block';
};


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
        showAlert("Erreur: " + (err.message || err), "error");
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

    targetList.innerHTML = '';
    const players = Object.values(dataCache.players || {});

    players.forEach(data => {
        const id = data.id;
        const subtitle = `Niveau: ${data.skill || '?'} | ${data.pos || '?'}`;

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
    // dataCache is handled by real-time listeners
    return Promise.resolve();
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

    if (!await showConfirm(`Vous allez créer environ ${totalCount} articles (moins les exclusions éventuelles). Continuer ?`)) return;

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
        showAlert("Erreur: " + (err.message || err), "error");
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

    // Use Cache
    const items = Object.values(dataCache.inventory || {});
    targetList.innerHTML = '';

    if (items.length === 0) {
        targetList.innerHTML = '<p style="text-align:center; padding: 20px;">Aucun article inventorié.</p>';
        return;
    }

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
            // Legacy support removed to align with card view
            distributions.forEach(d => distributedCount += (parseInt(d.qty) || 0));
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

                // Legacy support removed to align with card view
                distributions.forEach(d => distributedCount += (parseInt(d.qty) || 0));

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
            if (await showConfirm("Supprimer tout ce lot d'articles ? Cette action est irréversible.")) {
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

            if (batchItems.length === 0) return showAlert("Erreur: Lot vide.", "error");

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
                    if (await showConfirm("Voulez-vous vraiment supprimer tout ce lot (" + batchItems.length + " articles) ? Cette action est irréversible.")) {
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
                if (await showConfirm(`Supprimer définitivement l'article n°${item.number} de ce lot ?`)) {
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

        const distTeamContainer = document.getElementById('dist-team-container');
        const distTeamFilter = document.getElementById('dist-team-filter');

        distTypeSel.value = '';
        distTargetSel.innerHTML = '<option value="">Sélectionner...</option>';
        distTargetSel.disabled = true;
        distQtyInput.value = '1';
        if (distTeamContainer) distTeamContainer.style.display = 'none';

        distTypeSel.onchange = () => {
            const type = distTypeSel.value;
            distTargetSel.innerHTML = '<option value="">Sélectionner...</option>';
            if (distTeamFilter) distTeamFilter.innerHTML = '<option value="">Toutes les équipes</option>';

            if (!type) {
                distTargetSel.disabled = true;
                if (distTeamContainer) distTeamContainer.style.display = 'none';
                return;
            }

            distTargetSel.disabled = false;

            if (type === 'player' && distTeamContainer) {
                distTeamContainer.style.display = 'block';
                // Populate Teams Filter
                const teams = Object.entries(dataCache.teams || {}).map(([id, t]) => ({ id, name: t.name }));
                teams.sort((a, b) => a.name.localeCompare(b.name));
                teams.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.textContent = t.name;
                    distTeamFilter.appendChild(opt);
                });
            } else {
                if (distTeamContainer) distTeamContainer.style.display = 'none';
            }

            populateBeneficiaries();
        };

        if (distTeamFilter) {
            distTeamFilter.onchange = () => {
                populateBeneficiaries();
            };
        }

        function populateBeneficiaries() {
            const type = distTypeSel.value;
            const teamFilterId = distTeamFilter ? distTeamFilter.value : '';
            distTargetSel.innerHTML = '<option value="">Sélectionner...</option>';

            let source = [];
            if (type === 'coach') {
                source = Object.keys(dataCache.coaches || {}).map(k => ({ id: k, ...dataCache.coaches[k] }));
            } else if (type === 'player') {
                source = Object.values(dataCache.players || {});
                if (teamFilterId) {
                    source = source.filter(p => p.teamId === teamFilterId);
                }
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
        }

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
        // Use unified modal filling logic
        fillInventoryModal(data);
        // Explicitly stay on/switch to Stock tab if preferred, or just let reset handle it
        resetInventoryModalTabs();
        renderSingleInventoryDistributions(data);
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
            // Child
            childFirstName: document.getElementById('reg-child-first').value,
            childLastName: document.getElementById('reg-child-last').value,
            dob: document.getElementById('reg-dob').value,
            gender: document.getElementById('reg-gender').value,
            medical: document.getElementById('reg-medical').value,

            // Parents
            parent1Name: document.getElementById('reg-parent1-name').value,
            parent1Email: document.getElementById('reg-parent1-email').value,
            parent2Name: document.getElementById('reg-parent2-name').value,
            parent2Email: document.getElementById('reg-parent2-email').value,
            phoneFamily: document.getElementById('reg-phone').value,

            // Address
            addressLine: document.getElementById('reg-address').value,
            city: document.getElementById('reg-city').value,
            postalCode: document.getElementById('reg-postal').value,

            // Equipment & Other
            jerseySize: document.getElementById('reg-jersey-size').value,
            photoAuth: document.getElementById('reg-photo-auth').value,

            // Legacy / List View Mapping
            firstName: document.getElementById('reg-child-first').value,
            lastName: document.getElementById('reg-child-last').value,
            parentFirstName: document.getElementById('reg-parent1-name').value.split(' ')[0],
            parentLastName: document.getElementById('reg-parent1-name').value.split(' ').slice(1).join(' '),
            email: document.getElementById('reg-parent1-email').value,
            phone: document.getElementById('reg-phone').value,

            program: document.getElementById('reg-program').value,
            finalPrice: document.getElementById('reg-price').value,
            status: document.getElementById('reg-status').value
        };

        // Timestamp for new ones
        if (!id) data.timestamp = new Date();

        await uploadAndSave('registrations', id, data, null);

        regModal.classList.remove('active');
        loadRegistrations();
    } catch (err) {
        console.error(err);
        showAlert("Erreur: " + (err.message || err), "error");
    } finally {
        setLoading(form, false);
    }
});

async function loadRegistrations() {
    const tbody = document.querySelector('#registrations-table tbody');
    if (!tbody) return;

    // Filter values
    const searchText = document.getElementById('reg-search')?.value.toLowerCase() || '';

    tbody.innerHTML = '';

    const regs = Object.values(dataCache.registrations || {});

    if (regs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Aucune inscription trouvée.</td></tr>';
        return;
    }

    // Sort by timestamp desc
    regs.sort((a, b) => {
        const tA = a.timestamp?.seconds || 0;
        const tB = b.timestamp?.seconds || 0;
        return tB - tA;
    });

    let count = 0;
    regs.forEach(data => {
        const id = data.id;


        const fullName = `${data.childFirstName} ${data.childLastName}`.toLowerCase();
        if (searchText && !fullName.includes(searchText)) return;

        const date = data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().toLocaleDateString() : 'N/A';
        const teamName = data.teamId && dataCache.teams[data.teamId] ? dataCache.teams[data.teamId].name : '-';

        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.setAttribute('data-id', id);
        row.className = 'reg-row';

        let s = data.status || 'Nouveau';
        // Translate legacy English values for display
        if (s === 'New') s = 'Nouveau';
        if (s === 'Migrated') s = 'Migré';
        if (s === 'Paid') s = 'Payé';
        if (s === 'Confirmed') s = 'Confirmé';
        if (s === 'Completed') s = 'Terminé';
        if (s === 'Cancelled') s = 'Annulé';

        let statusHtml = '';
        let color = '#7f8c8d';
        if (s === 'Migré') color = '#27ae60'; // Green
        else if (s === 'Payé') color = '#f39c12'; // Orange
        else if (s === 'Nouveau') color = '#3498db'; // Blue
        statusHtml = `<span style="padding: 2px 8px; border-radius: 12px; background: ${color}; color: white; font-size: 0.75rem; font-weight: bold;">${s}</span>`;

        // Get active season info if needed
        let seasonText = '';
        if (dataCache.seasons) {
            const ags = Object.values(dataCache.seasons).find(s => s.active);
            if (ags) seasonText = ags.name || `${ags.type} ${ags.year}`;
        }

        const headerEl = document.getElementById('reg-view-header');
        if (headerEl) {
            headerEl.innerHTML = `Demandes d'inscription <span style="font-size:0.9rem; color:#666; font-weight:normal;">(${seasonText} - ${regs.length} inscrits)</span>`;
        }

        row.innerHTML = `<td>${date}</td>
                         <td><strong>${data.childFirstName} ${data.childLastName}</strong><br><small>Né(e): ${data.dob || data.birthYear || '?'}</small></td>
                         <td>
                            ${teamName !== '-' && teamName !== 'Non assigné' ?
                `<strong style="color:#007A33;">${teamName}</strong>` :
                `<strong>${data.program || data.programCat || ''}</strong>`
            }
                         </td>
                         <td>${statusHtml}</td>
                         <td>${data.parentFirstName} ${data.parentLastName}</td>
                         <td class="actions-cell">
                             <a href="mailto:${data.email}" class="btn-action" title="Envoyer courriel" onclick="event.stopPropagation()"><i class="fas fa-envelope"></i></a>
                             <button class="delete-reg" data-id="${id}" title="Supprimer" onclick="event.stopPropagation()"><i class="fas fa-trash"></i></button>
                         </td>`;
        tbody.appendChild(row);
        count++;
    });

    if (count === 0) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Aucune inscription trouvée.</td></tr>';

    // Add Click Listener
    setupClickableCard('.reg-row', 'registrations', 'registration-modal', 'reg-id', (data) => {
        // Child
        document.getElementById('reg-child-first').value = data.childFirstName || '';
        document.getElementById('reg-child-last').value = data.childLastName || '';
        document.getElementById('reg-dob').value = data.dob || '';
        document.getElementById('reg-gender').value = data.gender || 'M';
        document.getElementById('reg-medical').value = data.medical || '';
        document.getElementById('reg-price').value = data.price || '';

        let s = data.status || 'Nouveau';
        if (s === 'New') s = 'Nouveau';
        if (s === 'Migrated') s = 'Migré';
        if (s === 'Paid') s = 'Payé';
        if (s === 'Confirmed') s = 'Confirmé';
        document.getElementById('reg-status').value = s;

        // Parents
        document.getElementById('reg-parent1-name').value = data.parent1Name || `${data.parentFirstName || ''} ${data.parentLastName || ''}`.trim();
        document.getElementById('reg-parent1-email').value = data.parent1Email || data.email || '';
        document.getElementById('reg-parent2-name').value = data.parent2Name || '';
        document.getElementById('reg-parent2-email').value = data.parent2Email || '';
        document.getElementById('reg-phone').value = data.phoneFamily || data.phone || '';

        // Address
        document.getElementById('reg-address').value = data.addressLine || '';
        document.getElementById('reg-city').value = data.city || '';
        document.getElementById('reg-postal').value = data.postalCode || '';

        // Equipment
        document.getElementById('reg-jersey-size').value = data.jerseySize || '';
        document.getElementById('reg-short-info').value = (data.shortOption || '') + ' ' + (data.shortSize || '');
        document.getElementById('reg-socks-info').value = (data.socksOption || '') + ' ' + (data.socksSize || '') + (data.socksQuantity ? ' (Qté: ' + data.socksQuantity + ')' : '');

        // Other
        document.getElementById('reg-photo-auth').value = data.photoAuth || '';
        document.getElementById('reg-program').value = data.programCat || data.program || '';
        document.getElementById('reg-price').value = data.finalPrice || 0;
        document.getElementById('reg-status').value = data.status || 'New';
        document.getElementById('reg-session-id').value = data.registrationSessionId || '';
    });

    setupDeleteButton('.delete-reg', 'registrations', () => loadRegistrations());
}

// Add Listeners
document.getElementById('reg-search')?.addEventListener('input', loadRegistrations);

// --- MIGRATION LOGIC ---
const migrateBtn = document.getElementById('btn-migrate-registrations');
if (migrateBtn) {
    migrateBtn.addEventListener('click', () => {
        migrateRegistrations();
    });
} else {
    console.error("Migrate button NOT FOUND");
}

// --- REUSE GLOBAL UTILS ---
// (Logic here now uses window.showAlert and window.showConfirm from ui-utils.js)

async function migrateRegistrations() {
    if (!await showConfirm("Voulez-vous lancer l'analyse pour la migration des inscriptions vers la base de joueurs ?", "Démarrer Migration")) return;

    const container = document.querySelector('#view-registrations .card');
    setLoading(container, true);

    try {
        // 1. Use Cache for Candidates (Payé only as requested)
        const candidates = Object.values(dataCache.registrations || {}).filter(r => r.status === "Payé");

        if (candidates.length === 0) {
            await showAlert("Aucune inscription éligible (Payée) trouvée.");
            setLoading(container, false);
            return;
        }

        // 2a. Fetch Active Season & Teams (Auto-Assign Logic)
        console.log("Using active season and teams from cache...");
        let activeTeams = [];
        const activeSeason = Object.values(dataCache.seasons || {}).find(s => s.active);
        if (activeSeason) {
            const seasonId = activeSeason.id;
            activeTeams = Object.values(dataCache.teams || {}).filter(t => t.seasonId === seasonId);
        }

        // 2b. Fetch Existing Players (for dedupe)
        console.log("Using existing players from cache for deduplication...");
        const playersArr = Object.values(dataCache.players || {});
        const players = playersArr.map(data => {
            // Normalize for comparison
            const name = (data.name || `${data.firstName || ''} ${data.lastName || ''}`).toLowerCase().trim();
            const parent = (data.parentName || data.parentFirstName || '').toLowerCase().trim();
            return { id: data.id, name, parent };
        });

        // 3. Analyze
        const conflicts = [];
        const toMigrate = [];

        candidates.forEach(r => {
            const rId = r.id;

            const rFirst = (r.childFirstName || '').trim();
            const rLast = (r.childLastName || '').trim();
            const rName = `${rFirst} ${rLast}`.toLowerCase();
            // const rParent = (r.parent1Name || '').toLowerCase().trim();

            // Check duplicate
            // We check Name AND (Parent Name matches partially?)
            // If checking parent name, maybe we allow same name different parent?
            const potentialMatch = players.find(p => p.name === rName);

            if (potentialMatch) {
                conflicts.push({
                    regId: rId,
                    regData: r,
                    matchId: potentialMatch.id,
                    matchName: potentialMatch.name,
                    matchParent: potentialMatch.parent
                });
            } else {
                toMigrate.push({ id: rId, data: r });
            }
        });

        setLoading(container, false);

        if (conflicts.length === 0 && toMigrate.length === 0) {
            await showAlert("Tous les joueurs semblent déjà migrés ou traités.");
            return;
        }

        if (conflicts.length > 0) {
            showMigrationConflictModal(conflicts, toMigrate, activeTeams);
        } else {
            if (await showConfirm(`${toMigrate.length} joueurs prêts à être migrés. Confirmer ?`)) {
                const listWithAction = toMigrate.map(x => ({ ...x, action: 'migrate' }));
                await executeMigration(listWithAction, activeTeams);
            }
        }

    } catch (e) {
        console.error("Migration Error:", e);
        await showAlert("Erreur lors de l'analyse: " + e.message, "error");
        setLoading(container, false);
    }
}

function showMigrationConflictModal(conflicts, cleanList, activeTeams) {
    const modal = document.getElementById('migration-conflict-modal');
    const tbody = document.querySelector('#migration-conflict-table tbody');
    tbody.innerHTML = '';

    conflicts.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <strong>${c.regData.childFirstName} ${c.regData.childLastName}</strong><br>
                <small>Parent: ${c.regData.parent1Name}</small>
            </td>
            <td>
                Existe déjà: <strong style="color:orange;">${c.matchName}</strong><br>
                <small>Parent : ${c.matchParent || '?'}</small>
            </td>
            <td>
                <select class="form-control migration-decision" data-id="${c.regId}" style="font-size:0.9rem; padding: 5px;">
                    <option value="skip">Marquer comme déjà migré</option>
                    <option value="force">Forcer la création (Homonyme)</option>
                </select>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Add Clean Items info
    const infoDiv = document.createElement('tr');
    infoDiv.innerHTML = `<td colspan="3" style="background:#e8f5e9; text-align:center; padding: 10px;">
        + <strong>${cleanList.length}</strong> joueurs sans conflit seront migrés automatiquement via confirmation.
    </td>`;
    tbody.prepend(infoDiv);

    modal.classList.add('active');

    // Confirm Button
    const btn = document.getElementById('confirm-migration-btn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async () => {
        // Gather decisions
        const finalToMigrate = cleanList.map(x => ({ ...x, action: 'migrate' }));
        const selects = document.querySelectorAll('.migration-decision');
        selects.forEach(sel => {
            const val = sel.value;
            const rid = sel.getAttribute('data-id');
            const c = conflicts.find(x => x.regId === rid);
            if (!c) return;

            if (val === 'force') {
                finalToMigrate.push({ id: rid, data: c.regData, action: 'migrate' });
            } else if (val === 'skip') {
                finalToMigrate.push({ id: rid, data: c.regData, action: 'statusOnly' });
            }
        });

        modal.classList.remove('active');
        if (finalToMigrate.length === 0) {
            await showAlert("Aucune action effectuée.");
            return;
        }

        await executeMigration(finalToMigrate, activeTeams);
    });

    modal.querySelector('.close-modal') ? modal.querySelector('.close-modal').onclick = () => modal.classList.remove('active') : null;
    document.getElementById('migration-conflict-cancel')?.addEventListener('click', () => modal.classList.remove('active'));
}

async function executeMigration(list, activeTeams = []) {
    if (list.length === 0) return;
    const container = document.querySelector('#view-registrations .card');
    setLoading(container, true);

    let processed = 0;
    try {
        for (const item of list) {
            const r = item.data;
            const rid = item.id;

            if (item.action === 'migrate') {
                // Auto-Assign Logic
                let assignedTeamId = '';
                if (activeTeams.length > 0) {
                    const regCat = (r.programCat || r.program || '').trim();
                    const regGender = (r.gender || '').trim();

                    // Find matching team
                    const match = activeTeams.find(t =>
                        (t.category === regCat) &&
                        (t.gender === regGender)
                    );

                    if (match) assignedTeamId = match.id;
                }

                // Map Fields
                const newPlayer = {
                    firstName: r.childFirstName,
                    lastName: r.childLastName,
                    name: `${r.childFirstName} ${r.childLastName}`,
                    dob: r.dob || '',
                    year: r.dob ? parseInt(r.dob.split('-')[0]) : (r.yearOfBirth || new Date().getFullYear()),
                    gender: r.gender || '',
                    medical: r.medical || '',

                    parentName: r.parent1Name || '',
                    parentFirstName: r.parentFirstName || (r.parent1Name ? r.parent1Name.split(' ')[0] : ''),
                    parentLastName: r.parentLastName || (r.parent1Name ? r.parent1Name.split(' ').slice(1).join(' ') : ''),
                    parentEmail: r.parent1Email || r.email || '',
                    phone: r.phoneFamily || r.phone || '',

                    address: r.addressLine || '',
                    city: r.city || '',
                    postalCode: r.postalCode || '',

                    jerseySize: r.jerseySize || '',
                    shortSize: r.shortSize || '',
                    socksSize: r.socksSize || '',

                    teamId: assignedTeamId || r.teamId || '',
                    photoAuth: r.photoAuth || '',

                    sourceRegistrationId: rid,
                    createdAt: new Date(),
                    skill: 1, // Default to lowest skill or unrated
                    pos: 'TBD', // Default pos
                    status: 'Active'
                };

                // Add to Players
                await addDoc(collection(db, "players"), newPlayer);
            }

            // Update Registration Status to Migré for both 'migrate' and 'statusOnly'
            await updateDoc(doc(db, "registrations", rid), {
                status: 'Migré'
            });

            processed++;
        }

        await showAlert(`Migration terminée avec succès ! ${processed} joueurs créés.`, "success");
        loadRegistrations(); // Refresh UI
        // Refresh Players if needed (e.g. if we add a notification)
        updateStats();

    } catch (e) {
        console.error(e);
        await showAlert(`Erreur partielle après ${processed} éléments : ${e.message}`, "error");
    } finally {
        setLoading(container, false);
    }
}




// --- Rest of General Logic ---
async function updateStats() {
    const list = {
        'products': 'products',
        'players': 'players',
        'inventory': 'inventory'
    };
    for (const [key, cacheKey] of Object.entries(list)) {
        const count = Object.keys(dataCache[cacheKey] || {}).length;
        const el = document.getElementById(`stat-${key}`);
        if (el) el.innerText = count;
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

    // 1. Season Task
    const seasonTask = wrap("Season", async () => {
        if (!dataCache.currentSeason) {
            const activeSeason = Object.values(dataCache.seasons || {}).find(s => s.active);
            if (activeSeason) {
                dataCache.currentSeason = activeSeason.id;
            }
        }
    });

    // 2. Players Task
    const playersTask = wrap("Players", async () => {
        const playersCountEl = document.getElementById('dash-players-count');
        const playersCount = Object.keys(dataCache.players || {}).length;
        if (playersCountEl) playersCountEl.textContent = `${playersCount} joueurs au total`;
    });

    // 3. Coaches Task
    const coachesTask = wrap("Coaches", async () => {
        const coachContainer = document.getElementById('dash-coach-alerts');
        if (!coachContainer) return;

        coachContainer.innerHTML = '';
        const coaches = Object.values(dataCache.coaches || {});
        const now = new Date();
        const sixMonthsFromNow = new Date();
        sixMonthsFromNow.setMonth(now.getMonth() + 6);

        let alertCount = 0;
        coaches.forEach(c => {
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

        const matches = Object.values(dataCache.matches || {});
        const referees = Object.values(dataCache.referees || {});

        const refCounts = {};
        matches.forEach(m => {
            [m.refCenter, m.refAsst1, m.refAsst2].forEach(id => {
                if (id) refCounts[id] = (refCounts[id] || 0) + 1;
            });
        });

        refTbody.innerHTML = '';
        referees.forEach(r => {
            const count = refCounts[r.id] || 0;
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

const ROLE_DESCRIPTIONS = {
    'super-admin': 'Accès total à tout le système (visionner, modifier, supprimer). Aucune restriction.',
    'secretaire': 'Gestion des joueurs, des inscriptions, des matchs et visionnement des équipes.',
    'coach-general': 'Visionnement restreint de ses propres équipes. Accès en lecture seule aux détails des joueurs (santé, parents, naissance).',
    'arbitre-general': 'Visionnement du calendrier des matchs uniquement. Ne peut pas modifier ou voir les détails du match (sauf sa disponibilité).',
    'tresorier': 'Gestion de la facturation, de la boutique et visionnement de l\'inventaire.',
    'custom': 'Aucune permission de base. Utilisez la grille ci-dessous pour définir les accès spécifiques.'
};

function updateRoleDescription(role) {
    const descEl = document.getElementById('role-description');
    if (!descEl) return;
    const text = ROLE_DESCRIPTIONS[role] || '';
    if (text) {
        descEl.textContent = text;
        descEl.style.display = 'block';
    } else {
        descEl.style.display = 'none';
    }
}

if (openAdminModalBtn) openAdminModalBtn.addEventListener('click', () => {
    document.getElementById('admin-form').reset();
    document.getElementById('admin-id').value = '';
    document.getElementById('admin-preset-roles').value = 'custom';
    updateRoleDescription('custom');

    // Reset permissions radios to 'none'
    document.querySelectorAll('.permissions-grid input[value="none"]').forEach(r => r.checked = true);

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

        // Collect roles from radios and dropdown
        const roles = [];
        const roleSelectValue = document.getElementById('admin-preset-roles').value;
        const isSuperAdmin = roleSelectValue === 'super-admin';

        if (isSuperAdmin) {
            roles.push('SuperAdmin');
        } else {
            // Save main role first if not custom
            if (roleSelectValue !== 'custom') {
                roles.push(roleSelectValue);
            }
            // Find all permission radios
            const permissionsGrid = document.querySelector('.permissions-grid');
            const moduleNames = ['Dashboard', 'Joueurs', 'Coachs', 'Arbitres', 'Club', 'Commanditaires', 'Equipes', 'Matchs', 'Inventaire', 'Inscriptions', 'Boutique', 'Campagnes', 'Automatisations', 'Facturation', 'Terrains', 'Saisons', 'Config'];

            moduleNames.forEach(mod => {
                const selected = document.querySelector(`input[name="perm-${mod}"]:checked`)?.value;
                if (selected && selected !== 'none') {
                    roles.push(`${mod}:${selected}`);
                }
            });
        }

        if (roles.length === 0) throw new Error("Veuillez sélectionner au moins une permission ou le rôle Super Admin.");

        const lowerEmail = email.toLowerCase().trim();
        const data = { email: lowerEmail, name, role: roles };

        if (id) {
            // If editing, we might need to handle ID change if they changed email
            // But for now, let's keep it simple: use the ID provided by the table
            await updateDoc(doc(db, "admins", id), data);
        } else {
            // ALWAYS use lowercase email as the Document ID for security rules
            await setDoc(doc(db, "admins", lowerEmail), data);

            // --- INVITATION LOGIC FOR NEW USERS ---
            try {
                const token = await auth.currentUser.getIdToken();
                const inviteUrl = 'https://us-central1-celticsdelouest.cloudfunctions.net/inviteAdmin';
                const inviteRes = await fetch(inviteUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ email: lowerEmail, name: name })
                });
                const inviteData = await inviteRes.json();
                if (!inviteRes.ok || inviteData.error) {
                    console.error("Invite failed:", inviteData.error);
                    showAlert("Utilisateur créé, mais l'invitation par courriel a échoué: " + (inviteData.error || "Erreur serveur"), "warning");
                } else {
                    showAlert("Utilisateur créé et invitation envoyée !", "success");
                }
            } catch (inviteErr) {
                console.error("Invite Fetch Error:", inviteErr);
                showAlert("Utilisateur créé, mais erreur lors de l'envoi de l'invitation.", "warning");
            }
        }

        adminModal.classList.remove('active');
        loadAdmins();
    } catch (err) {
        console.error(err);
        showAlert("Erreur: " + (err.message || err), "error");
    } finally {
        setLoading(form, false);
    }
});

document.getElementById('admin-preset-roles')?.addEventListener('change', (e) => {
    const preset = e.target.value;
    updateRoleDescription(preset);
    if (preset === 'custom') return;

    // Reset all to 'none' when selecting a preset role
    document.querySelectorAll('.permissions-grid input[value="none"]').forEach(r => r.checked = true);
});

async function loadAdmins() {
    const table = document.getElementById('admins-table')?.querySelector('tbody');
    if (!table) return;

    try {
        const admins = Object.values(dataCache.admins || {});
        table.innerHTML = '';

        if (admins.length === 0) {
            table.innerHTML = '<tr><td colspan="4">Aucun administrateur trouvé.</td></tr>';
            return;
        }

        admins.forEach(data => {
            const id = data.id;
            const row = document.createElement('tr');

            // Handle legacy strings vs modern arrays
            const rolesArray = Array.isArray(data.role) ? data.role : [data.role];
            const rolesHtml = rolesArray.map(r => {
                let label = r;
                let color = 'badge-secondary';
                if (r === 'SuperAdmin') {
                    color = 'badge-primary';
                } else if (r.includes(':')) {
                    const [mod, level] = r.split(':');
                    label = `${mod}: ${level === 'edit' ? 'Modifier' : 'Visionner'}`;
                }
                return `<span class="badge ${color}" style="margin-right:5px; margin-bottom:5px; display:inline-block;">${label}</span>`;
            }).join('');

            row.innerHTML = `
                <td>${data.email}</td>
                <td>${data.name}</td>
                <td>${rolesHtml}</td>
                <td>
                    <button class="btn-icon edit-admin" data-id="${data.id}" style="margin-right:8px;"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" onclick="resetAdminPassword('${data.email}')" title="Réinitialiser mot de passe" style="margin-right:8px; color: var(--secondary);"><i class="fas fa-key"></i></button>
                    <button class="btn-icon delete-admin" data-id="${data.id}" style="color:red;"><i class="fas fa-trash"></i></button>
                </td>
            `;
            row.style.cursor = 'pointer';
            row.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    row.querySelector('.edit-admin').click();
                }
            });
            table.appendChild(row);
        });

        // Setup Edit
        table.querySelectorAll('.edit-admin').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const data = dataCache.admins[id];
                if (data) {
                    document.getElementById('admin-id').value = id;
                    document.getElementById('admin-email').value = data.email;
                    document.getElementById('admin-name').value = data.name;

                    // Reset Radios to 'none'
                    document.querySelectorAll('.permissions-grid input[value="none"]').forEach(r => r.checked = true);

                    const rolesArray = Array.isArray(data.role) ? data.role : [data.role];

                    if (rolesArray.includes('SuperAdmin')) {
                        const role = 'super-admin';
                        document.getElementById('admin-preset-roles').value = role;
                        updateRoleDescription(role);
                    } else {
                        // Default to custom, will be overwritten if a role is found
                        document.getElementById('admin-preset-roles').value = 'custom';
                        updateRoleDescription('custom');

                        rolesArray.forEach(r => {
                            if (ROLE_PERMISSIONS[r]) {
                                document.getElementById('admin-preset-roles').value = r;
                                updateRoleDescription(r);
                            } else if (r.includes(':')) {
                                const [mod, level] = r.split(':');
                                const radio = document.querySelector(`input[name="perm-${mod}"][value="${level}"]`);
                                if (radio) radio.checked = true;
                            } else {
                                // Fallback for simple permissions or old roles
                                const radio = document.querySelector(`input[name="perm-${r}"][value="edit"]`);
                                if (radio) radio.checked = true;
                            }
                        });
                    }

                    adminModal.classList.add('active');
                }
            });
        });

        // Setup Delete
        table.querySelectorAll('.delete-admin').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (await showConfirm("Supprimer cet administrateur ?")) {
                    const id = btn.getAttribute('data-id');
                    try {
                        await deleteDoc(doc(db, "admins", id));
                        loadAdmins();
                    } catch (e) {
                        showAlert("Erreur: " + e.message, "error");
                    }
                }
            });
        });
    } catch (e) {
        console.error("Erreur loadAdmins:", e);
        table.innerHTML = `<tr><td colspan="4" style="color:red">Erreur: ${e.message}</td></tr>`;
    }
}

async function getUserRole(email) {
    if (!email) return [];
    const lowerEmail = email.toLowerCase();

    // 1. Check Cache
    try {
        const admins = Object.values(dataCache.admins || {});
        let admin = admins.find(a => a.email && a.email.toLowerCase() === lowerEmail);

        // 2. Fallback: Direct DB Fetch (Race condition protection)
        if (!admin) {
            // Check if document exists with ID = email
            const docSnap = await getDoc(doc(db, "admins", lowerEmail));
            if (docSnap.exists()) {
                admin = { id: docSnap.id, ...docSnap.data() };
            } else {
                // Try querying by email field if ID is not email
                const q = query(collection(db, "admins"), where("email", "==", email)); // use original Case just in case, or lower? usually DB has exact match
                // actually lets try loose
                const qSnap = await getDocs(query(collection(db, "admins")));
                qSnap.forEach(d => {
                    const dData = d.data();
                    if (dData.email && dData.email.toLowerCase() === lowerEmail) {
                        admin = { id: d.id, ...dData };
                    }
                });
            }
        }

        if (admin) {
            const roleData = admin.role;
            return Array.isArray(roleData) ? roleData : [roleData]; // Always array
        }
    } catch (e) {
        console.warn("Error checking admin roles:", e);
    }
    return []; // No roles
}


// Hook into Nav clicks to load Admins
document.getElementById('nav-admins-btn')?.addEventListener('click', loadAdmins);

// EXPORT to window for button usage if needed, or re-run role check
const ROLE_PERMISSIONS = {
    'super-admin': { all: 'edit' },
    'secretaire': { Dashboard: 'view', Joueurs: 'edit', Inscriptions: 'edit', Matchs: 'edit', Equipes: 'view' },
    'coach-general': { Dashboard: 'view', Equipes: 'view' },
    'arbitre-general': { Matchs: 'view' },
    'tresorier': { Dashboard: 'view', Facturation: 'edit', Boutique: 'edit', Inventaire: 'view' },
    'custom': {}
};

window.checkAdminAndSetupUI = async (user) => {
    if (!user) return;

    const roles = await getUserRole(user.email);
    // console.log("User Roles:", roles);

    // --- MIGRATION: Ensure SuperAdmin has document ID == lowercase email (for rules) ---
    if (roles.includes('SuperAdmin')) {
        const lowerEmail = user.email.toLowerCase().trim();
        const docRef = doc(db, "admins", lowerEmail);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            console.warn("CRITICAL: Admin ID mismatch. Starting migration for:", lowerEmail);
            // Search for ANY document in 'admins' that has this email (case insensitive search)
            const qSnap = await getDocs(collection(db, "admins"));
            let legacyDoc = null;
            qSnap.forEach(d => {
                const dData = d.data();
                if (dData.email && dData.email.toLowerCase() === lowerEmail) {
                    legacyDoc = d;
                }
            });

            if (legacyDoc) {
                console.log("Legacy record found with ID:", legacyDoc.id, ". Migrating...");
                const data = legacyDoc.data();
                data.email = lowerEmail; // Standardize data too
                await setDoc(docRef, data);
                if (legacyDoc.id !== lowerEmail) {
                    await deleteDoc(legacyDoc.ref);
                }
                console.log("Migration successful. System access should now be granted.");
                location.reload(); // Reload to apply new rule permissions
            } else {
                console.error("Migration failed: No legacy record found for Admin. Please contact support.");
            }
        }
    }

    // Also check if user is a referee
    window.currentUserRefereeId = null;
    try {
        let referees = Object.values(dataCache.referees || {});

        // Force fetch if cache is empty (likely first load)
        if (referees.length === 0) {
            // console.log("Referees cache empty during check. Force fetching...");
            const refSnap = await getDocs(collection(db, "referees"));
            dataCache.referees = {};
            refSnap.forEach(doc => {
                dataCache.referees[doc.id] = { id: doc.id, ...doc.data() };
            });
            referees = Object.values(dataCache.referees);
            // console.log(`Fetched ${referees.length} referees.`);
        }

        // console.log(`Checking referee link for ${user.email}. Total refs in cache: ${referees.length}`);

        const refEntry = referees.find(r => r.email && r.email.toLowerCase().trim() === user.email.toLowerCase().trim());
        if (refEntry) {
            // console.log("Referee Match FOUND:", refEntry);
            window.currentUserRefereeId = refEntry.id;
        } else {
            // console.log("No referee match found for email:", user.email);
        }

    } catch (e) {
        console.warn("Error checking referee status:", e);
    }

    // Also check if user is a coach
    window.currentUserCoachId = null;
    try {
        const coaches = Object.values(dataCache.coaches || {});
        const coachEntry = coaches.find(c => c.email && c.email.toLowerCase() === user.email.toLowerCase());
        if (coachEntry) {
            window.currentUserCoachId = coachEntry.id;
            console.log("Logged in as Coach:", window.currentUserCoachId);
        }
    } catch (e) {
        console.warn("Error checking coach status:", e);
    }

    // Determine Main Role and Extra Permissions
    let mainRole = 'custom';
    const extraRoles = [];

    roles.forEach(r => {
        if (ROLE_PERMISSIONS[r]) {
            mainRole = r;
        } else if (r === 'SuperAdmin') {
            mainRole = 'super-admin';
        } else {
            extraRoles.push(r);
        }
    });

    const isSuper = mainRole === 'super-admin';
    window.currentUserMainRole = mainRole;

    // Define permission mapping
    const permissionMap = {
        'Joueurs': ['view-players'],
        'Coachs': ['view-coaches'],
        'Arbitres': ['view-referees'],
        'Club': ['view-board'],
        'Commanditaires': ['view-sponsors'],
        'Equipes': ['view-teams'],
        'Matchs': ['view-matches'],
        'Inventaire': ['view-inventory'],
        'Inscriptions': ['view-registrations'],
        'Boutique': ['view-boutique'],
        'Campagnes': ['view-email-campaigns'],
        'Automatisations': ['view-automations'],
        'Facturation': ['view-billing'],
        'Terrains': ['view-fields', 'view-fields-list'],
        'Saisons': ['view-seasons'],
        'Config': ['view-settings'],
        'Dashboard': ['view-dashboard']
    };

    // Determine allowed views and store permissions
    let allowedViews = [];
    window.currentPermissions = {}; // Reset

    if (isSuper) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            const target = btn.dataset.target;
            if (target) allowedViews.push(target);
        });
        window.currentPermissions.all = 'edit';
    } else {
        // 1. apply base permissions from role
        const basePerms = ROLE_PERMISSIONS[mainRole] || {};
        Object.keys(basePerms).forEach(mod => {
            window.currentPermissions[mod] = basePerms[mod];
            if (permissionMap[mod]) {
                allowedViews = allowedViews.concat(permissionMap[mod]);
            }
        });

        // 2. apply additional permissions (supplements)
        extraRoles.forEach(role => {
            const [mod, level] = role.includes(':') ? role.split(':') : [role, 'edit'];

            // Higher level wins (edit > view)
            if (level === 'edit' || window.currentPermissions[mod] !== 'edit') {
                window.currentPermissions[mod] = level;
            }

            if (permissionMap[mod]) {
                allowedViews = allowedViews.concat(permissionMap[mod]);
            }
        });
    }

    // Sort Listeners
    document.getElementById('coach-sort')?.addEventListener('change', loadCoaches);
    document.getElementById('board-sort')?.addEventListener('change', loadBoard);
    document.getElementById('ref-sort')?.addEventListener('change', loadReferees);

    // Update Sidebar Visibility
    document.querySelectorAll('.nav-btn').forEach(btn => {
        const target = btn.dataset.target;
        if (!target) return;

        if (allowedViews.includes(target)) {
            btn.style.display = 'flex';
        } else {
            btn.style.display = 'none';
        }
    });

    // Enforce Read-Only UI (disable modifications)
    function enforcePermissions() {
        const isSuper = window.currentPermissions.all === 'edit';

        const modMap = {
            'view-dashboard': 'Dashboard',
            'view-players': 'Joueurs',
            'view-coaches': 'Coachs',
            'view-referees': 'Arbitres',
            'view-board': 'Club',
            'view-sponsors': 'Commanditaires',
            'view-teams': 'Equipes',
            'view-matches': 'Matchs',
            'view-inventory': 'Inventaire',
            'view-registrations': 'Inscriptions',
            'view-boutique': 'Boutique',
            'view-email-campaigns': 'Campagnes',
            'view-automations': 'Automatisations',
            'view-billing': 'Facturation',
            'view-fields': 'Terrains',
            'view-fields-list': 'Terrains',
            'view-seasons': 'Saisons',
            'view-settings': 'Config'
        };

        Object.keys(modMap).forEach(viewId => {
            const mod = modMap[viewId];
            const level = isSuper ? 'edit' : (window.currentPermissions[mod] || 'none');
            const viewEl = document.getElementById(viewId);
            if (!viewEl) return;

            if (level === 'view') {
                const actionSelectors = [
                    '.btn-action', '#open-team-modal', '#open-player-modal-directory',
                    '#open-product-modal', '#open-inventory-modal', '#open-board-modal',
                    '#open-referee-modal', '#open-registration-modal', '#open-coach-modal',
                    '#open-match-modal', '#open-field-modal', '#open-season-modal',
                    '#btn-new-campaign', '#btn-new-invoice',
                    '.delete-team', '.delete-player', '.delete-product', '.delete-inventory',
                    '.delete-board', '.delete-referee', '.delete-registration', '.delete-coach',
                    '.delete-match', '.delete-field', '.delete-season', '.edit-admin', '.delete-admin'
                ];

                viewEl.querySelectorAll(actionSelectors.join(', ')).forEach(el => {
                    el.style.display = 'none';
                });

                viewEl.querySelectorAll('.btn-icon i.fa-edit, .btn-icon i.fa-trash').forEach(icon => {
                    icon.parentElement.style.display = 'none';
                });
            }
        });

        // ROLE SPECIFIC ENFORCEMENT
        if (window.currentUserMainRole === 'arbitre-general' || window.currentUserRefereeId) {
            // Arbitres cannot open match modal (handled by onclick in loadMatches but let's be double sure)
            // They also shouldn't see 'Ajouter' buttons in match view
            const matchView = document.getElementById('view-matches');
            if (matchView) {
                const addBtn = matchView.querySelector('#open-match-modal');
                if (addBtn) addBtn.style.display = 'none';
            }
        }

        if (window.currentUserMainRole === 'coach-general' || window.currentUserCoachId) {
            // Coaches cannot edit teams (handled by grid permissions but let's be sure)
            const teamView = document.getElementById('view-teams');
            if (teamView) {
                const addBtn = teamView.querySelector('#open-team-modal');
                if (addBtn) addBtn.style.display = 'none';
            }
        }
    }

    // Run enforcement after views are rendered
    setTimeout(enforcePermissions, 500);

    // Handle "Users" button specifically
    if (navAdminsBtn) {
        navAdminsBtn.style.display = isSuper ? 'flex' : 'none';
    }

    // Redirect if current view is now forbidden
    const activeView = document.querySelector('.view.active');
    if (activeView && !allowedViews.includes(activeView.id)) {
        const dashboardBtn = document.querySelector('.nav-btn[data-target="view-dashboard"]');
        if (dashboardBtn) dashboardBtn.click();
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

        const email = document.getElementById('coach-email').value;
        const phone = document.getElementById('coach-phone').value;

        if (file && file.size > 5 * 1024 * 1024) throw new Error("L'image est trop volumineuse (Max 5MB).");

        const data = { name, email, phone, policeExpiry, sportRespectExpiry, visible };
        await uploadAndSave('coaches', id, data, file);

        coachModal.classList.remove('active');
        loadCoaches();
    } catch (err) {
        console.error(err);
        showAlert("Erreur: " + (err.message || err), "error");
    } finally {
        setLoading(form, false);
    }
});

async function loadCoaches() {
    const list = document.getElementById('coaches-list');
    if (!list) return;

    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) {
        list.classList.add('view-grid');
    }

    const coachesList = Object.values(dataCache.coaches || {});
    const sortBy = document.getElementById('coach-sort')?.value || 'name';

    // Sorting Logic
    coachesList.sort((a, b) => {
        if (sortBy === 'active') {
            const visA = a.visible !== false;
            const visB = b.visible !== false;
            if (visA !== visB) return visA ? -1 : 1;
        } else if (sortBy === 'email') {
            return (a.email || '').localeCompare(b.email || '');
        } else if (sortBy === 'police') {
            const noDateA = !a.policeExpiry;
            const noDateB = !b.policeExpiry;
            if (noDateA && noDateB) return (a.name || '').localeCompare(b.name || '');
            if (noDateA) return 1;
            if (noDateB) return -1;
            return new Date(a.policeExpiry) - new Date(b.policeExpiry);
        }
        return (a.name || '').localeCompare(b.name || '');
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
        document.getElementById('coach-name').value = data.name || '';
        document.getElementById('coach-email').value = data.email || '';
        document.getElementById('coach-phone').value = data.phone || '';
        document.getElementById('coach-police-expiry').value = data.policeExpiry || '';
        document.getElementById('coach-sport-respect-expiry').value = data.sportRespectExpiry || '';
        document.getElementById('coach-visible').checked = data.visible !== false;

        setExistingPreview('coach-image-preview', data.imageUrl);

        const coachId = document.getElementById('coach-id').value; // Use ID from hidden field

        // Load assigned inventory
        const invList = document.getElementById('coach-inventory-list');
        if (invList) {
            invList.innerHTML = '';
            try {
                const items = Object.values(dataCache.inventory || {}).filter(item => item.assignedTo === coachId && item.assignedType === "coach");
                if (items.length === 0) invList.innerText = "Aucun inventaire assigné.";
                items.forEach(item => {
                    const div = document.createElement('div');
                    div.style.borderBottom = "1px solid #eee"; div.style.padding = "4px";
                    div.innerHTML = `<strong>${item.name}</strong> <small>(Qté: 1)</small>`;
                    invList.appendChild(div);
                });
            } catch (e) { console.error(e); invList.innerText = "Erreur chargement inventaire."; }
        }

        // Load assigned teams
        const teamList = document.getElementById('coach-teams-list');
        if (teamList) {
            teamList.innerHTML = '';
            try {
                const teams = Object.values(dataCache.teams || {}).filter(t => t.coachIds && t.coachIds.includes(coachId));
                if (teams.length === 0) {
                    teamList.innerText = "Aucune équipe.";
                } else {
                    teams.forEach(t => {
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
            showAlert("Configuration boutique sauvegardée !", "success");
        } catch (e) {
            console.error(e);
            showAlert("Erreur: " + e.message, "error");
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

    const inputStyle = 'width:100%; padding:8px 12px; border:1px solid #ddd; border-radius:6px; outline:none; font-size: 0.95rem;';
    const smallInputStyle = 'width:100px; padding:8px 12px; border:1px solid #ddd; border-radius:6px; outline:none; font-size: 0.95rem;';

    tr.innerHTML = `
        <td><input type="text" class="price-year" value="${year}" style="${smallInputStyle}"></td>
        <td><input type="text" class="price-cat" value="${cat}" style="${inputStyle}"></td>
        <td><input type="number" class="price-val" value="${price}" style="${smallInputStyle}"></td>
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
                if (!await showConfirm(`CONFIRMATION REQUISE :\n\nVous êtes sur le point d'OUVRIR les inscriptions pour la saison :\n${targetSeason} ${targetYear}\n\nConfirmez-vous cette action ?`)) {
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
                costShortBuy: parseFloat(document.getElementById('setting-cost-short-buy').value) || 0,
                costShortRent: parseFloat(document.getElementById('setting-cost-short-rent').value) || 0,
                costSocks: parseFloat(document.getElementById('setting-cost-socks').value) || 0,
                pricingGrid: []
            };

            document.querySelectorAll('#pricing-tbody tr').forEach(tr => {
                settings.pricingGrid.push({
                    year: tr.querySelector('.price-year').value,
                    category: tr.querySelector('.price-cat').value,
                    price: parseFloat(tr.querySelector('.price-val').value) || 0
                });
            });

            // Handle Size Guide File Upload
            const sizeGuideFile = document.getElementById('setting-size-guide').files[0];
            const statusEl = document.getElementById('size-guide-status');

            if (sizeGuideFile) {
                if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi du fichier...';
                try {
                    const sanitizedName = sizeGuideFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const storageRef = ref(storage, `settings/size_guide_${Date.now()}_${sanitizedName}`);
                    await uploadBytes(storageRef, sizeGuideFile);
                    settings.sizeGuideUrl = await getDownloadURL(storageRef);
                    if (statusEl) statusEl.innerHTML = '<span style="color:green"><i class="fas fa-check"></i> Fichier prêt</span>';
                } catch (err) {
                    console.error("Size Guide Upload Failed:", err);
                    showAlert("Erreur lors de l'envoi du guide de tailles: " + err.message, "error");
                    if (statusEl) statusEl.innerHTML = '<span style="color:red">Échec de l\'envoi</span>';
                    saveSettingsBtn.disabled = false;
                    saveSettingsBtn.innerHTML = '<i class="fas fa-save"></i> Sauvegarder Tout';
                    return; // Stop here if upload fails
                }
            } else {
                // Keep existing URL if no new file selected
                const existingPreview = document.querySelector('#size-guide-preview-admin a');
                if (existingPreview) settings.sizeGuideUrl = existingPreview.href;
            }

            // Use a fixed ID 'current_season' for easy retrieval
            await setDoc(doc(db, "settings", "current_season"), settings);

            // Clear file input
            document.getElementById('setting-size-guide').value = '';

            await loadSettings(); // REFRESH UI
            showAlert("Configuration sauvegardée avec succès !", "success");

        } catch (e) {
            console.error(e);
            showAlert("Erreur de sauvegarde: " + e.message, "error");
        } finally {
            saveSettingsBtn.disabled = false;
            saveSettingsBtn.innerHTML = '<i class="fas fa-save"></i> Sauvegarder Tout';
        }
    });
}

async function loadSettings() {
    try {
        const data = dataCache.settings?.current_season;

        if (data) {
            document.getElementById('reg-status-toggle').checked = data.registrationOpen || false;
            document.getElementById('reg-target-season').value = data.targetSeason || 'Été';
            document.getElementById('reg-target-year').value = data.targetYear || '2025';

            if (quillWelcome) {
                quillWelcome.root.innerHTML = data.welcomeMessage || '';
            }

            document.getElementById('setting-discount-2').value = data.discount2nd || 15;
            document.getElementById('setting-discount-3').value = data.discount3rd || 20;
            document.getElementById('setting-cost-short-buy').value = data.costShortBuy || 20;
            document.getElementById('setting-cost-short-rent').value = data.costShortRent || 5;
            document.getElementById('setting-cost-socks').value = data.costSocks || 10;

            const tbody = document.getElementById('pricing-tbody');
            tbody.innerHTML = '';
            if (data.pricingGrid && Array.isArray(data.pricingGrid)) {
                // Sort by year desc (if numbers) or keep order
                data.pricingGrid.forEach(item => addPriceRow(item));
            }

            // Display Size Guide Link
            const sizePreview = document.getElementById('size-guide-preview-admin');
            if (sizePreview) {
                if (data.sizeGuideUrl) {
                    sizePreview.innerHTML = `
                        <div style="display:flex; align-items:center; gap:10px; background:white; padding:10px; border-radius:6px; border:1px solid #ccc;">
                            <i class="fas fa-file-download" style="font-size:1.5rem; color:var(--primary);"></i>
                            <div style="flex:1;">
                                <div style="font-weight:600; font-size:0.9rem;">Guide actuel</div>
                                <a href="${data.sizeGuideUrl}" target="_blank" style="font-size:0.8rem; color:var(--primary);">Voir / Télécharger</a>
                            </div>
                        </div>
                    `;
                } else {
                    sizePreview.innerHTML = '<p style="font-size:0.85rem; color:#888; font-style:italic;">Aucun guide de tailles configuré.</p>';
                }
            }

            // Apply Calendar Settings from Firestore if present
            if (data.calendarConfig) {
                window.calendarSettings.startHour = data.calendarConfig.startHour || 8;
                window.calendarSettings.endHour = data.calendarConfig.endHour || 22;
                window.calendarSettings.slotDuration = data.calendarConfig.slotDuration || 15;
                window.calendarSettings.defaultDuration = data.calendarConfig.defaultDuration || 60;
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
const btnDeleteMatch = document.getElementById('btn-delete-match');

if (btnDeleteMatch) {
    btnDeleteMatch.addEventListener('click', async () => {
        const id = document.getElementById('match-id').value;
        if (!id) return;

        if (await showConfirm("Êtes-vous sûr de vouloir supprimer ce match ? Cette action est irréversible.")) {
            try {
                setLoading(btnDeleteMatch.parentElement, true);
                await deleteDoc(doc(db, "matches", id));
                matchModal.classList.remove('active');
                loadMatches();
            } catch (err) {
                console.error("Error deleting match:", err);
                showAlert("Erreur lors de la suppression: " + err.message, "error");
            } finally {
                setLoading(btnDeleteMatch.parentElement, false);
            }
        }
    });
}

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
        const fieldsData = Object.values(dataCache.fields || {});

        fieldsData.sort((a, b) => a.name.localeCompare(b.name));

        sel.innerHTML = '<option value="">Ajouter un terrain...</option>';
        fieldsData.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
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
        showAlert('Veuillez sélectionner un terrain', 'warning');
        return;
    }

    if (selectedMatchFields.includes(fieldId)) {
        showAlert('Ce terrain est déjà ajouté', 'warning');
        return;
    }

    selectedMatchFields.push(fieldId);
    renderMatchFieldTags();
    sel.value = ''; // Reset selection
});

async function loadRefereesIntoSelects(matchData = null) {
    // Populate the 3 selects with referee names
    const refereesData = Object.values(dataCache.referees || {});

    refereesData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Get list of available refs for this match
    const availableRefs = matchData?.availableRefs || [];

    // Helper to fill a select
    const fillSelect = (id) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        // Keep first option
        sel.innerHTML = '<option value="">-- Non assigné --</option>';
        refereesData.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id; // Store ID

            let name = r.name;
            if (availableRefs.includes(r.id)) {
                name += " (DISPO)";
            }
            opt.textContent = name;
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
            endTime: document.getElementById('match-end-time').value,
            type: document.getElementById('match-type').value,
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
        const newStart = timeToMinutes(data.time);
        const newEnd = timeToMinutes(data.endTime || data.time);

        if (selectedMatchFields.length > 0 && dataCache.matches) {
            const conflictFieldIds = getConflictFieldIds(selectedMatchFields);
            const conflicts = Object.values(dataCache.matches).filter(m => {
                if (m.id === id) return false;
                if (m.date !== data.date) return false;

                const matchFieldIds = m.fieldIds || (m.fieldId ? [m.fieldId] : []);
                const hasFieldOverlap = matchFieldIds.some(mfid => conflictFieldIds.includes(mfid));
                if (!hasFieldOverlap) return false;

                const mStart = timeToMinutes(m.time);
                const mEnd = timeToMinutes(m.endTime || m.time);
                return (newStart < mEnd && newEnd > mStart);
            });

            if (conflicts.length > 0) {
                const conflictMsg = conflicts.map(c => `- ${c.time}-${c.endTime || c.time} : ${c.category} vs ${c.opponent}`).join('\n');
                if (!await showConfirm(`⚠️ CONFLIT D'HORAIRE !\n\nIl y a déjà des matchs sur ces terrains :\n${conflictMsg}\n\nSauvegarder quand même ?`)) {
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
        showAlert("Erreur: " + (err.message || err), "error");
    } finally {
        setLoading(form, false);
    }
});

async function loadMatches(skipFetch = false) {
    const list = document.getElementById('matches-list');
    const calEl = document.getElementById('calendar');

    if (!calEl) return;

    // Permissions check for UI elements
    const addBtn = document.getElementById('open-match-modal');
    if (addBtn) addBtn.style.display = window.currentUserRefereeId ? 'none' : 'block';

    try {
        // We rely on dataCache.matches, dataCache.referees, dataCache.fields being populated
        // by the centralized onSnapshot listeners in initRealTimeListeners.

        const activeFields = Object.values(dataCache.fields).filter(f => f.active !== false && !f.isCombined);
        activeFields.sort((a, b) => a.name.localeCompare(b.name));

        if (activeFields.length === 0) {
            calEl.innerHTML = '<div class="alert alert-warning">Veuillez configurer au moins un terrain actif pour voir le calendrier.</div>';
            return;
        }

        // 3. Render Custom Grid
        renderCustomCalendarGrid(calEl, activeFields);

    } catch (e) {
        console.error("Error loading matches:", e);
        calEl.innerHTML = `<div class="alert alert-danger">Erreur: ${e.message}</div>`;
    }

    // List View (Sync Cache)
    if (list) {
        list.innerHTML = '';
        Object.values(dataCache.matches).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).forEach(data => {
            const getRefName = (rid) => (rid && dataCache.referees[rid]) ? dataCache.referees[rid].name : 'non assigné';
            const subtitle = `
                <div style="font-size:0.85rem; text-align:left; margin-top:5px;">
                    <strong><i class="fas fa-clock"></i> ${data.date} à ${data.time}</strong><br>
                    Vs ${data.opponent} (${data.category})<br>
                    Terrain(s): ${data.fields || 'Non spécifié'}
                </div>
            `;
            const card = createCard(null, `${data.category} vs ${data.opponent}`, subtitle, data.id, 'edit-match', 'delete-match', 'fa-futbol');
            card.classList.add('match-card');

            // Add Dispo button in list view for referees
            if (window.currentUserRefereeId) {
                const isAvailable = (data.availableRefs || []).includes(window.currentUserRefereeId);
                const dispoBtn = document.createElement('button');
                dispoBtn.className = `btn-dispo ${isAvailable ? 'btn-dispo-active' : 'btn-dispo-inactive'}`;
                dispoBtn.innerHTML = isAvailable ? '<i class="fas fa-check"></i> Dispo' : 'Dispo ?';
                dispoBtn.style.cssText = 'width: 100%; margin-top: 10px; padding: 8px; font-size: 0.8rem;';
                dispoBtn.onclick = (e) => {
                    e.stopPropagation();
                    toggleMatchAvailability(data.id);
                };
                card.querySelector('.card-body').appendChild(dispoBtn);
            }

            list.appendChild(card);
        });
        if (!window.currentUserRefereeId) {
            setupClickableCard('.match-card', 'matches', 'match-modal', 'match-id', async (data) => {
                await loadRefereesIntoSelects();
                await loadFieldsIntoAddSelect();
                document.getElementById('match-date').value = data.date;
                document.getElementById('match-time').value = data.time;
                document.getElementById('match-category').value = data.category;
                document.getElementById('match-opponent').value = data.opponent;
                selectedMatchFields = data.fieldIds || (data.fieldId ? [data.fieldId] : []);
                renderMatchFieldTags();
                document.getElementById('match-ref-center').value = data.refCenter || '';
                document.getElementById('match-ref-asst1').value = data.refAsst1 || '';
                document.getElementById('match-ref-asst2').value = data.refAsst2 || '';
                document.getElementById('match-played').checked = data.played || false;
            });
            setupDeleteButton('.delete-match', 'matches', () => loadMatches());
        }
    }
}

function renderCustomCalendarGrid(container, fields) {
    container.innerHTML = '';

    // Header with Navigation
    const nav = document.createElement('div');
    nav.className = 'calendar-nav';
    nav.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; background:white; padding:15px; border-radius:12px; box-shadow:0 2px 4px rgba(0,0,0,0.05);';

    const weekRange = getWeekRange(window.calendarCurrentDate || new Date());
    nav.innerHTML = `
        <div style="display:flex; gap:10px;">
            <button class="btn-action" id="cal-prev"><i class="fas fa-chevron-left"></i></button>
            <button class="btn-action" id="cal-today">Aujourd'hui</button>
            <button class="btn-action" id="cal-next"><i class="fas fa-chevron-right"></i></button>
        </div>
        <h3 style="margin:0; text-transform: capitalize;">Semaine du ${weekRange.start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</h3>
        <div>
            ${!window.currentUserRefereeId ? '<button class="btn-action" id="cal-settings-btn"><i class="fas fa-cog"></i> Config</button>' : ''}
        </div>
    `;
    container.appendChild(nav);

    // Nav Events
    nav.querySelector('#cal-prev').onclick = () => { window.calendarCurrentDate.setDate(window.calendarCurrentDate.getDate() - 7); loadMatches(); };
    nav.querySelector('#cal-next').onclick = () => { window.calendarCurrentDate.setDate(window.calendarCurrentDate.getDate() + 7); loadMatches(); };
    nav.querySelector('#cal-today').onclick = () => { window.calendarCurrentDate = new Date(); loadMatches(); };

    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'calendar-grid-wrapper';
    container.appendChild(gridWrapper);

    // Render 7 Days
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(weekRange.start);
        dayDate.setDate(dayDate.getDate() + i);
        renderDaySection(gridWrapper, dayDate, fields);
    }
}

function renderDaySection(container, date, fields) {
    const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' });
    const isoDate = date.toISOString().split('T')[0];

    const section = document.createElement('div');
    section.className = 'day-section';

    let tableHtml = `
        <div class="day-header">
            <span>${dayName.charAt(0).toUpperCase() + dayName.slice(1)}</span>
        </div>
        <table class="day-grid-table">
            <thead>
                <tr>
                    <th class="time-col-header">Heure</th>
                    ${fields.map(f => `<th>${f.name}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
    `;

    // Time Slots
    const settings = window.calendarSettings || { startHour: 8, endHour: 22, slotDuration: 15 };
    for (let h = settings.startHour; h < settings.endHour; h++) {
        for (let m = 0; m < 60; m += settings.slotDuration) {
            const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            tableHtml += `
                <tr data-time="${timeStr}">
                    <td class="time-label">${m === 0 ? `<strong>${h}h00</strong>` : `<small>${h}h${m}</small>`}</td>
                    ${fields.map(f => `<td class="grid-cell" data-field-id="${f.id}" data-date="${isoDate}" data-time="${timeStr}"></td>`).join('')}
                </tr>
            `;
        }
    }

    tableHtml += `</tbody></table>`;
    section.innerHTML = tableHtml;
    container.appendChild(section);

    // Place Matches
    Object.values(dataCache.matches).forEach(match => {
        if (match.date === isoDate) {
            const matchFieldIds = match.fieldIds || (match.fieldId ? [match.fieldId] : []);

            // For each match, we check which columns it should appear in (either as match or as unavailable)
            fields.forEach(colField => {
                let isDirectMatch = matchFieldIds.includes(colField.id);
                let isParentMatch = false; // Match is on a combined field containing this colField
                let isChildMatch = false; // Match is on a child of this combined colField

                // Check overlap
                matchFieldIds.forEach(mfid => {
                    const mField = dataCache.fields[mfid];
                    // Case 1: Match is on Combined, Col is Constituent (SHOW MATCH)
                    if (mField?.isCombined && mField.constituentFieldIds?.includes(colField.id)) {
                        isParentMatch = true;
                    }
                    // Case 2: Col is Combined, Match is on Constituent (SHOW UNAVAILABLE/LINKED)
                    if (colField.isCombined && colField.constituentFieldIds?.includes(mfid)) {
                        isChildMatch = true;
                    }
                });

                // We show full match if it's direct OR if it's a parent match (displayed on constituent col)
                const shouldRenderAsMatch = isDirectMatch || isParentMatch;
                // It is ghost only if it is a child match AND NOT explicitly a match (though logic implies mutually exclusive usually)
                const isGhostConflict = isChildMatch && !shouldRenderAsMatch;

                if (shouldRenderAsMatch || isGhostConflict) {
                    const cell = section.querySelector(`td[data-field-id="${colField.id}"][data-time="${match.time}"]`);
                    if (!cell) return;

                    const evt = document.createElement('div');
                    evt.className = 'grid-event-wrapper';
                    if (isGhostConflict) evt.classList.add('ghost-event');

                    const startMins = timeToMinutes(match.time);
                    const endMins = timeToMinutes(match.endTime || match.time);
                    const duration = Math.max(settings.slotDuration, endMins - startMins);
                    const heightFactor = duration / settings.slotDuration;

                    evt.style.height = `calc(${heightFactor} * 100% - 4px)`;
                    evt.style.minHeight = `calc(100% - 4px)`;

                    // Color based on type
                    const mType = isGhostConflict ? 'unavailable' : (match.type || 'match');

                    if (mType === 'practice') {
                        evt.style.background = '#e67e22'; // Orange
                        evt.style.borderLeft = '4px solid #d35400';
                        evt.style.color = 'white';
                    } else if (mType === 'unavailable') {
                        evt.style.background = '#7f8c8d'; // Gray
                        evt.style.borderLeft = '4px solid #2c3e50';
                        evt.style.color = 'white';
                        evt.style.opacity = isGhostConflict ? '0.6' : '0.9';
                    } else {
                        evt.style.background = 'var(--primary)';
                        evt.style.borderLeft = '4px solid #1e8449';
                        evt.style.color = 'white';
                    }

                    let eventTitle = isGhostConflict ? 'Indisponible' : `${match.category} vs ${match.opponent}`;
                    let eventMeta = isGhostConflict ? '<i class="fas fa-link"></i> Terrain occupé' : `<i class="fas fa-user"></i> ${match.refCenter ? 'Arbitres OK' : 'Pas d\'arbitre'}`;

                    if (!isGhostConflict) {
                        if (mType === 'practice') {
                            eventTitle = `Pratique (${match.category})`;
                            eventMeta = '<i class="fas fa-running"></i> Entraînement';
                        } else if (mType === 'unavailable') {
                            eventTitle = 'Indisponible';
                            eventMeta = '<i class="fas fa-ban"></i> Fermé';
                        }
                    } else {
                        // For ghost events, maybe show what's occupying it
                        const occupationSource = matchFieldIds.map(fid => dataCache.fields[fid]?.name || 'Auto').join(', ');
                        eventMeta = `<small><i class="fas fa-link"></i> Groupé avec ${occupationSource}</small>`;
                    }

                    evt.innerHTML = `
                        <div class="grid-event-title" style="${isGhostConflict ? 'font-size:0.7rem; font-style:italic;' : ''}">${eventTitle}</div>
                        <div class="grid-event-meta">${eventMeta}</div>
                        ${!isGhostConflict ? '<div class="resize-handle"></div>' : ''}
                    `;

                    if (!isGhostConflict) {
                        // If simple referee or arbitre role, show availability toggle
                        if (window.currentUserRefereeId || window.currentUserMainRole === 'arbitre-general') {
                            const isAvailable = (match.availableRefs || []).includes(window.currentUserRefereeId);
                            const dispoBtn = document.createElement('button');
                            dispoBtn.className = `btn-dispo ${isAvailable ? 'btn-dispo-active' : 'btn-dispo-inactive'}`;
                            dispoBtn.innerHTML = isAvailable ? '<i class="fas fa-check"></i> Dispo' : 'Dispo ?';
                            dispoBtn.title = "Indiquer ma disponibilité pour ce match";
                            dispoBtn.style.cssText = 'margin-top:auto; font-size:0.7rem; padding:6px; z-index:20;';

                            dispoBtn.onclick = (e) => {
                                e.stopPropagation();
                                if (window.currentUserRefereeId) {
                                    toggleMatchAvailability(match.id);
                                } else {
                                    showAlert("Votre compte administrateur n'est pas lié à un profil d'arbitre.", "warning");
                                }
                            };
                            evt.appendChild(dispoBtn);
                        }

                        evt.onclick = (e) => {
                            e.stopPropagation();
                            if (evt.dataset.preventClick === 'true') {
                                evt.dataset.preventClick = 'false';
                                return;
                            }
                            // Redirect to toggle availability for referees, open modal for others
                            if (window.currentUserRefereeId || window.currentUserMainRole === 'arbitre-general') {
                                if (window.currentUserRefereeId) {
                                    toggleMatchAvailability(match.id);
                                }
                                // If arbitre but not linked to a referee profile, just block modal
                            } else {
                                openMatchModal(match);
                            }
                        };

                        setupMatchInteractions(evt, match, isoDate);
                    } else {
                        evt.style.cursor = 'not-allowed';
                        evt.title = "Ce terrain est indisponible car il est lié à un autre terrain occupé.";
                    }

                    cell.appendChild(evt);
                }
            });
        }
    });

    // Cell Click (Create)
    section.querySelectorAll('.grid-cell').forEach(cell => {
        cell.onclick = () => {
            const isArbitre = window.currentUserMainRole === 'arbitre-general' || window.currentUserRefereeId;
            if (isArbitre) return; // Referees and Arbitres cannot create matches
            if (cell.children.length > 0) return; // Already has event
            openMatchModal(null, isoDate, cell.dataset.time, cell.dataset.fieldId);
        };
    });
}

// --- Conflict & Group Helpers ---
function getConflictFieldIds(fieldIds) {
    const conflictIds = new Set(fieldIds);
    const allFields = Object.values(dataCache.fields || {});

    fieldIds.forEach(fid => {
        const field = dataCache.fields[fid];
        if (!field) return;

        // If it's a group, all its constituents are in conflict
        if (field.isCombined && field.constituentFieldIds) {
            field.constituentFieldIds.forEach(cid => conflictIds.add(cid));
        }

        // Any group that contains this field is in conflict
        allFields.forEach(f => {
            if (f.isCombined && f.constituentFieldIds && f.constituentFieldIds.includes(fid)) {
                conflictIds.add(f.id);
            }
        });
    });

    return Array.from(conflictIds);
}

// --- Time Helpers ---
function timeToMinutes(time) {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(mins) {
    mins = Math.max(0, Math.min(1439, mins));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// --- Drag & Resize Support ---
function setupMatchInteractions(el, match, date) {
    if (window.currentUserRefereeId) {
        el.style.cursor = 'pointer';
        return; // No drag/resize for referees
    }

    let isDragging = false;
    let isResizing = false;
    let hasMoved = false;
    let startY, startH, initialX, initialY;

    el.onmousedown = (e) => {
        if (e.target.classList.contains('resize-handle')) {
            isResizing = true;
            startY = e.pageY;
            startH = el.offsetHeight;
            e.preventDefault();
            e.stopPropagation();
        } else if (e.target.tagName !== 'BUTTON') {
            isDragging = true;
            hasMoved = false;
            initialX = e.clientX;
            initialY = e.clientY;
            // Don't add dragging class immediately to avoid visual jump on simple click
            e.preventDefault();
            e.stopPropagation();
        }
    };

    window.addEventListener('mousemove', (e) => {
        if (isResizing) {
            const diff = e.pageY - startY;
            if (Math.abs(diff) > 3) hasMoved = true;
            const slotPixels = el.parentElement.offsetHeight || 35;
            const newH = startH + diff;
            const snappedH = Math.max(slotPixels, Math.round(newH / slotPixels) * slotPixels);
            el.style.height = (snappedH - 4) + 'px';
        } else if (isDragging) {
            const dx = e.clientX - initialX;
            const dy = e.clientY - initialY;

            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                if (!hasMoved) {
                    hasMoved = true;
                    el.classList.add('dragging');
                }
                el.style.transform = `translate(${dx}px, ${dy}px)`;
                el.style.zIndex = "1000";

                // Visual Cue: Highlight target cell
                el.style.pointerEvents = 'none';
                const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
                el.style.pointerEvents = '';

                // Remove previous highlights
                document.querySelectorAll('.grid-cell.drop-target').forEach(c => c.classList.remove('drop-target'));

                const cell = dropTarget?.closest('.grid-cell');
                if (cell) {
                    cell.classList.add('drop-target');
                }
            }
        }
    });

    window.addEventListener('mouseup', async (e) => {
        if (isResizing) {
            isResizing = false;
            if (hasMoved) el.dataset.preventClick = 'true';

            if (hasMoved) {
                const settings = window.calendarSettings || { slotDuration: 15 };
                const slotPixels = el.parentElement.offsetHeight || 35;
                const newDurationSlots = Math.round(el.offsetHeight / slotPixels);
                const durationMins = newDurationSlots * settings.slotDuration;
                const startMins = timeToMinutes(match.time);
                const newEndTime = minutesToTime(startMins + durationMins);

                if (newEndTime !== match.endTime) {
                    match.endTime = newEndTime;
                    loadMatches(true);
                    await updateDoc(doc(db, "matches", match.id), { endTime: newEndTime });
                }
            }
        } else if (isDragging) {
            isDragging = false;
            if (hasMoved) el.dataset.preventClick = 'true';
            el.classList.remove('dragging');
            el.style.transform = '';
            el.style.zIndex = "";

            if (hasMoved) {
                // Remove highlights
                document.querySelectorAll('.grid-cell.drop-target').forEach(c => c.classList.remove('drop-target'));

                // Find cell under mouse
                el.style.pointerEvents = 'none';
                const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
                el.style.pointerEvents = '';

                const cell = dropTarget?.closest('.grid-cell');
                if (cell) {
                    const newTime = cell.dataset.time;
                    const newFieldId = cell.dataset.fieldId;
                    const newDate = cell.dataset.date;

                    if (newTime !== match.time || !match.fieldIds.includes(newFieldId) || newDate !== match.date) {
                        const durationMins = timeToMinutes(match.endTime || match.time) - timeToMinutes(match.time);
                        const newStartMins = timeToMinutes(newTime);
                        const newEndTimeStr = minutesToTime(newStartMins + Math.max(15, durationMins));

                        // Optimistic UI update
                        match.time = newTime;
                        match.endTime = newEndTimeStr;
                        match.date = newDate;
                        match.fieldIds = [newFieldId];
                        loadMatches(true);

                        // For now, replace fieldIds if moved (simplification)
                        await updateDoc(doc(db, "matches", match.id), {
                            time: newTime,
                            endTime: newEndTimeStr,
                            date: newDate,
                            fieldIds: [newFieldId]
                        });
                    }
                }
            }
        }
    });
}

function openMatchModal(data = null, date = null, time = null, fieldId = null) {
    const form = document.getElementById('match-form');
    if (form) form.reset();
    document.getElementById('match-id').value = data ? data.id : '';

    // Show/Hide delete button
    const btnDelete = document.getElementById('btn-delete-match');
    if (btnDelete) {
        btnDelete.style.display = data ? 'block' : 'none';
    }

    if (data) {
        document.getElementById('match-date').value = data.date;
        document.getElementById('match-time').value = data.time;
        document.getElementById('match-end-time').value = data.endTime || '';
        document.getElementById('match-type').value = data.type || 'match';
        document.getElementById('match-category').value = data.category;
        document.getElementById('match-opponent').value = data.opponent;
        selectedMatchFields = data.fieldIds || (data.fieldId ? [data.fieldId] : []);
        document.getElementById('match-ref-center').value = data.refCenter || '';
        document.getElementById('match-ref-asst1').value = data.refAsst1 || '';
        document.getElementById('match-ref-asst2').value = data.refAsst2 || '';
        document.getElementById('match-played').checked = data.played || false;
    } else {
        document.getElementById('match-date').value = date || '';
        document.getElementById('match-type').value = 'match';
        document.getElementById('match-time').value = time || '18:00';

        // Default end time using settings
        if (time) {
            const [h, m] = time.split(':').map(Number);
            const duration = window.calendarSettings.defaultDuration || 60;
            const endMins = (h * 60 + m) + duration;
            document.getElementById('match-end-time').value = minutesToTime(endMins);
        } else {
            const duration = window.calendarSettings.defaultDuration || 60;
            const endMins = (18 * 60) + duration;
            document.getElementById('match-end-time').value = minutesToTime(endMins);
        }

        selectedMatchFields = fieldId ? [fieldId] : [];
    }

    loadRefereesIntoSelects(data).then(() => {
        loadFieldsIntoAddSelect().then(() => {
            renderMatchFieldTags();
            document.getElementById('match-modal').classList.add('active');
        });
    });
}

function getWeekRange(d) {
    const date = new Date(d);
    const day = date.getDay(); // 0 is Sunday
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    const start = new Date(date.setDate(diff));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end };
}

async function toggleMatchAvailability(matchId) {
    if (!window.currentUserRefereeId) return;

    try {
        const matchRef = doc(db, "matches", matchId);
        const matchSnap = await getDoc(matchRef);
        if (!matchSnap.exists()) return;

        const data = matchSnap.data();
        let availableRefs = data.availableRefs || [];

        if (availableRefs.includes(window.currentUserRefereeId)) {
            // Remove
            availableRefs = availableRefs.filter(id => id !== window.currentUserRefereeId);
        } else {
            // Add
            availableRefs.push(window.currentUserRefereeId);
        }

        await updateDoc(matchRef, { availableRefs });
        loadMatches(); // Refresh UI
    } catch (e) {
        console.error("Error toggling availability:", e);
        showAlert("Erreur lors de la mise à jour de la disponibilité.", "error");
    }
}

// --- Calendar Settings Modal Logic ---
const calendarSettingsModal = document.getElementById('calendar-settings-modal');
const calendarSettingsForm = document.getElementById('calendar-settings-form');

document.addEventListener('click', (e) => {
    if (e.target.id === 'cal-settings-btn' || e.target.closest('#cal-settings-btn')) {
        document.getElementById('cal-set-start').value = window.calendarSettings.startHour;
        document.getElementById('cal-set-end').value = window.calendarSettings.endHour;
        document.getElementById('cal-set-slot').value = window.calendarSettings.slotDuration;
        document.getElementById('cal-set-duration').value = window.calendarSettings.defaultDuration || 60;
        calendarSettingsModal.classList.add('active');
    }
});

if (calendarSettingsModal) {
    calendarSettingsModal.querySelector('.close-modal').onclick = () => calendarSettingsModal.classList.remove('active');
}

calendarSettingsForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const startHour = parseInt(document.getElementById('cal-set-start').value);
    const endHour = parseInt(document.getElementById('cal-set-end').value);
    const slotDuration = parseInt(document.getElementById('cal-set-slot').value);
    const defaultDuration = parseInt(document.getElementById('cal-set-duration').value);

    // 1. Update Global State
    window.calendarSettings.startHour = startHour;
    window.calendarSettings.endHour = endHour;
    window.calendarSettings.slotDuration = slotDuration;
    window.calendarSettings.defaultDuration = defaultDuration;

    // 2. Persist to Firestore (in general settings)
    try {
        const docRef = doc(db, "settings", "current_season");
        await updateDoc(docRef, {
            calendarConfig: { startHour, endHour, slotDuration, defaultDuration }
        });
        console.log("Calendar settings saved to Firestore");
    } catch (err) {
        console.error("Error saving calendar settings:", err);
    }

    calendarSettingsModal.classList.remove('active');
    loadMatches(); // Refresh grid
});
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
        showAlert("Erreur: " + (err.message || err), "error");
    } finally {
        setLoading(form, false);
    }
});

async function loadSponsors() {
    const list = document.getElementById('sponsors-list');
    if (!list) return;

    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) {
        list.classList.add('view-grid');
    }

    const sponsors = Object.values(dataCache.sponsors || {});

    list.innerHTML = '';

    if (sponsors.length === 0) {
        list.innerHTML = '<p>Aucun commanditaire.</p>';
        return;
    }

    sponsors.sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(data => {
        const id = data.id;
        const subtitle = data.visible !== false ? '<span style="color:green">Visible</span>' : '<span style="color:red">Caché</span>';
        const card = createCard(data.imageUrl, data.name, subtitle, id, 'edit-sponsor', 'delete-sponsor', 'fa-handshake', true);

        // Ensure strictly sponsor-card class
        card.classList.add('sponsor-card');
        card.classList.remove('team-card'); // Prevent conflicting listeners

        card.setAttribute('data-id', id);
        list.appendChild(card);
    });

    // Use specific selector to avoid global interference
    setupClickableCard('#sponsors-list .sponsor-card', 'sponsors', 'sponsor-modal', 'sponsor-id', (data) => {
        document.getElementById('sponsor-name').value = data.name;
        document.getElementById('sponsor-url').value = data.url || '';
        document.getElementById('sponsor-visible').checked = data.visible !== false;
        setExistingPreview('sponsor-image-preview', data.imageUrl);
    });
    setupDeleteButton('.delete-sponsor', 'sponsors', () => loadSponsors());
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
        showAlert("Erreur: " + (err.message || err), "error");
    } finally {
        setLoading(form, false);
    }
});

async function loadSeasons() {
    const list = document.getElementById('seasons-list');
    if (!list) return;

    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) list.classList.add('view-grid');

    const seasons = Object.values(dataCache.seasons || {});

    list.innerHTML = '';

    if (seasons.length === 0) {
        list.innerHTML = '<p>Aucune saison trouvée.</p>';
        return;
    }

    seasons.sort((a, b) => (b.year || 0) - (a.year || 0)).forEach(data => {

        const icon = data.type === 'summer' ? 'fa-sun' : 'fa-snowflake';
        const color = data.type === 'summer' ? '#f39c12' : '#3498db';
        const status = data.active ? '<span style="color:var(--success); font-weight:bold;">Active</span>' : 'Terminée';

        const subtitle = `
                <span style="color:${color}"><i class="fas ${icon}"></i> ${data.type === 'summer' ? 'Été' : 'Hiver'}</span><br>
                ${data.start} - ${data.end}<br>
                ${status}
            `;

        // We assume createCard handles null image URL by showing the iconClass
        const card = createCard(null, data.name, subtitle, data.id, 'edit-season', 'delete-season', 'fa-calendar-alt');
        card.setAttribute('data-id', data.id);
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
                    // Get Teams for this season from cache
                    const teams = Object.values(dataCache.teams || {}).filter(t => t.seasonId === seasonId);

                    teamsListEl.innerHTML = '';
                    let playerCount = 0;
                    let teamIds = [];

                    if (teams.length === 0) {
                        teamsListEl.innerHTML = '<p style="color:#888; font-style:italic;">Aucune équipe pour cette saison.</p>';
                        document.getElementById('season-stats-teams').textContent = "0";
                        document.getElementById('season-team-count-badge').textContent = "0 équipes";
                        document.getElementById('season-stats-players').textContent = "0";
                    } else {
                        document.getElementById('season-stats-teams').textContent = teams.length;
                        document.getElementById('season-team-count-badge').textContent = `${teams.length} équipes`;

                        teams.forEach(tData => {
                            const tDocId = tData.id;
                            teamIds.push(tDocId);
                            const div = document.createElement('div');
                            div.style.padding = '8px 12px';
                            div.style.borderBottom = '1px solid #eee';
                            div.style.background = '#fff';
                            div.style.marginBottom = '5px';
                            div.style.borderRadius = '6px';
                            div.innerHTML = `<strong><i class="fas fa-shield-alt"></i> ${tData.name}</strong> <span style="font-size:0.8rem; color:#888; margin-left:10px;">${tData.category}</span>`;
                            teamsListEl.appendChild(div);
                        });

                        // Calculate Player Count from cache
                        const players = Object.values(dataCache.players || {});
                        const seasonPlayers = players.filter(p => teamIds.includes(p.teamId)).length;
                        document.getElementById('season-stats-players').textContent = seasonPlayers;
                    }

                    // Matches stats & Preview
                    const matchesListEl = document.getElementById('season-matches-list');
                    matchesListEl.innerHTML = '<p>Recherche des matchs...</p>';

                    try {
                        // Filter matches from cache by date Range
                        const matches = Object.values(dataCache.matches || {}).filter(m =>
                            m.date >= data.start && m.date <= data.end
                        );
                        matchesListEl.innerHTML = '';

                        if (matches.length === 0) {
                            matchesListEl.innerHTML = '<p style="color:#888; font-style:italic;">Aucun match trouvé pour ces dates.</p>';
                            document.getElementById('season-stats-matches').textContent = "0";
                            document.getElementById('season-stats-progress').textContent = "0%";
                        } else {
                            document.getElementById('season-stats-matches').textContent = matches.length;

                            // Calculate progress (matches with score vs total)
                            let playedCount = 0;
                            matches.forEach(mData => {
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

                            const progress = matches.length > 0 ? Math.round((playedCount / matches.length) * 100) : 0;
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
}

// --- FIELDS LOGIC ---


async function populateFieldSelect(selectedId = null) {
    const select = document.getElementById('match-field');
    if (!select) return;

    select.innerHTML = '<option value="">Sélectionner un terrain...</option>';

    const fields = Object.values(dataCache.fields || {});
    fields.forEach(data => {
        const option = document.createElement('option');
        option.value = data.id;
        option.textContent = (data.isCombined ? '[COMBINÉ] ' : '') + data.name;
        if (selectedId && data.id === selectedId) option.selected = true;
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

        // Reset combined fields UI
        const combinedCheckbox = document.getElementById('field-is-combined');
        if (combinedCheckbox) combinedCheckbox.checked = false;
        const constituentsContainer = document.getElementById('field-constituents-container');
        if (constituentsContainer) constituentsContainer.style.display = 'none';

        populateConstituentsList([]);

        fieldModal.classList.add('active');
    });
}

// Toggle constituents visibility
document.getElementById('field-is-combined')?.addEventListener('change', (e) => {
    const container = document.getElementById('field-constituents-container');
    if (container) container.style.display = e.target.checked ? 'block' : 'none';
    if (e.target.checked) populateConstituentsList([]);
});

function populateConstituentsList(selectedIds = []) {
    const list = document.getElementById('field-constituents-list');
    if (!list) return;

    list.innerHTML = '';
    const currentId = document.getElementById('field-id').value;

    // Only show non-combined fields as potential constituents
    const fields = Object.values(dataCache.fields || {})
        .filter(f => !f.isCombined && f.id !== currentId && f.active !== false);

    if (fields.length === 0) {
        list.innerHTML = '<p style="font-size: 0.8rem; color: #888;">Aucun terrain simple disponible.</p>';
        return;
    }

    fields.sort((a, b) => a.name.localeCompare(b.name)).forEach(f => {
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 0.85rem;';
        const isChecked = selectedIds.includes(f.id);
        div.innerHTML = `
            <input type="checkbox" class="constituent-checkbox" value="${f.id}" id="const-${f.id}" ${isChecked ? 'checked' : ''} style="width: auto; margin: 0;">
            <label for="const-${f.id}" style="margin: 0; cursor: pointer;">${f.name}</label>
        `;
        list.appendChild(div);
    });
}

if (fieldModal) {
    fieldModal.querySelector('.close-modal').addEventListener('click', () => fieldModal.classList.remove('active'));
}

document.getElementById('field-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('field-id').value;
    const isCombined = document.getElementById('field-is-combined')?.checked || false;
    const constituentFieldIds = [];
    if (isCombined) {
        document.querySelectorAll('.constituent-checkbox:checked').forEach(cb => {
            constituentFieldIds.push(cb.value);
        });
        if (constituentFieldIds.length < 2) {
            showAlert("Veuillez sélectionner au moins 2 terrains pour un groupe combiné.", "warning");
            setLoading(form, false);
            return;
        }
    }

    const data = {
        name: document.getElementById('field-name').value,
        location: document.getElementById('field-location').value,
        type: document.getElementById('field-type').value,
        isCombined: isCombined,
        constituentFieldIds: constituentFieldIds
    };

    const form = e.target;
    setLoading(form, true);
    try {
        await uploadAndSave('fields', id, data, null);
        fieldModal.classList.remove('active');
        loadFields();
    } catch (err) {
        console.error("Error saving field:", err);
        showAlert("Erreur lors de l'enregistrement: " + err.message, "error");
    } finally {
        setLoading(form, false);
    }
});


async function loadFields() {
    const list = document.getElementById('fields-list');
    if (!list) return;

    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) list.classList.add('view-grid');

    try {
        const fields = Object.values(dataCache.fields || {});
        list.innerHTML = '';

        if (fields.length === 0) {
            list.innerHTML = '<p>Aucun terrain configuré.</p>';
            return;
        }

        fields.sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(data => {
            const id = data.id;
            const isCombined = data.isCombined === true;
            const subtitle = `
                ${isCombined ? '<span class="badge" style="background:#6c5ce7; color:white; margin-bottom:5px; font-size:0.7rem;">COMBINÉ</span><br>' : ''}
                ${data.type || '-'} <br>
                <small>${data.location || ''}</small>
            `;
            const card = createCard(null, data.name, subtitle, id, 'edit-field', 'delete-field', isCombined ? 'fa-layer-group' : 'fa-map-marker-alt');
            list.appendChild(card);
        });

        // Setup Edit/Delete Handlers
        setupClickableCard('#fields-list .product-card-admin', 'fields', 'field-modal', 'field-id', (data) => {
            document.getElementById('field-name').value = data.name;
            document.getElementById('field-location').value = data.location || '';
            document.getElementById('field-type').value = data.type || 'gazon';

            const isCombined = data.isCombined === true;
            const combinedCheckbox = document.getElementById('field-is-combined');
            if (combinedCheckbox) {
                combinedCheckbox.checked = isCombined;
                const container = document.getElementById('field-constituents-container');
                if (container) container.style.display = isCombined ? 'block' : 'none';
            }
            populateConstituentsList(data.constituentFieldIds || []);
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

// --- NAVIGATION HANDLER (Modified to init modules) ---
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Toggle active class
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Hide all views
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

        // Show target
        const target = btn.dataset.target;
        document.getElementById(target).classList.add('active');

        // Init specific modules if needed
        if (target === 'view-email-campaigns') {
            if (typeof initCampaignModule === 'function') initCampaignModule();
            if (typeof loadCampaigns === 'function') loadCampaigns('all');
        }

        if (target === 'view-billing') {
            if (typeof loadBilling === 'function') loadBilling();
        }
    });
});


// --- DASHBOARD PLAYERS MODAL ---
const dashboardPlayersCard = document.getElementById('dashboard-players-card');
const playersListModal = document.getElementById('players-list-modal');

if (dashboardPlayersCard && playersListModal) {
    dashboardPlayersCard.addEventListener('click', () => {
        playersListModal.classList.add('active');
        const buffer = document.getElementById('modal-players-list');
        buffer.innerHTML = '';

        try {
            const players = Object.values(dataCache.players || {});
            let count = 0;

            // Sort
            players.sort((a, b) => {
                const nA = (a.name || a.lastName || '').toLowerCase();
                const nB = (b.name || b.lastName || '').toLowerCase();
                return nA.localeCompare(nB);
            });

            players.forEach(p => {
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

// --- CONFIGURATION SUB-TABS ---
const configTabContainer = document.getElementById('config-tabs-container');
if (configTabContainer) {
    const tabs = configTabContainer.querySelectorAll('.tab-link');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-tab');

            // Remove active class from all tabs and contents in this container
            tabs.forEach(t => t.classList.remove('active'));
            configTabContainer.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // Add active class to selected tab and content
            tab.classList.add('active');
            const targetEl = document.getElementById(target);
            if (targetEl) targetEl.classList.add('active');

            // Fix Quill editor if switching to Inscriptions tab
            if (target === 'config-inscriptions' && typeof quillWelcome !== 'undefined' && quillWelcome) {
                // Quill might need a focus/update if it was hidden
            }
        });
    });
}

// --- GLOBAL POPUPS ---
// Exposed for use in other modules (like email-campaigns.js)
window.showPrompt = function (message, defaultValue = '') {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-prompt-modal');
        if (!modal) {
            // Fallback
            return resolve(prompt(message, defaultValue));
        }

        const msgEl = document.getElementById('prompt-message');
        const inputEl = document.getElementById('prompt-input');
        const btnOk = document.getElementById('prompt-ok-btn');
        const btnCancel = document.getElementById('prompt-cancel-btn');

        if (msgEl) msgEl.textContent = message;
        if (inputEl) inputEl.value = defaultValue;

        modal.classList.add('active');
        if (inputEl) {
            setTimeout(() => inputEl.focus(), 50);
        }

        // Clean listeners
        const newOk = btnOk.cloneNode(true);
        btnOk.parentNode.replaceChild(newOk, btnOk);

        const newCancel = btnCancel.cloneNode(true);
        btnCancel.parentNode.replaceChild(newCancel, btnCancel);

        // Attach new listeners
        newOk.addEventListener('click', () => {
            const val = inputEl ? inputEl.value : '';
            modal.classList.remove('active');
            resolve(val);
        });

        newCancel.addEventListener('click', () => {
            modal.classList.remove('active');
            resolve(null);
        });

        // Enter key
        if (inputEl) {
            inputEl.onkeydown = (e) => {
                if (e.key === 'Enter') newOk.click();
                if (e.key === 'Escape') newCancel.click();
            };
        }
    });
};

// Initialize modules
if (typeof window.initAutomationsModule === 'function') {
    window.initAutomationsModule();
}
if (typeof window.initCampaignModule === 'function') {
    window.initCampaignModule();
}
