// --- Custom Alert/Confirm Functions (ERP Native) ---
window.showAlert = function (message, type = 'info') {
    const modal = document.getElementById('custom-alert-modal');
    const messageEl = document.getElementById('alert-message');
    const iconEl = document.getElementById('alert-icon');
    const titleEl = document.getElementById('alert-title');

    if (!modal || !messageEl || !iconEl) return alert(message); // Fallback

    messageEl.textContent = message;

    // Change icon and color based on type
    if (type === 'success') {
        iconEl.className = 'fas fa-check-circle';
        iconEl.style.color = 'var(--success)';
        if (titleEl) titleEl.textContent = "Succès";
    } else if (type === 'error') {
        iconEl.className = 'fas fa-exclamation-circle';
        iconEl.style.color = 'var(--danger)';
        if (titleEl) titleEl.textContent = "Erreur";
    } else if (type === 'warning') {
        iconEl.className = 'fas fa-exclamation-triangle';
        iconEl.style.color = 'var(--warning)';
        if (titleEl) titleEl.textContent = "Attention";
    } else {
        iconEl.className = 'fas fa-info-circle';
        iconEl.style.color = 'var(--primary)';
        if (titleEl) titleEl.textContent = "Information";
    }

    modal.classList.add('active');

    const okBtn = document.getElementById('alert-ok-btn');
    if (okBtn) {
        okBtn.onclick = () => {
            modal.classList.remove('active');
            okBtn.onclick = null;
        };
    }
}

window.showConfirm = function (message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        const messageEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        if (!modal || !messageEl || !okBtn || !cancelBtn) {
            console.error("Confirm modal elements missing");
            resolve(confirm(message)); // Fallback
            return;
        }

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

window.showPrompt = function (message, defaultValue = "") {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-prompt-modal');
        const messageEl = document.getElementById('prompt-message');
        const inputEl = document.getElementById('prompt-input');
        const okBtn = document.getElementById('prompt-ok-btn');
        const cancelBtn = document.getElementById('prompt-cancel-btn');

        if (!modal || !messageEl || !inputEl || !okBtn || !cancelBtn) {
            console.error("Prompt modal elements missing");
            resolve(prompt(message, defaultValue)); // Fallback
            return;
        }

        messageEl.textContent = message;
        inputEl.value = defaultValue;

        // Focus input after modal is shown
        setTimeout(() => inputEl.focus(), 100);

        const cleanup = () => {
            modal.classList.remove('active');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            inputEl.onkeydown = null;
        };

        const confirm = () => {
            const val = inputEl.value;
            cleanup();
            resolve(val);
        };

        okBtn.onclick = confirm;

        cancelBtn.onclick = () => {
            cleanup();
            resolve(null);
        };

        // Enter key to confirm
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') confirm();
            if (e.key === 'Escape') {
                cleanup();
                resolve(null);
            }
        };

        modal.classList.add('active');
    });
}
