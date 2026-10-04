const sa = require('./service-account.json');
const admin = require('firebase-admin');

const app = admin.initializeApp({
    credential: admin.credential.cert(sa),
});

// Get the OAuth token directly
app.options.credential.getAccessToken().then(token => {
    console.log('TOKEN OK:', token.access_token.substring(0, 40) + '...');
    console.log('EXPIRES:', token.expires_in);

    // Call FCM V1 API directly via HTTP
    const https = require('https');
    const data = JSON.stringify({
        message: {
            token: 'cBM6zBkvYElNpmb3p3KF5b:APA91bHR1Oa716NOBijnerH7GMI0bw6fhORaahoQT8wf0MYATM_G4-E5oKR_EPz2i4lshbkAwCnKBCniFge-jQXJ78638i47WXEEVFveLbkMIe2ZO5VnINo',
            notification: { title: 'Test', body: 'Hello from Stratum' },
        },
    });

    const req = https.request({
        hostname: 'fcm.googleapis.com',
        path: `/v1/projects/${sa.project_id}/messages:send`,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token.access_token}`,
            'Content-Type': 'application/json',
        },
    }, (resp) => {
        let body = '';
        resp.on('data', chunk => body += chunk);
        resp.on('end', () => console.log('FCM Response:', resp.statusCode, body));
    });

    req.write(data);
    req.end();
}).catch(e => console.error('AUTH FAIL:', e.message));