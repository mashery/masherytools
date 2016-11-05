var express = require('express');
var router = express.Router();

var http  = require('http');  // HTTP client
var https = require('https'); // HTTP client
var url = require('url');	  // URL parser
var fs = require('fs');	  // File system
var path = require('path');  // Directory
var mashery = require('mashery');
var _ = require('lodash');
var bunyan = require('bunyan');

var log = bunyan.createLogger({
    name: 'apikeys',
    serializers: {
        req: bunyan.stdSerializers.req,
        res: bunyan.stdSerializers.res,
        err: bunyan.stdSerializers.err
    },
    level : bunyan.DEBUG
});

var hbs = require('hbs');
hbs.registerHelper('dateFormat', require('handlebars-dateformat'));
hbs.registerHelper({
    eq: function (v1, v2) {
        return v1 === v2;
    },
    ne: function (v1, v2) {
        return v1 !== v2;
    },
    lt: function (v1, v2) {
        return v1 < v2;
    },
    gt: function (v1, v2) {
        return v1 > v2;
    },
    lte: function (v1, v2) {
        return v1 <= v2;
    },
    gte: function (v1, v2) {
        return v1 >= v2;
    },
    and: function (v1, v2) {
        return v1 && v2;
    },
    or: function (v1, v2) {
        return v1 || v2;
    }
});

var creds = require(path.join(__dirname, '..', 'credentials.js'));
var config = require(path.join(__dirname, '..', 'config.js'));
var description = _.filter(mashery_tools, function(item) {
    return item.name == 'API Key Notification';
})[0].description;

/* GET home page. */
router.get('/', require('connect-ensure-login').ensureLoggedIn(), function (req, res) {
    res.render('apikeys', {
        title: 'API Key Notification',
        description: description,
        tgtUuid: mashery_area_uuids[0].uuid,
        tgtUuids: mashery_area_uuids
    });
});

router.post('/', require('connect-ensure-login').ensureLoggedIn(), function (req, res) {
    /************************
     * Global error handler *
     ************************/
    var errorMsg;
    var warnMsg;

    process.on('uncaughtException', function(err) {
        errorMsg = err ? err.message : "Unknown exception caught";
        res.render('apikeys', {
            title: 'API Key Notification',
            description: description,
            error: errorMsg,
            tgtUuid: mashery_area_uuids[0].uuid,
            tgtUuids: mashery_area_uuids
        });
    });

    /*****************************
     * initialize the API client *
     *****************************/
    var apiClient = mashery.init({
        user: mashery_user_id,
        pass: mashery_password,
        key: mashery_api_key,
        secret: mashery_api_key_secret,
        areaUuid: req.body.tgt_uuid ? req.body.tgt_uuid : mashery_area_uuids[0].uuid
    });

    /*****************************
     * Load the package API keys *
     *****************************/
    var pkgKeyArgs = {
        parameters: { fields: 'id,apikey,application,package,plan,status,created,updated,member' }
        //parameters: { filter: 'name:' + apiName }
    };

    apiClient.methods.fetchAllPackageKeys(pkgKeyArgs, function (packageKeyList, keysRawResponse) {
        if (packageKeyList) {
            res.render('apikeys', {
                title: 'API Key Notification',
                description: description,
                error: errorMsg,
                warn: warnMsg,
                keys: JSON.parse(packageKeyList),
                pusher: {
                    key: config.pusherKey,
                    channel: config.pusherChannel,
                    event: config.pusherEvent
                },
                tgtUuid: mashery_area_uuids[0].uuid,
                tgtUuids: mashery_area_uuids
            });
        } else {
            res.render('apikeys', {
                title: 'API Key Notification',
                description: description,
                error: errorMsg ? errorMsg : "No API keys",
                warn: warnMsg,
                tgtUuid: mashery_area_uuids[0].uuid,
                tgtUuids: mashery_area_uuids
            });
        }
    });
});

module.exports = router;
