const fs = require('fs');
const stripe = require('stripe');

// Manual .env parsing for Stripe Key
const envFile = fs.readFileSync('c:\\Users\\Benjamin\\Desktop\\Antigravity projects\\CelticsDeLouest\\functions\\.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
    }
});

const stripeClient = stripe(env.STRIPE_SECRET_KEY_PROD);

async function runStripeCheck() {
    // Read the previously fetched Firestore data
    const file1 = 'C:\\Users\\Benjamin\\.gemini\\antigravity\\brain\\da7f5c84-4f50-41d7-9a03-ea349be7f202\\.system_generated\\steps\\97\\output.txt';
    const data1 = JSON.parse(fs.readFileSync(file1, 'utf8'));

    // Page 2 manual addition
    const docs2 = [
        {
            "name": "projects/celticsdelouest/databases/prod/documents/scheduled_payments/z0NFhJhPgyMrRDdNxlAU",
            "fields": {
                "stripeInvoiceId": { "stringValue": "in_1T80plBSLzGzW8fpVQJzKeTY" },
                "status": { "stringValue": "pending" },
                "sessionId": { "stringValue": "Patricia Déry _1772812948837" }
            }
        },
        {
            "name": "projects/celticsdelouest/databases/prod/documents/scheduled_payments/zW8QEPSFMcI2IFGt3zcl",
            "fields": {
                "stripeInvoiceId": { "stringValue": "in_1T1ZHUBSLzGzW8fpsWjPDg7K" },
                "status": { "stringValue": "pending" },
                "sessionId": { "stringValue": "GAELLE PARE HAMELIN_1771277066038" }
            }
        }
    ];

    const allDocs = (data1.documents || []).concat(docs2);
    const toUpdate = [];

    console.log(`Checking ${allDocs.length} payments against Stripe...`);

    for (const doc of allDocs) {
        const fields = doc.fields || {};
        const invoiceId = fields.stripeInvoiceId?.stringValue;
        const currentStatus = fields.status?.stringValue;

        if (!invoiceId || currentStatus !== 'pending') continue;

        try {
            const invoice = await stripeClient.invoices.retrieve(invoiceId);

            if (invoice.status === 'paid') {
                toUpdate.push({
                    docPath: doc.name,
                    name: fields.sessionId?.stringValue?.split('_')[0] || 'N/A',
                    action: 'SET processed',
                    reason: 'PAID on Stripe',
                    paidAt: new Date(invoice.status_transitions.paid_at * 1000).toISOString()
                });
            } else if (invoice.status === 'void' || invoice.status === 'uncollectible') {
                toUpdate.push({
                    docPath: doc.name,
                    name: fields.sessionId?.stringValue?.split('_')[0] || 'N/A',
                    action: 'SET error',
                    reason: `Stripe status: ${invoice.status.toUpperCase()}`
                });
            }
        } catch (e) {
            // console.error(`Error checking ${invoiceId}: ${e.message}`);
        }
    }

    if (toUpdate.length === 0) {
        console.log("No discrepancies found.");
    } else {
        console.log("Discrepancies found:");
        console.log(JSON.stringify(toUpdate, null, 2));
    }
}

runStripeCheck().catch(console.error);
