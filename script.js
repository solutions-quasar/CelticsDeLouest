document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            // Toggle icon
            const icon = mobileMenuBtn.querySelector('i');
            if (navMenu.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });
    }

    // Close mobile menu when clicking a link (but NOT the dropdown toggle)
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            if (link.id === 'le-club-toggle') return;

            navMenu.classList.remove('active');
            const icon = mobileMenuBtn.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });
    });

    // Mobile Dropdown Toggle
    const clubToggle = document.getElementById('le-club-toggle');
    if (clubToggle) {
        clubToggle.addEventListener('click', (e) => {
            if (window.innerWidth <= 1100) {
                e.preventDefault();
                const dropdown = clubToggle.nextElementSibling;
                if (dropdown) {
                    dropdown.classList.toggle('active');
                    // Optional: rotation or icon change
                    const icon = clubToggle.querySelector('.fa-chevron-down');
                    if (icon) {
                        icon.style.transform = dropdown.classList.contains('active') ? 'rotate(180deg)' : 'rotate(0deg)';
                        icon.style.transition = '0.3s';
                    }
                }
            }
        });
    }

    // Smooth Scroll for Anchor Links (if browser smooth scroll isn't enough/supported properly)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');

            // Only handle if it's still a hash link
            if (!targetId || !targetId.startsWith('#')) return;

            e.preventDefault();
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                // Offset for fixed header
                const headerOffset = 80;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: "smooth"
                });
            }
        });
    });
});
