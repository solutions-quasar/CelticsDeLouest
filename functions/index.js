const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { Resend } = require("resend");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

// Initialize Resend
const resend = new Resend('re_VWwsQhz5_K5rYSgrfjhysuiEQTvWqjTw4');

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
exports.sendCampaign = onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            const { campaignId, testEmail, testContent, testSubject } = req.body;

            // CASE 1: TEST EMAIL
            if (testEmail) {
                const html = getEmailTemplate(testContent || "Ceci est un test.");
                const { data, error } = await resend.emails.send({
                    from: "Celtics de l'Ouest <info@solutionsquasar.ca>",
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
    }); // CORS
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
exports.sendConfirmationEmail = onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            const { parentEmail, emailHtml } = req.body;
            if (!parentEmail || !emailHtml) return res.status(400).json({ error: "Missing parentEmail or emailHtml" });

            const { data, error } = await resend.emails.send({
                from: "Celtics de l'Ouest <info@solutionsquasar.ca>",
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
});
