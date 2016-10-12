var express = require('express');
var router = express.Router();

var http  = require('http');  // HTTP client
var https = require('https'); // HTTP client
var url = require('url');	  // URL parser
var fs = require('fs');	  // File system
var path = require('path');  // Directory
var mashery = require('mashery');
var _ = require('lodash');
var jsf = require('json-schema-faker');
var bunyan = require('bunyan');

var log = bunyan.createLogger({
    name: 'swagger2iodocs',
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
var description = _.filter(mashery_tools, function(item) {
    return item.name == 'Swagger2IODocs';
})[0].description;

/* GET home page. */
router.get('/', function (req, res) {
    res.render('swagger2iodocs', {
        title: 'Swagger2IODocs',
        description: description,
        tgtUuid: mashery_area_uuids[0].uuid,
        tgtUuids: mashery_area_uuids
    });
});

router.post('/', function(req, res) {
    /************************
     * Global error handler *
     ************************/
    var errorMsg;
    var warnMsg;

    process.on('uncaughtException', function(err) {
        errorMsg = err ? err.message : "Unknown exception caught";
        res.render('swagger2iodocs', {
            title: 'Swagger2IODocs',
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

    var sample_response_dir = sample_response_swagger_dir;
    var trafficManagerHost = _.filter(mashery_area_uuids, function(item) {
        return item.uuid == (req.body.tgt_uuid ? req.body.tgt_uuid : mashery_area_uuids[0].uuid);
    })[0].tm_host;
    var controlCenterUrl = _.filter(mashery_area_uuids, function(item) {
        return item.uuid == (req.body.tgt_uuid ? req.body.tgt_uuid : mashery_area_uuids[0].uuid);
    })[0].cc_url;

    var printOnly = req.body.print_only ? true : false;
    var genRespSample = req.body.gen_resp ? true : false;
    var validateSwagger = req.body.validate_swagger ? true : false;
    
    /*******************************
     * Load the Swagger definition *
     *******************************/
    var swaggerDoc;
    var apiName;
    var apiId;
    var apiDesc;

    var swaggerSource = req.body.loadFile ? "file" : (req.body.loadData ? "url" : "unknown");
    if (swaggerSource === "url") {
        var swaggerUrl = req.body.input_url;
        var parsedUrl = url.parse(swaggerUrl);

        var swaggerPath = parsedUrl ?
            path.resolve(
                parsedUrl.hostname ? sample_response_dir : '',
                parsedUrl.hostname ? '.' + path.dirname(parsedUrl.pathname) : path.dirname(swaggerUrl)) : null;
        var swaggerFile = path.basename(swaggerUrl);

        // when a URL is used, default to samples directory as defined in configuration. Do not append relative path of URL.
        var swaggerDir = swaggerSource === "file" ?
            path.resolve(swaggerPath + path.sep + path.basename(swaggerFile, path.extname(swaggerFile))) :
            path.resolve(sample_response_dir);


        if (parsedUrl.protocol && typeof parsedUrl.protocol !== 'undefined') {
            // Load Swagger from URL
            var protocol = (parsedUrl.protocol === 'https:' ? https : (parsedUrl.protocol === 'http:' ? http : null));
            if (protocol) {
                /*var request =*/ protocol.get(parsedUrl, function (response) {
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
                errorMsg = "Invalid Swagger document:<br><pre>" + printJson(swaggerDoc) + "</pre>";
                res.render('swagger2iodocs', {
                    title: 'Swagger2IODocs',
                    description: description,
                    error: errorMsg,
                    warn: warnMsg,
                    tgtUuid: mashery_area_uuids[0].uuid,
                    tgtUuids: mashery_area_uuids
                });
                return;
            }
            var basePath = url.parse(host);

            // is there an existing API definition matching the Swagger source?
            apiDesc = swaggerDoc.info ?
                (swaggerDoc.info.description ? swaggerDoc.info.description : '') :
                '';
            apiName = swaggerDoc.info ? swaggerDoc.info.title : swaggerDoc.resourcePath.substring(1);
            var svcArgs = {
                parameters: { filter: 'name:' + apiName }
            };


            apiClient.methods.fetchAllServices(svcArgs, function (serviceList, serviceRawResponse) {
                //console.log(serviceList);
                if (serviceList.length === 0 && !printOnly) {
                    // not found
                    log.info("API definition '" + apiName + "' not found'");
                    res.render('swagger2iodocs', {
                        title: 'Swagger2IODocs',
                        description: description,
                        error: errorMsg ? errorMsg : "API definition '" + apiName + "' not found",
                        warn: warnMsg? warnMsg : "Use Swagger2Mashery to create the API definition before generating IODocs",
                        tgtUuid: mashery_area_uuids[0].uuid,
                        tgtUuids: mashery_area_uuids
                    });
                    return;
                } else {
                    if (serviceList.length === 1) {
                        // exact match
                        apiId = serviceList[0].id;
                    } else {
                        if (serviceList.length > 1 && !printOnly) {
                            // more than one match
                            log.info("Multiple APIs named '" + apiName + "' found");
                            res.render('swagger2iodocs', {
                                title: 'Swagger2IODocs',
                                description: description,
                                error: errorMsg ? errorMsg : "Multiple API definitions named '" + apiName + "' found",
                                warn: warnMsg,
                                tgtUuid: mashery_area_uuids[0].uuid,
                                tgtUuids: mashery_area_uuids
                            });
                            return;
                        }
                    }
                }
                if (swaggerDoc.apis) { // Swagger 1.2
                    // not supported -- use ioTruth
                } else if (swaggerDoc.paths) { // Swagger 2.0
                    setTimeout(function () {
                        processSwagger20(swaggerDoc, apiId, apiName, basePath);
                    }, 2000);
                }
            });
        } else {
            res.render('swagger2iodocs', {
                title: 'Swagger2IODocs',
                description: description,
                error: errorMsg ? errorMsg : "Unable to process Swagger",
                warn: warnMsg,
                tgtUuid: mashery_area_uuids[0].uuid,
                tgtUuids: mashery_area_uuids
            });
        }
    }, 10000);

    var iodocsDef = {
        name: '',
        title: '',
        description: apiDesc,
        version: '1',
        protocol: 'rest',
        basePath: 'http://' + trafficManagerHost,
        auth: {
            key: {
                param: 'api_key',
                location: 'query'
            }
        },
        resources: {},
        schemas: {}
    }
    
    /***********************
     * Process Swagger 2.0 *
     ***********************/
    var processSwagger20 = function(swaggerDoc, apiId, apiName, basePath) {
        var epArgs;
        var httpMethods = [];
        var methods = {};
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

        iodocsDef.name = apiName;
        iodocsDef.title = apiName;
        iodocsDef.description = apiDesc;

        // make a copy of the schema definitions section to force required for sample generation
        var definitions = JSON.parse(JSON.stringify(swaggerDoc.definitions));
        var cleanDefs = _.mapKeys(definitions, function(value, key) {
            return key.replace(/»/g, "").replace(/«/g, "");
        });
        for (var def in cleanDefs) {
            var props = cleanDefs[def].properties;
            if (props && props.length > 0) {
                cleanDefs[def].required = Object.keys(cleanDefs[def].properties);
                //console.log(JSON.stringify(definitions[def], null, 2));
            }
        }

        console.log("# of paths: " + Object.keys(swaggerDoc.paths).length);
        for (var p in swaggerDoc.paths) {
            if (p.length > 0) {
                cleanPath = (p.indexOf('/') === 0 ? p.substring(1) : p)
                    .replace(/\//g, ' ')
                    .replace(/{[A-Za-z0-9_]+}/g, "")
                    .replace(/{\?[A-Za-z0-9_,]+}/g, "")
                    .replace(/\s\s/g, ' ')
                    .replace(/_/g, ' ').trim();
                console.log("Path: " + cleanPath);

                // supported HTTP verbs and methods
                httpMethods = [];
                if (methods[cleanPath]) {
                	// merge similar base paths, e.g., "/Pet" and "/Pet/{petId}"
                    //console.log("Duplicate path");
                } else {
                    methods[cleanPath] = {};
                }
                var oPath = swaggerDoc.paths[p];
                //console.log("Path: %s", p);
                var keys = Object.keys(oPath);
                if ( 'undefined' !== keys && Array.isArray(keys) ) {
                    for (var key in keys) {
                        if (key >= 0) {
                            var keyName = keys[key].toString().toLowerCase();
                            console.log("   Method: %s", keyName);
                            httpMethods.push(keyName);
                            var opId = swaggerDoc.paths[p][keyName].operationId ?
                                swaggerDoc.paths[p][keyName].operationId :
                                (keyName === "get" ? "list " :
                                    (keyName === "post" ? "create " :
                                        (keyName === "put" ? "update " : "delete "))) + cleanPath;
                            console.log("   Operation: " + opId);
                            
                            methods[cleanPath][opId] = {
                                description: swaggerDoc.paths[p][keyName].summary,
                                httpMethod: keyName.toUpperCase(),
                                path: p.replace(/{\?[A-Za-z0-9_,]+}/g, ""),
                                parameters: {}
                            };

                            if (swaggerDoc.paths[p][keyName].consumes) {
                                var ctypeEnum = [];
                                for (var cons in swaggerDoc.paths[p][keyName].consumes) {
                                    ctypeEnum.push(swaggerDoc.paths[p][keyName].consumes[cons]);
                                }
                                methods[cleanPath][opId]['parameters']['Content-Type'] = {
                                    description: 'Content type of the request payload',
                                    required: true,
                                    location: 'header',
                                    enum: ctypeEnum
                                }
                            }/* else {
                                ctypeEnum.push('application/json');
                                methods[cleanPath][opId]['parameters']['Content-Type'] = {
                                    description: 'Content type of the request payload',
                                    required: true,
                                    location: 'header',
                                    enum: ctypeEnum
                                }
                            }*/

                            if (swaggerDoc.paths[p][keyName].produces) {
                                var acceptEnum = [];
                                for (var prod in swaggerDoc.paths[p][keyName].produces) {
                                    acceptEnum.push(swaggerDoc.paths[p][keyName].produces[prod]);
                                }
                                methods[cleanPath][opId]['parameters']['Accept'] = {
                                    description: 'Content type of the response payload',
                                    required: true,
                                    location: 'header',
                                    enum: acceptEnum
                                }
                            }

                            if (swaggerDoc.paths[p][keyName].parameters) {
                                for (var param in swaggerDoc.paths[p][keyName].parameters) {
                                    var oParam = swaggerDoc.paths[p][keyName].parameters[param];
                                    switch (oParam.in) {
                                        case 'body':
                                            if (oParam.schema) {
                                                if (oParam.schema['$ref']) {
                                                    var ref = oParam.schema['$ref'].split('/');
                                                    var schemaName = ref[ref.length - 1];
                                                    console.log("   Referenced schema name: %s", schemaName);

                                                    var oSchema = cleanDefs[schemaName];
                                                    if (undefined != oSchema) {
                                                        //console.log("Schema object: %s", JSON.stringify(oSchema, null, 3));
                                                        iodocsDef.schemas[schemaName] = oSchema;
                                                        methods[cleanPath][opId]['request'] = {
                                                            $ref: schemaName
                                                        };
                                                    }
                                                } else {
                                                    log.info("TODO: figure out how to do this without defining a 'wrapper' schema object");
                                                    if (oParam.schema.type && oParam.schema.type === 'array' && oParam.schema.items) {
                                                        methods[cleanPath][opId]['parameters'][oParam.name] = {
                                                            description: oParam.description,
                                                            required: oParam.required,
                                                            type: 'array',
                                                            items: {
                                                                '$ref': oParam.schema.items['$ref']
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            break;
                                        case 'query':
                                            methods[cleanPath][opId]['parameters'][oParam.name] = {
                                                description: oParam.description,
                                                required: oParam.required,
                                                type: oParam.type,
                                                location: 'query'
                                            };
                                            break;
                                        case 'path':
                                            methods[cleanPath][opId]['parameters']['{'+oParam.name+'}'] = {
                                                description: oParam.description,
                                                required: oParam.required,
                                                type: oParam.type,
                                                location: 'pathReplace'
                                            };
                                            break;
                                        case 'formData':
                                            methods[cleanPath][opId]['parameters'][oParam.name] = {
                                                description: oParam.description,
                                                required: oParam.required,
                                                type: oParam.type,
                                                location: 'body'
                                            };
                                            break;
                                    }
                                }
                                // add sample field
                                if (genRespSample) {
                                    if (swaggerDoc.paths[p][keyName].responses["200"]) {
                                        //console.log("Found 200 response for %s", p);
                                        var respSchema = swaggerDoc.paths[p][keyName].responses["200"].schema;
                                        var schemaRef;
                                        if (respSchema) {
                                            schemaRef = respSchema['$ref'].replace(/»/g, "").replace(/«/g, "");//swaggerDoc.paths[p][keyName].responses["200"].schema['$ref'];
                                        }
                                        if (undefined != schemaRef) {
                                            var ref = schemaRef.split('/');
                                            var schemaName = ref[ref.length - 1];
                                            var schemaObj = JSON.parse(JSON.stringify(cleanDefs[schemaName]));
                                            //var schemaObj = definitions[schemaName];
                                            schemaObj.required = Object.keys(schemaObj.properties);
                                            //schemaObj.definitions = definitions; //swaggerDoc.definitions;
                                            schemaObj.definitions = cleanDefs; //swaggerDoc.definitions;
                                            console.log(JSON.stringify(schemaObj, null, 2));
                                            try {
                                                var sample = jsf(schemaObj);
                                            } catch (e) {
                                                console.error("Sample generation failed for %s", p);
                                                console.error(e.message);
                                            }
                                            if (sample) {
                                                methods[cleanPath][opId]['parameters']['response_sample'] = {
                                                    required: false,
                                                    type: 'textarea',
                                                    location: 'empty',
                                                    description: 'Sample response payload',
                                                    default: JSON.stringify(sample, null, 2)
                                                };
                                            }
                                        } else {
                                            // could it be an array?
                                            var respSchemaItems = swaggerDoc.paths[p][keyName].responses["200"].schema.items;
                                            var schemaItemsRef;
                                            if (respSchemaItems) {
                                                schemaItemsRef = respSchemaItems['$ref'];
                                            }
                                            if (undefined != schemaItemsRef) {
                                                var ref = schemaItemsRef.split('/');
                                                var schemaName = ref[ref.length - 1];
                                                var schemaObj = JSON.parse(JSON.stringify(swaggerDoc.definitions[schemaName]));
                                                //var schemaObj = definitions[schemaName];
                                                schemaObj.required = Object.keys(schemaObj.properties);
                                                //schemaObj.definitions = definitions; //swaggerDoc.definitions;
                                                schemaObj.definitions = cleanDefs; //swaggerDoc.definitions;
                                                try {
                                                    var sample = jsf(schemaObj);
                                                } catch (e) {
                                                    console.error("Sample array generation failed for %s", p);
                                                    console.error(e.message);
                                                }
                                                if (sample) {
                                                    //console.log(JSON.stringify(sample, 2, null));
                                                    methods[cleanPath][opId]['parameters']['response_sample'] = {
                                                        required: false,
                                                        type: 'textarea',
                                                        location: 'empty',
                                                        description: 'Sample response payload',
                                                        default: '[' + JSON.stringify(sample, null, 2) + ']'
                                                    };
                                                }
                                            }                                        }
                                    }
                                }
                            }
                        };
                    }
                } else if ("object" === keys) {
                    httpMethods.push(keys.toString().toLowerCase());
                }

                iodocsDef.resources[cleanPath] = {};
                iodocsDef.resources[cleanPath]['methods'] = methods[cleanPath];

                ep++;
            } // end if p.length > 0
        } // end for p in paths

        // add any missing schema items
        for (var def in cleanDefs) {
            var oDef = cleanDefs[def];
            if (!iodocsDef.schemas[def]) {
                iodocsDef.schemas[def] = oDef;
            }
        }

        var renderTimeout = 2000;
        if (!printOnly) {
            // check if there is an existing IO Docs definition
            var ioArgs = {
                path: { serviceId: apiId }
            };
            apiClient.methods.fetchIODocs(ioArgs, function (ioDocDef, fetchRawResponse) {
                // cleanup any left-over Swagger schema references
                var json = JSON.stringify(iodocsDef, null, 3).replace(/#\/definitions\//g, '').trim();
                var definition = JSON.parse(json);

                var ioData = {
                    path: { serviceId: apiId },
                    data: {
                        "serviceId": apiId,
                        "definition": definition
                    }
                };
                renderTimeout = Object.keys(swaggerDoc.paths).length * 1000;
                //console.log("Render timeout: " + renderTimeout);

                if (ioDocDef.errorCode && ioDocDef.errorCode === 404) {
                    // create a new IO Docs definition
                    log.info("API '%s' does not yet have an IO Docs definition", apiName);
                    apiClient.methods.createIODocs(ioData, function (ioDoc, createRawResponse) {
                        //console.log(JSON.stringify(ioDoc, null, 3));
                        setTimeout(renderOutput('create'), renderTimeout);
                    });
                } else {
                    // an IO Docs definition exists, need to update it
                    log.info("API '%s' alraedy has an IO Docs definition", apiName);
                    apiClient.methods.updateIODocs(ioData, function (ioDoc, updateRawResponse) {
                        //console.log(JSON.stringify(ioDoc, null, 3));
                        setTimeout(renderOutput('update'), renderTimeout);
                    });
                }
            });

        } else {
            log.info("Render timeout: " + renderTimeout);
            setTimeout(renderOutput, renderTimeout);
        }
    };

    /*****************
     * Render output *
     *****************/
    var renderOutput = function(action) {
        // fix any remaining (nested) schema references
        var json = JSON.stringify(iodocsDef, null, 3).replace(/#\/definitions\//g, '').trim();

        res.render('swagger2iodocs', {
            title: 'Swagger2IODocs',
            description: description,
            printOnly: printOnly,
            error: errorMsg,
            warn: warnMsg,
            iodocs: printOnly ? json : null /*JSON.stringify(iodocsDef, null, 3) */,
            apiName: apiName,
            apiId: apiId,
            action: action,
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
    JSON.stringify(obj, null, 2);
};

module.exports = router;
