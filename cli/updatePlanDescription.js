/****************************
 * node module dependencies *
 ****************************/
var async = require('async');
var bunyan = require('bunyan');
var http = require('http');
var https = require('https');
var path = require('path');
var Client = require('node-rest-client').Client;
var url = require('url');
var _ = require('lodash');

var ProgressBar = require('progress');
var bar;

/***********************
 * basic configuration *
 ***********************/
var config = require(path.join(__dirname, '.', 'config.js'));

/***************************
 * command-line parameters *
 ***************************/
var args = require('optimist').argv,
    help = 'Usage: node updatePlanDescription.js [options]\n' +
    'Options:\n' +
    ' -h, --help        Print this message\n' +
    ' -g, --package     Package UUID (required if Plan UUID is specified)\n' +
    ' -n, --plan        Plan UUID\n' +
    ' -a, --area        Target Mashery area UUID for API definition\n' +
    ' -p, --print       Print output only without saving Mashery definitions\n' +
    ' -e, --error       Fail on error and terminate script\n' +
    ' -d, --debug       Print verbose progress and debugging information\n';

var debug = args.d !== undefined || args.debug !== undefined;
var printOnly = args.p !== undefined || args.print !== undefined;
var failOnError = args.e !== undefined || args.error !== undefined;
var interval = args.i ? parseInt(args.i) : (args.interval ? parseInt(args.interval) : 3000);

if (args.h || args.help) {
    console.log(help);
    process.exit(0);
}

if (!args.a && !args.area) {
    if (!config.areaUuid) {
        console.log(help);
        process.exit(0);
    }
}

var planId = args.n ? args.n.trim() : (args.plan ? args.plan.trim() : null);
var packageId = args.g ? args.g.trim() : (args.package ? args.package.trim() : null);

if (_.isNil(packageId) && !_.isNil(planId)) {
    console.log(help);
    process.exit(0);
}

var packages = [];
var plans = [];

var log = bunyan.createLogger({
    name: 'updatePlanDescription',
    serializers: {
        req: bunyan.stdSerializers.req,
        res: bunyan.stdSerializers.res,
        err: bunyan.stdSerializers.err
    },
    level: args.d ? bunyan.DEBUG : (args.debug ? bunyan.DEBUG : bunyan.INFO)
});

var apiArgs = {
    path: {},
    headers: {
        "Authorization": "changeme",
        "Content-Type": "application/json"
    }
};

