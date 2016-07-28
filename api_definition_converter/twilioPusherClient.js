var config = require('./config');
var client = require('twilio')(config.accountSid, config.authToken);

var Pusher = require('pusher');
var pusher = new Pusher({
    appId: config.pusherAppId,
    key: config.pusherKey,
    secret: config.pusherSecret,
    encrypted: true
});

module.exports.sendSms = function (to, message, apiKey, channel, event) {
    client.messages.create({
        body: message,
        to:   to,
        from: config.sendingNumber
//  mediaUrl: imageUrl
    }, function (err, data) {
        if (err) {
            if (channel && event) {
                pusher.trigger(channel, event, {
                    "message": "error"
                });
                console.error(err.message);
            }
        } else {
            if (channel && event) {
                pusher.trigger(channel, event, {
                    "message": apiKey
                });
            }
        }
    });
};
