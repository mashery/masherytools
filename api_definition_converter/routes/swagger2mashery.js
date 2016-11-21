var express = require('express');
var router = express.Router();

var swagger = require('swagger-parser');
var http  = require('http');  // HTTP client
var https = require('https'); // HTTP client
var url = require('url');	  // URL parser
var fs = require('fs');	  // File system
var path = require('path');  // Directory
var mashery = require('mashery');

var bunyan = require('bunyan');
var log = bunyan.createLogger({
    name: 'swagger2mashery',
    serializers: {
        req: bunyan.stdSerializers.req,
        res: bunyan.stdSerializers.res,
        err: bunyan.stdSerializers.err
    },
    level : bunyan.DEBUG
});

var multer = require('multer');
router.use(multer({storage: multer.memoryStorage(), inMemory:true}).single('input_file'));

var creds = require(path.join(__dirname, '..', 'credentials.js'));
var config = require(path.join(__dirname, '..', 'config.js'));
var description = mashery_tools.filter(function(item) {
    return item.name == 'Swagger2Mashery';
})[0].description;

/* GET home page. */
router.get('/', function (req, res) {
    res.render('swagger2mashery', {
        title: 'Swagger2Mashery',
        description: description,
        tgtUuid: mashery_area_uuids[0].uuid,
        tgtUuids: mashery_area_uuids
    });
});

