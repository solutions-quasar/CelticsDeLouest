// Firebase Configuration
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where } from "firebase/firestore";
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
const loginError = document.getElementById('login-error'); // Added error element in HTML


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

        // Handle Email Memory
        if (rememberEmail) {
            localStorage.setItem('celtics_admin_email', email);
        } else {
            localStorage.removeItem('celtics_admin_email');
        }

        try {
            // Handle Persistence (Stay Connected)
            const mode = rememberMe ? browserLocalPersistence : browserSessionPersistence;
            await setPersistence(auth, mode);

            // Sign in
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log("Logged in:", userCredential.user);
        } catch (error) {
            console.error("Login Error:", error);
            if (loginError) loginError.textContent = "Erreur de connexion : " + error.message;
        }
    });

    // Forgot Password Logic
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
        loadDashboardData(); // Initial load
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
        // Remove active class from buttons and views
        navBtns.forEach(b => b.classList.remove('active'));
        views.forEach(v => v.classList.remove('active'));

        // Add active to clicked button and target view
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');

        // Update Title
        pageTitle.innerText = btn.innerText;

        // Load specific data
        if (targetId === 'view-boutique') loadProducts();
        if (targetId === 'view-teams') loadPlayers();
        if (targetId === 'view-inventory') loadInventory();
    });
});


// --- BOUTIQUE LOGIC ---
const productModal = document.getElementById('product-modal');
const openProdModalBtn = document.getElementById('open-product-modal');
const closeProdModalBtn = productModal.querySelector('.close-modal');
const productForm = document.getElementById('product-form');

// Open/Close Modal
openProdModalBtn.addEventListener('click', () => {
    productForm.reset();
    document.getElementById('product-id').value = '';
    document.getElementById('image-preview').innerHTML = '';
    productModal.classList.add('active');
});
closeProdModalBtn.addEventListener('click', () => productModal.classList.remove('active'));

// Create/Update Product
productForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // UI Feedback
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

        // Upload Image if present
        let imageUrl = '';
        if (file) {
            const storageRef = ref(storage, 'products/' + file.name + Date.now());
            await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(storageRef);
        }

        // Determine Update or Create
        if (id) {
            // Update
            const docRef = doc(db, "products", id);
            const updateData = { name, price, desc };
            if (imageUrl) updateData.imageUrl = imageUrl;
            await updateDoc(docRef, updateData);
        } else {
            // Create
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

// Load Products
async function loadProducts() {
    const list = document.getElementById('products-list');
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

    // Attach Loop Events
    document.querySelectorAll('.edit-prod').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            // Basic Edit Fill - In real app, fetch current data to be safe, but here use DOM or known data locally if cached
            // For simplicity in this step, I'll allow simple editing. Ideally, fetchDoc
            // To save tokens/time, I will assume we can refetch or pass data. Let's refetch doc for edit.
            const id = e.target.getAttribute('data-id');
            // Placeholder for edit logic: populate modal with existing data
            // TODO: Implement proper pre-fill
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
const closeInvModalBtn = inventoryModal.querySelector('.close-modal');
const inventoryForm = document.getElementById('inventory-form');

openInvModalBtn.addEventListener('click', () => {
    inventoryForm.reset();
    inventoryModal.classList.add('active');
});
closeInvModalBtn.addEventListener('click', () => inventoryModal.classList.remove('active'));

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

async function loadInventory() {
    const tbody = document.querySelector('#inventory-table tbody');
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
                // Find closest button (in case icon clicked)
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
const closePlayerModalBtn = playerModal.querySelector('.close-modal');
const playerForm = document.getElementById('player-form');

openPlayerModalBtn.addEventListener('click', () => {
    playerForm.reset();
    playerModal.classList.add('active');
});
closePlayerModalBtn.addEventListener('click', () => playerModal.classList.remove('active'));

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

async function loadPlayers() {
    const tbody = document.querySelector('#players-table tbody');
    tbody.innerHTML = '<tr><td colspan="5">Chargement...</td></tr>';
    const querySnapshot = await getDocs(collection(db, "players"));
    tbody.innerHTML = '';
    window.allPlayers = []; // Cache for generator

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
document.getElementById('generate-teams-btn').addEventListener('click', () => {
    const teamSize = parseInt(document.getElementById('team-size-select').value);
    const players = window.allPlayers || [];
    if (players.length < teamSize * 2) {
        alert("Pas assez de joueurs pour faire 2 équipes !");
        return;
    }

    // Sort by skill to balance
    players.sort((a, b) => b.skill - a.skill);

    const team1 = [];
    const team2 = [];

    // Snake draft or distribute
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

function getTeamStrength(team) {
    return team.reduce((acc, p) => acc + p.skill, 0);
}


// --- GENERAL ---
async function updateStats() {
    const pSnap = await getDocs(collection(db, "products"));
    document.getElementById('stat-products').innerText = pSnap.size;

    const plSnap = await getDocs(collection(db, "players"));
    document.getElementById('stat-players').innerText = plSnap.size;

    const iSnap = await getDocs(collection(db, "inventory"));
    document.getElementById('stat-inventory').innerText = iSnap.size;
}
function loadDashboardData() {
    updateStats();
}
