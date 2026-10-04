require('dotenv/config');
const admin = require('firebase-admin');
const path = require('path');

// Try with the JSON file directly
const serviceAccount = require(path.join(__dirname, 'service-account.json'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const token = 'cBM6zBkvYElNpmb3p3KF5b:APA91bHR1Oa716NOBijnerH7GMI0bw6fhORaahoQT8wf0MYATM_G4-E5oKR_EPz2i4lshbkAwCnKBCniFge-jQXJ78638i47WXEEVFveLbkMIe2ZO5VnINo';

admin.messaging().send({
    token,
    notification: { title: 'Test', body: 'Hello from Stratum' },
})
    .then(r => console.log('SENT OK:', r))
    .catch(e => console.error('ERROR:', e.code, e.message));