const https = require('https');

/*
This function sends a notification with the specified data (user id, message) to the device.
*/
export const sendNotification = function(data) {
    // Took out authorization because I'm not sure we need it for just sending Create Notifications.
    console.log('got to sendNotification');
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
    };

    const options = {
        host: 'onesignal.com',
        port: 443,
        path: '/api/v1/notifications',
        method: 'POST',
        headers,
    };

    const req = https.request(options, function(res) {
        res.on('data', function(data) {
            console.log('Response:');
            console.log(JSON.parse(data));
        });
    });

    req.on('error', function(e) {
        console.log('ERROR:');
    });

    req.write(JSON.stringify(data));
    req.end();
};
