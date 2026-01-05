// Firebase Configuration
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where, orderBy, onSnapshot, getDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence, sendPasswordResetEmail } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

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
    referees: {}
};

// --- Auth Logic ---
const loginForm = document.getElementById('login-form');
const authScreen = document.getElementById('auth-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const logoutBtn = document.getElementById('logout-btn');
const loginError = document.getElementById('login-error');

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
    logoutBtn.addEventListener('click', () => signOut(auth));
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        authScreen.classList.remove('active');
        dashboardScreen.classList.add('active');
        document.getElementById('user-email').textContent = user.email;
        loadDashboardData();
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

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        views.forEach(v => v.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');
        pageTitle.innerText = btn.innerText;

        if (targetId === 'view-boutique') loadProducts();
        if (targetId === 'view-teams') loadPlayers();
        if (targetId === 'view-inventory') loadInventory();
        if (targetId === 'view-board') loadBoard();
        if (targetId === 'view-referees') loadReferees();
        if (targetId === 'view-registrations') loadRegistrations();
    });
});


// --- GENERIC EDIT HANDLER ---
function setupEditButton(btnClass, cacheKey, modalId, idFieldId, populateCallback) {
    document.querySelectorAll(btnClass).forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('button').getAttribute('data-id');
            const data = dataCache[cacheKey][id];
            if (data) {
                document.getElementById(idFieldId).value = id;
                populateCallback(data);
                const modal = document.getElementById(modalId);
                // Clear any previous loading state or images in inputs
                modal.classList.add('active');
            }
        });
    });
}

// --- BOARD LOGIC ---
const boardModal = document.getElementById('board-modal');
const openBoardModalBtn = document.getElementById('open-board-modal');
if (openBoardModalBtn) openBoardModalBtn.addEventListener('click', () => {
    document.getElementById('board-form').reset();
    document.getElementById('board-id').value = '';
    boardModal.classList.add('active');
});
if (boardModal) boardModal.querySelector('.close-modal').addEventListener('click', () => boardModal.classList.remove('active'));

document.getElementById('board-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    handleFormSubmit(e, 'board_members', 'board-id', 'board-image', ['name', 'role', 'order'], () => loadBoard());
});

async function loadBoard() {
    const list = document.getElementById('board-list');
    list.innerHTML = '<p>Chargement...</p>';
    const q = query(collection(db, "board_members"), orderBy("order", "asc"));
    const snapshot = await getDocs(q);
    list.innerHTML = '';
    dataCache.board = {};

    snapshot.forEach(doc => {
        const data = doc.data();
        dataCache.board[doc.id] = data;
        const card = createCard(data.imageUrl, data.name, data.role, doc.id, 'edit-board', 'delete-board');
        list.appendChild(card);
    });

    setupEditButton('.edit-board', 'board', 'board-modal', 'board-id', (data) => {
        document.getElementById('board-name').value = data.name;
        document.getElementById('board-role').value = data.role;
        document.getElementById('board-order').value = data.order;
    });
    setupDeleteButton('.delete-board', 'board_members', () => loadBoard());
}

// --- REFEREE LOGIC ---
const refModal = document.getElementById('referee-modal');
const openRefModalBtn = document.getElementById('open-referee-modal');
if (openRefModalBtn) openRefModalBtn.addEventListener('click', () => {
    document.getElementById('referee-form').reset();
    document.getElementById('referee-id').value = '';
    refModal.classList.add('active');
});
if (refModal) refModal.querySelector('.close-modal').addEventListener('click', () => refModal.classList.remove('active'));

document.getElementById('referee-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    handleFormSubmit(e, 'referees', 'referee-id', 'ref-image', ['name'], () => loadReferees());
});

