// Firebase Configuration
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence, sendPasswordResetEmail } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

// ... existing config code
const firebaseConfig = {
    apiKey: "AIzaSyCwJOzr9gAAyrkUAbtThkKNWJ1GcJUNx-E",
    authDomain: "celticsdelouest.firebaseapp.com",
    projectId: "celticsdelouest",
    storageBucket: "celticsdelouest.firebasestorage.app",
    messagingSenderId: "1078067192512",
    appId: "1:1078067192512:web:ae3b414f15358d1bfb8325",
    measurementId: "G-N5LFCG1QWT"
};

// Initialize
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// --- Auth Logic ---
const loginForm = document.getElementById('login-form');
const authScreen = document.getElementById('auth-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const logoutBtn = document.getElementById('logout-btn');
const loginError = document.getElementById('login-error');

// Pre-fill email if remembered
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

        if (rememberEmail) {
            localStorage.setItem('celtics_admin_email', email);
        } else {
            localStorage.removeItem('celtics_admin_email');
        }

        try {
            const mode = rememberMe ? browserLocalPersistence : browserSessionPersistence;
            await setPersistence(auth, mode);
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log("Logged in:", userCredential.user);
        } catch (error) {
            console.error("Login Error:", error);
            if (loginError) loginError.textContent = "Erreur de connexion : " + error.message;
        }
    });

    const forgotBtn = document.getElementById('forgot-password');
    if (forgotBtn) {
        forgotBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            if (!email) {
                alert("Veuillez entrer votre courriel dans le champ ci-dessus pour réinitialiser le mot de passe.");
                return;
            }
            try {
                await sendPasswordResetEmail(auth, email);
                alert("Un email de réinitialisation a été envoyé à " + email);
            } catch (error) {
                console.error(error);
                alert("Erreur: " + error.message);
            }
        });
    }
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => {
            console.log("Logged out");
        }).catch((error) => {
            console.error("Logout Error:", error);
        });
    });
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        authScreen.classList.remove('active');
        dashboardScreen.classList.add('active');
        document.getElementById('user-email').textContent = user.email;
        loadDashboardData();

        // Check for seeding
        seedDatabase();

    } else {
        dashboardScreen.classList.remove('active');
        authScreen.classList.add('active');
    }
});

// --- Navigation Logic ---
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

// --- BOARD MEMBER LOGIC ---
const boardModal = document.getElementById('board-modal');
const openBoardModalBtn = document.getElementById('open-board-modal');
const closeBoardModalBtn = boardModal ? boardModal.querySelector('.close-modal') : null;
const boardForm = document.getElementById('board-form');

if (openBoardModalBtn) {
    openBoardModalBtn.addEventListener('click', () => {
        boardForm.reset();
        document.getElementById('board-id').value = '';
        boardModal.classList.add('active');
    });
}
if (closeBoardModalBtn) closeBoardModalBtn.addEventListener('click', () => boardModal.classList.remove('active'));

if (boardForm) {
    boardForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = boardForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = 'Enregistrement...';

        try {
            const id = document.getElementById('board-id').value;
            const name = document.getElementById('board-name').value;
            const role = document.getElementById('board-role').value;
            const order = parseInt(document.getElementById('board-order').value) || 99;
            const file = document.getElementById('board-image').files[0];

            let imageUrl = '';
            if (file) {
                const storageRef = ref(storage, 'board/' + file.name + Date.now());
                await uploadBytes(storageRef, file);
                imageUrl = await getDownloadURL(storageRef);
            }

            const data = { name, role, order };
            if (imageUrl) data.imageUrl = imageUrl;

            if (id) {
                await updateDoc(doc(db, "board_members", id), data);
            } else {
                if (!data.imageUrl) data.imageUrl = '';
                await addDoc(collection(db, "board_members"), data);
            }
            boardModal.classList.remove('active');
            loadBoard();
        } catch (err) {
            console.error(err);
            alert("Erreur: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Enregistrer';
        }
    });
}

