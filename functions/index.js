const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { Resend } = require("resend");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY || 'YOUR_RESEND_KEY');

// Initialize Stripe (Test Key)
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'YOUR_STRIPE_KEY');

// --- AUTH HELPER: VERIFY ADMIN ---
async function authenticateAdmin(req) {
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
async function getOrCreateStripeCustomer(email, name) {
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

        if (!amount || !email || !paymentMethodId) {
            return res.status(400).json({ error: "Missing required fields (amount, email, paymentMethodId)" });
        }

        // 1. Get Customer
        const customerId = await getOrCreateStripeCustomer(email, parentName || "Parent Celtics");

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
    const now = admin.firestore.Timestamp.now();
    const paymentsRef = db.collection("scheduled_payments");

    // Query: status == 'pending' AND dueDate <= now
    const q = paymentsRef.where("status", "==", "pending").where("dueDate", "<=", now);
    const snapshot = await q.get();

    if (snapshot.empty) {
        console.log("No scheduled payments due.");
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
});

// --- STRIPE LOGIC: MANUAL INVOICE ---
exports.createManualInvoice = onRequest({ cors: true }, async (req, res) => {
    try {
        await authenticateAdmin(req);
        const { email, name, items, dueDate } = req.body;
        // items = [{ description, amount }]

        const customerId = await getOrCreateStripeCustomer(email, name);

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


// --- STRIPE WEBHOOK (Sync to Firestore) ---
exports.stripeWebhook = onRequest(async (req, res) => {
    const endpointSecret = "whsec_YOUR_STRIPE_WEBHOOK_SECRET"; // Configure this in specific deployment
    const sig = req.headers['stripe-signature'];

    let event;

    try {
        if (!sig || !endpointSecret || endpointSecret === "whsec_YOUR_STRIPE_WEBHOOK_SECRET") {
            // If secret not configured, we allow body directly ONLY in development/testing
            // In production, this SHOULD fail if sig is missing
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

        // Sync to Firestore 'invoices' collection
        await db.collection('invoices').doc(invoice.id).set({
            stripeId: invoice.id,
            customerId: invoice.customer,
            customerEmail: invoice.customer_email,
            amount: invoice.amount_due,
            amountPaid: invoice.amount_paid,
            status: invoice.status,
            currency: invoice.currency,
            hostedInvoiceUrl: invoice.hosted_invoice_url,
            pdfUrl: invoice.invoice_pdf,
            created: invoice.created,
            lines: invoice.lines.data.map(l => ({ desc: l.description, amount: l.amount }))
        }, { merge: true });

        // UPDATE REGISTRATIONS
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
    } else if (event.type === 'invoice.payment_failed' || event.type === 'invoice.created') {
        const invoice = event.data.object;
        // Basic sync for visibility
        await db.collection('invoices').doc(invoice.id).set({
            stripeId: invoice.id,
            customerId: invoice.customer,
            customerEmail: invoice.customer_email,
            status: invoice.status,
            amount: invoice.amount_due,
            metadata: invoice.metadata || {},
            created: invoice.created
        }, { merge: true });
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
        await authenticateAdmin(req);
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
            // Query players with active flag (logic to be refined)
            snapshot = await db.collection("players").get(); // Filter by season if needed
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.parentEmail) recipients.push(d.parentEmail);
            });
        } else if (audience.type === 'team') {
            snapshot = await db.collection("players").where("teamId", "==", audience.teamId).get();
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.parentEmail) recipients.push(d.parentEmail);
            });
        } else if (audience.type === 'coaches') {
            snapshot = await db.collection("coaches").get();
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.email) recipients.push(d.email); // Assuming coaches have 'email'
            });
        }
        // Add more cases as needed

        // Deduplicate
        recipients = [...new Set(recipients)];

        if (recipients.length === 0) {
            await docRef.update({ status: 'sent', sentAt: admin.firestore.FieldValue.serverTimestamp(), 'stats.error': "No recipients found" });
            return res.json({ success: false, message: "No recipients found" });
        }

        // 2. Send (Batching handled by Resend logic or loop)
        // Resend allows up to 50 "to" in one call, or use BCC. 
        // For mass marketing, individual emails are better for delivery/tracking.
        // Loop for now (simple), optimized later for bulk.

        // Using BCC for efficiency if generic content
        const { data, error } = await resend.emails.send({
            from: "Celtics de l'Ouest <info@solutionsquasar.ca>",
            reply_to: "celtics.portneuf@gmail.com",
            bcc: recipients,
            subject: campaign.subject,
            html: getEmailTemplate(campaign.content, campaign.subject),
            tags: [{ name: 'campaignId', value: campaignId }]
        });

        if (error) throw error;

        // 3. Update Doc
        await docRef.update({
            status: 'sent',
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            'stats.sentCount': recipients.length,
            'stats.resendId': data.id
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
                subSnap.forEach(d => { if (d.data().parentEmail) recipients.push(d.data().parentEmail); });
            } else if (audience.type === 'team') {
                subSnap = await db.collection("players").where("teamId", "==", audience.teamId).get();
                subSnap.forEach(d => { if (d.data().parentEmail) recipients.push(d.data().parentEmail); });
            }
            recipients = [...new Set(recipients)];

            if (recipients.length > 0) {
                await resend.emails.send({
                    from: "Celtics de l'Ouest <info@solutionsquasar.ca>",
                    reply_to: "celtics.portneuf@gmail.com",
                    bcc: recipients,
                    subject: campaign.subject,
                    html: getEmailTemplate(campaign.content, campaign.subject),
                    tags: [{ name: 'campaignId', value: campaignId }]
                });
            }

            // Update status
            await campaignsRef.doc(campaignId).update({
                status: 'sent',
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                'stats.sentCount': recipients.length
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
});

const { Webhook } = require("svix");

// ... (other imports)

// --- WEBHOOK: RESEND EVENTS ---
exports.resendWebhook = onRequest(async (req, res) => {
    const secret = "whsec_YOUR_SIGNING_SECRET"; // TODO: Use process.env.WEBHOOK_SECRET

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
                await docRef.update({
                    'stats.openCount': admin.firestore.FieldValue.increment(1)
                });
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

// Original function kept
exports.sendConfirmationEmail = onRequest({ cors: true }, async (req, res) => {
    try {
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
        await authenticateAdmin(req);
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
            const link = await admin.auth().generatePasswordResetLink(lowerEmail);

            // 3. Format Email
            const emailContent = `
                <p>Bonjour ${name || 'nouvel utilisateur'},</p>
                <p>Vous avez été invité à rejoindre la plateforme administrative des <strong>Celtics de l'Ouest</strong>.</p>
                <p>Pour finaliser votre compte et choisir votre mot de passe, veuillez cliquer sur le bouton ci-dessous :</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${link}" class="btn" style="color: white; padding: 12px 24px; text-decoration: none; font-weight: bold;">Initialiser mon compte</a>
                </div>
                <p>Si le bouton ne fonctionne pas, vous pouvez copier ce lien dans votre navigateur :</p>
                <p style="word-break: break-all; font-size: 12px; color: #666;">${link}</p>
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

