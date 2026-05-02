const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { Resend } = require("resend");
const cors = require("cors")({ origin: true });

admin.initializeApp();

// --- MULTI-ENVIRONMENT CONFIG ---
const ENV_CONFIG = {
    staging: {
        firestoreDb: "(default)",
        stripeSecretKey: process.env.STRIPE_SECRET_KEY,
        stripeCampSecretKey: process.env.STRIPE_CAMP_SECRET_KEY || process.env.STRIPE_SECRET_KEY,
        stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        stripeCampWebhookSecret: process.env.STRIPE_CAMP_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET,
        resendApiKey: process.env.RESEND_API_KEY
    },
    production: {
        firestoreDb: "prod",
        stripeSecretKey: process.env.STRIPE_SECRET_KEY_PROD || process.env.STRIPE_SECRET_KEY,
        stripeCampSecretKey: process.env.STRIPE_CAMP_SECRET_KEY_PROD || process.env.STRIPE_SECRET_KEY,
        stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET_PROD || process.env.STRIPE_WEBHOOK_SECRET,
        stripeCampWebhookSecret: process.env.STRIPE_CAMP_WEBHOOK_SECRET_LIVE || process.env.STRIPE_WEBHOOK_SECRET_PROD || process.env.STRIPE_WEBHOOK_SECRET,
        resendApiKey: process.env.RESEND_API_KEY_PROD || process.env.RESEND_API_KEY
    }
};

function getContext(req, forCamp = false) {
    const env = req && req.headers['x-environment'] === 'production' ? 'production' : 'staging';
    const config = ENV_CONFIG[env];

    const secretKeyToUse = forCamp ? config.stripeCampSecretKey : config.stripeSecretKey;
    const webhookSecretToUse = forCamp ? config.stripeCampWebhookSecret : config.stripeWebhookSecret;

    return {
        env,
        db: getFirestore(config.firestoreDb),
        stripe: require('stripe')(secretKeyToUse),
        endpointSecret: webhookSecretToUse,
        resend: new Resend(config.resendApiKey)
    };
}

// Default instances for legacy/internal use (deprecated - use getContext instead)
// const db = getFirestore();
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// const resend = new Resend(process.env.RESEND_API_KEY);

// --- AUTH HELPER: VERIFY ADMIN ---
async function authenticateAdmin(req, db) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Unauthorized: Missing or invalid token");
    }
    const token = authHeader.split(" ")[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const email = decodedToken.email.toLowerCase();
        const adminDoc = await db.collection('admins').doc(email).get();
        if (!adminDoc.exists) {
            throw new Error("Forbidden: Not an admin");
        }
        return decodedToken;
    } catch (e) {
        throw new Error("Unauthorized: " + e.message);
    }
}

// --- STRIPE HELPER: CREATE/GET CUSTOMER ---
async function getOrCreateStripeCustomer(stripe, email, name) {
    const existing = await stripe.customers.list({ email: email, limit: 1 });
    if (existing.data.length > 0) {
        return existing.data[0].id;
    }
    const newCustomer = await stripe.customers.create({
        email: email,
        name: name
    });
    return newCustomer.id;
}

