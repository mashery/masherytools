var express = require('express');
var router = express.Router();

var _ = require('lodash');

var jsxml = require("node-jsxml");	// XML parser
var Namespace = jsxml.Namespace,
    QName = jsxml.QName,
    XML = jsxml.XML,
    XMLList = jsxml.XMLList;

var http = require('http');  // HTTP client
var https = require('https'); // HTTP client
var url = require('url');	  // URL parser
var fs = require('fs');	  // File system
var path = require('path');  // Directory
var mashery = require('mashery');

var config = require(path.join(__dirname, '..', 'config.js'));
var description = mashery_tools.filter(function(item) {
    return item.name == 'WADL2Mashery';
})[0].description;

var multer = require('multer');
router.use(multer({storage: multer.memoryStorage(), inMemory: true}).single('input_file'));

/* GET home page. */
router.get('/', function (req, res) {
    res.render('wadl2mashery', {
        title: 'WADL2Mashery',
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
    var warnMsgs = [];

    process.on('uncaughtException', function (err) {
        errorMsg = err.message;
        return;
        res.render('wadl2mashery', {
            title: 'WADL2Mashery',
            description: description,
            error: errorMsg,
            tgtUuid: mashery_area_uuids[0].uuid,
            tgtUuids: mashery_area_uuids
        });
    });

    /*****************************
     * initialize the API client *
     *****************************/
    var creds = require(path.join(__dirname, '..', 'credentials.js'));
    var apiClient = mashery.init({
        user: mashery_user_id,
        pass: mashery_password,
        key: mashery_api_key,
        secret: mashery_api_key_secret,
        areaUuid: req.body.tgt_uuid ? req.body.tgt_uuid : mashery_area_uuids[0].uuid
    });

    var sample_response_dir = sample_response_wadl_dir;
    var trafficManagerHost = mashery_area_uuids.filter(function (item) {
        return item.uuid == (req.body.tgt_uuid ? req.body.tgt_uuid : mashery_area_uuids[0].uuid);
    })[0].tm_host;
    var controlCenterUrl = mashery_area_uuids.filter(function (item) {
        return item.uuid == (req.body.tgt_uuid ? req.body.tgt_uuid : mashery_area_uuids[0].uuid);
    })[0].cc_url;

    var printOnly = req.body.print_only ? true : false;
    var mergePath = req.body.merge_path ? true : false;

    /****************************
     * Load the WADL definition *
     ****************************/
    var wadlDoc;
    var apiName;
    var apiId;

    var wadlSource = req.body.loadFile ? "file" : (req.body.loadData ? "url" : "unknown");
    if (wadlSource === "url") {
        var wadlUrl = req.body.input_url;
        var parsedUrl = url.parse(wadlUrl);

        var wadlPath = parsedUrl ?
            path.resolve(
                parsedUrl.hostname ? sample_response_dir : '',
                parsedUrl.hostname ? '.' + path.dirname(parsedUrl.pathname) : path.dirname(wadlUrl)) : null;
        var wadlFile = path.basename(wadlUrl);

        // when a URL is used, default to samples directory as defined in config. Do not append relative path of URL.
        var wadlDir = wadlSource === "file" ?
            path.resolve(wadlPath + path.sep + path.basename(wadlFile, path.extname(wadlFile))) :
            path.resolve(sample_response_dir);

        if (parsedUrl.protocol && typeof parsedUrl.protocol !== 'undefined') {
            // Load WADL from URL
            var protocol = (parsedUrl.protocol === 'https:' ? https : (parsedUrl.protocol === 'http:' ? http : null));
            if (protocol) {
                var request = protocol.get(parsedUrl, function (response) {
                    // save the data
                    var xml = '';
                    response.on('data', function (chunk) {
                        xml += chunk;
                    });

                    response.on('end', function () {
                        try {
                            wadlDoc = new XML(xml);
                            //console.log(wadlDoc);
                        } catch (e) {
                            errorMsg = "HTTP retrieval error: " + e.message;
                        }
                    });
                });
            } else {
                errorMsg = "Invalid WADL URL: " + wadlUrl;
            }
        } else {
            errorMsg = "Unexpected protocol: " + protocol;
        }
    } else {
        // Load WADL from file
        wadlFile = req.file.originalname;
        try {
            wadlDoc = new XML(req.file.buffer.toString());
            //console.log(wadlDoc);
        } catch (e) {
            if (!wadlDoc) {
                errorMsg = "Unable to parse WADL from " + wadlUrl + " (WADL source: " + wadlSource + ")";
            }
        }
    } // end wadlSource

    // wait for WADL to be read
    setTimeout(function() {
        if (!wadlDoc && errorMsg) {
            res.render('wadl2mashery', {
                title: 'WADL2Mashery',
                description: description,
                error: errorMsg,
                warn: warnMsgs,
                tgtUuid: mashery_area_uuids[0].uuid,
                tgtUuids: mashery_area_uuids
            });
            return;
        }

        var svcArgs;
        var appDoc = wadlDoc.child('doc');
        svcArgs = {
            data: {
                "name": typeof appDoc !== 'undefined' && appDoc.attribute('title').length() > 0 ?
                    appDoc.attribute('title').toString() :
                    path.basename(wadlFile).substring(0, path.basename(wadlFile).lastIndexOf(path.extname(wadlFile))),
                "description": "Imported from WADL " +
                    (wadlSource === 'url' ? '[' + wadlUrl + '](' + wadlUrl + '' + ')' : wadlFile),
                "version": "1.0"
            }
        };

        var epName = '';
        var cleanPath = '';
        var targetUrl = '';
        var addresses = [];

        apiName = svcArgs.data.name;
        if (!printOnly) {
            try {
                apiClient.methods.createService(svcArgs, function (serviceData, serviceRawResponse) {
                    apiId = serviceData.id;
                    apiName = serviceData.name;
                    //console.log(serviceData);
                });
            } catch (e) {
                errorMsg = "Error creating service: " + e.message;
                console.error(errorMsg);
            }
        }

        setTimeout(function () {
            var resourceList = wadlDoc.child('resources');
            var resources = resourceList.child('resource');
            if (typeof resources !== 'undefined') {
                var resourcePaths = [];
                resources.each(function(resource, index) {
                    var path = resource.attribute('path').toString();
                    //resourcePaths.push(path);
                    resourcePaths.push(path.replace(/\/{[A-Za-z0-9_]+}/g, ""));
                });
                var uniqPaths = _.uniq(resourcePaths);
                var unique = uniqPaths.length === resourcePaths.length;
                if (unique) {
                    /***************************************************
                     * Unique resource paths, one HTTP method per path *
                     ***************************************************/
                    console.log("Unique resource paths, one HTTP method per path");
                    resources.each(function(resource, index) {
                        console.log("Processing resource %s of %s", index + 1, resources.length());
                        // supported HTTP verbs and methods
                        var httpMethods = [];
                        var methods = [];

                        var base = resourceList.attribute('base').toString();
                        var path = resource.attribute('path').toString();
                        if (_.endsWith(base, '/') && _.startsWith(path, '/')) {
                            targetUrl = base + path.substring(1);
                        } else {
                            if ((_.endsWith(base, '/') && !_.startsWith(path, '/')) ||
                                (!_.endsWith(base, '/') && _.startsWith(path, '/'))) {
                                targetUrl = base + path;
                            } else {
                                if (!_.endsWith(base, '/') && !_.startsWith(path, '/')) {
                                    targetUrl = base + path;
                                }
                            }
                        }

                        // process nested <resource> element
                        var nested = resource.child('resource');
                        if (undefined !== nested) {
                            nested.each(function(nResource, index) {
                                var nPath = nResource.attribute('path').toString();
                                targetUrl += nPath;
                            });
                        }

                        // process unique target URLs only
                        if (addresses.indexOf(targetUrl) === -1) {
                            addresses.push(targetUrl);
                        }

                        epName = path;
                        cleanPath = (epName.indexOf('/') === 0 ? epName.substring(1) : epName)
                            .replace(/\//g, ' ')
                            .replace(/{[A-Za-z0-9_]+}/g, "")
                            .replace(/\s\s/g, ' ')
                            .replace(/_/g, ' ').trim();
                        if (printOnly) {
                            endpoints.push(cleanPath);
                        }

                        // get the supported HTTP methods and method names
                        var method = resource.child('method');
                        if (method) {
                            var methodName = method.attribute('name');
                            if (methodName && methodName.length() > 0) {
                                methodName.each( function(item, index) {
                                    var httpMethod = item.toString().toLowerCase();
                                    httpMethods.push(httpMethod);
                                })
                            } else {
                                warnMsgs.push("Resource " + cleanPath + " does not have a valid HTTP method. Skipping.");
                            }
                        } else {
                            warnMsgs.push("Resource " + cleanPath + " does not have a method. Skipping.");
                        }

                        var methodId = method.attribute('id');
                        var obj;
                        if (undefined !== methodId && methodId.length() > 0) {
                            obj = {
                                name: methodId.toString()
                            };
                        } else {
                            obj = {
                                name: cleanPath
                            }
                        }
                        //console.log("methodId: '%s'", obj.name);
                        if (!containsObject(obj, methods)) {
                            methods.push(obj);
                        } else {
                            //console.log("      Method %s already in methods", printJson(obj));
                        }

                        // check if target domain is whitelisted
                        var parsedTargetUrl = url.parse(targetUrl);
                        parsedTargetUrl.pathname = decodeURIComponent(parsedTargetUrl.pathname);
                        parsedTargetUrl.path = decodeURIComponent(parsedTargetUrl.path);
                        var dmArgs = {
                            data: {
                                "domain": parsedTargetUrl && parsedTargetUrl.hostname ?
                                    parsedTargetUrl.hostname : parsedUrl.hostname,
                                "status": "active"
                            }
                        };

                        if (printOnly && whitelist.indexOf(dmArgs.data.domain) < 0) {
                            whitelist.push(dmArgs.data.domain);
                        } else {
                            setTimeout(whitelistDomain, 1000, dmArgs);
                        }

                        // create new endpoint
                        if (!printOnly) {
                            if (httpMethods.length > 0) {
                                if (apiId) {
                                    var epArgs = {
                                        path: {
                                            serviceId: apiId
                                        },
                                        data: {
                                            "name": cleanPath,
                                            "outboundRequestTargetPath": parsedTargetUrl.path,
                                            "outboundTransportProtocol": parsedTargetUrl.protocol === 'https:' ? 'https' : 'http',
                                            "supportedHttpMethods": httpMethods,
                                            "methods": methods,
                                            "publicDomains": [{
                                                "address": trafficManagerHost
                                            }],
                                            "requestPathAlias": parsedTargetUrl.path,
                                            "systemDomains": [{
                                                "address": parsedTargetUrl.host
                                            }],
                                            "inboundSslRequired": parsedTargetUrl.protocol === 'https:' ? true : false
                                        }
                                    };
                                    //console.log(epArgs);
                                    setTimeout(createEndpoint, (index+2)*1000, epArgs);
                                } else {
                                    errorMsg = "API ID is undefined. Service has not been created yet?"
                                }
                            } else {
                                errorMsg = "Something went wrong... no HTTP methods found"
                            }
                        }
                    }); // end resources.each
                } else {
                    /**********************************************************************
                     * merge non-unique paths with multiple HTTP methods on same endpoint *
                     **********************************************************************/
                    if (mergePath) {
                        console.log("merge non-unique paths with multiple HTTP methods on same endpoint");
                        var base = resourceList.attribute('base').toString();
                        for (var index = 0; index < uniqPaths.length; index++) {
                            var path = uniqPaths[index];
                            console.log("Processing path %s of %s", index + 1, uniqPaths.length);

                            if (_.endsWith(base, '/') && _.startsWith(path, '/')) {
                                targetUrl = base + path.substring(1);
                            } else {
                                if ((_.endsWith(base, '/') && !_.startsWith(path, '/')) ||
                                    (!_.endsWith(base, '/') && _.startsWith(path, '/'))) {
                                    targetUrl = base + path;
                                } else {
                                    if (!_.endsWith(base, '/') && !_.startsWith(path, '/')) {
                                        targetUrl = base + path;
                                    }
                                }
                            }

                            // process unique target URLs only
                            if (addresses.indexOf(targetUrl) === -1) {
                                addresses.push(targetUrl);
                            }

                            // supported HTTP verbs and methods
                            var httpMethods = [];
                            var methods = [];

                            epName = path;
                            cleanPath = (epName.indexOf('/') === 0 ? epName.substring(1) : epName)
                                .replace(/\//g, ' ')
                                .replace(/{[A-Za-z0-9_]+}/g, "")
                                .replace(/\s\s/g, ' ')
                                .replace(/_/g, ' ').trim();

                            // check if target domain is whitelisted
                            var parsedTargetUrl = url.parse(targetUrl);
                            parsedTargetUrl.pathname = decodeURIComponent(parsedTargetUrl.pathname);
                            parsedTargetUrl.path = decodeURIComponent(parsedTargetUrl.path);
                            var dmArgs = {
                                data: {
                                    "domain": parsedTargetUrl && parsedTargetUrl.hostname ?
                                        parsedTargetUrl.hostname : parsedUrl.hostname,
                                    "status": "active"
                                }
                            };

                            if (printOnly && whitelist.indexOf(dmArgs.data.domain) < 0) {
                                whitelist.push(dmArgs.data.domain);
                            } else {
                                setTimeout(whitelistDomain, 1000, dmArgs);
                            }

                            resources.each(function(resource, idx) {
                                var resPath = resource.attribute('path').toString().replace(/\/{[A-Za-z0-9_]+}/g, "");
                                if (resPath === path) {
                                    console.log("   Processing resource %s of %s", idx + 1, resources.length());

                                    // get the supported HTTP methods and method names
                                    var method = resource.child('method');
                                    if (method) {
                                        var methodName = method.attribute('name');
                                        if (methodName && methodName.length() > 0) {
                                            var httpMethod = methodName.toString().toLowerCase();
                                            httpMethods.push(httpMethod);
                                        } else {
                                            warnMsgs.push("Resource " + cleanPath + " does not have a valid HTTP method. Skipping.");
                                        }
                                    } else {
                                        warnMsgs.push("Resource " + cleanPath + " does not have a method. Skipping.");
                                    }

                                    var obj = {
                                        name: method.attribute('id').toString()
                                    };
                                    console.log("      method name: " + obj.name);
                                    if (!containsObject(obj, methods)) {
                                        methods.push(obj);
                                    } else {
                                        //console.log("      Method %s already in methods", printJson(obj));
                                    }
                                }
                            }); // end resources.each

                            // create new endpoint
                            if (printOnly) {
                                endpoints.push(cleanPath);
                            } else {
                                if (httpMethods.length > 0) {
                                    if (apiId) {
                                        var epArgs = {
                                            path: {
                                                serviceId: apiId
                                            },
                                            data: {
                                                "name": cleanPath,
                                                "outboundRequestTargetPath": parsedTargetUrl.path,
                                                "outboundTransportProtocol": "use-inbound",
                                                "supportedHttpMethods": httpMethods,
                                                "methods": methods,
                                                "publicDomains": [{
                                                    "address": trafficManagerHost
                                                }],
                                                "requestPathAlias": parsedTargetUrl.path,
                                                "systemDomains": [{
                                                    "address": parsedTargetUrl.host
                                                }],
                                                "inboundSslRequired": parsedTargetUrl.protocol === 'https:' ? true : false
                                            }
                                        };
                                        console.log(epArgs);
                                        setTimeout(createEndpoint, (index+2)*1000, epArgs);
                                    } else {
                                        errorMsg = "API ID is undefined. Service has not been created yet?"
                                    }
                                } else {
                                    errorMsg = "Something went wrong... no HTTP methods found"
                                }
                            }
                        } // end for uniqPaths
                    } else {
                        /*******************************************
                         * non-unique paths, but do not merge them *
                         *******************************************/
                        console.log("non-unique paths, but do not merge them");
                        resources.each(function(resource, index) {
                            console.log("Processing resource %s of %s", index + 1, resources.length());
                            // supported HTTP verbs and methods
                            var httpMethods = [];
                            var methods = [];

                            var base = resourceList.attribute('base').toString();
                            var path = resource.attribute('path').toString();
                            if (_.endsWith(base, '/') && _.startsWith(path, '/')) {
                                targetUrl = base + path.substring(1);
                            } else {
                                if ((_.endsWith(base, '/') && !_.startsWith(path, '/')) ||
                                    (!_.endsWith(base, '/') && _.startsWith(path, '/'))) {
                                    targetUrl = base + path;
                                } else {
                                    if (!_.endsWith(base, '/') && !_.startsWith(path, '/')) {
                                        targetUrl = base + path;
                                    }
                                }
                            }

                            // process unique target URLs only
                            if (addresses.indexOf(targetUrl) === -1) {
                                addresses.push(targetUrl);
                            }

                            epName = path;
                            cleanPath = (epName.indexOf('/') === 0 ? epName.substring(1) : epName)
                                .replace(/\//g, ' ')
                                .replace(/{[A-Za-z0-9_]+}/g, "")
                                .replace(/\s\s/g, ' ')
                                .replace(/_/g, ' ').trim();
                            if (printOnly) {
                                endpoints.push(cleanPath);
                            }

                            // get the supported HTTP methods and method names
                            var method = resource.child('method');
                            if (method) {
                                var methodName = method.attribute('name');
                                if (methodName && methodName.length() > 0) {
                                    var httpMethod = methodName.toString().toLowerCase();
                                    httpMethods.push(httpMethod);
                                    switch (httpMethod) {
                                        case "get":
                                            cleanPath = "list " + cleanPath;
                                            break;
                                        case "post":
                                            cleanPath = "create " + cleanPath;
                                            break;
                                        case "put":
                                            cleanPath = "update " + cleanPath;
                                            break;
                                        case "delete":
                                            cleanPath = "delete " + cleanPath;
                                            break;
                                    }
                                } else {
                                    warnMsgs.push("Resource " + cleanPath + " does not have a valid HTTP method. Skipping.");
                                }

                                var obj = {
                                    name: method.attribute('id').toString()
                                };
                                if (obj.name !== "" && !containsObject(obj, methods)) {
                                    methods.push(obj);
                                } else {
                                    //console.log("      Method %s already in methods", printJson(obj));
                                }
                            } else {
                                warnMsgs.push("Resource " + cleanPath + " does not have a method. Skipping.");
                            }

                            // check if target domain is whitelisted
                            var parsedTargetUrl = url.parse(targetUrl);
                            parsedTargetUrl.pathname = decodeURIComponent(parsedTargetUrl.pathname);
                            parsedTargetUrl.path = decodeURIComponent(parsedTargetUrl.path);
                            var dmArgs = {
                                data: {
                                    "domain": parsedTargetUrl && parsedTargetUrl.hostname ?
                                        parsedTargetUrl.hostname : parsedUrl.hostname,
                                    "status": "active"
                                }
                            };

                            if (printOnly && whitelist.indexOf(dmArgs.data.domain) < 0) {
                                whitelist.push(dmArgs.data.domain);
                            } else {
                                setTimeout(whitelistDomain, 1000, dmArgs);
                            }

                            // create new endpoint
                            if (!printOnly) {
                                if (httpMethods.length > 0) {
                                    if (apiId) {
                                        var epArgs = {
                                            path: {
                                                serviceId: apiId
                                            },
                                            data: {
                                                "name": cleanPath,
                                                "outboundRequestTargetPath": parsedTargetUrl.path,
                                                "outboundTransportProtocol": parsedTargetUrl.protocol === 'https:' ? 'https' : 'http',
                                                "supportedHttpMethods": httpMethods,
                                                //"methods": methods.length > 0 ? methods : [],
                                                "publicDomains": [{
                                                    "address": trafficManagerHost
                                                }],
                                                "requestPathAlias": parsedTargetUrl.path,
                                                "systemDomains": [{
                                                    "address": parsedTargetUrl.host
                                                }],
                                                "inboundSslRequired": false
                                            }
                                        };
                                        console.log(epArgs);
                                        setTimeout(createEndpoint, (index+2)*1000, epArgs);
                                    } else {
                                        errorMsg = "API ID is undefined. Service has not been created yet?"
                                    }
                                } else {
                                    errorMsg = "Something went wrong... no HTTP methods found"
                                }
                            }
                        }); // end resources.each
                    }
                }

                //console.log("Done resources");
            } // end if resources != undefined
            else {
                console.error("WADL does not have any resources");
            }

            var renderTimeout = printOnly ? 2000 : (typeof resources == 'undefined' ? 2000 : (resources.length() + 1) * 2000);
            //console.log("Render timeout: ", renderTimeout);

            setTimeout(function() {
                var wlMulti;
                if (whitelist.length > 1) {
                    wlMulti = "true";
                }
                var epMulti;
                if (endpoints.length > 1) {
                    epMulti = "true";
                }

                res.render('wadl2mashery', {
                    title: 'WADL2Mashery',
                    description: description,
                    printOnly: printOnly,
                    error: errorMsg,
                    warn: warnMsgs,
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
            }, renderTimeout); // make sure all endpoints are created before returning
        }, 3000); // wait for service to be created
    }, 2000); // wait for WADL to be read

    /********************
     * Utility function *
     ********************/
    var containsObject = function (obj, array) {
        for (var i = 0; i < array.length; i++) {
            if (array[i].name === obj.name) {
                return true;
            }
        }
        return false;
    };

    /**************************
     * check domain whitelist *
     **************************/
    var whitelist = [];
    var whitelistDomain = function (dmArgs) {
        if (whitelist.indexOf(dmArgs.data.domain) < 0) {
            apiClient.methods.createDomain(dmArgs, function (domainData, domainRawResponse) {
                if (domainData.errorCode && domainData.errorCode === 400) {
                    if (domainData.errors[0].message.indexOf("duplicate value") > 0) {
                        if (whitelist.indexOf(dmArgs.data.domain) < 0) {
                            var warnMsg = "Domain '" + dmArgs.data.domain + "' is already whitelisted";
                            if (warnMsgs.indexOf(warnMsg) < 0) {
                                warnMsgs.push(warnMsg);
                            }
                        }
                    } else {
                        //console.error("%s %s", domainData.errorMessage, domainData.errors[0].message);
                        errorMsg = domainData.errorMessage + " " + domainData.errors[0].message;
                    }
                } else {
                    //console.log("Registering new domain: '%s' is now %s", domainData.domain, domainData.status);
                    if (domainData.status === "active" && whitelist.indexOf(domainData.domain) < 0) {
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
    var createEndpoint = function (epArgs) {
        //printJson(epArgs);
        apiClient.methods.createServiceEndpoint(epArgs, function (epData, epRawResponse) {
            if (epData.errorCode && epData.errorCode === 400) {
                errorMsg = epData.errorMessage + " " + epData.errors[0].message;
                //printJson(epArgs);
                //process.exit(1);
            } else if (epData.errorCode && epData.errorCode === 500) {
                errorMsg = JSON.stringify(epData);
                //console.error(epData);
                //printJson(epArgs);
                //process.exit(1);
            } else {
                if ("undefined" === typeof epData.name) {
                    errorMsg = JSON.stringify(epData);
                    //printJson(epData);
                    //process.exit(1);
                } else {
                    if (!printOnly) {
                        endpoints.push(epData.name);
                    }
                    //console.log("Endpoint " + epData.name + " was created");
                }
            }
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
