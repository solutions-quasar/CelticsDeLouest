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

async function deepInvoiceAudit() {
    console.log("--- DEEP INVOICE AUDIT: Amount & Status Check ---");

    const file = 'C:\\Users\\Benjamin\\.gemini\\antigravity\\brain\\da7f5c84-4f50-41d7-9a03-ea349be7f202\\.system_generated\\steps\\353\\output.txt';
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const firestoreInvoices = data.documents || [];

    const issues = [];

    for (const doc of firestoreInvoices) {
        const fields = doc.fields || {};
        const stripeId = fields.stripeId?.stringValue;
        const fsStatus = fields.status?.stringValue;
        const fsAmount = parseInt(fields.amount?.integerValue || 0);
        const fsPaid = parseInt(fields.amountPaid?.integerValue || 0);

        if (!stripeId) continue;

        try {
            const inv = await stripeProd.invoices.retrieve(stripeId);

            const stripeAmount = inv.amount_due;
            const stripePaid = inv.amount_paid;
            const stripeStatus = inv.status;

            const statusMismatch = stripeStatus !== fsStatus;
            const amountMismatch = stripeAmount !== fsAmount || stripePaid !== fsPaid;

            if (statusMismatch || amountMismatch) {
                issues.push({
                    stripeId,
                    customer: fields.customerName?.stringValue || fields.customerEmail?.stringValue,
                    status: `${fsStatus} vs ${stripeStatus}`,
                    amount: `${fsAmount / 100} vs ${stripeAmount / 100}`,
                    paid: `${fsPaid / 100} vs ${stripePaid / 100}`,
                    issue: statusMismatch ? "Status Mismatch" : "Amount Mismatch"
                });
            }
        } catch (e) { }
    }

    if (issues.length === 0) {
        console.log("No amount or status mismatches found in analyzed invoices.");
    } else {
        console.table(issues);
    }
}

deepInvoiceAudit().catch(console.error);