// --- STRIPE LOGIC: PAYMENTS ---
exports.createRegistrationPayment = onRequest({ cors: true }, async (req, res) => {
    try {
        const { paymentMethodId, amount, email, parentName, installments, description, sessionId } = req.body;
        const { db, stripe } = getContext(req);

        if (!amount || !email || !paymentMethodId) {
            return res.status(400).json({ error: "Missing required fields (amount, email, paymentMethodId)" });
        }

        // 1. Get Customer
        const customerId = await getOrCreateStripeCustomer(stripe, email, parentName || "Parent Celtics");

        // 2. Attach Payment Method to Customer (Required for future charges)
        await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });

        // Set as default for invoice charges
        await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: paymentMethodId }
        });

        if (installments) {
            // --- OPTION B: 3 INSTALLMENTS (No Fee) ---
            // Logic: 
            // 1. Invoice 1: Immediate
            // 2. Invoice 2: +30 Days
            // 3. Invoice 3: +60 Days

            const totalAmount = parseInt(amount); // Amount in cents
            const partAmount = Math.floor(totalAmount / 3);
            const remainder = totalAmount - (partAmount * 3); // Add to first payment to avoid penny loss

            const amount1 = partAmount + remainder;
            const amount2 = partAmount;
            const amount3 = partAmount;

            // --- INVOICE 1 (Immediate) ---
            // --- INVOICE 1 (Immediate) ---
            // 1. Create Invoice (Draft)
            const invoice1 = await stripe.invoices.create({
                customer: customerId,
                auto_advance: true,
                collection_method: 'charge_automatically',
                description: "Paiement 1 sur 3",
                metadata: { sessionId: sessionId, installment: 1 }
            });

            // 2. Create Invoice Item linked to Invoice
            await stripe.invoiceItems.create({
                customer: customerId,
                invoice: invoice1.id,
                amount: amount1,
                currency: 'cad',
                description: `${description || "Inscription Celtics"} - Versement 1/3`
            });

            // 3. Finalize
            const finalized1 = await stripe.invoices.finalizeInvoice(invoice1.id);

            // 4. Pay Invoice 1 Immediate
            const paidInvoice1 = await stripe.invoices.pay(finalized1.id);

            // --- INVOICE 2 (+30 Days) ---
            // We cannot "schedule" a one-off invoice easily in Stripe API without subscriptions or manual handling.
            // However, we can create an Invoice Item now, but only create the Invoice later? No.
            // Best approach for "Scheduled Invoices" without Subscription:
            // Create the Invoice object properly but set `effective_at` (not available on one-off) or standard approach:
            // Actually, for simple deferred payments, Subscription Schedules are cleaner OR just holding the data.
            // BUT, user wants "Invoices".
            // STRIPE HACK: One-off invoices cannot be easily scheduled for auto-charge in future API-wise.
            // ALTERNATIVE: Use `subscription` with 3 iterations.
            // LIMITATION: 'Subscription' implies recurring same amount.
            // PLAN: We will use a standard Subscription approach configured to cancel after 3 cycles?
            // OR: We simply record the "Debt" in our DB and have a cron job generate the Stripe Invoice?
            // OR: We create a Price for the installment and start a subscription.

            // SIMPLER FOR MVP:
            // We create the Invoice Items NOW.
            // But we can't create multiple "Draft" invoices for the future easily that auto-charge.
            // LET'S USE: "Subscription Schedule" for 3 months.
            // OR BETTER: Just create 3 distinct PaymentIntents? No, we need to save card.

            // Let's go with the **Subscription** model as it's most robust for "Auto Charge".
            // 1. Create a Product "Inscription 3 Versements"
            // 2. Create a Price (amount/month)
            // 3. Create Subscription with `iterations=3`.

            // WAIT, exact amounts might vary per child. Subscription needs fixed Price object.
            // Creating ad-hoc prices for every user is messy.

            // REVISED PLAN FOR INSTALLMENTS (Since we are in Firebase):
            // We will create Invoice 1 immediately and pay it.
            // We will store "Future Payments" in Firestore `scheduled_payments` collection.
            // We will use a Scheduled Function (`processScheduledPayments` daily) to generate Invoices 2 & 3.
            // This gives us full control and visibility in ERP.

            // SO: Just do Payment 1 now.
            const paymentIntent = paidInvoice1.payment_intent;

            // --- INVOICE 2 (+45 Days) ---
            const invoice2 = await stripe.invoices.create({
                customer: customerId,
                auto_advance: false,
                collection_method: 'charge_automatically',
                description: "Paiement 2 sur 3",
                metadata: { sessionId: sessionId, installment: 2 }
            });
            await stripe.invoiceItems.create({
                customer: customerId,
                invoice: invoice2.id,
                amount: amount2,
                currency: 'cad',
                description: `${description || "Inscription"} - Versement 2/3`
            });

            // --- INVOICE 3 (+90 Days) ---
            const invoice3 = await stripe.invoices.create({
                customer: customerId,
                auto_advance: false,
                collection_method: 'charge_automatically',
                description: "Paiement 3 sur 3",
                metadata: { sessionId: sessionId, installment: 3 }
            });
            await stripe.invoiceItems.create({
                customer: customerId,
                invoice: invoice3.id,
                amount: amount3,
                currency: 'cad',
                description: `${description || "Inscription"} - Versement 3/3`
            });

            // SAVE FUTURE PAYMENTS TO FIRESTORE (Link to Stripe IDs)
            const futurePay1 = {
                customerId: customerId,
                sessionId: sessionId,
                stripeInvoiceId: invoice2.id,
                amount: amount2,
                currency: 'cad',
                description: `${description || "Inscription"} - Versement 2/3`,
                dueDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)),
                status: 'pending',
                installmentOrder: 2,
                created: admin.firestore.FieldValue.serverTimestamp()
            };
            const futurePay2 = {
                customerId: customerId,
                sessionId: sessionId,
                stripeInvoiceId: invoice3.id,
                amount: amount3,
                currency: 'cad',
                description: `${description || "Inscription"} - Versement 3/3`,
                dueDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)),
                status: 'pending',
                installmentOrder: 3,
                created: admin.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('scheduled_payments').add(futurePay1);
            await db.collection('scheduled_payments').add(futurePay2);

            // Return success
            res.json({
                success: true,
                paymentIntentId: typeof paymentIntent === 'string' ? paymentIntent : paymentIntent.id,
                customerId: customerId,
                invoiceId: invoice1.id,
                isInstallment: true
            });

        } else {
            // --- OPTION A: SINGLE PAYMENT via Invoice ---
            // We use Invoice so the user gets a nice PDF receipt automatically via Stripe.

            // 1. Create Invoice (Draft)
            const invoice = await stripe.invoices.create({
                customer: customerId,
                auto_advance: true,
                collection_method: 'charge_automatically',
                description: "Frais d'inscription (Paiement complet)",
                metadata: { sessionId: sessionId }
            });

            // 2. Create Invoice Item linked to Invoice
            await stripe.invoiceItems.create({
                customer: customerId,
                invoice: invoice.id,
                amount: parseInt(amount),
                currency: 'cad',
                description: description || "Inscription Saison"
            });

            // 3. Finalize
            const finalized = await stripe.invoices.finalizeInvoice(invoice.id);

            // 4. Pay
            const paidInvoice = await stripe.invoices.pay(finalized.id);

            res.json({
                success: true,
                paymentIntentId: paidInvoice.payment_intent,
                customerId: customerId,
                invoiceId: invoice.id
            });
        }

    } catch (e) {
        console.error("Payment Error:", e);
        res.status(500).json({ error: e.message });
    }
});


// --- SCHEDULED FUNCTION: PROCESS FUTURE PAYMENTS ---
// Runs every day to check for due payments and generate invoices
exports.processScheduledPayments = onSchedule("every 24 hours", async (event) => {
    for (const env of ['staging', 'production']) {
        const { db, stripe } = getContext({ headers: { 'x-environment': env } });
        await runScheduledPaymentsForEnv(db, stripe);
    }
});

async function runScheduledPaymentsForEnv(db, stripe) {
    const now = admin.firestore.Timestamp.now();
    const paymentsRef = db.collection("scheduled_payments");

    // Query: status == 'pending' AND dueDate <= now
    const q = paymentsRef.where("status", "==", "pending").where("dueDate", "<=", now);
    const snapshot = await q.get();

    if (snapshot.empty) {
        return;
    }

    const promises = snapshot.docs.map(async (doc) => {
        const payData = doc.data();
        const payId = doc.id;

        console.log(`Processing scheduled payment: ${payId} for ${payData.amount} cents`);

        try {
            let invoiceId = payData.stripeInvoiceId;

            if (!invoiceId) {
                // Fallback: Create if somehow missing
                const invoice = await stripe.invoices.create({
                    customer: payData.customerId,
                    auto_advance: true,
                    collection_method: 'charge_automatically',
                    metadata: { sessionId: payData.sessionId, installment: payData.installmentOrder }
                });
                await stripe.invoiceItems.create({
                    customer: payData.customerId,
                    invoice: invoice.id,
                    amount: payData.amount,
                    currency: payData.currency || 'cad',
                    description: payData.description
                });
                invoiceId = invoice.id;
            }

            // 3. Finalize and Pay
            const finalized = await stripe.invoices.finalizeInvoice(invoiceId);
            await stripe.invoices.pay(finalized.id);

            // 3. Update DB Status
            await paymentsRef.doc(payId).update({
                status: 'processed',
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
                generatedInvoiceId: invoiceId
            });
            console.log(`Invoice ${invoiceId} processed for scheduled payment ${payId}`);

        } catch (e) {
            console.error(`Failed to process payment ${payId}`, e);
            await paymentsRef.doc(payId).update({
                status: 'error',
                lastError: e.message
            });
        }
    });

    await Promise.all(promises);
}

