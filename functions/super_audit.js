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

async function superAudit() {
    console.log("--- SUPER AUDIT: Stripe vs ALL Collections ---");

    // 1. Load All Collections
    const regData = JSON.parse(fs.readFileSync('C:\\Users\\Benjamin\\.gemini\\antigravity\\brain\\da7f5c84-4f50-41d7-9a03-ea349be7f202\\.system_generated\\steps\\300\\output.txt', 'utf8')).documents || [];
    const campData = JSON.parse(fs.readFileSync('C:\\Users\\Benjamin\\.gemini\\antigravity\\brain\\da7f5c84-4f50-41d7-9a03-ea349be7f202\\.system_generated\\steps\\333\\output.txt', 'utf8')).documents || [];
    const spData = JSON.parse(fs.readFileSync('C:\\Users\\Benjamin\\.gemini\\antigravity\\brain\\da7f5c84-4f50-41d7-9a03-ea349be7f202\\.system_generated\\steps\\97\\output.txt', 'utf8')).documents || [];

    const knownInvoiceIds = new Set();
    const knownCustomerEmails = new Set();
    const knownSessionIds = new Set();

    [...regData, ...campData].forEach(d => {
        const f = d.fields || {};
        if (f.stripeInvoiceId?.stringValue) knownInvoiceIds.add(f.stripeInvoiceId.stringValue);
        if (f.parentEmail?.stringValue) knownCustomerEmails.add(f.parentEmail.stringValue.toLowerCase());
        if (f.parent1Email?.stringValue) knownCustomerEmails.add(f.parent1Email.stringValue.toLowerCase());
        if (f.registrationSessionId?.stringValue) knownSessionIds.add(f.registrationSessionId.stringValue);
    });

    spData.forEach(d => {
        if (d.fields?.stripeInvoiceId?.stringValue) knownInvoiceIds.add(d.fields.stripeInvoiceId.stringValue);
    });

    // 2. Fetch Recent Stripe Invoices (Last 30 days)
    const invoices = await stripeProd.invoices.list({ limit: 100 });
    const missing = [];

    for (const inv of invoices.data) {
        if (inv.status === 'void') continue;

        const isKnown = knownInvoiceIds.has(inv.id);
        if (!isKnown) {
            // Check for customer match
            const email = inv.customer_email?.toLowerCase();
            const hasRecordByEmail = email && knownCustomerEmails.has(email);

            // Check if it's an installment (already verified mostly, but redo here)
            const isInstallment = inv.description?.includes('Versement') || inv.metadata?.installmentOrder;

            if (!hasRecordByEmail) {
                missing.push({
                    id: inv.id,
                    customer: inv.customer_name || inv.customer_email,
                    email: inv.customer_email,
                    amount: inv.amount_due / 100,
                    status: inv.status,
                    date: new Date(inv.created * 1000).toISOString().split('T')[0],
                    desc: inv.description
                });
            }
        }
    }

    if (missing.length === 0) {
        console.log("No missing payments found in the last 100 Stripe invoices.");
    } else {
        console.log("\nPayments found on Stripe but NOT linked to any customer in Firestore:");
        console.table(missing);
    }
}

superAudit().catch(console.error);
