mashery_tools = [
    {
        name: 'RAML2Mashery',
        description: 'This tool generates a Mashery API definition in the target area from a RAML-based source. RAML 0.8 and 1.0 are supported.',
        link: '/raml2mashery'
    },
    {
        name: 'Swagger2Mashery',
        description: 'This tool generates a Mashery API definition in the target area from a Swagger-based source. Swagger 1.2 and 2.0 are supported.',
        link: '/swagger2mashery'
    },
    {
        name: 'WADL2Mashery',
        description: 'This tool generates a Mashery API definition in the target area from a WADL-based source.',
        link: '/wadl2mashery'
    },
    {
        name: 'WSDL2Mashery',
        description: 'This tool generates a Mashery API definition in the target area from a WSDL-based source.',
        link: '/wsdl2mashery'
    },
    {
        name: 'Copy API',
        description: 'This tool allows the user to copy an API definition from a source area to a destination area.',
        link: '/copyapi'
    },
    {
        name: 'Swagger2IODocs',
        description: 'This tool generates an IO Docs definition for a given API in the target area from a Swagger-based source. Swagger 2.0 is supported.',
        link: '/swagger2iodocs'
    },
    {
        name: 'API Key Notification',
        description: 'This tool listens for event trigger notifications from Mashery about provisioned API keys, and sends an SMS notification to an administrator about any keys in a \'waiting\' state',
        link: '/apikeys'
    }
];

swaggerLoadWait = 5000; // maximum time to wait for Swagger loading -- increase as needed

// Not used in Web UI (onli in CLI)
sample_response_raml_dir = './Samples/RAML'; // TODO: RAML can have inline !includes
sample_response_wadl_dir = './Samples/WADL';
sample_response_wsdl_dir = './Samples/WSDL';
sample_response_swagger_dir = './Samples/Swagger';

// Twilio
var dotenv = require('dotenv');
var cfg = {};

if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    dotenv.config({path: '.env'});
} else {
    dotenv.config({path: '.env.test', silent: true});
}

// A random string that will help generate secure one-time passwords and
// HTTP sessions
cfg.secret = process.env.APP_SECRET || 'keyboard cat';

// Your Twilio account SID and auth token, both found at:
// https://www.twilio.com/user/account
//
// A good practice is to store these string values as system environment
// variables, and load them from there as we are doing below. Alternately,
// you could hard code these values here as strings.
cfg.accountSid = process.env.TWILIO_ACCOUNT_SID;
cfg.authToken = process.env.TWILIO_AUTH_TOKEN;
cfg.sendingNumber = process.env.TWILIO_NUMBER;

var requiredConfig = [cfg.accountSid, cfg.authToken, cfg.sendingNumber];
var isConfigured = requiredConfig.every(function(configValue) {
    return configValue || false;
});

if (!isConfigured) {
    var errorMessage =
        'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_NUMBER must be set.';

    throw new Error(errorMessage);
}

cfg.pusherKey = process.env.PUSHER_API_KEY;
cfg.pusherSecret = process.env.PUSHER_API_SECRET;
cfg.pusherChannel = process.env.PUSHER_CHANNEL;
cfg.pusherEvent = process.env.PUSHER_EVENT;
cfg.pusherAppId = process.env.PUSHER_APP_ID;

requiredConfig = [cfg.pusherKey, cfg.pusherSecret, cfg.pusherChannel, cfg.pusherEvent, cfg.pusherAppId];
isConfigured = requiredConfig.every(function(configValue) {
    return configValue || false;
});

if (!isConfigured) {
    var errorMessage =
        'PUSHER_API_KEY, PUSHER_API_SECRET, PUSHER_CHANNEL, PUSHER_EVENT and PUSHER_APP_ID must be set.';

    throw new Error(errorMessage);
}
// Export configuration object
module.exports = cfg;
