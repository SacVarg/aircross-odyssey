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

    // Added "message" and "type" to handle chat payloads dynamically
    const { caller, message, type } = req.body;

    try {
        const db = admin.firestore();
        const tokensSnap = await db.collection('artifacts/aircross-odyssey-main/public/data/fcm_tokens').get();

        if (tokensSnap.empty) return res.status(200).json({ message: 'No devices registered.' });

        const tokens = [];
        tokensSnap.forEach(doc => tokens.push(doc.data().token));

        // Default values for the Radio page
        let notificationTitle = 'RADIO TRANSMISSION INBOUND';
        let notificationBody = `${caller} has joined the Comms Link!`;
        let clickUrl = "https://aircross-odyssey-f6e2f.web.app/radio.html";

        // Dynamic overrides if the ping is coming from the Comms page
        if (type === 'chat') {
            notificationTitle = `NEW MESSAGE // ${caller}`;
            notificationBody = message ? message : '🎤 Audio transmission received';
            clickUrl = "https://aircross-odyssey-f6e2f.web.app/comms.html";
        }

        const payload = {
            notification: {
                title: notificationTitle,
                body: notificationBody,
            },
            data: { click_action: clickUrl },
            tokens: tokens
        };

        const response = await admin.messaging().sendEachForMulticast(payload);
        
        // Clean up expired or revoked tokens automatically
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