async function loadBoard() {
    const list = document.getElementById('board-list');
    if (!list) return;
    list.innerHTML = '<p>Chargement...</p>';
    const q = query(collection(db, "board_members"), orderBy("order", "asc"));
    const querySnapshot = await getDocs(q);
    list.innerHTML = '';
    querySnapshot.forEach(doc => {
        const data = doc.data();
        const card = document.createElement('div');
        card.className = 'product-card-admin';
        card.style.textAlign = 'center';

        const img = data.imageUrl ? `<img src="${data.imageUrl}" style="width:80px;height:80px;border-radius:50%;margin:0 auto 10px;object-fit:cover;">` : '<div style="width:80px;height:80px;background:#eee;border-radius:50%;margin:0 auto 10px;display:flex;align-items:center;justify-content:center"><i class="fas fa-user"></i></div>';

        card.innerHTML = `
            ${img}
            <h4>${data.name}</h4>
            <p>${data.role}</p>
            <div class="product-actions" style="justify-content:center;">
                <button class="btn-action delete-board" data-id="${doc.id}" style="background:var(--danger)">Supprimer</button>
            </div>
        `;
        list.appendChild(card);
    });

    document.querySelectorAll('.delete-board').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (confirm('Supprimer ce membre ?')) {
                await deleteDoc(doc(db, "board_members", e.target.getAttribute('data-id')));
                loadBoard();
            }
        });
    });
}

// --- REFEREE LOGIC ---
const refModal = document.getElementById('referee-modal');
const openRefModalBtn = document.getElementById('open-referee-modal');
const closeRefModalBtn = refModal ? refModal.querySelector('.close-modal') : null;
const refForm = document.getElementById('referee-form');

if (openRefModalBtn) {
    openRefModalBtn.addEventListener('click', () => {
        refForm.reset();
        document.getElementById('referee-id').value = '';
        refModal.classList.add('active');
    });
}
if (closeRefModalBtn) closeRefModalBtn.addEventListener('click', () => refModal.classList.remove('active'));

if (refForm) {
    refForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = refForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = 'Enregistrement...';

        try {
            const id = document.getElementById('referee-id').value;
            const name = document.getElementById('ref-name').value;
            const file = document.getElementById('ref-image').files[0];

            let imageUrl = '';
            if (file) {
                const storageRef = ref(storage, 'referees/' + file.name + Date.now());
                await uploadBytes(storageRef, file);
                imageUrl = await getDownloadURL(storageRef);
            }

            const data = { name };
            if (imageUrl) data.imageUrl = imageUrl;

            if (id) {
                await updateDoc(doc(db, "referees", id), data);
            } else {
                if (!data.imageUrl) data.imageUrl = '';
                await addDoc(collection(db, "referees"), data);
            }
            refModal.classList.remove('active');
            loadReferees();
        } catch (err) {
            console.error(err);
            alert("Erreur: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Enregistrer';
        }
    });
}

async function loadReferees() {
    const list = document.getElementById('referees-list');
    if (!list) return;
    list.innerHTML = '<p>Chargement...</p>';
    const q = query(collection(db, "referees"), orderBy("name", "asc"));
    const querySnapshot = await getDocs(q);
    list.innerHTML = '';

    querySnapshot.forEach(doc => {
        const data = doc.data();
        const card = document.createElement('div');
        card.className = 'product-card-admin';
        card.style.textAlign = 'center';

        const img = data.imageUrl ? `<img src="${data.imageUrl}" style="width:60px;height:60px;border-radius:50%;margin:0 auto 10px;object-fit:cover;">` : '<div style="width:60px;height:60px;background:#eee;border-radius:50%;margin:0 auto 10px;display:flex;align-items:center;justify-content:center"><i class="fas fa-whistle"></i></div>';

        card.innerHTML = `
            ${img}
            <h4>${data.name}</h4>
            <div class="product-actions" style="justify-content:center;">
                <button class="btn-action delete-ref" data-id="${doc.id}" style="background:var(--danger)">Supprimer</button>
            </div>
        `;
        list.appendChild(card);
    });

    document.querySelectorAll('.delete-ref').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (confirm('Supprimer cet arbitre ?')) {
                await deleteDoc(doc(db, "referees", e.target.getAttribute('data-id')));
                loadReferees();
            }
        });
    });
}