var authenticate = function(user, pwd, key, secret, uuid, callback) {
    var args = {
        'data': ['grant_type=password&username=', user, '&password=', pwd, '&scope=', uuid].join(''),
        'headers': {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    };

    client = new Client({
        user: key,
        password: secret
    });

    client.post("https://api.mashery.com/v3/token", args, function(data, response) {
        if (data && data.error) {
            throw new Error(data.error + (data.error_description ? ': ' + data.error_description : ''));
        } else if (data && data.access_token) {
            apiArgs.headers.Authorization = "Bearer " + data.access_token;
            if (_.isFunction(callback)) callback();
        }
    });
};

/*****************************
 * initialize the API client *
 *****************************/
var apiClient = new Client();
apiClient.registerMethod("fetchAllPackages", "https://api.mashery.com/v3/rest/packages", "GET");
apiClient.registerMethod("fetchPackage", "https://api.mashery.com/v3/rest/packages/${id}", "GET");
apiClient.registerMethod("updatePackage", "https://api.mashery.com/v3/rest/packages/${id}", "PUT");
apiClient.registerMethod("fetchAllPlans", "https://api.mashery.com/v3/rest/packages/${packageId}/plans", "GET");
apiClient.registerMethod("fetchPlan", "https://api.mashery.com/v3/rest/packages/${packageId}/plans/${id}", "GET");
apiClient.registerMethod("updatePlan", "https://api.mashery.com/v3/rest/packages/${packageId}/plans/${id}", "PUT");
apiClient.registerMethod("fetchAllPlanServices", "https://api.mashery.com/v3/rest/packages/${packageId}/plans/${id}/services", "GET");

/******************
 * Program driver *
 ******************/
var main = function() {
    if (_.isNil(packageId)) {
        apiClient.methods.fetchAllPackages(apiArgs, function(packageList, pkgsRawResponse) {
            if (_.isArray(packageList)) {
                if (!debug) {
                    bar = new ProgressBar('  [:bar] :percent Processing package :current/:total (:pkgName)', {
                        complete: '=',
                        incomplete: ' ',
                        width: 50,
                        total: packageList.length
                    });
                }
                async.eachSeries(packageList, processPackage, function(err) {
                    if (err) {
                        throw err;
                    }
                });
            } else {
                log.error(packageList);
            }
        });
    } else {
        apiArgs.path = { "id": packageId };
        apiClient.methods.fetchPackage(apiArgs, function(packageObj, pkgRawResponse) {
            log.debug(packageObj);

            if (_.isNil(planId)) {
                apiArgs.path = { "packageId": packageId };
                apiClient.methods.fetchAllPlans(apiArgs, function(planList, plansRawResponse) {
                    if (_.isArray(planList)) {
                        async.eachSeries(planList, processPlan, function(err) {
                            if (err) {
                                //throw err;
                                callback(new Error(err));
                            }
                        });
                    }
                });
            } else {
                apiArgs.path = {
                    "packageId": packageId,
                    "id": planId
                };
                apiClient.methods.fetchPlan(apiArgs, function(planObj, planRawResponse) {
                    processPlan(planObj);
                });
            }
        });
    }
};

var processPackage = function(packageObj, callback) {
    if (!debug) {
        if (bar) bar.tick(1, {
            pkgName: packageObj.name
        });
    }
    log.debug("Processing " + packageObj.name + " (" + packageObj.id + ")");

    apiArgs.path = { "packageId": packageObj.id };
    apiClient.methods.fetchAllPlans(apiArgs, function(planList, plansRawResponse) {
        if (_.isArray(planList)) {
            async.eachSeries(planList, processPlan, function(err) {
                if (err) {
                    if (_.isFunction(callback)) callback(new Error(err));
                } else {
                    if (_.isFunction(callback)) callback();
                }
            });
        }
    });
};

var processPlan = function(planObj, callback) {
    log.debug("  Processing " + planObj.name + " (" + planObj.id + ")");

    apiArgs.path.id = planObj.id;
    apiClient.methods.fetchAllPlanServices(apiArgs, function(svcList, svcsRawResponse) {
        if (_.isArray(svcList)) {
            var services = _.map(svcList, "name");
            if (!_.isNil(services) && !_.isEmpty(services)) {
                apiArgs.data = {
                    description: "APIs includes: " + services.join(", ")
                };
                apiArgs.path.id = planObj.id;
                apiClient.methods.updatePlan(apiArgs, function(planUpd, planRawResponse) {
                    log.debug("  -> Updated description for " + planUpd.name + ": " + planUpd.description);
                    if (_.isFunction(callback)) callback();
                });
            } else {
                log.debug("  -> No changes made to " + planObj.name);
                if (_.isFunction(callback)) callback();
            }
        }
    });
};

/*************************************
 * Get an OAuth token for the V3 API *
 *************************************/
authenticate(
    config.userId,
    config.password,
    config.apiKey,
    config.secret,
    args.a ? args.a : (args.area ? args.area : config.areaUuid),
    main
);

console.log("UpdatePlanDescription\n");
console.log("Print only: ........... %s", printOnly);
console.log("Debug: ................ %s", args.d ? "on" : (args.debug ? "on" : "off"));
console.log("Fail on error: ........ %s", args.e ? "true" : (args.error ? "true" : "false"));
console.log("Package UUID: ......... %s", packageId ? packageId : "all");
console.log("Plan UUID: ............ %s", planId ? planId : "all");

/*****************
 * error handler *
 *****************/
process.on('uncaughtException', function(err) {
    console.error(err ? "Exception: %s" : "Unknown exception caught", err.message);
});