/**
 * Environment Configuration for Celtics de l'Ouest
 * 
 * This file automatically detects the environment based on the current hostname
 * and provides the correct Firebase and Stripe configuration.
 */

const CONFIG = {
    staging: {
        firebase: {
            apiKey: "AIzaSyCwJOzr9gAAyrkUAbtThkKNWJ1GcJUNx-E",
            authDomain: "celticsdelouest.firebaseapp.com",
            projectId: "celticsdelouest",
            storageBucket: "celticsdelouest.firebasestorage.app",
            messagingSenderId: "1078067192512",
            appId: "1:1078067192512:web:ae3b414f15358d1bfb8325",
            measurementId: "G-N5LFCG1QWT"
        },
        firestoreDb: "(default)",
        stripePublicKey: "pk_test_51Sx7yRBRQUHxNmgkudJhBzy5oDtUKf0A1MwykRovc0fZzr0cMgh3Xnpy4wcE4EgCf3UKZZ1aK4n94xSXioTB0CZU00UcseiBId",
        env: 'staging'
    },
    production: {
        firebase: {
            apiKey: "AIzaSyCw_l89YWTjnUDXMPdZHZeIX6KbRsXxLOk",
            authDomain: "celticsdelouest.firebaseapp.com",
            projectId: "celticsdelouest",
            storageBucket: "celticsdelouest.firebasestorage.app",
            messagingSenderId: "1078067192512",
            appId: "1:1078067192512:web:a66e73b11e550c8ffb8325",
            measurementId: "G-8TJBZB7S3J"
        },
        firestoreDb: "prod",
        stripePublicKey: "pk_live_51Sx7yJBSLzGzW8fp8qOqS1dkmQgI14ZkAeDSPPpW5F2DYz4bFSPpGuqa2waPKijEbcgGSN6WZ0EePuMInP8qlKK800YquuTkUv", // À REMPLACER PAR VOTRE CLÉ LIVE
        env: 'production'
    }
};

// Auto-detection logic
const isProd = window.location.hostname === 'celtics-production.web.app' ||
    window.location.hostname === 'celticsdelouest-prod.web.app' ||
    window.location.hostname === 'celticsdelouest.com'; // Ajoutez votre domaine final ici

const activeConfig = isProd ? CONFIG.production : CONFIG.staging;

export default activeConfig;
export { activeConfig, isProd };
