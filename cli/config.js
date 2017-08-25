var dotenv = require('dotenv');
var cfg = {};

if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    dotenv.config({path: '.env'});
} else {
    dotenv.config({path: '.env.test', silent: true});
}

cfg.userId = process.env.mashery_user_id;
cfg.password = process.env.mashery_password;
cfg.apiKey = process.env.mashery_v3api_key;
cfg.secret = process.env.mashery_v3api_key_secret;
cfg.areaUuid = process.env.mashery_area_uuid;

var requiredConfig = [cfg.userId, cfg.password, cfg.apiKey,  cfg.secret];
var isConfigured = requiredConfig.every(function(configValue) {
    return configValue || false;
});

if (!isConfigured) {
    var errorMessage =
        'mashery_user_id, mashery_password, mashery_v3api_key, and mashery_v3api_key_secret must be set.';
    throw new Error(errorMessage);
}

// Export configuration object
module.exports = cfg;