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

//var twilioClient = require('../twilioClient');
var twilioClient = require('../twilioPusherClient');
var admins = require('../config/administrators.json');

var creds = require(path.join(__dirname, '..', 'credentials.js'));
var config = require(path.join(__dirname, '..', 'config.js'));
var description = _.filter(mashery_tools, function(item) {
    return item.name == 'API Key Notification';
})[0].description;

/* GET home page. */
router.get('/', function (req, res) {
    res.render('apikeys', {
        title: 'API Key Notification',
        description: description,
        tgtUuid: mashery_area_uuids[0].uuid,
        tgtUuids: mashery_area_uuids
    });
});

/*********************************
 * POST used in Mashery Tools UI *
 *********************************/
router.post('/', require('connect-ensure-login').ensureLoggedIn(), function (req, res) {

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

    var apiKey = req.body.apikey;
    var memberPhone = req.body.member.phone;
    if (apiKey) {
        if (memberPhone) {
            var message = formatMessage(req.body);
            twilioClient.sendSms(memberPhone, message);
            console.log("Status: %s", status);
        } else {
            console.warn("Member %s did not specify a phone number", req.body.member.username);
        }
        var adminMessage = formatAdminMessage(req.body);
        admins.forEach(function(admin) {
            twilioClient.sendSms(admin.phoneNumber, adminMessage, apiKey,
                config.pusherChannel, config.pusherEvent);
        });
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

/*************************************
 * PUT used by Mashery Event Trigger *
 *************************************/
router.put('/', function(req, res) {

    process.on('uncaughtException', function(err) {
        errorMsg = err ? err.message : "Unknown exception caught";
        res.render('apikeys', {
            title: 'API Key Notification',
            description: description,
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

    var apiKey = req.body.apikey;
    var memberPhone = req.body.member.phone;
    if (apiKey) {
        if (memberPhone) {
            formatMessage(req.body);
            twilioClient.sendSms(memberPhone, message);
        }
        var adminMessage = formatAdminMessage(req.body);
        admins.forEach(function(admin) {
            twilioClient.sendSms(admin.phoneNumber, adminMessage);
        });
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

function formatAdminMessage(notification) {
    var message = 'ADMIN - The API key ' + notification.apikey +
        ' for user ' + notification.member.username +
        ' for package ' + notification.package.name +
        ' and plan ' + notification.plan.name +
        (notification.status === 'active' ? ' has been approved' :
            (notification.status === 'waiting' ? ' is being reviewed' : ' has been disabled'));
    return message;
};

function formatMessage(notification) {
    var message = 'Your API key ' + notification.apikey +
        ' for package ' + notification.package.name +
        ' and plan ' + notification.plan.name +
        (notification.status === 'active' ? ' has been approved' :
            (notification.status === 'waiting' ? ' is being reviewed' : ' has been disabled'));
    return message;
};

module.exports = router;
