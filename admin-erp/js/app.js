// Firebase Configuration
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, setDoc, getDoc, query, where, orderBy, enableIndexedDbPersistence, serverTimestamp } from "firebase/firestore";
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

// Enable Offline Persistence for Firestore
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code == 'unimplemented') {
        console.warn('Persistence not supported by browser');
    }
});

// --- Global Cache for Editing ---
const dataCache = {
    products: {},
    inventory: {},
    players: {},
    board: {},
    referees: {},
    registrations: {},
    coaches: {},
    admins: {}
};

// --- Auth Logic ---
const loginForm = document.getElementById('login-form');
const authScreen = document.getElementById('auth-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
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
        const generateTeamsBtn = document.getElementById('generate-teams-btn');
        if (generateTeamsBtn) {
            generateTeamsBtn.addEventListener('click', async () => {
                const user = auth.currentUser;
                if (!user) return;

                const roles = await getUserRole(user.email);
                if (roles && roles.includes('SuperAdmin')) {
                    alert("Génération des équipes en cours... (Fonctionnalité complète à venir)");
                } else {
                    alert("Accès refusé. Seuls les super administrateurs peuvent générer des équipes.");
                }
            });
        }

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

        if (targetId === 'view-boutique') loadProducts();
        if (targetId === 'view-teams') loadTeams(); // Use new loadTeams instead of loadPlayers
        if (targetId === 'view-players') loadPlayersDirectory();
        if (targetId === 'view-inventory') loadInventory();
        if (targetId === 'view-board') loadBoard();
        if (targetId === 'view-referees') loadReferees();
        if (targetId === 'view-registrations') loadRegistrations();
        if (targetId === 'view-coaches') loadCoaches();
        if (targetId === 'view-settings') loadSettings();
        if (targetId === 'view-matches') loadMatches();
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
function setupClickableCard(cardSelector, cacheKey, modalId, idFieldId, populateCallback) {
    document.querySelectorAll(cardSelector).forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete') ||
                e.target.closest('.delete-board') ||
                e.target.closest('.delete-ref') ||
                e.target.closest('.delete-prod') ||
                e.target.closest('.delete-player') ||
                e.target.closest('.delete-inv') ||
                e.target.closest('.delete-reg') ||
                e.target.closest('a')) {
                return;
            }

            const id = card.getAttribute('data-id');
            const data = dataCache[cacheKey][id];

            if (data) {
                document.getElementById(idFieldId).value = id;
                populateCallback(data);
                const modal = document.getElementById(modalId);
                const form = modal.querySelector('form');
                if (form) setLoading(form, false);
                modal.classList.add('active');
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
        const file = document.getElementById('board-image').files[0];

        if (file && file.size > 5 * 1024 * 1024) throw new Error("L'image est trop volumineuse (Max 5MB).");

        const data = { name, role, order, visible };
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
        const displayName = isInactive ? `${data.name} <small style="color:red">(Inactif)</small>` : data.name;

        const card = createCard(data.imageUrl, displayName, data.role, data.id, 'edit-board', 'delete-board');
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

        const data = { name, visible };
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

        // Populate Match Select (Upcoming only ?) - Let's show all sorted desc
        matchSelect.innerHTML = '<option value="">Choisir un match...</option>';
        dataCache.allMatches.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
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

    await populateCoachSelect('team-coach');
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
        items.push({ id: key, name: dataCache.coaches[key].name });
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
        items.push({ id: key, name: dataCache.seasons[key].name });
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

document.getElementById('team-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(form, true);

    try {
        const id = document.getElementById('team-id').value;
        const data = {
            name: document.getElementById('team-name').value,
            category: document.getElementById('team-category').value,
            coachId: document.getElementById('team-coach').value,
            seasonId: document.getElementById('team-season').value
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

async function loadTeams() {
    const list = document.getElementById('teams-list');
    if (!list) return;
    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) list.classList.add('view-grid');

    list.innerHTML = '<p>Chargement...</p>';

    try {
        await populateCoachSelect('team-coach');
        await populateSeasonSelect('team-season');

        const snapshot = await getDocs(collection(db, "teams"));
        list.innerHTML = '';
        dataCache.teams = {};

        const pSnap = await getDocs(collection(db, "players"));
        const teamCounts = {};
        pSnap.forEach(p => {
            const pd = p.data();
            if (pd.teamId) {
                teamCounts[pd.teamId] = (teamCounts[pd.teamId] || 0) + 1;
            }
        });

        if (snapshot.empty) {
            list.innerHTML = '<p>Aucune équipe trouvée.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            dataCache.teams[doc.id] = data;

            let coachName = 'Non assigné';
            if (data.coachId && dataCache.coaches[data.coachId]) {
                coachName = dataCache.coaches[data.coachId].name;
            }

            const count = teamCounts[doc.id] || 0;
            let seasonName = 'Aucune saison';
            if (data.seasonId && dataCache.seasons[data.seasonId]) {
                seasonName = dataCache.seasons[data.seasonId].name;
            }

            const subtitle = `<span style="color:#666;">${data.category}</span><br><i class="fas fa-calendar-alt"></i> ${seasonName}<br><i class="fas fa-user-tie"></i> ${coachName}<br><i class="fas fa-users"></i> ${count} Joueurs`;

            const card = createCard(null, data.name, subtitle, doc.id, 'edit-team', 'delete-team', 'fa-shield-alt');
            card.setAttribute('data-id', doc.id);
            card.classList.add('team-card');
            list.appendChild(card);
        });

        setupClickableCard('.team-card', 'teams', 'team-modal', 'team-id', async (data) => {
            console.log('Team card clicked, data:', data);

            document.getElementById('team-name').value = data.name;
            document.getElementById('team-category').value = data.category || 'U9-U10';
            await populateCoachSelect('team-coach', data.coachId);
            await populateSeasonSelect('team-season', data.seasonId);

            // Find team ID
            let teamId = null;
            Object.keys(dataCache.teams).forEach(k => { if (dataCache.teams[k] === data) teamId = k; });
            console.log('Team ID:', teamId);

            // Load all players for the selector (force reload to ensure fresh data)
            console.log('Loading players from Firestore...');
            try {
                const allPlayersSnap = await getDocs(collection(db, "players"));
                dataCache.allPlayers = [];
                allPlayersSnap.forEach(p => {
                    dataCache.allPlayers.push({ id: p.id, ...p.data() });
                });

                console.log('Loaded players:', dataCache.allPlayers.length);
                console.log('Players data:', dataCache.allPlayers);

                // Populate player selector with unassigned players
                const playerSelect = document.getElementById('team-add-player-select');
                console.log('Player select element:', playerSelect);

                if (playerSelect && teamId) {
                    playerSelect.innerHTML = '<option value="">Ajouter un joueur...</option>';

                    // Filter players not in this team
                    const availablePlayers = dataCache.allPlayers.filter(p => p.teamId !== teamId);
                    console.log('Available players (not in team):', availablePlayers.length);

                    availablePlayers.sort((a, b) => a.name.localeCompare(b.name));

                    availablePlayers.forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.id;
                        opt.textContent = `${p.name} (${p.pos || 'N/A'})`;
                        playerSelect.appendChild(opt);
                    });

                    console.log('Player select populated with', availablePlayers.length, 'players');
                } else {
                    console.warn('Player select not found or teamId is null', { playerSelect, teamId });
                }
            } catch (error) {
                console.error('Error loading players:', error);
            }

            // Function to render players list
            const renderPlayersList = async () => {
                const plList = document.getElementById('team-players-list');
                if (!plList || !teamId) return;

                plList.innerHTML = '<p>Chargement...</p>';

                const q = query(collection(db, "players"), where("teamId", "==", teamId));
                const snap = await getDocs(q);
                plList.innerHTML = '';

                if (snap.empty) {
                    plList.innerHTML = '<p style="color:#888; font-style:italic;">Aucun joueur.</p>';
                } else {
                    snap.forEach(p => {
                        const pd = p.data();
                        const div = document.createElement('div');
                        div.style.padding = '8px';
                        div.style.borderBottom = '1px solid #eee';
                        div.style.display = 'flex';
                        div.style.justifyContent = 'space-between';
                        div.style.alignItems = 'center';
                        div.innerHTML = `
                            <span><i class="fas fa-user"></i> ${pd.name} <span style="color:#888; font-size:0.8rem;">(${pd.pos})</span></span>
                            <button type="button" class="remove-player-btn" data-player-id="${p.id}" 
                                style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">
                                <i class="fas fa-times"></i>
                            </button>
                        `;
                        plList.appendChild(div);
                    });

                    // Add event listeners to remove buttons
                    plList.querySelectorAll('.remove-player-btn').forEach(btn => {
                        btn.addEventListener('click', async () => {
                            const playerId = btn.getAttribute('data-player-id');
                            const confirmed = await showConfirm('Retirer ce joueur de l\'équipe ?');
                            if (!confirmed) return;

                            try {
                                await updateDoc(doc(db, "players", playerId), { teamId: '' });

                                // Update cache
                                const playerIndex = dataCache.allPlayers.findIndex(p => p.id === playerId);
                                if (playerIndex !== -1) {
                                    dataCache.allPlayers[playerIndex].teamId = '';
                                }

                                // Refresh displays
                                await renderPlayersList();

                                // Refresh player selector
                                playerSelect.innerHTML = '<option value="">Ajouter un joueur...</option>';
                                const availablePlayers = dataCache.allPlayers.filter(p => p.teamId !== teamId);
                                availablePlayers.sort((a, b) => a.name.localeCompare(b.name));
                                availablePlayers.forEach(p => {
                                    const opt = document.createElement('option');
                                    opt.value = p.id;
                                    opt.textContent = `${p.name} (${p.pos || 'N/A'})`;
                                    playerSelect.appendChild(opt);
                                });

                                showAlert('Joueur retiré avec succès !', 'success');
                            } catch (e) {
                                console.error(e);
                                showAlert('Erreur : ' + e.message, 'error');
                            }
                        });
                    });
                }
            };

            // Initial render
            await renderPlayersList();

            // Add player button handler
            const addPlayerBtn = document.getElementById('btn-add-player-to-team');
            if (addPlayerBtn) {
                addPlayerBtn.onclick = async () => {
                    const playerSelect = document.getElementById('team-add-player-select');
                    const playerId = playerSelect.value;
                    if (!playerId) return showAlert('Veuillez sélectionner un joueur.', 'warning');

                    try {
                        await updateDoc(doc(db, "players", playerId), { teamId: teamId });

                        // Update cache
                        const playerIndex = dataCache.allPlayers.findIndex(p => p.id === playerId);
                        if (playerIndex !== -1) {
                            dataCache.allPlayers[playerIndex].teamId = teamId;
                        }

                        // Refresh displays
                        await renderPlayersList();

                        // Refresh player selector
                        playerSelect.innerHTML = '<option value="">Ajouter un joueur...</option>';
                        const availablePlayers = dataCache.allPlayers.filter(p => p.teamId !== teamId);
                        availablePlayers.sort((a, b) => a.name.localeCompare(b.name));
                        availablePlayers.forEach(p => {
                            const opt = document.createElement('option');
                            opt.value = p.id;
                            opt.textContent = `${p.name} (${p.pos || 'N/A'})`;
                            playerSelect.appendChild(opt);
                        });

                        showAlert('Joueur ajouté avec succès !', 'success');
                    } catch (e) {
                        console.error(e);
                        showAlert('Erreur : ' + e.message, 'error');
                    }
                };
            }
        });

        setupDeleteButton('.delete-team', 'teams', () => loadTeams());
    } catch (e) {
        console.error("Error loading teams:", e);
        list.innerHTML = `<p style="color:red">Erreur lors du chargement des équipes: ${e.message}</p>`;
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
        items.push({ id: key, ...dataCache.teams[key] });
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


document.getElementById('player-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
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

        playerModal.classList.remove('active');
        loadPlayers(); // Refresh Teams View
        loadPlayersDirectory(); // Refresh Directory View
        updateStats();
    } catch (err) {
        console.error(err);
        alert("Erreur: " + (err.message || err));
    } finally {
        setLoading(form, false);
    }
});

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

async function loadPlayersDirectory() {
    const list = document.getElementById('players-directory-list');
    if (!list) return;

    if (!list.classList.contains('view-grid') && !list.classList.contains('view-list')) list.classList.add('view-grid');
    list.innerHTML = '<p>Chargement...</p>';

    const snapshot = await getDocs(collection(db, "players"));
    list.innerHTML = '';
    dataCache.players = {};

    snapshot.forEach(doc => {
        const data = doc.data();
        dataCache.players[doc.id] = data;
        const subtitle = `Niveau: ${data.skill} | ${data.pos} | ${data.year}`;
        const card = createCard(data.imageUrl, data.name, subtitle, doc.id, 'edit-player-dir', 'delete-player-dir', 'fa-user');
        card.setAttribute('data-id', doc.id);
        card.classList.add('player-dir-card');
        list.appendChild(card);
    });

    setupClickableCard('.player-dir-card', 'players', 'player-modal', 'player-id', async (data) => {
        document.getElementById('player-name').value = data.name;
        document.getElementById('player-year').value = data.year;
        document.getElementById('player-skill').value = data.skill;
        document.getElementById('player-pos').value = data.pos;
        await populateTeamSelect(data.teamId);
        setExistingPreview('player-image-preview', data.imageUrl);
    });
    setupDeleteButton('.delete-player-dir', 'players', () => { loadPlayersDirectory(); updateStats(); });
}

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

    if (startNum > endNum) {
        return showAlert('Le numéro de début doit être inférieur au numéro de fin.', 'error');
    }

    const count = endNum - startNum + 1;
    if (!confirm(`Vous allez créer ${count} articles. Continuer ?`)) return;

    const batchId = 'batch_' + Date.now();
    setLoading(form, true);

    try {
        for (let i = startNum; i <= endNum; i++) {
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
        showAlert(`${count} articles ont été créés avec succès !`, 'success');
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

            await uploadAndSave('inventory', id, data, null);
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

    const groups = {};
    const singles = [];

    items.forEach(item => {
        if (item.batchId) {
            if (!groups[item.batchId]) groups[item.batchId] = [];
            groups[item.batchId].push(item);
        } else {
            singles.push(item);
        }
    });

    // --- RENDER BATCHES ---
    Object.keys(groups).forEach(batchId => {
        const batchItems = groups[batchId];
        batchItems.sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0));

        const first = batchItems[0];
        const last = batchItems[batchItems.length - 1];
        const baseName = first.name.split(' #')[0];

        let totalQty = 0;
        let totalDistributed = 0;
        batchItems.forEach(item => {
            totalQty += (parseInt(item.quantity) || 0);
            let distributedCount = 0;
            let distributions = item.distributions || [];
            // Migration
            if ((!distributions || distributions.length === 0) && item.assignedType && item.assignedType !== 'none' && item.assignedTo) {
                distributedCount = 1;
            } else {
                distributions.forEach(d => distributedCount += (parseInt(d.qty) || 0));
            }
            totalDistributed += distributedCount;
        });

        const stockRemaining = totalQty - totalDistributed;
        const subtitle = `${first.category} | Lot #${first.number}-#${last.number} | ${first.model} | <span style="font-weight:bold;">${stockRemaining} en stock</span> / ${totalQty}`;

        const card = createCard(null, `${baseName} (Lot)`, subtitle, batchId, 'edit-inv-batch', 'delete-inv-batch', 'fa-layer-group');
        card.setAttribute('data-batch-id', batchId);
        card.classList.add('inv-batch-card');
        targetList.appendChild(card);
    });

    // --- RENDER SINGLES ---
    singles.forEach(data => {
        let distributedCount = 0;
        let distributions = data.distributions || [];

        if ((!distributions || distributions.length === 0) && data.assignedType && data.assignedType !== 'none' && data.assignedTo) {
            distributedCount = 1;
        } else {
            distributions.forEach(d => distributedCount += (parseInt(d.qty) || 0));
        }

        const stockRemaining = (parseInt(data.quantity) || 0) - distributedCount;
        let subtitle = `${data.category} | <span style="font-weight:bold;">${stockRemaining} en stock</span> / ${data.quantity} total`;
        if (distributedCount > 0) subtitle += `<br><span style="color:var(--primary); font-size:0.85rem;"><i class="fas fa-share-alt"></i> ${distributedCount} distribué(s)</span>`;

        const card = createCard(null, data.name, subtitle, data.id, 'edit-inv', 'delete-inv', 'fa-box');
        card.setAttribute('data-id', data.id);
        card.classList.add('inv-card');
        targetList.appendChild(card);
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

    // Handle batch click
    document.querySelectorAll('.inv-batch-card').forEach(card => {
        card.addEventListener('click', () => {
            const batchId = card.getAttribute('data-batch-id');
            const batchItems = items.filter(item => item.batchId === batchId);
            batchItems.sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0));
            const first = batchItems[0];

            inventoryModal.classList.add('active');
            resetInventoryModalTabs();

            document.getElementById('inv-batch-badge').style.display = 'inline-block';
            document.getElementById('inv-id').value = batchId;
            document.getElementById('inv-id').setAttribute('data-is-batch', 'true');

            document.getElementById('inv-name').value = first.name.split(' #')[0];
            document.getElementById('inv-cat').value = first.category;
            document.getElementById('inv-qty').value = batchItems.length;
            document.getElementById('inv-qty').disabled = true;
            document.getElementById('inv-status').value = first.status;
            document.getElementById('inv-model').value = first.model || "";
            document.getElementById('inv-size').value = first.size || "";
            document.getElementById('inv-number').value = "";
            document.getElementById('inv-number').disabled = true;

            document.getElementById('inv-dist-helper-form').style.display = 'none';
            document.getElementById('inv-dist-label').style.display = 'none';

            // Render batch stock management view
            renderBatchStockList(batchItems);
        });
    });

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
                <button type="button" class="btn-manage-individual" style="background: ${isDist ? '#f1f3f5' : 'var(--primary)'}; color: ${isDist ? '#495057' : 'white'}; border: none; padding: 8px 15px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; font-weight: 600; transition: transform 0.2s;">
                    ${isDist ? 'Gérer' : 'Associer'}
                </button>
            `;

            grid.appendChild(card);

            card.querySelector('.btn-manage-individual').addEventListener('click', () => {
                // To manage an individual item, we just re-open the modal as a single item
                // This is a neat trick: we find the element that corresponds to the single item and click it
                // OR we just manually trigger the single item fill logic.

                // Let's use the manual approach to be safe
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
        });

        stockEl.textContent = `Libres: ${libres} / ${batchItems.length}`;
        stockEl.style.background = libres > 0 ? 'var(--primary)' : 'var(--danger)';
    }

    function fillInventoryModal(data) {
        document.getElementById('inv-name').value = data.name;
        document.getElementById('inv-cat').value = data.category;
        document.getElementById('inv-qty').value = data.quantity;
        document.getElementById('inv-qty').disabled = false;
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

            source.sort((a, b) => a.name.localeCompare(b.name));
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

        document.getElementById('inv-name').value = data.name;
        document.getElementById('inv-cat').value = data.category;
        document.getElementById('inv-qty').value = data.quantity;
        document.getElementById('inv-status').value = data.status;
        document.getElementById('inv-model').value = data.model || "";
        document.getElementById('inv-size').value = data.size || "";
        document.getElementById('inv-number').value = data.number || "";

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

            source.sort((a, b) => a.name.localeCompare(b.name));
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

    tbody.innerHTML = '<tr><td colspan="5">Chargement...</td></tr>';
    const q = query(collection(db, "registrations"), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    tbody.innerHTML = '';
    dataCache.registrations = {};

    snapshot.forEach(doc => {
        const data = doc.data();
        dataCache.registrations[doc.id] = data;
        const date = data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().toLocaleDateString() : 'N/A';
        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.setAttribute('data-id', doc.id);
        row.className = 'reg-row';

        row.innerHTML = `<td>${date}</td><td>${data.childFirstName} ${data.childLastName}</td><td>${data.program}</td><td>${data.parentFirstName} ${data.parentLastName}</td>
        <td class="actions-cell">
            <button class="delete-reg" data-id="${doc.id}"><i class="fas fa-trash"></i></button>
            <a href="mailto:${data.email}" class="btn-action"><i class="fas fa-envelope"></i></a>
        </td>`;
        tbody.appendChild(row);
    });

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

// --- HELPERS ---

function createCard(imageUrl, title, subtitle, id, editClass, deleteClass, defaultIcon = 'fa-cube', isLogo = false) {
    const card = document.createElement('div');
    card.className = 'product-card-admin';
    card.style.textAlign = 'center';
    card.style.cursor = 'pointer';

    const imgStyle = isLogo
        ? `width:100%;height:100px;object-fit:contain;margin:0 auto 10px;`
        : `width:80px;height:80px;border-radius:50%;margin:0 auto 10px;object-fit:cover;`;

    const imgHtml = imageUrl
        ? `<img src="${imageUrl}" style="${imgStyle}">`
        : `<div style="${imgStyle}background:#eee;${isLogo ? '' : 'border-radius:50%;'}display:flex;align-items:center;justify-content:center;color:#888"><i class="fas ${defaultIcon} fa-2x"></i></div>`;

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

// Updated Helper: Returns Promise
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


// --- Rest of General Logic ---
async function updateStats() {
    const list = ['products', 'players', 'inventory'];
    for (const c of list) {
        const snap = await getDocs(collection(db, c));
        const el = document.getElementById(`stat-${c}`);
        if (el) el.innerText = snap.size;
    }
}
function loadDashboardData() { updateStats(); }

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
        const visible = document.getElementById('coach-visible').checked;
        const file = document.getElementById('coach-image').files[0];

        if (file && file.size > 5 * 1024 * 1024) throw new Error("L'image est trop volumineuse (Max 5MB).");

        const data = { name, policeExpiry, visible };
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
    if (!list.classList.contains('view-grid')) list.classList.add('view-grid');

    const q = query(collection(db, "coaches"));
    const snapshot = await getDocs(q);
    list.innerHTML = '';
    dataCache.coaches = {};

    const coachesList = [];
    snapshot.forEach(doc => {
        coachesList.push({ id: doc.id, ...doc.data() });
    });

    // Custom Sort: Active first, then Empty policeExpiry first, then chronological
    coachesList.sort((a, b) => {
        const visA = a.visible !== false;
        const visB = b.visible !== false;
        if (visA !== visB) return visA ? -1 : 1;

        const noDateA = !a.policeExpiry;
        const noDateB = !b.policeExpiry;

        if (noDateA && noDateB) return a.name.localeCompare(b.name);
        if (noDateA) return -1;
        if (noDateB) return 1;

        return new Date(a.policeExpiry) - new Date(b.policeExpiry);
    });

    coachesList.forEach(data => {
        dataCache.coaches[data.id] = data;

        let subtitle = '';
        const isInactive = data.visible === false;
        const displayName = isInactive ? `${data.name} <small style="color:red">(Inactif)</small>` : data.name;

        if (data.policeExpiry) {
            const date = new Date(data.policeExpiry);
            const today = new Date();
            const color = date < today ? 'red' : 'green';
            subtitle = `Police exp: <span style="color:${color}">${data.policeExpiry}</span>`;
        } else {
            subtitle = `<span style="color:red">Vérification police requise</span>`;
        }

        const card = createCard(data.imageUrl, displayName, subtitle, data.id, 'edit-coach', 'delete-coach', 'fa-whistle');
        card.setAttribute('data-id', data.id);
        card.classList.add('coach-card');
        if (isInactive) card.style.opacity = '0.5';
        list.appendChild(card);
    });

    setupClickableCard('.coach-card', 'coaches', 'coach-modal', 'coach-id', async (data) => {
        document.getElementById('coach-name').value = data.name;
        document.getElementById('coach-police-expiry').value = data.policeExpiry || '';
        document.getElementById('coach-visible').checked = data.visible !== false;
        setExistingPreview('coach-image-preview', data.imageUrl);

        // Load Assigned Inventory
        const invList = document.getElementById('coach-inventory-list');
        invList.innerHTML = '<p style="color:#666;">Chargement...</p>';
        try {
            const q = query(collection(db, "inventory"), where("assignedType", "==", "coach"), where("assignedTo", "==", data.id));
            const snap = await getDocs(q);
            invList.innerHTML = '';
            if (snap.empty) {
                invList.innerHTML = '<p style="color: #888; font-style: italic;">Aucun matériel assigné.</p>';
            } else {
                snap.forEach(doc => {
                    const item = doc.data();
                    const div = document.createElement('div');
                    div.style.padding = '8px';
                    div.style.borderBottom = '1px solid #eee';
                    div.style.display = 'flex';
                    div.style.justifyContent = 'space-between';
                    div.innerHTML = `
                        <div>
                            <strong>${item.name}</strong><br>
                            <span style="font-size:0.8rem; color:#666;">${item.category} (Qty: ${item.quantity})</span>
                        </div>
                        <div style="font-size:0.8rem; color:${item.status === 'Neuf' ? 'green' : 'orange'}">${item.status}</div>
                    `;
                    invList.appendChild(div);
                });
            }
        } catch (e) {
            console.error(e);
            invList.innerHTML = '<p style="color:red;">Erreur de chargement de l\'inventaire.</p>';
        }

        // Teams
        const teamList = document.getElementById('coach-teams-list');
        teamList.innerHTML = '<p style="color:#666;">Chargement...</p>';
        try {
            const q = query(collection(db, "teams"), where("coachId", "==", data.id));
            const snap = await getDocs(q);
            teamList.innerHTML = '';
            if (snap.empty) {
                teamList.innerHTML = '<p style="color: #888; font-style: italic;">Aucune équipe assignée.</p>';
            } else {
                snap.forEach(doc => {
                    const team = doc.data();
                    const div = document.createElement('div');
                    div.style.padding = '8px';
                    div.style.borderBottom = '1px solid #eee';
                    div.innerHTML = `<strong>${team.name}</strong> <span style="color:#666;">(${team.category})</span>`;
                    teamList.appendChild(div);
                });
            }
        } catch (e) {
            console.error(e);
            teamList.innerHTML = '<p style="color:red;">Erreur.</p>';
        }
    });
    setupDeleteButton('.delete-coach', 'coaches', () => loadCoaches());
}


// --- GLOBAL SETTINGS LOGIC ---
const saveSettingsBtn = document.getElementById('save-settings-btn');
const addPriceRowBtn = document.getElementById('add-price-row-btn');

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

if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
        saveSettingsBtn.disabled = true;
        saveSettingsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sauvegarde...';

        try {
            const settings = {
                registrationOpen: document.getElementById('reg-status-toggle').checked,
                welcomeMessage: document.getElementById('setting-welcome-msg').value,
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
            document.getElementById('setting-welcome-msg').value = data.welcomeMessage || '';
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

if (openMatchModalBtn) openMatchModalBtn.addEventListener('click', () => {
    document.getElementById('match-form').reset();
    document.getElementById('match-id').value = '';
    loadRefereesIntoSelects(); // Refresh referees list
    setLoading(document.getElementById('match-form'), false);
    matchModal.classList.add('active');
});

if (matchModal) matchModal.querySelector('.close-modal').addEventListener('click', () => matchModal.classList.remove('active'));

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

        const data = {
            date: document.getElementById('match-date').value,
            time: document.getElementById('match-time').value,
            category: document.getElementById('match-category').value,
            opponent: document.getElementById('match-opponent').value,
            field: document.getElementById('match-field').value,
            refCenter: document.getElementById('match-ref-center').value,
            refAsst1: document.getElementById('match-ref-asst1').value,
            refAsst2: document.getElementById('match-ref-asst2').value,
            timestamp: serverTimestamp() // To sort by creation or date? Better sort by date field in query
        };

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
                    document.getElementById('match-modal').classList.add('active');
                });
            },
            // Open Modal on Event Click (Edit)
            eventClick: (info) => {
                const matchId = info.event.id;
                if (dataCache.matches && dataCache.matches[matchId]) {
                    const data = dataCache.matches[matchId];
                    loadRefereesIntoSelects().then(() => {
                        document.getElementById('match-id').value = matchId;
                        document.getElementById('match-date').value = data.date;
                        document.getElementById('match-time').value = data.time;
                        document.getElementById('match-category').value = data.category;
                        document.getElementById('match-opponent').value = data.opponent;
                        document.getElementById('match-field').value = data.field;
                        document.getElementById('match-ref-center').value = data.refCenter || '';
                        document.getElementById('match-ref-asst1').value = data.refAsst1 || '';
                        document.getElementById('match-ref-asst2').value = data.refAsst2 || '';

                        document.getElementById('match-modal').classList.add('active');
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
                        Terrain: ${data.field}
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
        document.getElementById('match-date').value = data.date;
        document.getElementById('match-time').value = data.time;
        document.getElementById('match-category').value = data.category;
        document.getElementById('match-opponent').value = data.opponent;
        document.getElementById('match-field').value = data.field;
        document.getElementById('match-ref-center').value = data.refCenter || '';
        document.getElementById('match-ref-asst1').value = data.refAsst1 || '';
        document.getElementById('match-ref-asst2').value = data.refAsst2 || '';
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