// --- REGISTRATIONS LOGIC ---
async function loadRegistrations() {
    const tbody = document.querySelector('#registrations-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Chargement...</td></tr>';

    const q = query(collection(db, "registrations"), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    tbody.innerHTML = '';

    snapshot.forEach(doc => {
        const data = doc.data();
        const date = data.timestamp ? data.timestamp.toDate().toLocaleDateString() : 'N/A';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${date}</td>
            <td>${data.childFirstName} ${data.childLastName}</td>
            <td>${data.program}</td>
            <td>${data.parentFirstName} ${data.parentLastName}</td>
            <td class="actions-cell">
                <button class="delete-reg" data-id="${doc.id}"><i class="fas fa-trash"></i></button>
                <a href="mailto:${data.email}" class="btn-action" style="padding:5px 10px; text-decoration:none;"><i class="fas fa-envelope"></i></a>
            </td>
        `;
        tbody.appendChild(row);
    });

    document.querySelectorAll('.delete-reg').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.closest('button').getAttribute('data-id');
            if (confirm('Supprimer cette inscription ?')) {
                await deleteDoc(doc(db, "registrations", id));
                loadRegistrations();
            }
        });
    });
}

// --- BOUTIQUE LOGIC ---
const productModal = document.getElementById('product-modal');
const openProdModalBtn = document.getElementById('open-product-modal');
const closeProdModalBtn = productModal ? productModal.querySelector('.close-modal') : null;
const productForm = document.getElementById('product-form');

if (openProdModalBtn) {
    openProdModalBtn.addEventListener('click', () => {
        productForm.reset();
        document.getElementById('product-id').value = '';
        document.getElementById('image-preview').innerHTML = '';
        productModal.classList.add('active');
    });
}
if (closeProdModalBtn) closeProdModalBtn.addEventListener('click', () => productModal.classList.remove('active'));

if (productForm) {
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = productForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        submitBtn.disabled = true;

        try {
            const id = document.getElementById('product-id').value;
            const name = document.getElementById('prod-name').value;
            const price = parseFloat(document.getElementById('prod-price').value);
            const desc = document.getElementById('prod-desc').value;
            const file = document.getElementById('prod-image').files[0];

            let imageUrl = '';
            if (file) {
                const storageRef = ref(storage, 'products/' + file.name + Date.now());
                await uploadBytes(storageRef, file);
                imageUrl = await getDownloadURL(storageRef);
            }

            if (id) {
                const docRef = doc(db, "products", id);
                const updateData = { name, price, desc };
                if (imageUrl) updateData.imageUrl = imageUrl;
                await updateDoc(docRef, updateData);
            } else {
                await addDoc(collection(db, "products"), {
                    name,
                    price,
                    desc,
                    imageUrl: imageUrl || 'https://via.placeholder.com/150'
                });
            }

            productModal.classList.remove('active');
            loadProducts();
            updateStats();

        } catch (error) {
            console.error("Error saving product: ", error);
            alert("Erreur lors de l'enregistrement: " + error.message);
        } finally {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
    });
}

async function loadProducts() {
    const list = document.getElementById('products-list');
    if (!list) return;
    list.innerHTML = '<p>Chargement...</p>';
    const querySnapshot = await getDocs(collection(db, "products"));
    list.innerHTML = '';

    querySnapshot.forEach((doc) => {
        const data = doc.data();
        const card = document.createElement('div');
        card.className = 'product-card-admin';
        card.innerHTML = `
            <img src="${data.imageUrl}" alt="${data.name}">
            <h4>${data.name}</h4>
            <p>$${data.price}</p>
            <div class="product-actions">
                <button class="btn-action edit-prod" data-id="${doc.id}">Edit</button>
                <button class="btn-action delete-prod" style="background:var(--danger)" data-id="${doc.id}">Delete</button>
            </div>
        `;
        list.appendChild(card);
    });

    document.querySelectorAll('.edit-prod').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.getAttribute('data-id');
            alert('Edit functionality ready to be linked with population logic for ID: ' + id);
            productModal.classList.add('active');
            document.getElementById('product-id').value = id;
        });
    });

    document.querySelectorAll('.delete-prod').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (confirm('Supprimer ce produit ?')) {
                await deleteDoc(doc(db, "products", e.target.getAttribute('data-id')));
                loadProducts();
                updateStats();
            }
        });
    });
}


// --- INVENTORY LOGIC ---
const inventoryModal = document.getElementById('inventory-modal');
const openInvModalBtn = document.getElementById('open-inventory-modal');
const closeInvModalBtn = inventoryModal ? inventoryModal.querySelector('.close-modal') : null;
const inventoryForm = document.getElementById('inventory-form');

if (openInvModalBtn) {
    openInvModalBtn.addEventListener('click', () => {
        inventoryForm.reset();
        inventoryModal.classList.add('active');
    });
}
if (closeInvModalBtn) closeInvModalBtn.addEventListener('click', () => inventoryModal.classList.remove('active'));

if (inventoryForm) {
    inventoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('inv-name').value;
        const category = document.getElementById('inv-cat').value;
        const quantity = parseInt(document.getElementById('inv-qty').value);
        const status = document.getElementById('inv-status').value;

        await addDoc(collection(db, "inventory"), { name, category, quantity, status });
        inventoryModal.classList.remove('active');
        loadInventory();
        updateStats();
    });
}

async function loadInventory() {
    const tbody = document.querySelector('#inventory-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Chargement...</td></tr>';
    const querySnapshot = await getDocs(collection(db, "inventory"));
    tbody.innerHTML = '';

    querySnapshot.forEach((doc) => {
        const data = doc.data();
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${data.name}</td>
            <td><span class="badge">${data.category}</span></td>
            <td>${data.quantity}</td>
            <td>${data.status}</td>
            <td class="actions-cell">
               <button class="delete-inv" data-id="${doc.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });

    document.querySelectorAll('.delete-inv').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (confirm('Supprimer cet article ?')) {
                const id = e.target.closest('button').getAttribute('data-id');
                await deleteDoc(doc(db, "inventory", id));
                loadInventory();
                updateStats();
            }
        });
    });
}


// --- PLAYERS & TEAMS LOGIC ---
const playerModal = document.getElementById('player-modal');
const openPlayerModalBtn = document.getElementById('open-player-modal');
const closePlayerModalBtn = playerModal ? playerModal.querySelector('.close-modal') : null;
const playerForm = document.getElementById('player-form');

if (openPlayerModalBtn) {
    openPlayerModalBtn.addEventListener('click', () => {
        playerForm.reset();
        playerModal.classList.add('active');
    });
}
if (closePlayerModalBtn) closePlayerModalBtn.addEventListener('click', () => playerModal.classList.remove('active'));

if (playerForm) {
    playerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('player-name').value;
        const year = parseInt(document.getElementById('player-year').value);
        const skill = parseInt(document.getElementById('player-skill').value);
        const pos = document.getElementById('player-pos').value;

        await addDoc(collection(db, "players"), { name, year, skill, pos });
        playerModal.classList.remove('active');
        loadPlayers();
        updateStats();
    });
}

async function loadPlayers() {
    const tbody = document.querySelector('#players-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Chargement...</td></tr>';
    const querySnapshot = await getDocs(collection(db, "players"));
    tbody.innerHTML = '';
    window.allPlayers = [];

    querySnapshot.forEach((doc) => {
        const data = doc.data();
        window.allPlayers.push({ id: doc.id, ...data });

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${data.name}</td>
            <td>${data.year}</td>
            <td>${data.skill}</td>
            <td>${data.pos}</td>
            <td class="actions-cell">
               <button class="delete-player" data-id="${doc.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });

    document.querySelectorAll('.delete-player').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.closest('button').getAttribute('data-id');
            if (confirm('Supprimer ce joueur ?')) {
                await deleteDoc(doc(db, "players", id));
                loadPlayers();
                updateStats();
            }
        });
    });
}

// Team Algorithm
const genTeamBtn = document.getElementById('generate-teams-btn');
if (genTeamBtn) {
    genTeamBtn.addEventListener('click', () => {
        const teamSize = parseInt(document.getElementById('team-size-select').value);
        const players = window.allPlayers || [];
        if (players.length < teamSize * 2) {
            alert("Pas assez de joueurs pour faire 2 équipes !");
            return;
        }

        players.sort((a, b) => b.skill - a.skill);

        const team1 = [];
        const team2 = [];

        players.forEach((p, index) => {
            if (index % 2 === 0) team1.push(p);
            else team2.push(p);
        });

        const output = document.getElementById('generated-teams-result');
        output.innerHTML = `
            <div class="team-group">
                <h4>Équipe 1 (Force: ${getTeamStrength(team1)})</h4>
                <ul class="team-list">
                    ${team1.map(p => `<li>${p.name} (${p.skill}) - ${p.pos}</li>`).join('')}
                </ul>
            </div>
            <div class="team-group">
                <h4>Équipe 2 (Force: ${getTeamStrength(team2)})</h4>
                <ul class="team-list">
                    ${team2.map(p => `<li>${p.name} (${p.skill}) - ${p.pos}</li>`).join('')}
                </ul>
            </div>
        `;
    });
}


function getTeamStrength(team) {
    return team.reduce((acc, p) => acc + p.skill, 0);
}


// --- GENERAL ---
async function updateStats() {
    // Only update if we are on dashboard or if elements exist
    const pEl = document.getElementById('stat-products');
    if (pEl) {
        const pSnap = await getDocs(collection(db, "products"));
        pEl.innerText = pSnap.size;
    }
    const plEl = document.getElementById('stat-players');
    if (plEl) {
        const plSnap = await getDocs(collection(db, "players"));
        plEl.innerText = plSnap.size;
    }
    const iEl = document.getElementById('stat-inventory');
    if (iEl) {
        const iSnap = await getDocs(collection(db, "inventory"));
        iEl.innerText = iSnap.size;
    }
}
function loadDashboardData() {
    updateStats();
}


// --- SEEDER FUNCTION ---
// Runs once to populate DB if empty
async function seedDatabase() {
    // Check Board
    const boardSnap = await getDocs(collection(db, "board_members"));
    if (boardSnap.empty) {
        console.log("Seeding Board...");
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

        for (const m of boardMembers) {
            await addDoc(collection(db, "board_members"), m);
        }
        console.log("Board Seeded");
    }

    // Check Referees
    const refSnap = await getDocs(collection(db, "referees"));
    if (refSnap.empty) {
        console.log("Seeding Refs...");
        const referees = [
            "Charlotte Bédard", "Dany Ayotte", "Élodie Boutet", "Éloi Ayotte",
            "Émile Gingras", "Emily Duguay", "Félix-Antoine Cantin", "Gabrielle Tessier",
            "Jasmin Moisan", "Juan Manuel Gaspari", "Julien Berthiaume", "Laurence Thibault",
            "Léo Demers", "Loïk Coulombe", "Mamadou Manka", "Mathéo Quimper Hinton", "Naomie Petit"
        ];

        for (const name of referees) {
            await addDoc(collection(db, "referees"), { name: name });
        }
        console.log("Refs Seeded");
    }
}