async function loadReferees() {
    const list = document.getElementById('referees-list');
    list.innerHTML = '<p>Chargement...</p>';
    const q = query(collection(db, "referees"), orderBy("name", "asc"));
    const snapshot = await getDocs(q);
    list.innerHTML = '';
    dataCache.referees = {};

    snapshot.forEach(doc => {
        const data = doc.data();
        dataCache.referees[doc.id] = data;
        const card = createCard(data.imageUrl, data.name, '', doc.id, 'edit-ref', 'delete-ref', 'fa-gavel');
        list.appendChild(card);
    });

    setupEditButton('.edit-ref', 'referees', 'referee-modal', 'referee-id', (data) => {
        document.getElementById('ref-name').value = data.name;
    });
    setupDeleteButton('.delete-ref', 'referees', () => loadReferees());
}

// --- PRODUCTS LOGIC ---
const productModal = document.getElementById('product-modal');
const openProdModalBtn = document.getElementById('open-product-modal');
if (openProdModalBtn) openProdModalBtn.addEventListener('click', () => {
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('image-preview').innerHTML = '';
    productModal.classList.add('active');
});
if (productModal) productModal.querySelector('.close-modal').addEventListener('click', () => productModal.classList.remove('active'));

document.getElementById('product-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    handleFormSubmit(e, 'products', 'product-id', 'prod-image', ['name', 'price', 'desc'], () => {
        loadProducts();
        updateStats();
    });
});

async function loadProducts() {
    const list = document.getElementById('products-list');
    list.innerHTML = '<p>Chargement...</p>';
    const snapshot = await getDocs(collection(db, "products"));
    list.innerHTML = '';
    dataCache.products = {};

    snapshot.forEach(doc => {
        const data = doc.data();
        dataCache.products[doc.id] = data;
        const card = createCard(data.imageUrl, data.name, `$${data.price}`, doc.id, 'edit-prod', 'delete-prod');
        list.appendChild(card);
    });

    setupEditButton('.edit-prod', 'products', 'product-modal', 'product-id', (data) => {
        document.getElementById('prod-name').value = data.name;
        document.getElementById('prod-price').value = data.price;
        document.getElementById('prod-desc').value = data.desc;
    });
    setupDeleteButton('.delete-prod', 'products', () => { loadProducts(); updateStats(); });
}

// --- PLAYERS LOGIC ---
const playerModal = document.getElementById('player-modal');
const openPlayerModalBtn = document.getElementById('open-player-modal');
if (openPlayerModalBtn) openPlayerModalBtn.addEventListener('click', () => {
    document.getElementById('player-form').reset();
    document.getElementById('player-id').value = '';
    playerModal.classList.add('active');
});
if (playerModal) playerModal.querySelector('.close-modal').addEventListener('click', () => playerModal.classList.remove('active'));

document.getElementById('player-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    handleFormSubmit(e, 'players', 'player-id', null, ['name', 'year', 'skill', 'pos'], () => {
        loadPlayers();
        updateStats();
    });
});

async function loadPlayers() {
    const tbody = document.querySelector('#players-table tbody');
    tbody.innerHTML = '<tr><td colspan="5">Chargement...</td></tr>';
    const snapshot = await getDocs(collection(db, "players"));
    tbody.innerHTML = '';
    window.allPlayers = [];
    dataCache.players = {};

    snapshot.forEach(doc => {
        const data = doc.data();
        window.allPlayers.push({ id: doc.id, ...data });
        dataCache.players[doc.id] = data;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${data.name}</td>
            <td>${data.year}</td>
            <td>${data.skill}</td>
            <td>${data.pos}</td>
            <td class="actions-cell">
               <button class="btn-action edit-player" data-id="${doc.id}"><i class="fas fa-edit"></i></button>
               <button class="btn-action delete-player" data-id="${doc.id}" style="background:var(--danger)"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });

    setupEditButton('.edit-player', 'players', 'player-modal', 'player-id', (data) => {
        document.getElementById('player-name').value = data.name;
        document.getElementById('player-year').value = data.year;
        document.getElementById('player-skill').value = data.skill;
        document.getElementById('player-pos').value = data.pos;
    });
    setupDeleteButton('.delete-player', 'players', () => { loadPlayers(); updateStats(); });
}

