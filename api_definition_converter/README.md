# Mashery API Definition Converter
Tool for converting various API definition formats into Mashery formats.

## Introduction

I created this Web UI wrapper around a collection of [Node.js](https://nodejs.org/) scripts to make more compelling demos of the [Platform API](http://support.mashery.com/docs/read/mashery_api/30) (even though the likely use of the API will be via command-line.) This Web app is implemented using the [Express](http://expressjs.com/) and [Handlebars](http://handlebarsjs.com/) frameworks, and leverages a client library for the Mashery Platform API created by [Cox Automotive](https://github.com/Cox-Automotive/mashery) . The Web UI was designed to be extended using a simple configuration, hoping to encourage additional contribution and a growing set of API-driven tools.

## Prerequisites

Node.js v4.4.3 or later

## Installation
Post clone of repository, change into the api_definition_converter directory and perform the following commands/steps:

* ```npm install```
* ```cp credentials.js.sample credentials.js``` and update to reflect your Mashery area information and V3 API key information.

## Usage

From within the api_definition_converter directory, run following command:

    node bin/www

To run the application in debug mode, use following command:

    node bin/www | node_modules/bunyan/bin/bunyan

Navigate to [http://localhost:3000](http://localhost:3000)

![Mashery API Tools](/../screenshots/MasheryTools.png?raw=true "Mashery Tools")

**Note:** Target domains _must_ be whitelisted before any of these tools are used, or the endpoint creation will fail.

## The Tools

### API Key Notification

This tool listens to Mashery Event Triggers (after key create/update/delete) and sends a text message to the key owner and an administrator about the key status. The UI allows the user to manually send an SMS notification to the owner of an API key about the key's status.

**Note:** The demo uses the [Twilio Programmable SMS](https://www.twilio.com/sms) API and the [Pusher](https://pusher.com) API. A Twilio account is required (a trial account is sufficient) as is a Pusher account and application (all configured in the .env configuration file.) 

![Copy API](/../screenshots/KeyList.png?raw=true "API Keys")

![Copy API](/../screenshots/KeyNotify.png?raw=true "API Key Notification")

### Copy API

This tool allows the user to copy an API definition from a source area to a destination area.

**Note:** The Copy API tool only copies API definitions. It does not copy packages and plans that reference the source API. The logic behind the decision to exclude them was that packages and plans, which are typically created and managed by business people, would be different across areas, whether the areas are used to separate dev/test from prod or different lines of business under the same company. Adding an option to include packages and plans (response filters, too?) is something we can look into in the future.

![Copy API](/../screenshots/CopyAPI.png?raw=true "Copy API")

![Copy API](/../screenshots/CopyAPISource.png?raw=true "Copy API Source Area")

### RAML2Mashery

This tool consumes a RAML-based API definition (RAML 0.8 and 1.0 are supported) and creates a Mashery service definition in the target area. The RAML definition can be specified as a remote URL or loaded from a file system. The tool can be run in preview mode before being executed against a specific area.

![RAML Converter](/../screenshots/RAML2MasheryUrl.png?raw=true "RAML Converter")

![RAML Converter](/../screenshots/RAML2MasheryFile.png?raw=true "RAML Converter")

### Swagger2Mashery

This tool consumes a Swagger-based API definition (Swagger 1.2 and 2.0 are supported) and creates a Mashery service definition in the target area. The Swagger definition can be specified as a remote URL or loaded from a file system. The tool can be run in preview mode before being executed against a specific area.

![Swagger Converter](/../screenshots/Swagger2MasheryUrl.png?raw=true "Swagger Converter")

![Swagger Converter](/../screenshots/Swagger2MasheryFile.png?raw=true "Swagger Converter")

### WADL2Mashery

This tool consumes a WADL-based API definition and creates a Mashery service definition in the target area. WADL resources that share a common path can optionally be merged into a single Mashery endpoint. The tool can be run in preview mode before being executed against a specific area.

![WADL Converter](/../screenshots/WADL2MasheryUrl.png?raw=true "WADL Converter")

![WADL Converter](/../screenshots/WADL2MasheryFile.png?raw=true "WADL Converter")

### WSDL2Mashery

This tool consumes a WSDL-based SOAP Web service definition and creates a Mashery service definition in the target area.  The WSDL definition can be specified as a remote URL or loaded from a file system. The tool can be run in preview mode before being executed against a specific area.

![WSDL Converter](/../screenshots/WSDL2MasheryUrl.png?raw=true "WSDL Converter")

![WSDL Converter](/../screenshots/WSDL2MasheryFile.png?raw=true "WSDL Converter")

### Swagger2IODocs

This tool consumes a Swagger-based API definition (Swagger 2.0 only is supported at this point) and creates a Mashery IO Docs definition. The tool can be run in preview mode before being executed against a specific area. When run in preview mode, the generated IO Docs is printed to the browser, and can be copied/pasted into the IO Docs editor in the Mashery Control Center. When executed against a specific area, the IO Docs definition is created in the target area if none already exists, or updated if a definition does exist.

**NEW feature:** an option to generate a sample response from a schema object in a textarea control. In order to render the sample in a syntax highlighting control, the following additional steps are required:

* Add the following to the Head JavaScript section in the Portal Settings page:

```javascript
<script type="text/javascript" src="http://ajax.googleapis.com/ajax/libs/jquery/1.11.3/jquery.min.js"></script>
<script type="text/javascript">
var $j = jQuery.noConflict();
</script>
```

* Add the following styles to the last-minute CSS section:

```css
pre.sample {
  margin: 0;
  height: 150px;
  resize: both;
  overflow: auto;
}
```

* Add the following to the Body JavaScript section:

```javascript
portalReady(function () {
    /*************************************************
     * IODocs syntax highlighting for Swagger sample *
     *************************************************/
    var iodocs = document.querySelector("#page-ioDocs");
    if (undefined !== iodocs) {
        var sample = $j( "textarea[name='params[response_sample]']" );
        if (undefined !== sample) {
            sample.addClass("sample");
            $j( "textarea.sample").before(function () {
                var json = $j(this).val();
                if (undefined !== json) {
                    return "<pre class='response prettyprint sample'>" + json + "</pre>";
                } else {
                    return "";
                }
            });
            sample.hide();
            prettyPrint();
        }
    }
});
```

**Caution:** No warning is provided before overwriting an existing IO Docs definition. _Use with care_.

**Note:** This tool provides partial support for schema objects used as method parameters. Specifically, arrays/lists of schema objects are not supported at this point.

![Swagger IODocs Converter](/../screenshots/Swagger2IODocs.png?raw=true "Swagger IODocs Converter")
