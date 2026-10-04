import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

let firebaseApp: admin.app.App;

export const initializeFirebase = () => {
    if (firebaseApp) return firebaseApp;

    const serviceAccount = JSON.parse(
        readFileSync(join(process.cwd(), 'service-account.json'), 'utf-8'),
    );

    firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });

    console.log('✅ Firebase Admin initialized');
    return firebaseApp;
};

export const getMessaging = () => {
    if (!firebaseApp) {
        initializeFirebase();
    }
    return admin.messaging();
};