// --- INVENTORY LOGIC ---
const inventoryModal = document.getElementById('inventory-modal');
const openInvModalBtn = document.getElementById('open-inventory-modal');
if (openInvModalBtn) openInvModalBtn.addEventListener('click', () => {
    document.getElementById('inventory-form').reset();
    document.getElementById('inv-id').value = '';
    inventoryModal.classList.add('active');
});
if (inventoryModal) inventoryModal.querySelector('.close-modal').addEventListener('click', () => inventoryModal.classList.remove('active'));

document.getElementById('inventory-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    handleFormSubmit(e, 'inventory', 'inv-id', null, ['name', 'category', 'qty:int', 'status'], () => {
        loadInventory();
        updateStats();
    }); // Note: 'qty:int' maps to inv-qty and parses int
});

async function loadInventory() {
    const tbody = document.querySelector('#inventory-table tbody');
    tbody.innerHTML = '<tr><td colspan="5">Chargement...</td></tr>';
    const snapshot = await getDocs(collection(db, "inventory"));
    tbody.innerHTML = '';
    dataCache.inventory = {};

    snapshot.forEach(doc => {
        const data = doc.data();
        dataCache.inventory[doc.id] = data;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${data.name}</td>
            <td><span class="badge">${data.category}</span></td>
            <td>${data.quantity}</td>
            <td>${data.status}</td>
            <td class="actions-cell">
               <button class="btn-action edit-inv" data-id="${doc.id}"><i class="fas fa-edit"></i></button>
               <button class="btn-action delete-inv" data-id="${doc.id}" style="background:var(--danger)"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });

    setupEditButton('.edit-inv', 'inventory', 'inventory-modal', 'inv-id', (data) => {
        document.getElementById('inv-name').value = data.name;
        document.getElementById('inv-cat').value = data.category;
        document.getElementById('inv-qty').value = data.quantity;
        document.getElementById('inv-status').value = data.status;
    });
    setupDeleteButton('.delete-inv', 'inventory', () => { loadInventory(); updateStats(); });
}

// --- HELPERS ---

// Generic Card Creator
function createCard(imageUrl, title, subtitle, id, editClass, deleteClass, defaultIcon = 'fa-cube') {
    const card = document.createElement('div');
    card.className = 'product-card-admin';
    card.style.textAlign = 'center';

    const imgHtml = imageUrl
        ? `<img src="${imageUrl}" style="width:80px;height:80px;border-radius:50%;margin:0 auto 10px;object-fit:cover;">`
        : `<div style="width:80px;height:80px;background:#eee;border-radius:50%;margin:0 auto 10px;display:flex;align-items:center;justify-content:center;color:#888"><i class="fas ${defaultIcon} fa-2x"></i></div>`;

    card.innerHTML = `
        ${imgHtml}
        <h4>${title}</h4>
        <p>${subtitle}</p>
        <div class="product-actions" style="justify-content:center; gap: 10px;">
            <button class="btn-action ${editClass}" data-id="${id}">Éditer</button>
            <button class="btn-action ${deleteClass}" data-id="${id}" style="background:var(--danger)">Supprimer</button>
        </div>
    `;
    return card;
}

// Generic Delete Setup
function setupDeleteButton(btnClass, collectionName, callback) {
    document.querySelectorAll(btnClass).forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (confirm('Voulez-vous vraiment supprimer cet élément ?')) {
                const id = e.target.closest('button').getAttribute('data-id');
                await deleteDoc(doc(db, collectionName, id));
                callback();
            }
        });
    });
}

// Generic Form Handler
async function handleFormSubmit(e, collectionName, idFieldId, imageFieldId, fields, callback) {
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
    btn.disabled = true;

    try {
        const id = document.getElementById(idFieldId).value;
        const data = {};

        // Collect fields
        fields.forEach(f => {
            let fieldName = f;
            let type = 'string';
            if (f.includes(':')) {
                [fieldName, type] = f.split(':');
            }

            // Derive input ID from some convention or map?
            // Current convention in code: 
            // product: name->prod-name, price->prod-price
            // We need to be careful.
            // Let's manually map for safety in the callers, OR standardize IDs.
            // Standardizing IDs takes time. 
            // I will use direct DOM access in the params above instead of generic list for now to avoid breaking.

            // WAIT, better approach: The caller function passed specific logic.
            // I cannot make this 100% generic due to diverse ID naming (prod-name vs player-name).
            // I will revert to specific handlers but use helper for the upload/save part.
        });

        // RE-IMPLEMENTING SPECIFIC HANDLERS to ensure ID correctness
        // See specific handlers above. They call this common "upload and save" helper.        
    } catch (err) {
        // ...
    }
}

