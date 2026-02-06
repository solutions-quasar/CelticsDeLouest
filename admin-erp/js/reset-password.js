import { initializeApp } from 'firebase/app';
import { getAuth, verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyAQZqPjxCxXlDJLlSAQnTNPQNULQqxhqWQ",
    authDomain: "celticsdelouest.firebaseapp.com",
    projectId: "celticsdelouest",
    storageBucket: "celticsdelouest.firebasestorage.app",
    messagingSenderId: "1047374913629",
    appId: "1:1047374913629:web:1d4e6e8f8b8f8b8f8b8f8b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Get oobCode from URL
const urlParams = new URLSearchParams(window.location.search);
const oobCode = urlParams.get('oobCode');

const loadingState = document.getElementById('loading-state');
const resetFormContainer = document.getElementById('reset-form-container');
const resetSuccess = document.getElementById('reset-success');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');

// Verify code on page load
async function verifyCode() {
    if (!oobCode) {
        showError('Lien invalide. Aucun code de vérification trouvé.');
        return;
    }

    try {
        // Verify the password reset code is valid
        await verifyPasswordResetCode(auth, oobCode);

        // Code is valid, show form
        loadingState.style.display = 'none';
        resetFormContainer.style.display = 'block';

    } catch (error) {
        console.error('Error verifying code:', error);
        let message = 'Ce lien a expiré ou est invalide.';

        if (error.code === 'auth/expired-action-code') {
            message = 'Ce lien a expiré. Veuillez demander un nouveau lien de réinitialisation.';
        } else if (error.code === 'auth/invalid-action-code') {
            message = 'Ce lien est invalide ou a déjà été utilisé.';
        }

        showError(message);
    }
}

function showError(message) {
    loadingState.style.display = 'none';
    resetFormContainer.style.display = 'none';
    errorMessage.textContent = message;
    errorState.style.display = 'block';
}

// Handle form submission
document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorMsg = document.getElementById('reset-error');

    errorMsg.textContent = '';

    if (newPassword !== confirmPassword) {
        errorMsg.textContent = 'Les mots de passe ne correspondent pas';
        return;
    }

    if (newPassword.length < 6) {
        errorMsg.textContent = 'Le mot de passe doit contenir au moins 6 caractères';
        return;
    }

    try {
        // Reset the password
        await confirmPasswordReset(auth, oobCode, newPassword);

        // Show success
        resetFormContainer.style.display = 'none';
        resetSuccess.style.display = 'block';

    } catch (error) {
        console.error('Error resetting password:', error);
        errorMsg.textContent = 'Erreur lors de la réinitialisation. Veuillez réessayer.';
    }
});

// Verify code on page load
verifyCode();
