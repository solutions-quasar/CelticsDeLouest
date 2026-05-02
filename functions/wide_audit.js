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

async function wideAudit() {
    console.log("--- WIDE AUDIT: All Stripe Invoices vs Registrations ---");

    // 1. Fetch recent invoices
    const invoices = await stripeProd.invoices.list({ limit: 100 });
    console.log(`Fetched ${invoices.data.length} recent Stripe invoices.`);

    // 2. Load Registrations
    const regFile = 'C:\\Users\\Benjamin\\.gemini\\antigravity\\brain\\da7f5c84-4f50-41d7-9a03-ea349be7f202\\.system_generated\\steps\\300\\output.txt';
    const regData = JSON.parse(fs.readFileSync(regFile, 'utf8'));
    const registrations = regData.documents || [];

    const regInvoiceIds = new Set();
    const regSessionIds = new Set();
    registrations.forEach(r => {
        if (r.fields?.stripeInvoiceId?.stringValue) regInvoiceIds.add(r.fields.stripeInvoiceId.stringValue);
        if (r.fields?.registrationSessionId?.stringValue) regSessionIds.add(r.fields.registrationSessionId.stringValue);
    });

    // 3. Load Scheduled Payments
    const spFile1 = 'C:\\Users\\Benjamin\\.gemini\\antigravity\\brain\\da7f5c84-4f50-41d7-9a03-ea349be7f202\\.system_generated\\steps\\97\\output.txt';
    const spData1 = JSON.parse(fs.readFileSync(spFile1, 'utf8'));
    (spData1.documents || []).forEach(sp => {
        if (sp.fields?.stripeInvoiceId?.stringValue) regInvoiceIds.add(sp.fields.stripeInvoiceId.stringValue);
    });

    console.log("\nAuditing invoices from last month...");
    const problems = [];

    for (const inv of invoices.data) {
        const isKnown = regInvoiceIds.has(inv.id);
        if (!isKnown) {
            // Check by customer name/email metadata if possible
            const customerName = inv.customer_name || inv.customer_email;
            const matchesReg = registrations.some(r => {
                const rName = `${r.fields?.childFirstName?.stringValue} ${r.fields?.childLastName?.stringValue}`;
                const pName = r.fields?.parent1Name?.stringValue;
                return rName.includes(customerName) || pName?.includes(customerName) || r.fields?.parent1Email?.stringValue === inv.customer_email;
            });

            if (!matchesReg && inv.status !== 'void') {
                problems.push({
                    id: inv.id,
                    customer: customerName,
                    amount: inv.amount_due / 100,
                    status: inv.status,
                    description: inv.description,
                    created: new Date(inv.created * 1000).toISOString().split('T')[0],
                    issue: "Invoice on Stripe but NOT linked to any Registration in Firestore"
                });
            }
        }
    }

    if (problems.length === 0) {
        console.log("No unlinked invoices found in the last 100 Stripe invoices.");
    } else {
        console.table(problems);
    }
}

wideAudit().catch(console.error);
