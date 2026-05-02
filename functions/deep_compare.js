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

async function deepCompare() {
    console.log("--- DEEP COMPARE: All Recent Stripe Invoices vs Firestore ---");

    // 1. Fetch all recent invoices from Stripe (last 500)
    let stripeInvoices = [];
    let lastId = null;
    while (stripeInvoices.length < 500) {
        const invoices = await stripeProd.invoices.list({
            limit: 100,
            starting_after: lastId || undefined
        });
        if (invoices.data.length === 0) break;
        stripeInvoices = stripeInvoices.concat(invoices.data);
        lastId = invoices.data[invoices.data.length - 1].id;
    }
    console.log(`Retrieved ${stripeInvoices.length} invoices from Stripe.`);

    // 2. Read all Firestore documents from local fetch
    const file1 = 'C:\\Users\\Benjamin\\.gemini\\antigravity\\brain\\da7f5c84-4f50-41d7-9a03-ea349be7f202\\.system_generated\\steps\\97\\output.txt';
    const data1 = JSON.parse(fs.readFileSync(file1, 'utf8'));
    const allFirestoreDocs = data1.documents || [];

    // Manual page 2 docs
    const docs2 = [
        { "fields": { "stripeInvoiceId": { "stringValue": "in_1T80plBSLzGzW8fpVQJzKeTY" }, "status": { "stringValue": "pending" }, "sessionId": { "stringValue": "Patricia Déry _1772812948837" } } },
        { "fields": { "stripeInvoiceId": { "stringValue": "in_1T1ZHUBSLzGzW8fpsWjPDg7K" }, "status": { "stringValue": "pending" }, "sessionId": { "stringValue": "GAELLE PARE HAMELIN_1771277066038" } } }
    ];
    const totalFirestore = allFirestoreDocs.concat(docs2);

    const firestoreInvoiceIds = new Set(totalFirestore.map(d => d.fields?.stripeInvoiceId?.stringValue).filter(id => !!id));

    // 3. Find Stripe invoices (Draft/Open) NOT in Firestore
    console.log("\nInvoices on Stripe (Draft/Open/Paid) but MISSING in Firestore scheduled_payments:");
    const missingInFirestore = stripeInvoices.filter(inv => {
        // We only care about invoices that look like installments (metadata or description)
        const isInstallment = inv.description?.includes('Versement') || inv.metadata?.installmentOrder;
        return isInstallment && !firestoreInvoiceIds.has(inv.id);
    });

    if (missingInFirestore.length === 0) {
        console.log("No missing installment invoices found on Stripe.");
    } else {
        console.table(missingInFirestore.map(inv => ({
            id: inv.id,
            customer: inv.customer_name || inv.customer_email,
            amount: inv.amount_due / 100,
            status: inv.status,
            description: inv.description,
            created: new Date(inv.created * 1000).toISOString().split('T')[0]
        })));
    }

    // 4. Find Firestore records whose Stripe invoice ID is NOT in the retrieved Stripe list
    // (This might happen if the invoice was deleted or is very old)
    console.log("\nFirestore scheduled_payments records NOT found in recent Stripe invoices:");
    const stripeInvoiceIdsSet = new Set(stripeInvoices.map(inv => inv.id));
    const missingOnStripe = totalFirestore.filter(d => {
        const id = d.fields?.stripeInvoiceId?.stringValue;
        return id && !stripeInvoiceIdsSet.has(id);
    });

    if (missingOnStripe.length === 0) {
        console.log("All Firestore records match a recent Stripe invoice.");
    } else {
        console.log(`${missingOnStripe.length} records not found in the last 500 Stripe invoices.`);
    }
}

deepCompare().catch(console.error);
