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

async function invoiceAudit() {
    console.log("--- INVOICE AUDIT: Firestore Invoices vs Stripe ---");

    // 1. Load Firestore Invoices
    const file = 'C:\\Users\\Benjamin\\.gemini\\antigravity\\brain\\da7f5c84-4f50-41d7-9a03-ea349be7f202\\.system_generated\\steps\\353\\output.txt';
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const firestoreInvoices = data.documents || [];

    console.log(`Analyzing ${firestoreInvoices.length} firestore invoice records...`);

    const mismatches = [];

    for (const doc of firestoreInvoices) {
        const fields = doc.fields || {};
        const stripeId = fields.stripeId?.stringValue;
        const fsStatus = fields.status?.stringValue;
        const customer = fields.customerName?.stringValue || fields.customerEmail?.stringValue;

        if (!stripeId) continue;

        try {
            const inv = await stripeProd.invoices.retrieve(stripeId);

            if (inv.status !== fsStatus) {
                // Ignore if it's just 'open' vs 'draft' for very recent ones, but 'paid' vs 'not paid' is a big deal
                if (inv.status === 'paid' && fsStatus !== 'paid') {
                    mismatches.push({
                        stripeId,
                        customer,
                        fsStatus,
                        stripeStatus: inv.status,
                        amount: inv.amount_due / 100,
                        issue: "Invoice PAID on Stripe but NOT in Firestore"
                    });
                }
            }
        } catch (e) {
            // console.error(`Error for ${stripeId}: ${e.message}`);
        }
    }

    if (mismatches.length === 0) {
        console.log("No status mismatches found in the analyzed invoices.");
    } else {
        console.log("\nFound Status Mismatches:");
        console.table(mismatches);
    }
}

invoiceAudit().catch(console.error);
