var express = require('express');
var router = express.Router();

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
    return item.name == 'WSDL2Mashery';
})[0].description;

var multer = require('multer');
router.use(multer({storage: multer.memoryStorage(), inMemory: true}).single('input_file'));

/* GET home page. */
router.get('/', function (req, res) {
    res.render('wsdl2mashery', {
        title: 'WSDL2Mashery',
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
        res.render('wsdl2mashery', {
            title: 'WSDL2Mashery',
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

    var sample_response_dir = sample_response_wsdl_dir;
    var trafficManagerHost = mashery_area_uuids.filter(function (item) {
        return item.uuid == (req.body.tgt_uuid ? req.body.tgt_uuid : mashery_area_uuids[0].uuid);
    })[0].tm_host;
    var controlCenterUrl = mashery_area_uuids.filter(function (item) {
        return item.uuid == (req.body.tgt_uuid ? req.body.tgt_uuid : mashery_area_uuids[0].uuid);
    })[0].cc_url;

    var printOnly = req.body.print_only ? true : false;

    /****************************
     * Load the WSDL definition *
     ****************************/
    var wsdlDoc;
    var apiName;
    var apiId;

    var wsdlSource = req.body.loadFile ? "file" : (req.body.loadData ? "url" : "unknown");
    if (wsdlSource === "url") {
        var wsdlUrl = req.body.input_url;
        var parsedUrl = url.parse(wsdlUrl);

        var wsdlPath = parsedUrl ?
            path.resolve(
                parsedUrl.hostname ? sample_response_dir : '',
                parsedUrl.hostname ? '.' + path.dirname(parsedUrl.pathname) : path.dirname(wsdlUrl)) : null;
        var wsdlFile = path.basename(wsdlUrl);

        // when a URL is used, default to samples directory as defined in config. Do not append relative path of URL.
        var wsdlDir = wsdlSource === "file" ?
            path.resolve(wsdlPath + path.sep + path.basename(wsdlFile, path.extname(wsdlFile))) :
            path.resolve(sample_response_dir);

        if (parsedUrl.protocol && typeof parsedUrl.protocol !== 'undefined') {
            // Load WSDL from URL
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
                            wsdlDoc = new XML(xml);
                            //console.log(wsdlDoc);
                        } catch (e) {
                            errorMsg = "HTTP retrieval error: " + e.message;
                        }
                    });
                });
            } else {
                errorMsg = "Invalid WSDL URL: " + wsdlUrl;
            }
        } else {
            errorMsg = "Unexpected protocol: " + protocol;
        }
    } else {
        // Load WSDL from file
        try {
            wsdlDoc = new XML(req.file.buffer.toString());
            //console.log(wsdlDoc);
        } catch (e) {
            if (!wsdlDoc) {
                errorMsg = "Unable to parse WSDL from " + wsdlUrl + " (WSDL source: " + wsdlSource + ")";
            }
        }
    } // end wsdlSource

    // wait for WSDL to be read
    setTimeout(function() {
        if (!wsdlDoc && errorMsg) {
            res.render('wsdl2mashery', {
                title: 'WSDL2Mashery',
                description: description,
                error: errorMsg,
                warn: warnMsgs,
                tgtUuid: mashery_area_uuids[0].uuid,
                tgtUuids: mashery_area_uuids
            });
            return;
        }

        var svcArgs;
        var service = wsdlDoc.child('service');
        if (typeof service !== 'undefined' && service.length() > 0) {
            var documentation = service.child('documentation');
            svcArgs = {
                data: {
                    "name": service.attribute('name').toString(),
                    "description": typeof documentation !== 'undefined' ? documentation.text().toString() : "Imported from WSDL",
                    "version": "1.0"
                }
            };
        } else {
            errorMsg = "WSDL does not contain a service element";
            res.render('wsdl2mashery', {
                title: 'WSDL2Mashery',
                description: description,
                error: errorMsg,
                warn: warnMsgs,
                tgtUuid: mashery_area_uuids[0].uuid,
                tgtUuids: mashery_area_uuids
            });
            return;
        }

        var epName = '';
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
            var ports = service.child("port");
            if (typeof ports !== 'undefined') {
                // supported HTTP verbs and methods
                var httpMethods = [];
                var methods = [];

                ports.each(function(port, index) {
                    if (epName === '') {
                        epName = port.attribute('name').toString();
                    }
                    if (targetUrl === '') {
                        targetUrl = port.child('address').attribute('location').toString();
                    }

                    // process unique target URLs only
                    if (addresses.indexOf(targetUrl) === -1) {
                        addresses.push(targetUrl);
                    }

                    var portBinding = port.attribute('binding').toString();
                    portBinding = portBinding.substring(portBinding.indexOf(':') + 1);

                    // get the supported HTTP methods and operation names from the bindings
                    var bindings = wsdlDoc.child('binding');
                    if (typeof bindings !== 'undefined') {
                        bindings.each(function(binding, index) {
                            var bndName = binding.attribute('name').toString();
                            bndName = bndName.substring(bndName.indexOf(':') + 1);
                            var bndType = binding.attribute('type').toString();
                            bndType = bndType.substring(bndType.indexOf(':') + 1);
                            if (portBinding === bndType || portBinding === bndName) {
                                //console.log("   Found matching binding %s", bndType);
                                var transport = binding.child('binding').attribute('transport').toString();
                                if (transport.length > 0) {
                                    if (httpMethods.indexOf("post") === -1) {
                                        httpMethods.push("post");
                                    }

                                    var operations = binding.child('operation');
                                    if (typeof operations !== 'undefined') {
                                        operations.each(function(operation, index) {
                                            var opName = operation.attribute('name').toString();
                                            if (opName.length > 0) {
                                                var opNS = operation.child('operation')._qname._ns.prefix;
                                                var prefix = opNS === "soap" ? "soap11." : "soap12.";

                                                /**
                                                 * if separation of methods between SOAP 1.1and 1.2 is not needed,
                                                 * change the next line to:
                                                 *
                                                 * var obj = {name: opName};
                                                 */
                                                var obj = {
                                                    name: prefix + opName
                                                };
                                                if (!containsObject(obj, methods)) {
                                                    methods.push(obj);
                                                } else {
                                                    //console.log("      Method %s already in methods", printJson(obj));
                                                }
                                            }
                                        }); // end operations.each
                                        //console.log("   done operations");
                                    }
                                } else {
                                    var verb = binding.child('binding').attribute('verb').toString();
                                    warnMsgs.push("HTTP " + verb + " binding ignored");
                                }
                            }
                        }); // end bindings.each
                    }
                }); // end ports.each
                //console.log("Done ports");

                // check if target domain is whitelisted
                var dmArgs = {
                    data: {
                        "domain": parsedUrl && parsedUrl.hostname ? parsedUrl.hostname : url.parse(addresses[0]).hostname,
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
                    var jsonFile = wsdlDir + path.sep + methods[m].name + ".json";
                    var xmlFile = wsdlDir + path.sep + methods[m].name + ".xml";

                    var updateJson = fs.existsSync(jsonFile);
                    var updateXml = fs.existsSync(xmlFile);

                    /*
                     if (printOnly) {
                     console.log("      Method '%s' will be created\n" +
                     "         Sample JSON response file: '%s' (exists: %s)\n" +
                     "         Sample XML response file: '%s' (exists: %s)",
                     methods[m].name, jsonFile, updateJson, xmlFile, updateXml);
                     }*/

                    if (updateJson || updateXml) {
                        var mdArgs = {
                            name: methods[m].name,
                            sampleJsonResponse: "{}",
                            sampleXmlResponse: "<null/>"
                        };
                        if (updateJson) {
                            var sampleJson = fs.readFileSync(jsonFile, 'utf-8');
                            mdArgs.sampleJsonResponse = sampleJson;
                            //console.log("   Sample JSON for method '%s': %s", methods[m].name, mdArgs.sampleJsonResponse);
                        }
                        if (updateXml) {
                            var sampleXml = fs.readFileSync(xmlFile, 'utf-8');
                            mdArgs.sampleXmlResponse = sampleXml;
                            //console.log("   Sample XML for method '%s': %s", methods[m].name, mdArgs.sampleXmlResponse);
                        }
                        methods[m] = mdArgs;
                    }
                } // end for methods

                // create new endpoint
                if (!printOnly) {
                    if (httpMethods.length > 0) {
                        var parsedTargetUrl = url.parse(targetUrl);
                        if (apiId) {
                            var epArgs = {
                                path: {
                                    serviceId: apiId
                                },
                                data: {
                                    "name": epName,
                                    "requestProtocol": "soap",
                                    "apiKeyValueLocations": ["request-header"],
                                    "apiKeyValueLocationKey": "X-API-Key",
                                    "apiMethodDetectionLocations": ["request-body"],
                                    "apiMethodDetectionKey": "concat(concat(substring(concat('soap11.',namespace-uri(/*[1][contains(namespace-uri(.),'xmlsoap')])),0,number(contains(namespace-uri(/*[1]),'xmlsoap'))*7),substring(concat('soap12.',namespace-uri(/*[1][contains(namespace-uri(.),'2003')])),0,number(contains(namespace-uri(/*[1]),'2003'))*7)),'.',local-name(/*[local-name()='Envelope']/*[local-name()='Body']/*[1]))",
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
                                    "inboundSslRequired": false
                                }
                            };
                            //console.log(epArgs);
                            setTimeout(createEndpoint, 1000, epArgs);
                        } else {
                            errorMsg = "API ID is undefined. Service has not been created yet?"
                        }
                    } else {
                        errorMsg = "Something went wrong... no HTTP methods found"
                    }
                } else {
                    endpoints.push(epName);
                }
            } // end if ports != undefined
            else {
                console.error("WSDL does not have any ports");
            }
            var renderTimeout = printOnly ? 1000 : (typeof ports == 'undefined' ? 1000 : ports.length() * 2000);
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
                
                res.render('wsdl2mashery', {
                    title: 'WSDL2Mashery',
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
    }, 2000); // wait for WSDL to be read

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
                            //console.error("Domain '%s' is already whitelisted", dmArgs.data.domain);
                            warnMsgs.push("Domain '" + dmArgs.data.domain + "' is already whitelisted");
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
                    endpoints.push(epData.name);
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
