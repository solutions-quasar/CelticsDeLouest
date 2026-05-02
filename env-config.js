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
        stripeCampPublicKey: "pk_test_51T7Jn4EWDwkOsFxOV1UawUp9isAG8BzsokRNEMpZ17epmkdxtQ2TdymHMTZ6wEsgXq8E8VNBKh4R9FGv4Oez6ZEt0076iuwQfY",
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
        // TODO: Replace with your live Stripe live key (pk_live_...)
        stripePublicKey: "pk_live_51Sx7yJBSLzGzW8fp8qOqS1dkmQgI14ZkAeDSPPpW5F2DYz4bFSPpGuqa2waPKijEbcgGSN6WZ0EePuMInP8qlKK800YquuTkUv",
        // TODO: Replace with your LIVE Camp Stripe live key (pk_live_...)
        stripeCampPublicKey: "pk_live_51T7JmsEhKzPEATeJNtEQ87TbuFEGjsKXOytOIfawUsVm9cdixjym7kqYTV8gtGHg1ZXLcR7f74iCv1QlFTNu9pfq00Gln5UtID",
        env: 'production'
    }
};

// Auto-detection logic
const isProd = window.location.hostname === 'celtics-production.web.app' ||
    window.location.hostname === 'celtics-production.firebaseapp.com' ||
    window.location.hostname === 'celticsdelouest-prod.web.app' ||
    window.location.hostname === 'celticsdelouest.org' ||
    window.location.hostname === 'www.celticsdelouest.org' ||
    window.location.hostname === 'celticsdelouest.com';

const activeConfig = isProd ? CONFIG.production : CONFIG.staging;

export default activeConfig;
export { activeConfig, isProd };