router.post('/', function (req, res) {
    /************************
     * Global error handler *
     ************************/
    var errorMsg;
    var warnMsg;

    process.on('uncaughtException', function(err) {
        errorMsg = err ? err.message : "Unknown exception caught";
        res.render('swagger2mashery', {
            title: 'Swagger2Mashery',
            description: description,
            error: errorMsg,
            tgtUuid: mashery_area_uuids[0].uuid,
            tgtUuids: mashery_area_uuids
        });
        return;
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

    var trafficManagerHost = mashery_area_uuids.filter(function(item) {
        return item.uuid == (req.body.tgt_uuid ? req.body.tgt_uuid : mashery_area_uuids[0].uuid);
    })[0].tm_host;
    var controlCenterUrl = mashery_area_uuids.filter(function(item) {
        return item.uuid == (req.body.tgt_uuid ? req.body.tgt_uuid : mashery_area_uuids[0].uuid);
    })[0].cc_url;

    var printOnly = req.body.print_only ? true : false;
    var validateSwagger = req.body.validate_swagger ? true : false;
    
    /*******************************
     * Load the Swagger definition *
     *******************************/
    var swaggerDoc;
    var apiName;
    var apiId;

    var swaggerSource = req.body.loadFile ? "file" : (req.body.loadData ? "url" : "unknown");
    if (swaggerSource === "url") {
        var swaggerUrl = req.body.input_url;
        var parsedUrl = url.parse(swaggerUrl);

        var swaggerPath = parsedUrl ?
            path.resolve(
                parsedUrl.hostname ? sample_response_dir : '',
                parsedUrl.hostname ? '.' + path.dirname(parsedUrl.pathname) : path.dirname(swaggerUrl)) : null;
        var swaggerFile = path.basename(swaggerUrl);

        // when a URL is used, default to samples directory as defined in config. Do not append relative path of URL.
        var swaggerDir = swaggerSource === "file" ?
            path.resolve(swaggerPath + path.sep + path.basename(swaggerFile, path.extname(swaggerFile))) :
            path.resolve(sample_response_dir);


        if (parsedUrl.protocol && typeof parsedUrl.protocol !== 'undefined') {
            // Load Swagger from URL
            var protocol = (parsedUrl.protocol === 'https:' ? https : (parsedUrl.protocol === 'http:' ? http : null));
            if (protocol) {
                var request = protocol.get(parsedUrl, function (response) {
                    // save the data
                    var json = '';
                    response.on('data', function (chunk) {
                        json += chunk;
                    });

                    response.on('end', function () {
                        try {
                            //console.log(json);
                            swaggerDoc = JSON.parse(json);
                            //console.log(JSON.stringify(swaggerDoc, null, 2));
                        } catch (e) {
                            errorMsg = "Unable to parse Swagger from " + swaggerUrl;
                        }
                    });
                });
            } else {
                errorMsg = "Invalid Swagger URL: " + swaggerUrl;
            }
        }
    } else {
        // Load Swagger from file
        swaggerDoc = JSON.parse(req.file.buffer.toString());
    }

    setTimeout(function () {
        if (swaggerDoc) {
            var host;
            if (swaggerDoc.schemes) {
                host = swaggerDoc.host && swaggerDoc.schemes ?
                swaggerDoc.schemes[0] + "://" + swaggerDoc.host +
                (swaggerDoc.basePath ? swaggerDoc.basePath : "") :
                    swaggerDoc.basePath;
            } else {
                host = swaggerDoc.host ?
                "http://" + swaggerDoc.host + (swaggerDoc.basePath ? swaggerDoc.basePath : "") :
                    swaggerDoc.basePath;
            }

            if (!host) {
                errorMsg = "Invalid Swagger document - missing host and/or basePath entries";
                res.render('swagger2mashery', {
                    title: 'Swagger2Mashery',
                    description: description,
                    error: errorMsg,
                    warn: warnMsg,
                    tgtUuid: mashery_area_uuids[0].uuid,
                    tgtUuids: mashery_area_uuids
                });
                return;
            }
            var basePath = url.parse(host);

            // get service metadata
            var svcArgs;
            if (swaggerDoc.info) {
                svcArgs = {
                    data: {
                        "name": swaggerDoc.info.title,
                        "description": swaggerDoc.info.description ? swaggerDoc.info.description : "",
                        "version": swaggerDoc.info.version ? swaggerDoc.info.version : ""
                    }
                };
            } else {
                svcArgs = {
                    data: {
                        "name": swaggerDoc.resourcePath.substring(1),
                        "version": swaggerDoc.apiVersion
                    }
                };
            }

            apiName = svcArgs.data.name;

            if (!printOnly) {
                try {
                    apiClient.methods.createService(svcArgs, function (serviceData, serviceRawResponse) {
                        log.debug(serviceData);
                        apiId = serviceData.id;
                        apiName = serviceData.name;
                        if (swaggerDoc.apis) { // Swagger 1.2
                            setTimeout(function () {
                                processSwagger12(swaggerDoc, apiId, basePath);
                            }, 2000);
                        } else if (swaggerDoc.paths) { // Swagger 2.0
                            setTimeout(function () {
                                processSwagger20(swaggerDoc, apiId, basePath);
                            }, 2000);
                        }
                    });
                } catch (ex) {
                    log.error(ex.message);
                }
            } else {
                if (swaggerDoc.apis) { // Swagger 1.2
                    setTimeout(function () {
                        processSwagger12(swaggerDoc, apiId, basePath);
                    }, 2000);
                } else if (swaggerDoc.paths) { // Swagger 2.0
                    setTimeout(function () {
                        processSwagger20(swaggerDoc, apiId, basePath);
                    }, 2000);
                }
            }
        } else {
            res.render('swagger2mashery', {
                title: 'Swagger2Mashery',
                description: description,
                error: errorMsg ? errorMsg : "Unable to process Swagger",
                warn: warnMsg,
                tgtUuid: mashery_area_uuids[0].uuid,
                tgtUuids: mashery_area_uuids
            });
        }
    }, swaggerLoadWait);

    /**************************
     * check domain whitelist *
     **************************/
    var whitelist = [];
    var whitelistDomain = function (dmArgs) {
        if (whitelist.indexOf(dmArgs.data.domain) < 0) {
            apiClient.methods.createDomain(dmArgs, function(domainData, domainRawResponse) {
                if (domainData && domainData.errorCode && domainData.errorCode === 400 &&
                    domainData.errors && domainData.errors.length > 0) {
                    if (domainData.errors[0].message && domainData.errors[0].message.indexOf("duplicate value") > 0) {
                        if (whitelist.indexOf(dmArgs.data.domain) < 0) {
                            //console.error("Domain '%s' is already whitelisted", dmArgs.data.domain);
                            warnMsg = "Domain '" + dmArgs.data.domain + "' is already whitelisted";
                        }
                    } else {
                        //console.error("%s %s", domainData.errorMessage, domainData.errors[0].message);
                        errorMsg = domainData.errorMessage;
                    }
                } else {
                    //console.log("Registering new domain: '%s' is now %s", domainData.domain, domainData.status);
                    if (domainData && domainData.status === "active" && whitelist.indexOf(domainData.domain) < 0) {
                        whitelist.push(domainData.domain);
                    }
                }
            });
        }
    };

    /*************************
     * create a new endpoint *
     *************************/
    var endpoints = [];
    var createEndpoint = function(epArgs) {
        //printJson(epArgs);
        apiClient.methods.createServiceEndpoint(epArgs, function(epData, epRawResponse) {
            if (epData.errorCode && epData.errorCode === 400 &&
                epData.errors && epData.errors.length > 0) {
                errorMsg = epData.errorMessage + " " + (epData.errors[0].message ? domainData.errors[0].message : "");
                log.error(epData);
                //console.error(printJson(epArgs));
                //process.exit(1);
            } else if (epData.errorCode && epData.errorCode === 500) {
                errorMsg = printJson(epData);
                log.error(epData);
                //console.error(printJson(epArgs));
                //process.exit(1);
            } else {
                if ("undefined" === typeof epData.name) {
                    errorMsg = printJson(epData);
                    log.error(epData);
                    //console.error(printJson(epData));
                    //process.exit(1);
                } else {
                    endpoints.push(epData.name);
                    //console.log("Endpoint " + epData.name + " was created");
                }
            }
        });
    };

    /***********************
     * Process Swagger 1.2 *
     ***********************/
    var processSwagger12 = function(swaggerDoc, apiId, basePath) {
        // create new endpoint(s)
        var epArgs;
        var httpMethods = [];
        var methods = [];
        var ep;
        var cleanPath = '';

        for (ep = 0; ep < swaggerDoc.apis.length; ep++) {
            var api = swaggerDoc.apis[ep];

            // supported HTTP verbs and methods
            httpMethods = [];
            methods = [];

            for (var op = 0; op < api.operations.length; op++) {
                if ("undefined" !== typeof api.operations[op].method &&
                    api.operations[op].method) {
                    httpMethods.push(api.operations[op].method.toLowerCase());
                } else {
                    // BW6-generated sample had an invalid property named "httpMethod" instead of "method"
                    httpMethods.push(api.operations[op].httpMethod.toLowerCase());
                }
                if ("undefined" !== typeof api.operations[op].nickname &&
                    isNaN(parseInt(api.operations[op].nickname))) { // this is to avoid auto-generated numeric nicknames
                    methods.push({"name": api.operations[op].nickname});
                }
            } // end for op in api.operations

            // endpoint metadata
            cleanPath = (api.path.indexOf('/') === 0 ? api.path.substring(1) : api.path)
                .replace(/\//g, ' ')
                .replace(/{[A-Za-z0-9_]+}/g, "")
                .replace(/\s\s/g, ' ')
                .replace(/_/g, ' ').trim();
            if (methods.length === 0) {
                methods.push({"name": cleanPath});
            }

            // check if target domain is whitelisted
            var dmArgs = {
                data: {
                    "domain": basePath.hostname ? basePath.hostname : parsedUrl.hostname,
                    "status": "active"
                }
            };

            if (printOnly && whitelist.indexOf(dmArgs.data.domain) < 0) {
                whitelist.push(dmArgs.data.domain);
            } else {
                setTimeout(whitelistDomain, 1000, dmArgs);
            }

            /******************
             * Update methods *
             ******************/
            for (var m = 0; m < methods.length; m++) {
                var jsonFile = swaggerDir + path.sep + methods[m].name + ".json";
                var xmlFile = swaggerDir + path.sep + methods[m].name + ".xml";

                var updateJson = fs.existsSync(jsonFile);
                var updateXml = fs.existsSync(xmlFile);

                if (updateJson || updateXml) {
                    var mdArgs = {
                        name: methods[m].name,
                        sampleJsonResponse: "{}",
                        sampleXmlResponse: "<null/>"
                    };
                    if (updateJson) {
                        mdArgs.sampleJsonResponse = fs.readFileSync(jsonFile, 'utf-8');
                        //console.log("   Sample JSON for method '%s': %s", methods[m].name, mdArgs.sampleJsonResponse);
                    }
                    if (updateXml) {
                        mdArgs.sampleXmlResponse = fs.readFileSync(xmlFile, 'utf-8');
                        //console.log("   Sample XML for method '%s': %s", methods[m].name, mdArgs.sampleXmlResponse);
                    }
                    methods[m] = mdArgs;
                } // end if updateJson || updateXml
            } // end for methods

            if (!printOnly) {
                epArgs = {
                    path: {serviceId: apiId},
                    data: {
                        "name": cleanPath,
                        "outboundRequestTargetPath": api.path.indexOf("/") >= 0 ? api.path.substring(1) : api.path,
                        "outboundTransportProtocol": basePath.protocol === 'https:' ? 'https' : 'http',
                        "supportedHttpMethods": httpMethods,
                        "methods": methods,
                        "publicDomains": [{
                            "address": trafficManagerHost
                        }],
                        "requestPathAlias": api.path.indexOf("/") >= 0 ? api.path.substring(1) : api.path,
                        "systemDomains": [{
                            "address": basePath.host
                        }],
                        "inboundSslRequired": false
                    }
                };
                setTimeout(createEndpoint, (ep+2)*1000, epArgs);
            } else {
                endpoints.push(cleanPath);
            }
            ep++;
        } // end for swaggerDoc.apis

        var renderTimeout = printOnly ? 1000 : (swaggerDoc.apis.length + 1)* 2000;
        //console.log("Render timeout: " + renderTimeout);
        setTimeout(renderOutput, renderTimeout);
    };

    /***********************
     * Process Swagger 2.0 *
     ***********************/
    var processSwagger20 = function(swaggerDoc, apiId, basePath) {
        log.debug("Inside processSwagger20");
        var epArgs;
        var httpMethods = [];
        var methods = [];
        var ep;
        var cleanPath = '';

        // Swagger 2.0 validation - optional as BW6.2 generates Swagger 1.2 definitions, and BW6.3 generates Swagger 2.0
        var swaggerVer = swaggerDoc.swagger ? swaggerDoc.swagger : swaggerDoc.swaggerVersion;
        if (swaggerVer === "2.0" && validateSwagger) {
            swagger.validate(swaggerDoc, function(err, api) {
                if ("undefined" != err && err.message) {
                    errorMsg = "Swagger 2.0 validation error: " + JSON.stringify(err.message, null, 2);
                    //console.error(errorMsg);
                }
            });
        }

        ep = 0;
        log.debug("# of paths: " + Object.keys(swaggerDoc.paths).length);
        for (var p in swaggerDoc.paths) {
            if (p.length > 0) {
                // supported HTTP verbs and methods
                httpMethods = [];
                methods = [];

                var oPath = swaggerDoc.paths[p];
                //console.log("Path: %s", p);
                var keys = Object.keys(oPath);
                if ( "undefined" !== keys && Array.isArray(keys) ) {
                    for (var key in keys) {
                        if (key >= 0) {
                            var keyName = keys[key].toString().toLowerCase();
                            //console.log("   Key: %s", keyName);
                            httpMethods.push(keyName);
                        }
                    }
                } else if ("object" === keys) {
                    httpMethods.push(keys.toString().toLowerCase());
                }

                cleanPath = (p.indexOf('/') === 0 ? p.substring(1) : p)
                    .replace(/\//g, ' ')
                    .replace(/{[A-Za-z0-9_]+}/g, "")
                    .replace(/{\?[A-Za-z0-9_,]+}/g, "")
                    .replace(/\s\s/g, ' ')
                    .replace(/_/g, ' ').trim();
                
                methods.push({"name" : cleanPath });

                // check if target domain is whitelisted
                var dmArgs = {
                    data: {
                        "domain": basePath.hostname ? basePath.hostname : parsedUrl.hostname,
                        "status": "active"
                    }
                };

                if (printOnly && whitelist.indexOf(dmArgs.data.domain) < 0) {
                    whitelist.push(dmArgs.data.domain);
                    //console.log("   Endpoint '%s' will be created", cleanPath);
                } else {
                    setTimeout(whitelistDomain, 1000, dmArgs);
                }

                /******************
                 * Update methods *
                 ******************/
                for (var m = 0; m < methods.length; m++) {
                    var jsonFile = swaggerDir + path.sep + methods[m].name + ".json";
                    var xmlFile = swaggerDir + path.sep + methods[m].name + ".xml";

                    var updateJson = fs.existsSync(jsonFile);
                    var updateXml = fs.existsSync(xmlFile);

                    if (updateJson || updateXml) {
                        var mdArgs = {
                            name: methods[m].name,
                            sampleJsonResponse: "{}",
                            sampleXmlResponse: "<null/>"
                        };
                        if (updateJson) {
                            mdArgs.sampleJsonResponse = fs.readFileSync(jsonFile, 'utf-8');
                            //console.log("   Sample JSON for method '%s': %s", methods[m].name, mdArgs.sampleJsonResponse);
                        }
                        if (updateXml) {
                            mdArgs.sampleXmlResponse = fs.readFileSync(xmlFile, 'utf-8');
                            //console.log("   Sample XML for method '%s': %s", methods[m].name, mdArgs.sampleXmlResponse);
                        }
                        methods[m] = mdArgs;
                    } // end if updateJson || updateXml
                } // end for methods

                epArgs = {
                    path: { serviceId: apiId },
                    data: {
                        "name": cleanPath,
                        "outboundRequestTargetPath": (basePath.pathname + p).replace("//", "/").replace(/{\?[A-Za-z0-9_,]+}/g, ""),
                        "outboundTransportProtocol": basePath.protocol === 'https:' ? 'https' : 'http',
                        "supportedHttpMethods" : httpMethods,
                        "methods": methods,
                        "publicDomains": [{
                            "address": trafficManagerHost
                        }],
                        "requestPathAlias": p.replace(/{\?[A-Za-z0-9_,]+}/g, ""),//(basePath.pathname + p).replace("//", "/"),
                        "systemDomains": [{
                            "address": basePath.host
                        }],
                        "inboundSslRequired": false
                    }
                };

                //console.log(epArgs);
                if (!printOnly) {
                    setTimeout(createEndpoint, (ep+2)*syncInterval, epArgs);
                    log.debug("Endpoint #" + (ep+1) + " will be created in " + ((ep+2)*(syncInterval/1000)) + " seconds");
                } else {
                    endpoints.push(epArgs.data.name);
                }
                ep++;
            } // end if p.length > 0
        } // end for p in paths

        var renderTimeout = printOnly ? 2000 : Object.keys(swaggerDoc.paths).length + 1 * syncInterval;

        console.log("Render timeout: " + renderTimeout);
        setTimeout(renderOutput, renderTimeout);
    };

    /***********************
     * Render output *
     ***********************/
    var renderOutput = function() {
        console.log("# of endpoints: %d", endpoints.length);
        var wlMulti;
        if (whitelist.length > 1) {
            wlMulti = "true";
        }
        var epMulti;
        if (endpoints.length > 1) {
            epMulti = "true";
        }
        res.render('swagger2mashery', {
            title: 'Swagger2Mashery',
            description: description,
            printOnly: printOnly,
            error: errorMsg,
            warn: warnMsg,
            whitelist: whitelist,
            wlMulti: wlMulti,
            endpoints: endpoints,
            epMulti: epMulti,
            apiName: apiName,
            apiId: apiId,
            ccUrl: controlCenterUrl,
            tgtUuid: mashery_area_uuids[0].uuid,
            tgtUuids: mashery_area_uuids
        });
    };
});

/*********************
 * Pretty print JSON *
 *********************/
var printJson = function(obj) {
    console.log(JSON.stringify(obj, null, 2));
};

module.exports = router;
