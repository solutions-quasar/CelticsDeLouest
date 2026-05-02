const fs = require('fs');
const stripe = require('stripe');
const admin = require('firebase-admin');

// Manual .env parsing
const envFile = fs.readFileSync('c:\\Users\\Benjamin\\Desktop\\Antigravity projects\\CelticsDeLouest\\functions\\.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
    }
});

const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY_PROD;

if (!STRIPE_SECRET_KEY) {
    console.error("Missing STRIPE_SECRET_KEY_PROD in .env");
    process.exit(1);
}

const stripeClient = stripe(STRIPE_SECRET_KEY);

// Initialize Firebase Admin
admin.initializeApp({
    projectId: 'celticsdelouest'
});

// For Node v20/v22 with firebase-admin 13+, we need to handle the database selection
const db = admin.firestore();
// Use the 'prod' database
const prodDb = admin.app().firestore('prod');

async function dryRunSync() {
    console.log("--- DRY RUN: Firestore vs Stripe Synchronization ---");

    const snapshot = await prodDb.collection('scheduled_payments')
        .where('status', '==', 'pending')
        .get();

    console.log(`Found ${snapshot.size} pending payments in Firestore.`);

    const toUpdate = [];

    for (const doc of snapshot.docs) {
        const payment = doc.data();
        const invoiceId = payment.stripeInvoiceId;

        if (!invoiceId) continue;

        try {
            const invoice = await stripeClient.invoices.retrieve(invoiceId);

            if (invoice.status === 'paid') {
                toUpdate.push({
                    id: doc.id,
                    name: payment.sessionId?.split('_')[0] || 'N/A',
                    oldStatus: 'pending',
                    newStatus: 'processed',
                    reason: 'Already PAID on Stripe',
                    paidAt: new Date(invoice.status_transitions.paid_at * 1000).toISOString()
                });
            } else if (invoice.status === 'void' || invoice.status === 'uncollectible') {
                toUpdate.push({
                    id: doc.id,
                    name: payment.sessionId?.split('_')[0] || 'N/A',
                    oldStatus: 'pending',
                    newStatus: 'error',
                    reason: `Stripe status is ${invoice.status.toUpperCase()}`
                });
            }
        } catch (error) {
            // console.error(`Error for ${invoiceId}:`, error.message);
        }
    }

    if (toUpdate.length === 0) {
        console.log("No discrepancies found. Firestore is up to date.");
    } else {
        console.log("\nDiscrepancies found:");
        console.table(toUpdate);
        console.log(`\nTotal: ${toUpdate.length} updates proposed.`);
    }
}

dryRunSync().catch(console.error);
