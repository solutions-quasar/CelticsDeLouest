const fs = require('fs');
const stripe = require('stripe');

const envFile = fs.readFileSync('c:\\Users\\Benjamin\\Desktop\\Antigravity projects\\CelticsDeLouest\\functions\\.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
    }
});

const stripeProd = stripe(env.STRIPE_SECRET_KEY_PROD);

async function findUnlinkedCharges() {
    console.log("--- STRIPE CHARGES vs FIRESTORE INVOICES ---");

    // Load local cache of Firestore invoices
    const file = 'C:\\Users\\Benjamin\\.gemini\\antigravity\\brain\\da7f5c84-4f50-41d7-9a03-ea349be7f202\\.system_generated\\steps\\353\\output.txt';
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const firestoreInvoices = data.documents || [];
    const fsInvoiceIds = new Set(firestoreInvoices.map(doc => doc.fields?.stripeId?.stringValue).filter(id => id));

    // Fetch recent charges from Stripe
    const charges = await stripeProd.charges.list({ limit: 100 });

    const unlinked = [];

    for (const charge of charges.data) {
        if (!charge.invoice && !fsInvoiceIds.has(charge.id)) {
            // Check if this charge's PaymentIntent is linked to an invoice
            if (charge.payment_intent) {
                const pi = await stripeProd.paymentIntents.retrieve(charge.payment_intent);
                if (pi.invoice && fsInvoiceIds.has(pi.invoice)) continue;
            }

            unlinked.push({
                id: charge.id,
                amount: charge.amount / 100,
                customer: charge.billing_details?.name || charge.customer,
                date: new Date(charge.created * 1000).toISOString(),
                description: charge.description,
                status: charge.status
            });
        }
    }

    if (unlinked.length === 0) {
        console.log("All recent Stripe charges are linked to Firestore invoices.");
    } else {
        console.log(`Found ${unlinked.length} unlinked charges:`);
        console.table(unlinked);
    }
}

findUnlinkedCharges().catch(console.error);
