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

const stripeClient = stripe(env.STRIPE_SECRET_KEY_PROD);

async function checkStaging() {
    const file = 'C:\\Users\\Benjamin\\.gemini\\antigravity\\brain\\da7f5c84-4f50-41d7-9a03-ea349be7f202\\.system_generated\\steps\\266\\output.txt';
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));

    const allDocs = data.documents || [];
    const toUpdate = [];

    console.log(`Checking ${allDocs.length} staging payments against Stripe...`);

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
        console.log("No discrepancies found in staging.");
    } else {
        console.log("Staging discrepancies found:");
        console.log(JSON.stringify(toUpdate, null, 2));
    }
}

checkStaging().catch(console.error);
