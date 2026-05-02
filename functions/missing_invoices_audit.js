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

async function findMissingFireStoreInvoices() {
    console.log("--- STRIPE INVOICES vs FIRESTORE INVOICES ---");

    // Load local cache of Firestore invoices
    const file = 'C:\\Users\\Benjamin\\.gemini\\antigravity\\brain\\da7f5c84-4f50-41d7-9a03-ea349be7f202\\.system_generated\\steps\\353\\output.txt';
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const firestoreInvoices = data.documents || [];
    const fsInvoiceIds = new Set(firestoreInvoices.map(doc => doc.fields?.stripeId?.stringValue).filter(id => id));

    // Fetch recent invoices from Stripe
    const stripeInvoices = await stripeProd.invoices.list({ limit: 100 });

    const missing = [];

    for (const inv of stripeInvoices.data) {
        if (!fsInvoiceIds.has(inv.id)) {
            missing.push({
                id: inv.id,
                amount: inv.amount_due / 100,
                customer: inv.customer_name || inv.customer_email || inv.customer,
                date: new Date(inv.created * 1000).toISOString(),
                status: inv.status,
                description: inv.description || (inv.lines.data[0] ? inv.lines.data[0].description : 'No description')
            });
        }
    }

    if (missing.length === 0) {
        console.log("All recent Stripe invoices (last 100) are recorded in Firestore.");
    } else {
        console.log(`Found ${missing.length} missing invoices in Firestore:`);
        console.table(missing);
    }
}

findMissingFireStoreInvoices().catch(console.error);
