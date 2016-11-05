var express = require('express');
var router = express.Router();

var raml = require('raml-1-parser');
var url = require('url');	  // URL parser
var fs = require('fs');	  // File system
var path = require('path');  // Directory
var mashery = require('mashery');

var multer = require('multer');
router.use(multer({
	/*
	storage: multer.memoryStorage(),
	inMemory: true,
	*/
	dest: path.join(__dirname, '../public/uploads'),
 	limits: {
		fileSize: 100000,
		files:1
	}
}).single('input_file'));

var creds = require(path.join(__dirname, '..', 'credentials.js'));
var config = require(path.join(__dirname, '..', 'config.js'));
var description = mashery_tools.filter(function(item) {
    return item.name == 'RAML2Mashery';
})[0].description;

/* GET home page. */
router.get('/', require('connect-ensure-login').ensureLoggedIn(), function (req, res) {
    res.render('raml2mashery', {
        title: 'RAML2Mashery',
        description: description,
        tgtUuid: mashery_area_uuids[0].uuid,
        tgtUuids: mashery_area_uuids
    });
});

router.post('/', require('connect-ensure-login').ensureLoggedIn(), function (req, res) {
    var errorMsgs = [];
    var warnMsgs = [];

    /**************************
     * check domain whitelist *
     **************************/
    var whitelist = [];
    var whitelistDomain = function (dmArgs) {
        if (whitelist.indexOf(dmArgs.data.domain) < 0) {
            apiClient.methods.createDomain(dmArgs, function(domainData, domainRawResponse) {
                if (domainData.errorCode && domainData.errorCode === 400) {
                    if (domainData.errors[0].message.indexOf("duplicate value") > 0) {
                        if (whitelist.indexOf(dmArgs.data.domain) < 0) {
                            //console.error("Domain '%s' is already whitelisted", dmArgs.data.domain);
                            warnMsgs.push("Domain '" + dmArgs.data.domain + "' is already whitelisted");
                        }
                    } else {
                        //console.error("%s %s", domainData.errorMessage, domainData.errors[0].message);
                        errorMsgs.push(domainData.errorMessage + " " + domainData.errors[0].message);
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
    var createEndpoint = function(epArgs) {
        //console.log(printJson(epArgs));
        apiClient.methods.createServiceEndpoint(epArgs, function(epData, epRawResponse) {
            if (epData.errorCode && epData.errorCode === 400) {
                errorMsgs.push(epData.errorMessage + " " + epData.errors[0].message);
                //console.error(epData);
                //console.error(printJson(epArgs));
                //process.exit(1);
            } else if (epData.errorCode && epData.errorCode === 500) {
                errorMsgs.push(printJson(epData));
                //console.error(epData);
                //console.error(printJson(epArgs));
                //process.exit(1);
            } else {
                if ("undefined" === typeof epData.name) {
                    errorMsgs.push(printJson(epData));
                    //console.error(epData);
                    //console.error(printJson(epData));
                    //process.exit(1);
                } else {
                    endpoints.push(epData.name);
                    //console.log("Endpoint " + epData.name + " was created");
                }
            }
        });
    };

    /***************************
     * Process RAML API object *
     ***************************/
    var processRaml = function(api, ramlSource) {
        console.log("Processing RAML...");

        // get service metadata
        var basePath = api.baseUri;
        var svcArgs = {
            data: {
                "name": api.title ? api.title : "Untitled",
                "description": api.documentation && api.documentation.length > 0 ? api.documentation[0].content :
					"Imported from RAML " +
                    (ramlSource.indexOf("http:") >= 0 || ramlSource.indexOf("https:") >= 0 ?
						'[' + ramlSource + '](' + ramlSource + '' + ')' : ramlSource),
                "version": api.version ? api.version : ""
            }
        };
        var dmArgs;

        // check if target domain is whitelisted
        parsedUrl = url.parse(basePath);
        if (parsedUrl && parsedUrl.hostname) {
            dmArgs = {
                data: {
                    "domain": parsedUrl && parsedUrl.hostname ? parsedUrl.hostname : basePath.hostname,
                    "status": "active"
                }
            };
        } else {
            errorMsgs.push("Invalid base URU: " + basePath);
            res.render('raml2mashery', {
                title: 'RAML2Mashery',
                description: description,
                error: errorMsgs,
                tgtUuid: mashery_area_uuids[0].uuid,
                tgtUuids: mashery_area_uuids
            });
            return;
        }

        apiName = svcArgs.data.name;
        var resources = api.resources;
        console.log("# of resources: " + resources.length);

        var epArgs;
        var httpMethods = [];
        var methods = [];
        var ep;
        var cleanPath = '';

        if (printOnly && whitelist.indexOf(dmArgs.data.domain) < 0) {
            whitelist.push(dmArgs.data.domain);
            for (var i = 0, len = resources.length; i < len; i++) {
                var resource = resources[i];
                cleanPath = (resource.relativeUri.indexOf('/') === 0 ?
                    resource.relativeUri.substring(1) : resource.relativeUri)
                    .replace(/\//g, ' ')
                    .replace(/{[A-Za-z0-9_]+}/g, "")
                    .replace(/\s\s/g, ' ')
                    .replace(/_/g, ' ').trim();
                if (endpoints.indexOf(dmArgs.data.domain) < 0)endpoints.push(cleanPath);
            }
        } else {
            // whitelist the domain
            setTimeout(whitelistDomain, 1000, dmArgs);

            // create the service definition and endpoint
            apiClient.methods.createService(svcArgs, function (serviceData, serviceRawResponse) {
                //console.log(serviceData);
                apiId = serviceData.id;
                apiName = serviceData.name;
                ep = 0;

                for (var i = 0, len = resources.length; i < len; i++) {
                    var resource = resources[i];
                    // supported HTTP verbs and methods
                    httpMethods = [];
                    methods = [];

                    cleanPath = (resource.relativeUri.indexOf('/') === 0 ?
                        resource.relativeUri.substring(1) : resource.relativeUri)
                        .replace(/\//g, ' ')
                        .replace(/{[A-Za-z0-9_]+}/g, "")
                        .replace(/\s\s/g, ' ')
                        .replace(/_/g, ' ').trim();
                    methods.push({"name" : cleanPath });

                    for (var m = 0; m < resource.methods.length; m++) {
                        httpMethods.push(resource.methods[m].method);
                    }

                    parsedUrl = url.parse(basePath);
                    if (parsedUrl && parsedUrl.hostname) {
                        /******************
                         * Update methods *
                         ******************/
                        for (m = 0; m < methods.length; m++) {
                            var jsonFile = ramlDir + path.sep + methods[m].name + ".json";
                            var xmlFile = ramlDir + path.sep + methods[m].name + ".xml";

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
                            path: {serviceId: apiId},
                            data: {
                                "name": cleanPath,
                                "outboundRequestTargetPath": (parsedUrl.pathname + resource.relativeUri).replace("//", "/"),
                                "outboundTransportProtocol": parsedUrl.protocol === 'https:' ? 'https' : 'http',
                                "supportedHttpMethods": httpMethods,
                                "methods": methods,
                                "publicDomains": [{
                                    "address": trafficManagerHost
                                }],
                                "requestPathAlias": resource.relativeUri,//(basePath.pathname + p).replace("//", "/"),
                                "systemDomains": [{
                                    "address": parsedUrl.host
                                }],
                                "inboundSslRequired": false
                            }
                        };

                        console.log(epArgs);

                        setTimeout(createEndpoint, (ep + 2) * 1000, epArgs);
                        ep++;
                    } else {
                        console.error("This should not happen -- in valid baseUri: %", basePath);
                    }
                } // end for resources
            });
        }

        var renderTimeout = printOnly ? 1000 : resources.length * 2000;
        console.log("Render timeout: " + renderTimeout);
        setTimeout(function() {
            var wlMulti;
            if (whitelist.length > 1) {
                wlMulti = "true";
            }
            var epMulti;
            if (endpoints.length > 1) {
                epMulti = "true";
            }
            
            res.render('raml2mashery', {
                title: 'RAML2Mashery',
                description: description,
                printOnly: printOnly,
                error: errorMsgs,
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
        }, renderTimeout);
    };

    /************************
     * Global error handler *
     ************************/
    process.on('uncaughtException', function(err) {
        errorMsgs.push(err.message);
        res.render('raml2mashery', {
            title: 'RAML2Mashery',
            description: description,
            error: errorMsgs,
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

    var sample_response_dir = sample_response_raml_dir;
    var trafficManagerHost = mashery_area_uuids.filter(function(item) {
        return item.uuid == (req.body.tgt_uuid ? req.body.tgt_uuid : mashery_area_uuids[0].uuid);
    })[0].tm_host;
    var controlCenterUrl = mashery_area_uuids.filter(function(item) {
        return item.uuid == (req.body.tgt_uuid ? req.body.tgt_uuid : mashery_area_uuids[0].uuid);
    })[0].cc_url;

    var printOnly = req.body.print_only ? true : false;

    /*******************************
     * Load the RAML definition *
     *******************************/
    var apiName;
    var apiId;
	var ramlUrl;
	var ramlFile;

    var ramlSource = req.body.loadFile ? "file" : (req.body.loadData ? "url" : "unknown");
    if (ramlSource === "url") {
        ramlUrl = req.body.input_url;
        var parsedUrl = url.parse(ramlUrl);

        var ramlPath = parsedUrl ?
            path.resolve(
                parsedUrl.hostname ? sample_response_dir : '',
                parsedUrl.hostname ? '.' + path.dirname(parsedUrl.pathname) : path.dirname(ramlUrl)) : null;
        ramlFile = path.basename(ramlUrl);

        // when a URL is used, default to samples directory as defined in config. Do not append relative path of URL.
        var ramlDir = ramlSource === "file" ?
            path.resolve(ramlPath + path.sep + path.basename(ramlFile, path.extname(ramlFile))) :
            path.resolve(sample_response_dir);

        if (parsedUrl.protocol && typeof parsedUrl.protocol !== 'undefined') {
            // Load RAML from URL
            if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') {
				raml.loadApi(ramlUrl).then( function(api) {

				    api.errors().forEach(function(x) {
				        errorMsgs.push(JSON.stringify({
				            code: x.code,
				            message: x.message,
				            path: x.path,
				            start: x.start,
				            end: x.end,
				            isWarning: x.isWarning
				            },null,2));
				        });

                    //console.log(JSON.stringify(api.toJSON(), null, 2));
                    var resources = api.resources();
                    if (!resources || resources.length === 0) {
                        errorMsgs.push("No resources defined in RAML");
                        res.render('raml2mashery', {
                            title: 'RAML2Mashery',
                            description: description,
                            error: errorMsgs,
                            tgtUuid: mashery_area_uuids[0].uuid,
                            tgtUuids: mashery_area_uuids
                        });
                    } else {
                        processRaml(api.toJSON(), ramlUrl);
                    }
				});
            } else {
                errorMsgs.push("Invalid RAML URL: " + ramlUrl);
                res.render('raml2mashery', {
                    title: 'RAML2Mashery',
                    description: description,
                    error: errorMsgs,
                    tgtUuid: mashery_area_uuids[0].uuid,
                    tgtUuids: mashery_area_uuids
                });
            }
        }
    } else {
        // Load RAML from file
		//console.log("RAML file: \n" + JSON.stringify(req.file, null, 2));
		var api = raml.loadApiSync(req.file.path);
		ramlFile = path.basename(req.file.originalname);

        var errors = api.errors();
        if (errors && errors.length > 0) {
            errors.forEach(function(x){
                errorMsgs.push(JSON.stringify({
                    code: x.code,
                    message: x.message,
                    path: x.path,
                    start: x.start,
                    end: x.end,
                    isWarning: x.isWarning
                }, null, 2));
            });
            res.render('raml2mashery', {
                title: 'RAML2Mashery',
                description: description,
                error: errorMsgs,
                tgtUuid: mashery_area_uuids[0].uuid,
                tgtUuids: mashery_area_uuids
            });
        } else {
            var resources = api.resources();
            if (!resources || resources.length === 0) {
                errorMsgs.push("No resources defined in RAML");
                res.render('raml2mashery', {
                    title: 'RAML2Mashery',
                    description: description,
                    error: errorMsgs,
                    tgtUuid: mashery_area_uuids[0].uuid,
                    tgtUuids: mashery_area_uuids
                });
            } else {
                console.log(JSON.stringify(api.toJSON(), null, 2));
                processRaml(api.toJSON(), ramlFile);
            }
        }
    }
});

/*********************
 * Pretty print JSON *
 *********************/
var printJson = function(obj) {
    JSON.stringify(obj, null, 2);
};

module.exports = router;