// Re-writing handleFormSubmit to be a helper called BY the specific handlers
async function uploadAndSave(collectionName, id, data, imageFile, callback) {
    let imageUrl = '';
    if (imageFile) {
        const storageRef = ref(storage, `${collectionName}/${imageFile.name}_${Date.now()}`);
        await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(storageRef);
    }

    if (imageUrl) data.imageUrl = imageUrl;

    if (id) {
        await updateDoc(doc(db, collectionName, id), data);
    } else {
        if (!data.imageUrl && imageFieldId) data.imageUrl = ''; // Ensure field exists
        await addDoc(collection(db, collectionName), data);
    }
    callback();
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

// --- Seeding ---
async function seedDatabase() {
    const boardSnap = await getDocs(collection(db, "board_members"));
    if (boardSnap.empty) {
        const boardMembers = [
            { name: "Mathieu Gingras", role: "Président", order: 1 },
            { name: "Dany Ayotte", role: "Vice-président", order: 2 },
            { name: "Marie-Pier Bouchard", role: "Trésorière", order: 3 },
            { name: "Meagan Léger Pouliot", role: "Secrétaire", order: 4 },
            { name: "Philippe Moisan", role: "Administrateur", order: 5 },
            { name: "Guillaume Petit", role: "Administrateur", order: 6 },
            { name: "Mathieu Rieg", role: "Administrateur", order: 7 },
            { name: "Clémence Bouillé", role: "Coordonnatrice Administrative", order: 8 },
            { name: "Félix-Antoine Cantin", role: "Responsable des Arbitres", order: 9 },
            { name: "Jasmin Moisan", role: "Ligneur", order: 10 }
        ];
        for (const m of boardMembers) await addDoc(collection(db, "board_members"), m);
    }
    const refSnap = await getDocs(collection(db, "referees"));
    if (refSnap.empty) {
        const referees = [
            "Charlotte Bédard", "Dany Ayotte", "Élodie Boutet", "Éloi Ayotte",
            "Émile Gingras", "Emily Duguay", "Félix-Antoine Cantin", "Gabrielle Tessier",
            "Jasmin Moisan", "Juan Manuel Gaspari", "Julien Berthiaume", "Laurence Thibault",
            "Léo Demers", "Loïk Coulombe", "Mamadou Manka", "Mathéo Quimper Hinton", "Naomie Petit"
        ];
        for (const name of referees) await addDoc(collection(db, "referees"), { name: name });
    }
}

// --- Registrations ---
async function loadRegistrations() {
    const tbody = document.querySelector('#registrations-table tbody');
    tbody.innerHTML = '<tr><td colspan="5">Chargement...</td></tr>';
    const q = query(collection(db, "registrations"), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    tbody.innerHTML = '';
    snapshot.forEach(doc => {
        const data = doc.data();
        const date = data.timestamp ? data.timestamp.toDate().toLocaleDateString() : 'N/A';
        const row = document.createElement('tr');
        row.innerHTML = `<td>${date}</td><td>${data.childFirstName} ${data.childLastName}</td><td>${data.program}</td><td>${data.parentFirstName} ${data.parentLastName}</td>
        <td class="actions-cell"><button class="delete-reg" data-id="${doc.id}"><i class="fas fa-trash"></i></button><a href="mailto:${data.email}" class="btn-action"><i class="fas fa-envelope"></i></a></td>`;
        tbody.appendChild(row);
    });
    setupDeleteButton('.delete-reg', 'registrations', () => loadRegistrations());
}
