import admin from 'firebase-admin';

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (error) {
        console.error("Firebase init error:", error);
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { caller } = req.body;

    try {
        const db = admin.firestore();
        const tokensSnap = await db.collection('artifacts/aircross-odyssey-main/public/data/fcm_tokens').get();

        if (tokensSnap.empty) return res.status(200).json({ message: 'No devices registered.' });

        const tokens = [];
        tokensSnap.forEach(doc => tokens.push(doc.data().token));

        const message = {
            notification: {
                title: 'RADIO TRANSMISSION INBOUND',
                body: `${caller} has joined the Comms Link!`,
            },
            data: { click_action: "https://aircross-odyssey-f6e2f.web.app/radio.html" },
            tokens: tokens
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        
        // Clean up expired tokens
        const failedTokens = [];
        response.responses.forEach((resp, index) => {
            if (!resp.success) {
                const error = resp.error;
                if (error.code === 'messaging/invalid-registration-token' || error.code === 'messaging/registration-token-not-registered') {
                    failedTokens.push(tokensSnap.docs[index].ref.delete());
                }
            }
        });
        await Promise.all(failedTokens);

        return res.status(200).json({ success: true, delivered: response.successCount });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to broadcast' });
    }
}
