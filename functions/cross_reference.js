const fs = require('fs');

async function crossReference() {
    console.log("--- CROSS-REFERENCE: Registrations vs Scheduled Payments ---");

    // 1. Load Registrations
    const regFile = 'C:\\Users\\Benjamin\\.gemini\\antigravity\\brain\\da7f5c84-4f50-41d7-9a03-ea349be7f202\\.system_generated\\steps\\300\\output.txt';
    const regData = JSON.parse(fs.readFileSync(regFile, 'utf8'));
    const registrations = regData.documents || [];

    // 2. Load Scheduled Payments (All pages)
    const spFile1 = 'C:\\Users\\Benjamin\\.gemini\\antigravity\\brain\\da7f5c84-4f50-41d7-9a03-ea349be7f202\\.system_generated\\steps\\97\\output.txt';
    const spData1 = JSON.parse(fs.readFileSync(spFile1, 'utf8'));

    // Page 2 manual addition
    const docs2 = [
        { "fields": { "stripeInvoiceId": { "stringValue": "in_1T80plBSLzGzW8fpVQJzKeTY" }, "status": { "stringValue": "pending" }, "sessionId": { "stringValue": "Patricia Déry _1772812948837" } } },
        { "fields": { "stripeInvoiceId": { "stringValue": "in_1T1ZHUBSLzGzW8fpsWjPDg7K" }, "status": { "stringValue": "pending" }, "sessionId": { "stringValue": "GAELLE PARE HAMELIN_1771277066038" } } }
    ];
    const scheduledPayments = (spData1.documents || []).concat(docs2);

    console.log(`Analyzing ${registrations.length} registrations and ${scheduledPayments.length} scheduled payment records...`);

    const discrepancies = [];

    for (const reg of registrations) {
        const fields = reg.fields || {};
        const name = `${fields.childFirstName?.stringValue} ${fields.childLastName?.stringValue}`;
        const parentName = fields.parent1Name?.stringValue;
        const sessionId = fields.registrationSessionId?.stringValue;
        const status = fields.paymentStatus?.stringValue;
        const isInstallment = fields.installmentPlan?.booleanValue || fields.paymentMethod?.stringValue?.includes('3-Versements');

        if (isInstallment) {
            // Find scheduled payments for this session
            const matches = scheduledPayments.filter(sp => {
                const spSession = sp.fields?.sessionId?.stringValue;
                return spSession === sessionId;
            });

            if (status === 'Partial' && matches.length < 2) {
                discrepancies.push({
                    name,
                    parentName,
                    status,
                    isInstallment,
                    scheduledCount: matches.length,
                    issue: "Partial registration with missing scheduled payments (Expected 2 more)"
                });
            } else if (status === 'Paid' && matches.some(m => m.fields?.status?.stringValue === 'pending')) {
                discrepancies.push({
                    name,
                    parentName,
                    status,
                    isInstallment,
                    scheduledCount: matches.length,
                    issue: "Registration marked as PAID but still has PENDING scheduled payments"
                });
            }
        } else {
            // Not an installment plan, check if it's NOT Paid
            if (status !== 'Paid' && status !== 'Migré') {
                // Check if maybe it SHOULD have been an installment plan but isn't?
                // Or if it's just unpaid.
                // discrepancies.push({ name, status, issue: "Non-installment registration NOT paid" });
            }
        }
    }

    if (discrepancies.length === 0) {
        console.log("No internal logic discrepancies found between Registrations and Scheduled Payments.");
    } else {
        console.log("\nFound Potential Issues:");
        console.table(discrepancies);
    }
}

crossReference().catch(console.error);