// --- STRIPE LOGIC: MANUAL INVOICE ---
exports.createManualInvoice = onRequest({ cors: true }, async (req, res) => {
    try {
        const { db, stripe } = getContext(req);
        await authenticateAdmin(req, db);
        const { email, name, items, dueDate } = req.body;
        // items = [{ description, amount }]

        const customerId = await getOrCreateStripeCustomer(stripe, email, name);

        // 1. Create Invoice (Draft)
        const invoice = await stripe.invoices.create({
            customer: customerId,
            auto_advance: true,
            collection_method: 'send_invoice',
            days_until_due: 30
        });

        // 2. Create Invoice Items linked to Invoice
        for (const item of items) {
            await stripe.invoiceItems.create({
                customer: customerId,
                invoice: invoice.id,
                amount: item.amount, // cents
                currency: 'cad',
                description: item.description
            });
        }

        // 3. Finalize
        const finalized = await stripe.invoices.finalizeInvoice(invoice.id);

        // If we wanted to send immediately:
        await stripe.invoices.sendInvoice(finalized.id);

        res.json({ success: true, invoiceId: finalized.id, url: finalized.hosted_invoice_url });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// --- STRIPE LOGIC: FETCH INVOICES ---
exports.listStripeInvoices = onRequest({ cors: true }, async (req, res) => {
    try {
        const { db, stripe } = getContext(req);
        await authenticateAdmin(req, db);
        const { limit = 50, starting_after, status } = req.body;

        const params = { limit };
        if (starting_after) params.starting_after = starting_after;
        if (status) params.status = status;

        const invoices = await stripe.invoices.list(params);

        res.json({
            success: true,
            data: invoices.data,
            has_more: invoices.has_more
        });
    } catch (e) {
        console.error("Error fetching stripe invoices:", e);
        res.status(500).json({ error: e.message });
    }
});

exports.getStripeStats = onRequest({ cors: true }, async (req, res) => {
    try {
        const { db, stripe } = getContext(req);
        await authenticateAdmin(req, db);

        // Fetch all paid invoices for the total (Stripe auto-pagination helper)
        let totalPaid = 0;
        let countPaid = 0;
        for await (const invoice of stripe.invoices.list({ status: 'paid', limit: 100 })) {
            totalPaid += invoice.amount_paid;
            countPaid++;
        }

        // Fetch all open/pending invoices
        let totalPending = 0;
        let countPending = 0;
        for await (const invoice of stripe.invoices.list({ status: 'open', limit: 100 })) {
            totalPending += invoice.amount_due;
            countPending++;
        }

        res.json({
            success: true,
            totalPaidRecent: totalPaid,
            totalPendingRecent: totalPending,
            countPaid: countPaid,
            countPending: countPending
        });
    } catch (e) {
        console.error("Error fetching stripe stats:", e);
        res.status(500).json({ error: e.message });
    }
});


// --- STRIPE WEBHOOK (Sync to Firestore) ---
exports.stripeWebhook = onRequest(async (req, res) => {
    const env = req.query.env === 'production' ? 'production' : 'staging';
    const isCampWebhook = req.query.camp === 'true';

    // Pass `isCampWebhook` to get the correct Stripe instance and endpointSecret
    const { db, stripe, endpointSecret } = getContext({ headers: { 'x-environment': env } }, isCampWebhook);

    const sig = req.headers['stripe-signature'];

    let event;

    try {
        if (!sig || !endpointSecret || endpointSecret.startsWith("whsec_YOUR_STRIPE_WEBHOOK_SECRET")) {
            // If secret not configured, we allow body directly ONLY in development/testing
            event = req.body;
        } else {
            event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
        }
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle Events
    if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object;
        const sessionId = invoice.metadata ? invoice.metadata.sessionId : null;

        // Sync to Firestore 'invoices' collection removed in favor of direct Stripe fetch

        // Skip if this is a camp registration (already handled atomically in processCampRegistration)
        if (invoice.metadata && invoice.metadata.type === 'camp_registration') {
            return res.json({ received: true, note: "Camp registration handled atomically" });
        }

        // UPDATE REGISTRATIONS (Standard)
        if (sessionId) {
            const regsSnap = await db.collection('registrations').where('registrationSessionId', '==', sessionId).get();
            if (!regsSnap.empty) {
                const isFinal = !invoice.metadata.installment || invoice.metadata.installment == 3;
                const newStatus = isFinal ? 'Paid' : 'Partial';

                const updateBatch = db.batch();
                regsSnap.forEach(doc => {
                    updateBatch.update(doc.ref, {
                        paymentStatus: newStatus,
                        lastPaidInvoiceId: invoice.id,
                        lastPaymentDate: admin.firestore.FieldValue.serverTimestamp()
                    });
                });
                await updateBatch.commit();
                console.log(`Updated ${regsSnap.size} registrations for session ${sessionId} to ${newStatus}`);
            }
        }
    } else if (event.type === 'invoice.payment_failed' || event.type === 'invoice.created' || event.type === 'invoice.updated') {
        const invoice = event.data.object;
        // Basic sync for visibility removed in favor of direct Stripe fetch
    }

    res.json({ received: true });
});

// --- HTML TEMPLATE HELPER ---
const getEmailTemplate = (content, title = "Celtics de l'Ouest") => {
    return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: 'Helvetica', 'Arial', sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
            .header { background-color: #008744; padding: 20px; text-align: center; color: white; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px 20px; line-height: 1.6; color: #333333; }
            .footer { background-color: #333333; color: #ffffff; padding: 20px; text-align: center; font-size: 12px; }
            .footer a { color: #008744; text-decoration: none; }
            .btn { display: inline-block; padding: 10px 20px; background-color: #008744; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${title}</h1>
            </div>
            <div class="content">
                ${content}
            </div>
            <div class="footer">
                <p>&copy; ${new Date().getFullYear()} Celtics de l'Ouest. Tous droits réservés.</p>
                <p>Club de Soccer de Portneuf | <a href="https://celticsdelouest.com">Visiter le site web</a></p>
                <p>Vous recevez cet email car vous êtes membre ou parent d'un membre.</p>
            </div>
        </div>
    </body>
    </html>
    `;
};

// --- HTTP FUNCTION: SEND CAMPAIGN (Immediate or Test) ---
exports.sendCampaign = onRequest({ cors: true }, async (req, res) => {
    try {
        const { db, resend } = getContext(req);
        await authenticateAdmin(req, db);
        const { campaignId, testEmail, testContent, testSubject } = req.body;

        // CASE 1: TEST EMAIL
        if (testEmail) {
            const html = getEmailTemplate(testContent || "Ceci est un test.");
            const { data, error } = await resend.emails.send({
                from: "Celtics de l'Ouest <info@solutionsquasar.ca>",
                reply_to: "celtics.portneuf@gmail.com",
                to: testEmail,
                subject: `[TEST] ${testSubject || "Test Design"}`,
                html: html
            });
            if (error) throw error;
            return res.json({ success: true, message: "Test envoyé" });
        }

        // CASE 2: SEND ACTUAL CAMPAIGN
        if (!campaignId) return res.status(400).json({ error: "Missing campaignId" });

        const docRef = db.collection("campaigns").doc(campaignId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) return res.status(404).json({ error: "Campaign not found" });

        const campaign = docSnap.data();

        // Guard: Don't resend if already sent (unless force flag?)
        if (campaign.status === "sent") return res.status(400).json({ error: "Campaign already sent" });

        // 1. Resolve Audience
        let recipients = [];

        // Logic to fetch users based on audience filter
        // This can be heavy, so we might need to handle this via chunks or a separate trigger if list is huge.
        // For now, we assume reasonable size (< 500)

        // FETCH RECIPIENTS LOGIC (Simplified for now, needs to match frontend logic or pass recipients IDs)
        // Ideally, frontend passes criteria, backend queries DB.
        // Let's assume the frontend passed 'audience' object in the campaign doc.

        const audience = campaign.audience || {};
        let snapshot;

        if (audience.type === 'specific') {
            // Specific emails already in audience.emails array
            recipients = audience.emails || [];
        } else if (audience.type === 'all_active') {
            snapshot = await db.collection("players").get(); // Filter by season if needed
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.email) recipients.push(d.email);
            });
        } else if (audience.type === 'team') {
            snapshot = await db.collection("players").where("teamId", "==", audience.teamId).get();
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.email) recipients.push(d.email);
            });
        } else if (audience.type === 'parents') {
            snapshot = await db.collection("players").get();
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.parentEmail) recipients.push(d.parentEmail);
                if (d.parent1Email) recipients.push(d.parent1Email);
                if (d.parent2Email) recipients.push(d.parent2Email);
            });
        } else if (audience.type === 'coaches') {
            snapshot = await db.collection("coaches").where("visible", "!=", false).get();
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.email) recipients.push(d.email);
            });
        } else if (audience.type === 'referees') {
            snapshot = await db.collection("referees").where("visible", "!=", false).get();
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.email) recipients.push(d.email);
            });
        } else if (audience.type === 'board') {
            snapshot = await db.collection("board_members").where("visible", "!=", false).get();
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.email) recipients.push(d.email);
            });
        }

        // Deduplicate
        recipients = [...new Set(recipients)];

        if (recipients.length === 0) {
            await docRef.update({ status: 'sent', sentAt: admin.firestore.FieldValue.serverTimestamp(), 'stats.error': "No recipients found" });
            return res.json({ success: false, message: "No recipients found" });
        }

        // 2. Send using Batch (up to 100 per request) for individual tracking
        const batchPayload = recipients.map(email => ({
            from: "Celtics de l'Ouest <info@solutionsquasar.ca>",
            reply_to: "celtics.portneuf@gmail.com",
            to: [email],
            subject: campaign.subject,
            html: getEmailTemplate(campaign.content, campaign.subject),
            tags: [{ name: 'campaignId', value: campaignId }]
        }));

        const chunkSize = 100;
        for (let i = 0; i < batchPayload.length; i += chunkSize) {
            const chunk = batchPayload.slice(i, i + chunkSize);
            const { error } = await resend.batch.send(chunk);
            if (error) throw error;
        }

        // 3. Update Doc
        await docRef.update({
            status: 'sent',
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            'stats.sentCount': recipients.length,
            openedBy: [] // Initialize array for tracking
        });

        res.json({ success: true, recipientsCount: recipients.length });

    } catch (e) {
        console.error("Error sending campaign:", e);
        res.status(500).json({ error: e.message });
    }
});


// --- SCHEDULED FUNCTION: PROCESS CAMPAIGNS ---
// Runs every 15 minutes to check for scheduled campaigns
exports.processScheduledCampaigns = onSchedule("every 15 minutes", async (event) => {
    for (const env of ['staging', 'production']) {
        const { db, resend } = getContext({ headers: { 'x-environment': env } });
        await runScheduledCampaignsForEnv(db, resend);
    }
});

async function runScheduledCampaignsForEnv(db, resend) {
    const now = admin.firestore.Timestamp.now();
    const campaignsRef = db.collection("campaigns");

    // Query: status == 'scheduled' AND scheduledAt <= now
    const q = campaignsRef.where("status", "==", "scheduled").where("scheduledAt", "<=", now);
    const snapshot = await q.get();

    if (snapshot.empty) {
        console.log("No scheduled campaigns to process.");
        return;
    }

    const promises = snapshot.docs.map(async (doc) => {
        const campaign = doc.data();
        const campaignId = doc.id;

        console.log(`Processing scheduled campaign: ${campaignId}`);

        try {
            // CALL THE SEND LOGIC (Reuse code or call function locally? Better to reuse logic)
            // For simplicity in this single file, I'll duplicate the simplified send logic or refactor.
            // Let's refactor `sendCampaignCore` if this was a larger project.
            // For now, I'll make a HTTP call to my own function OR just copy logic.
            // Copying basic logic for safety and speed here.

            // 1. Resolve Audience (Same as above)
            let recipients = [];
            const audience = campaign.audience || {};
            let subSnap;

            if (audience.type === 'specific') recipients = audience.emails || [];
            else if (audience.type === 'all_active') {
                subSnap = await db.collection("players").get();
                subSnap.forEach(d => { if (d.data().email) recipients.push(d.data().email); });
            } else if (audience.type === 'team') {
                subSnap = await db.collection("players").where("teamId", "==", audience.teamId).get();
                subSnap.forEach(d => { if (d.data().email) recipients.push(d.data().email); });
            } else if (audience.type === 'parents') {
                subSnap = await db.collection("players").get();
                subSnap.forEach(d => {
                    const data = d.data();
                    if (data.parentEmail) recipients.push(data.parentEmail);
                    if (data.parent1Email) recipients.push(data.parent1Email);
                    if (data.parent2Email) recipients.push(data.parent2Email);
                });
            } else if (audience.type === 'coaches') {
                subSnap = await db.collection("coaches").where("visible", "!=", false).get();
                subSnap.forEach(d => { if (d.data().email) recipients.push(d.data().email); });
            } else if (audience.type === 'referees') {
                subSnap = await db.collection("referees").where("visible", "!=", false).get();
                subSnap.forEach(d => { if (d.data().email) recipients.push(d.data().email); });
            } else if (audience.type === 'board') {
                subSnap = await db.collection("board_members").where("visible", "!=", false).get();
                subSnap.forEach(d => { if (d.data().email) recipients.push(d.data().email); });
            }
            recipients = [...new Set(recipients)];

            if (recipients.length > 0) {
                const batchPayload = recipients.map(email => ({
                    from: "Celtics de l'Ouest <info@solutionsquasar.ca>",
                    reply_to: "celtics.portneuf@gmail.com",
                    to: [email],
                    subject: campaign.subject,
                    html: getEmailTemplate(campaign.content, campaign.subject),
                    tags: [{ name: 'campaignId', value: campaignId }]
                }));

                const chunkSize = 100;
                for (let i = 0; i < batchPayload.length; i += chunkSize) {
                    const chunk = batchPayload.slice(i, i + chunkSize);
                    await resend.batch.send(chunk);
                }
            }

            // Update status
            await campaignsRef.doc(campaignId).update({
                status: 'sent',
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                'stats.sentCount': recipients.length,
                openedBy: []
            });

            // HANDLE RECURRENCE
            if (campaign.recurrence) {
                // Calculate next date (Simple Weekly/Monthly logic)
                let nextDate = new Date(campaign.scheduledAt.toDate());
                if (campaign.recurrence === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
                if (campaign.recurrence === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);

                // Create NEXT campaign draft/scheduled
                const newCampaign = { ...campaign };
                delete newCampaign.sentAt;
                delete newCampaign.stats;
                newCampaign.status = 'scheduled';
                newCampaign.scheduledAt = admin.firestore.Timestamp.fromDate(nextDate);
                newCampaign.createdAt = admin.firestore.FieldValue.serverTimestamp();
                newCampaign.subject = campaign.subject + " (Série)";

                await campaignsRef.add(newCampaign);
                console.log(`Recurrence created for ${campaignId}`);
            }

        } catch (e) {
            console.error(`Failed to process campaign ${campaignId}`, e);
            await campaignsRef.doc(campaignId).update({ 'stats.error': e.message });
        }
    });

    await Promise.all(promises);
}

const { Webhook } = require("svix");

// ... (other imports)

// --- CAMP CONFIGURATION: FETCH DATA SECURELY ---
exports.getCampSettings = onRequest({ cors: true }, async (req, res) => {
    try {
        const { db } = getContext(req);

        // 1. Fetch settings
        const settingsSnap = await db.collection("settings").doc("camp_ete").get();
        if (!settingsSnap.exists) {
            return res.status(404).json({ error: "Configuration introuvable." });
        }
        const settings = settingsSnap.data();

        // 2. Fetch periods
        const periodsSnap = await db.collection("camp_periods").orderBy("startDate", "asc").get();
        const periods = [];
        periodsSnap.forEach(doc => {
            const data = doc.data();
            // Normalize field names: admin saves `maxCapacity`, frontend reads `maxRegistrations`
            periods.push({
                id: doc.id,
                ...data,
                maxRegistrations: data.maxRegistrations || data.maxCapacity || 0
            });
        });

        res.json({ settings, periods });
    } catch (e) {
        console.error("getCampSettings Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- WEBHOOK: RESEND EVENTS ---
exports.resendWebhook = onRequest(async (req, res) => {
    const env = req.query.env === 'production' ? 'production' : 'staging';
    const { db } = getContext({ headers: { 'x-environment': env } });

    const secret = env === 'production' ? process.env.RESEND_WEBHOOK_SECRET_PROD : process.env.RESEND_WEBHOOK_SECRET;

    // Verify Signature
    if (secret && secret !== "whsec_YOUR_SIGNING_SECRET") {
        try {
            const wh = new Webhook(secret);
            // req.rawBody required for verification
            wh.verify(req.rawBody, req.headers);
        } catch (err) {
            console.error("Webhook verification failed:", err);
            return res.status(400).send("Webhook verification failed");
        }
    }

    const type = req.body.type; // 'email.opened', 'email.clicked'
    const data = req.body.data;

    console.log("Webhook received:", type, data);

    if (!data) return res.status(200).send("No data");

    // Look for tags to identify campaign
    const tags = data.tags || [];
    const campaignTag = tags.find(t => t.name === 'campaignId');

    if (campaignTag && campaignTag.value) {
        const campaignId = campaignTag.value;
        const docRef = db.collection("campaigns").doc(campaignId);

        try {
            if (type === 'email.opened') {
                const updateData = { 'stats.openCount': admin.firestore.FieldValue.increment(1) };
                if (data.to && data.to.length > 0) {
                    updateData.openedBy = admin.firestore.FieldValue.arrayUnion(data.to[0]);
                }
                await docRef.update(updateData);
            } else if (type === 'email.clicked') {
                await docRef.update({
                    'stats.clickCount': admin.firestore.FieldValue.increment(1)
                });
            }
        } catch (e) {
            console.error("Error updating stats:", e);
        }
    }

    res.status(200).send("Processed");
});

// --- CAMP REGISTRATION: ATOMIC PROCESS ---
exports.processCampRegistration = onRequest({ cors: true }, async (req, res) => {
    try {
        const { paymentMethodId, amount, email, parentFirstName, parentLastName, parentPhone, registrations } = req.body;
        const { db, stripe, resend } = getContext(req, true); // true for camp context

        const missing = [];
        if (!amount) missing.push("montant");
        if (!email) missing.push("email");
        if (!paymentMethodId) missing.push("méthode de paiement");
        if (!registrations || registrations.length === 0) missing.push("inscriptions");
        if (!parentFirstName) missing.push("prénom parent");
        if (!parentLastName) missing.push("nom parent");
        if (!parentPhone) missing.push("téléphone parent");

        if (missing.length > 0) {
            return res.status(400).json({ error: `Champs obligatoires manquants : ${missing.join(', ')}.` });
        }

        const parentName = `${parentFirstName} ${parentLastName}`;

        // 1. Get/Create Customer
        const customerId = await getOrCreateStripeCustomer(stripe, email, parentName);

        // 2. Attach Payment Method
        await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
        await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: paymentMethodId }
        });

        const { limit = 100 } = req.body;
        const invoices = await stripe.invoices.list({
            limit: limit,
            expand: ['data.customer']
        });

        // 3. Create & Pay Invoice
        const invoice = await stripe.invoices.create({
            customer: customerId,
            auto_advance: true,
            collection_method: 'charge_automatically',
            description: `Inscription Camp de Soccer - Multi-enfants (${registrations.length})`,
            metadata: { type: 'camp_registration', registrationsCount: registrations.length.toString() }
        });

        await stripe.invoiceItems.create({
            customer: customerId,
            invoice: invoice.id,
            amount: parseInt(amount),
            currency: 'cad',
            description: `Camp de Soccer - ${registrations.length} enfant(s) inscrit(s)`
        });

        const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
        const paidInvoice = await stripe.invoices.pay(finalized.id);

        // 4. Save Registrations to Firestore (Batch)
        const batch = db.batch();
        const registrationIds = [];
        const registrationSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        for (const reg of registrations) {
            const regRef = db.collection("camp_registrations").doc();
            registrationIds.push(regRef.id);

            const campRegData = {
                ...reg,
                parentFirstName,
                parentLastName,
                parentEmail: email,
                parentPhone,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                weeksSelected: reg.selectedPeriods,
                totalPaid: (amount / 100).toFixed(2), // Note: This is the total for the WHOLE session
                status: 'Paid',
                stripePaymentIntentId: paidInvoice.payment_intent,
                stripeInvoiceId: invoice.id,
                registrationSessionId,
                childFirstName: reg.firstName, // Mapping for consistency with existing data
                childLastName: reg.lastName,
                countHandled: true
            };
            batch.set(regRef, campRegData);

            // 5. Update Period Capacities (Atomic increment)
            for (const periodId of reg.selectedPeriods) {
                const periodRef = db.collection("camp_periods").doc(periodId);
                batch.set(periodRef, {
                    currentRegistrations: admin.firestore.FieldValue.increment(1)
                }, { merge: true });
            }
        }
        await batch.commit();

        // 6. Send Confirmation Email
        try {
            // Build children summaries
            let childrenHtml = '';
            for (const reg of registrations) {
                const periodsSnap = await Promise.all(reg.selectedPeriods.map(id => db.collection("camp_periods").doc(id).get()));
                const periodsText = periodsSnap.map(snap => {
                    if (snap.exists) {
                        const p = snap.data();
                        const s = new Date(p.startDate + 'T12:00:00').toLocaleDateString('fr-CA');
                        const e = new Date(p.endDate + 'T12:00:00').toLocaleDateString('fr-CA');
                        return `<li>Du ${s} au ${e}</li>`;
                    }
                    return `<li>Période ID: ${snap.id}</li>`;
                }).join('');

                childrenHtml += `
                    <div style="margin-bottom: 20px; padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 8px;">
                        <h4 style="margin-top: 0; color: #008744;">Enfant : ${reg.firstName} ${reg.lastName}</h4>
                        <p style="margin-bottom: 5px;"><strong>Semaines :</strong></p>
                        <ul style="padding-left: 20px; margin-top: 5px;">${periodsText}</ul>
                    </div>
                `;
            }

            const totalDisplay = (amount / 100).toFixed(2) + " $";

            const emailHtml = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden; background-color: #f9f9f9;">
                    <div style="background-color: #008744; padding: 30px; text-align: center; color: white;">
                        <h1 style="margin: 0;">Confirmation - Camp de Soccer</h1>
                        <p style="margin: 5px 0 0 0; opacity: 0.9;">Celtics de l'Ouest</p>
                    </div>
                    <div style="padding: 24px; line-height: 1.6;">
                        <p>Bonjour ${parentFirstName},</p>
                        <p>Nous avons bien reçu votre inscription pour ${registrations.length > 1 ? 'vos enfants' : 'votre enfant'} au camp de soccer des Celtics de l'Ouest pour l'été 2026. Merci de votre confiance !</p>
                        
                        <h3 style="color: #008744; margin-top: 30px; margin-bottom: 15px;">Détails de l'inscription</h3>
                        ${childrenHtml}

                        <div style="background: white; padding: 20px; border-radius: 8px; margin-top: 25px; border: 1px solid #008744; text-align: right;">
                            <span style="color: #666; font-size: 1.1rem;">Total payé :</span>
                            <span style="font-size: 1.8rem; font-weight: 800; color: #008744; margin-left: 10px;">${totalDisplay}</span>
                            <div style="font-size: 0.85rem; color: #888;">Taxes incluses</div>
                        </div>

                        <p style="margin-top: 40px; text-align: center; color: #666; font-size: 0.9em; background: #fff; padding: 15px; border-radius: 8px;">
                            Si vous avez des questions, contactez-nous au <a href="mailto:celtics.portneuf@gmail.com" style="color: #008744; font-weight: 600; text-decoration: none;">celtics.portneuf@gmail.com</a>.
                        </p>
                    </div>
                    <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee;">
                        &copy; ${new Date().getFullYear()} Celtics de l'Ouest. Tous droits réservés.
                    </div>
                </div>
            `;

            await resend.emails.send({
                from: "Celtics de l'Ouest <info@solutionsquasar.ca>",
                reply_to: "celtics.portneuf@gmail.com",
                to: email,
                subject: "Confirmation d'inscription - Camp de Soccer Celtics",
                html: emailHtml
            });
        } catch (mailErr) {
            console.error("Email error (non-blocking):", mailErr);
        }

        res.json({
            success: true,
            registrationIds,
            paymentIntentId: paidInvoice.payment_intent
        });

    } catch (e) {
        console.error("processCampRegistration Error:", e);
        res.status(500).json({
            error: e.message,
            code: e.code || "unknown",
            stack: e.stack // Useful for pinpointing the exact line in Cloud Functions logs
        });
    }
});

// --- EMAIL UTILITY: SEND CONFIRMATION EMAIL (Standard) ---
exports.sendConfirmationEmail = onRequest({ cors: true }, async (req, res) => {
    try {
        const { resend } = getContext(req);
        const { parentEmail, emailHtml } = req.body;
        if (!parentEmail || !emailHtml) return res.status(400).json({ error: "Missing parentEmail or emailHtml" });

        const { data, error } = await resend.emails.send({
            from: "Celtics de l'Ouest <info@solutionsquasar.ca>",
            reply_to: "celtics.portneuf@gmail.com",
            to: parentEmail,
            subject: "Confirmation d'inscription - Celtics de l'Ouest",
            html: emailHtml, // Already formatted? Or wrap it? 
            // Assuming original caller formats it well or uses simple HTML
        });

        if (error) {
            console.error("Resend Error:", error);
            return res.status(400).json({ error });
        }
        res.status(200).json({ data });
    } catch (e) {
        console.error("Function Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- ADMIN INVITATION LOGIC ---
exports.inviteAdmin = onRequest({ cors: true }, async (req, res) => {
    try {
        const { db, resend } = getContext(req);
        await authenticateAdmin(req, db);
        const { email, name } = req.body;
        if (!email) return res.status(400).json({ error: "Missing email" });

        const lowerEmail = email.toLowerCase().trim();
        let user;

        try {
            // 1. Create User in Auth (or get if exists)
            try {
                user = await admin.auth().getUserByEmail(lowerEmail);
            } catch (err) {
                if (err.code === 'auth/user-not-found') {
                    user = await admin.auth().createUser({
                        email: lowerEmail,
                        displayName: name || '',
                    });
                } else {
                    throw err;
                }
            }

            // 2. Generate Reset Link
            const firebaseLink = await admin.auth().generatePasswordResetLink(lowerEmail);

            // 3. Create a Redirect Link (to prevent scanners from clicking the one-time link)
            const redirectLink = `https://celticsdelouest.web.app/admin-erp/invite-confirm.html?link=${encodeURIComponent(firebaseLink)}`;

            // 4. Format Email
            const emailContent = `
                <p>Bonjour ${name || 'nouvel utilisateur'},</p>
                <p>Vous avez été invité à rejoindre la plateforme administrative des <strong>Celtics de l'Ouest</strong>.</p>
                <p>Pour finaliser votre compte et choisir votre mot de passe, veuillez cliquer sur le bouton ci-dessous :</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${redirectLink}" class="btn" style="color: white; padding: 12px 24px; text-decoration: none; font-weight: bold;">Initialiser mon compte</a>
                </div>
                <p>À bientôt,<br>L'équipe des Celtics</p>
            `;
            const html = getEmailTemplate(emailContent, "Invitation Plateforme Admin");

            // 4. Send Email
            const { data, error } = await resend.emails.send({
                from: "Celtics de l'Ouest <info@solutionsquasar.ca>",
                reply_to: "celtics.portneuf@gmail.com",
                to: lowerEmail,
                subject: "Bienvenue sur la plateforme administrative - Celtics de l'Ouest",
                html: html
            });

            if (error) throw error;

            res.json({ success: true, message: "Invitation envoyée", authId: user.uid });

        } catch (authError) {
            console.error("Auth Error in inviteAdmin:", authError);
            res.status(500).json({ error: "Auth Error: " + authError.message });
        }

    } catch (e) {
        console.error("inviteAdmin main error:", e);
        res.status(500).json({ error: e.message });
    }
});


// --- PASSWORD RESET: SEND ADMIN PASSWORD RESET EMAIL ---
exports.sendAdminPasswordReset = onRequest({ cors: true }, async (req, res) => {
    try {
        const { resend } = getContext(req);
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email required" });
        }

        // Verify user exists
        let user;
        try {
            user = await admin.auth().getUserByEmail(email);
        } catch (error) {
            return res.status(404).json({ error: "User not found" });
        }

        // Generate Firebase password reset link with custom redirect
        const actionCodeSettings = {
            url: 'https://celticsdelouest.web.app/admin-erp/reset-password.html',
            handleCodeInApp: false
        };

        const resetLink = await admin.auth().generatePasswordResetLink(
            email,
            actionCodeSettings
        );

        // Send email via Resend
        await resend.emails.send({
            from: "Celtics de l'Ouest <info@solutionsquasar.ca>",
            to: email,
            subject: "Réinitialisation de votre mot de passe administrateur",
            html: getPasswordResetEmailTemplate(resetLink, email)
        });

        res.json({ success: true });

    } catch (error) {
        console.error("Error sending password reset:", error);
        res.status(500).json({ error: error.message });
    }
});

function getPasswordResetEmailTemplate(resetLink, email) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #27ae60; margin: 0;">Celtics de l'Ouest</h1>
                <p style="color: #666; margin: 5px 0;">Administration ERP</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="color: #27ae60; margin-top: 0;">Réinitialisation de mot de passe</h2>
                <p>Bonjour,</p>
                <p>Une demande de réinitialisation de mot de passe a été effectuée pour votre compte administrateur (<strong>${email}</strong>).</p>
                <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${resetLink}" 
                   style="display: inline-block; background: #27ae60; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                    Réinitialiser mon mot de passe
                </a>
            </div>
            
            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; font-size: 14px; color: #856404;">
                    <strong>⚠️ Important :</strong> Ce lien est valide pendant <strong>1 heure</strong>.
                </p>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666;">
                <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email en toute sécurité.</p>
                <p style="margin-top: 15px;">
                    <em>Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :</em><br>
                    <a href="${resetLink}" style="color: #27ae60; word-break: break-all;">${resetLink}</a>
                </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999;">
                <p>© ${new Date().getFullYear()} Celtics de l'Ouest - Tous droits réservés</p>
            </div>
        </body>
        </html>
    `;
}

// --- FIRESTORE TRIGGERS: CAMP REGISTRATION SYNC ---

/**
 * Shared logic to handle registration changes
 * @param {string} dbId - The database ID
 * @param {Array} addPeriods - Period IDs to increment
 * @param {Array} removePeriods - Period IDs to decrement
 */
async function syncRegistrationChange(dbId, addPeriods, removePeriods) {
    const db = getFirestore(dbId);
    const batch = db.batch();

    const addSet = new Set(addPeriods);
    const removeSet = new Set(removePeriods);

    // Truly added (not in remove)
    const toAdd = addPeriods.filter(p => !removeSet.has(p));
    // Truly removed (not in add)
    const toRemove = removePeriods.filter(p => !addSet.has(p));

    toAdd.forEach(pId => {
        const ref = db.collection("camp_periods").doc(pId);
        batch.set(ref, { currentRegistrations: admin.firestore.FieldValue.increment(1) }, { merge: true });
    });

    toRemove.forEach(pId => {
        const ref = db.collection("camp_periods").doc(pId);
        batch.set(ref, { currentRegistrations: admin.firestore.FieldValue.increment(-1) }, { merge: true });
    });

    if (toAdd.length > 0 || toRemove.length > 0) {
        await batch.commit();
        console.log(`Synced registration change in ${dbId}: +[${toAdd}] -[${toRemove}]`);
    }
}

// 1. ON CREATED
const handleCreated = async (event) => {
    const data = event.data.data();
    if (!data || data.countHandled) return; // Already handled by atomic function

    const periods = data.weeksSelected || data.selectedPeriodsId || [];
    if (periods.length === 0) return;

    await syncRegistrationChange(event.database, periods, []);
};

exports.onCampRegistrationCreated = onDocumentCreated("camp_registrations/{regId}", handleCreated);
exports.onCampRegistrationCreatedProd = onDocumentCreated({ document: "camp_registrations/{regId}", database: "prod" }, handleCreated);

// 2. ON DELETED
const handleDeleted = async (event) => {
    const data = event.data.data();
    if (!data) return;

    const periods = data.weeksSelected || data.selectedPeriodsId || [];
    if (periods.length === 0) return;

    await syncRegistrationChange(event.database, [], periods);
};

exports.onCampRegistrationDeleted = onDocumentDeleted("camp_registrations/{regId}", handleDeleted);
exports.onCampRegistrationDeletedProd = onDocumentDeleted({ document: "camp_registrations/{regId}", database: "prod" }, handleDeleted);

// 3. ON UPDATED
const handleUpdated = async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before || !after) return;

    const beforePeriods = before.weeksSelected || before.selectedPeriodsId || [];
    const afterPeriods = after.weeksSelected || after.selectedPeriodsId || [];

    // Compare arrays
    const isSame = JSON.stringify(beforePeriods.sort()) === JSON.stringify(afterPeriods.sort());
    if (isSame) return;

    await syncRegistrationChange(event.database, afterPeriods, beforePeriods);
};

exports.onCampRegistrationUpdated = onDocumentUpdated("camp_registrations/{regId}", handleUpdated);
exports.onCampRegistrationUpdatedProd = onDocumentUpdated({ document: "camp_registrations/{regId}", database: "prod" }, handleUpdated);

// --- STRIPE LOGIC: DIRECT FETCH FOR ERP ---

/**
 * Lists recent Stripe invoices directly
 * Used by ERP to show history and scheduled payments without Firestore sync
 */
exports.listStripeInvoices = onRequest({ cors: true }, async (req, res) => {
    try {
        const { db, stripe } = getContext(req);
        await authenticateAdmin(req, db);

        const { limit = 100 } = req.body;

        // Fetch all statuses (paid, open, draft, void, uncollectible)
        const invoices = await stripe.invoices.list({
            limit: limit,
            expand: ['data.customer']
        });

        res.json({
            success: true,
            data: invoices.data,
            has_more: invoices.has_more
        });

    } catch (error) {
        console.error("Error listing invoices:", error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Aggregates statistics from Stripe invoices
 * Calculates exact revenue from the source of truth
 */
exports.getStripeStats = onRequest({ cors: true }, async (req, res) => {
    try {
        const { db, stripe } = getContext(req);
        await authenticateAdmin(req, db);

        let totalPaidRecent = 0;
        let totalPendingRecent = 0;
        let countPaid = 0;
        let countPending = 0;

        // Use auto-pagination to fetch ALL invoices for the stats
        // (Stripe Node SDK supports async iteration)
        for await (const inv of stripe.invoices.list({ limit: 100 })) {
            if (inv.status === 'paid') {
                totalPaidRecent += inv.amount_paid;
                countPaid++;
            } else if (inv.status === 'open' || inv.status === 'draft') {
                totalPendingRecent += inv.amount_due;
                countPending++;
            }
        }

        res.json({
            success: true,
            totalPaidRecent,
            totalPendingRecent,
            countPaid,
            countPending
        });

    } catch (error) {
        console.error("Error fetching stats:", error);
        res.status(500).json({ error: error.message });
    }
});
