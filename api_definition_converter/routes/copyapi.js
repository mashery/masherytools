var express = require('express');
var router = express.Router();
var _ = require('lodash');

var hbs = require('hbs');
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

var fs = require('fs');	     // File system
var path = require('path');  // Directory
var mashery = require('mashery');

var config = require(path.join(__dirname, '..', 'config.js'));
var description = mashery_tools.filter(function(item) {
    return item.name == 'Copy API';
})[0].description;

/* GET home page */
router.get('/', function (req, res) {
    var creds = require(path.join(__dirname, '..', 'credentials.js'));

    res.render('copyapi', {
        title: 'Copy API',
        description: description,
        srcUuid: mashery_area_uuids[0].uuid,
        srcUuids: mashery_area_uuids,
        srcUser: mashery_user_id,
        srcPwd: mashery_password,
        srcKey: mashery_api_key,
        srcSecret: mashery_api_key_secret,
        tgtUuids: mashery_area_uuids,
        tgtUuid: mashery_area_uuids[0].uuid
    });
});

router.post('/', function(req, res) {
    /************************
     * Global error handler *
     ************************/
    var errorMsg;
    var warnMsg;

    process.on('uncaughtException', function(err) {
        errorMsg = err.message;
        res.render('copyapi', {
            description: description,
            title: 'Copy API',
            error: errorMsg,
            srcUuid: mashery_area_uuids[0],
            srcUuids: mashery_area_uuids,
            srcUser: mashery_user_id,
            srcPwd: mashery_password,
            srcKey: mashery_api_key,
            srcSecret: mashery_api_key_secret,
            tgtUuids: mashery_area_uuids
        });
    });

    /********************************
     * export a  service definition *
     ********************************/
    var exportApiDefinition = function(apiId, callback) {
        var svcArgs = {
            path: { id: apiId },
            parameters: { fields: 'name,version,description,securityProfile,endpoints.name,endpoints.apiKeyValueLocationKey,endpoints.apiKeyValueLocations,endpoints.apiMethodDetectionKey,endpoints.apiMethodDetectionLocations,endpoints.inboundSslRequired,endpoints.oauthGrantTypes,endpoints.outboundRequestTargetPath,endpoints.outboundRequestTargetQueryParameters,endpoints.outboundTransportProtocol,endpoints.publicDomains,endpoints.requestAuthenticationType,endpoints.requestPathAlias,endpoints.requestProtocol,endpoints.supportedHttpMethods,endpoints.systemDomains,endpoints.trafficManagerDomain,endpoints.methods.name,endpoints.methods.sampleJsonResponse,endpoints.methods.sampleXmlResponse' }
        };

        apiClient.methods.fetchService(svcArgs, function(serviceData, serviceRawResponse) {
            if (serviceData.errorCode && serviceData.errorCode === 400) {
                console.error("%s %s", serviceData.errorMessage, serviceData.errors[0].message);
                //process.exit(1);
            } else if (serviceData.errorCode && serviceData.errorCode === 500) {
                console.error(serviceData);
                //process.exit(1);
            } else {
                if ("undefined" === typeof serviceData.name) {
                    console.error(JSON.stringify(serviceData, null, 4));
                    //process.exit(1);
                } else {
                    //console.log(typeof callback);
                    if(typeof callback === 'function') {callback(serviceData);}
                }
            }

        });
    };

    /****************************
     * Import service endpoints *
     ****************************/
    var importServiceEndpoints = function(serviceData, apiId) {
        for (var ep in serviceData.endpoints) {
            if (serviceData.endpoints[ep].name) {
                // check if target domain(s) is whitelisted
                for (var sd in serviceData.endpoints[ep].systemDomains) {
                    if (serviceData.endpoints[ep].systemDomains[sd].address) {
                        var dmArgs = {
                            data: {
                                "domain": serviceData.endpoints[ep].systemDomains[sd].address,
                                "status": "active"
                            }
                        };
                        setTimeout(whitelistDomain, 1000, dmArgs);
                    }
                }

                var epArgs = {
                    path: { serviceId: apiId },
                    data: serviceData.endpoints[ep]
                };
                var srcAreaPrefix = srcArea.slice(0, srcArea.indexOf("."));
                var tgtAreaPrefix = tgtArea.slice(0, tgtArea.indexOf("."));
                //console.log(epArgs);
                setTimeout(createEndpoint, (ep+2)*1000, epArgs, srcAreaPrefix, tgtAreaPrefix);
            }
        } // end for ep in endpoints
    };

    /************************
     * whitelist API domain *
     ************************/
    var whitelist = [];
    var whitelistDomain = function (dmArgs) {
        if (whitelist.indexOf(dmArgs.data.domain) < 0) {
            apiClient.methods.createDomain(dmArgs, function(domainData, domainRawResponse) {
                if (domainData.errorCode && domainData.errorCode === 400) {
                    if (domainData.errors[0].message.indexOf("duplicate value") > 0) {
                        if (whitelist.indexOf(dmArgs.data.domain) < 0) {
                            console.error("Domain '%s' is already whitelisted", dmArgs.data.domain);
                            whitelist.push(dmArgs.data.domain);
                        }
                    } else {
                        console.error("%s %s", domainData.errorMessage, domainData.errors[0].message);
                    }
                } else {
                    console.log("Registering new domain: '%s' is now %s", domainData.domain, domainData.status);
                    if (domainData.status === "active") {
                        whitelist.push(domainData.domain);
                    }
                }
            });
        }
    };

    /*************************
     * create a new endpoint *
     *************************/
    var createEndpoint = function(epArgs, srcAreaPrefix, tgtAreaPrefix) {
        var epArgsCopy = _.clone(epArgs);
        if (epArgsCopy.data.trafficManagerDomain) {
            epArgsCopy.data.trafficManagerDomain = epArgsCopy.data.trafficManagerDomain.replace(srcAreaPrefix, tgtAreaPrefix);
        }
        if (epArgsCopy.data.publicDomains[0].address &&
            epArgsCopy.data.publicDomains[0].address.indexOf(".api.mashery.com") > 0) {
            epArgsCopy.data.publicDomains[0].address = 
                epArgsCopy.data.publicDomains[0].address.replace(srcAreaPrefix, tgtAreaPrefix);
        } else {
            epArgsCopy.data.publicDomains[0].address = epArgsCopy.data.trafficManagerDomain;
        }
        // process the endpoint
        if (epArgsCopy.data.requestAuthenticationType === "oauth") {
            if (epArgsCopy.data.apiKeyValueLocationKey || typeof epArgsCopy.data.apiKeyValueLocationKey !== "undefined") {
                //console.log("Removing apiKeyValueLocationKey");
                delete epArgsCopy.data.apiKeyValueLocationKey;
            }
            if (epArgsCopy.data.apiKeyValueLocations || typeof epArgsCopy.data.apiKeyValueLocations !== "undefined") {
                //console.log("Removing apiKeyValueLocations");
                delete epArgsCopy.data.apiKeyValueLocations;
            }
        } else {
            if (epArgsCopy.data.oauthGrantTypes || typeof epArgsCopy.data.oauthGrantTypes !== "undefined") {
                //console.log("Removing oauthGrantTypes");
                delete epArgsCopy.data.oauthGrantTypes;
            }
        }

        //console.log(JSON.stringify(epArgsCopy, null, 4));

        apiClient.methods.createServiceEndpoint(epArgsCopy, function(epData, epRawResponse) {
            if (epData.errorCode && epData.errorCode === 400) {
                console.error("%s %s", epData.errorMessage, epData.errors[0].message);
                //console.log(JSON.stringify(epArgs, null, 4));
                //process.exit(1);
            } else if (epData.errorCode && epData.errorCode === 500) {
                console.error(epData);
                //console.log(JSON.stringify(epArgs, null, 4));
                //process.exit(1);
            } else {
                if ("undefined" === typeof epData.name) {
                    console.error(JSON.stringify(epData, null, 4));
                    process.exit(1);
                } else {
                    console.log("Created new endpoint '%s' with ID '%s'", epData.name, epData.id);
                }
            }
        });
    };

    /*****************************
     * initialize the API client *
     *****************************/
    var credentials = require(path.join(__dirname, '..', 'credentials.js'));

    var srcUserName = req.body.src_user ? req.body.src_user : mashery_user_id;
    var srcPwd = req.body.src_pwd ? req.body.src_pwd : mashery_password;
    var srcApiKey = req.body.src_key ? req.body.src_key : mashery_api_key;
    var srcSecret = req.body.src_secret ? req.body.src_secret : mashery_api_key_secret;
    var srcAreaUuid = req.body.src_uuid ? req.body.src_uuid : mashery_area_uuids[0].uuid;

    var tgtUserName = req.body.tgt_user ? req.body.tgt_user : mashery_user_id;
    var tgtPwd = req.body.tgt_pwd ? req.body.tgt_pwd : mashery_password;
    var tgtApiKey = req.body.tgt_key ? req.body.tgt_key : mashery_api_key;
    var tgtSecret = req.body.tgt_secret ? req.body.tgt_secret : mashery_api_key_secret;
    var tgtAreaUuid;
    var tgtArea;
    var srcArea;
    var controlCenterUrl;

    var apiClient;

    var svcsArgs = {
        parameters: {fields: 'id,name,version,description'}
    };

    var op = req.body.copyapi ? "copy" :
        (req.body.load_src_services ? "source" :
            (req.body.load_tgt_services ? "target" : null));

    if (!op) {
        res.render('copyapi', {
            title: 'Copy API',
            description: description,
            errorMsg: 'Unknown operation requested',
            srcUuid: mashery_area_uuids[0].uuid,
            srcUuids: mashery_area_uuids,
            srcUser: mashery_user_id,
            srcPwd: mashery_password,
            srcKey: mashery_api_key,
            srcSecret: mashery_api_key_secret,
            tgtUuid: mashery_area_uuids[0].uuid,
            tgtUuids: mashery_area_uuids,
            tgtUser: mashery_user_id,
            tgtPwd: mashery_password,
            tgtKey: mashery_api_key,
            tgtSecret: mashery_api_key_secret,
        });
        return;
    }
    switch (op) {
        case "copy":
            var api = req.body.copyapi;
            srcAreaUuid = req.body.src_area.slice(req.body.src_area.indexOf("|")+1);
            srcArea = req.body.src_area.slice(0, req.body.src_area.indexOf("|"));
            tgtAreaUuid = req.body.tgt_area.slice(req.body.tgt_area.indexOf("|")+1);
            tgtArea = req.body.tgt_area.slice(0, req.body.tgt_area.indexOf("|"));
            var tgtAreaFilter = mashery_area_uuids.filter(function(item) {
                return item.uuid == tgtAreaUuid;
            });
            if (tgtAreaFilter && tgtAreaFilter.length > 0) {
                controlCenterUrl = tgtAreaFilter[0].cc_url;
            } else {
                warnMsg = "Unable to determine target area Control Center URL";
            }

            apiClient = mashery.init({
                user: srcUserName,
                pass: srcPwd,
                key: srcApiKey,
                secret: srcSecret,
                areaUuid: srcAreaUuid
            });

            exportApiDefinition(api, function(serviceData) {
                //console.log(JSON.stringify(serviceData, null, 2));
                var svcArgs;
                if (serviceData.name) {
                    svcArgs = {
                        data: {
                            "name": serviceData.name,
                            "description": serviceData.description ? serviceData.description : "",
                            "version": serviceData.version ? serviceData.version : "",
                            "securityProfile" : serviceData.securityProfile
                        }
                    };
                } else {
                    console.error("No service name found - invalid API definition");
                }

                apiClient = mashery.init({
                    user: tgtUserName,
                    pass: tgtPwd,
                    key: tgtApiKey,
                    secret: tgtSecret,
                    areaUuid: tgtAreaUuid
                });

                apiClient.methods.createService(svcArgs, function(svcData, serviceRawResponse) {
                    apiId = svcData.id;
                    apiName = svcData.name;
                    console.log("Created new service '%s' with ID '%s'", apiName, apiId);

                    if (serviceData.endpoints) {
                        importServiceEndpoints(serviceData, apiId);
                    }

                    setTimeout( function() {
                        res.render('copyapi', {
                            title: 'Copy API',
                            description: description,
                            tgtApi: serviceData.name,
                            apiId: apiId,
                            ccUrl: controlCenterUrl,
                            tgtArea: tgtArea,
                            srcUuid: srcAreaUuid,
                            srcUuids: mashery_area_uuids,
                            srcUser: srcUserName ? srcUserName : mashery_user_id,
                            srcPwd: srcPwd ? srcPwd : mashery_password,
                            srcKey: srcApiKey ? srcApiKey : mashery_api_key,
                            srcSecret: srcSecret ? srcSecret : mashery_api_key_secret,
                            tgtUuid: tgtAreaUuid,
                            tgtUuids: mashery_area_uuids
                        });
                    }, (serviceData.endpoints.length+2) * 1000);
                });
            });
            break;

        case "source":
            apiClient = mashery.init({
                user: srcUserName,
                pass: srcPwd,
                key: srcApiKey,
                secret: srcSecret,
                areaUuid: srcAreaUuid
            });
            try {
                apiClient.methods.fetchAllServices(svcsArgs, function (svcsData, svcsRawResponse) {
                    res.render('copyapi', {
                        title: 'Copy API',
                        description: description,
                        srcServices: svcsData,
                        error: errorMsg,
                        warn: warnMsg,
                        srcUuid: srcAreaUuid,
                        srcUuids: mashery_area_uuids,
                        srcUser: srcUserName,
                        srcPwd: srcPwd,
                        srcKey: srcApiKey,
                        srcSecret: srcSecret,
                        tgtUuid: tgtAreaUuid,
                        tgtUuids: mashery_area_uuids,
                        tgtUser: tgtUserName,
                        tgtPwd: tgtPwd,
                        tgtKey: tgtApiKey,
                        tgtSecret: tgtSecret
                    });
                    //}, renderTimeout);
                });
            } catch (e) {
                res.render('copyapi', {
                    title: 'Copy API',
                    description: description,
                    error: e.message
                });
            }
            break;

        case "target":
            tgtAreaUuid = req.body.tgt_uuid;
            apiClient = mashery.init({
                user: tgtUserName,
                pass: tgtPwd,
                key: tgtApiKey,
                secret: tgtSecret,
                areaUuid: tgtAreaUuid
            });
            try {
                apiClient.methods.fetchAllServices(svcsArgs, function (svcsData, svcsRawResponse) {
                    res.render('copyapi', {
                        title: 'Copy API',
                        description: description,
                        tgtServices: svcsData,
                        error: errorMsg,
                        warn: warnMsg,
                        srcUuid: srcAreaUuid,
                        srcUuids: mashery_area_uuids,
                        srcUser: srcUserName,
                        srcPwd: srcPwd,
                        srcKey: srcApiKey,
                        srcSecret: srcSecret,
                        tgtUuid: tgtAreaUuid,
                        tgtUuids: mashery_area_uuids,
                        tgtUser: tgtUserName,
                        tgtPwd: tgtPwd,
                        tgtKey: tgtApiKey,
                        tgtSecret: tgtSecret
                    });
                });
            } catch (e) {
                res.render('copyapi', {
                    title: 'Copy API',
                    description: description,
                    error: e.message
                });
            }
            break;
    }
});

module.exports = router;
