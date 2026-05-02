const { getFirestore } = require('firebase-admin/firestore');
const admin = require('firebase-admin');

admin.initializeApp();
const db = getFirestore('prod');

async function check() {
    const snap = await db.collection('invoices').count().get();
    const count = snap.data().count;
    console.log('Count Invoices:', count);
}

check().catch(console.error);
