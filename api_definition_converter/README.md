# Mashery API Definition Converter
Tool for converting various API definition formats into Mashery formats.

## Introduction

I created this Web UI wrapper around a collection of [Node.js](https://nodejs.org/) scripts to make more compelling demos of the [Platform API](http://support.mashery.com/docs/read/mashery_api/30) (even though the likely use of the API will be via command-line.) This Web app is implemented using the [Express](http://expressjs.com/) and [Handlebars](http://handlebarsjs.com/) frameworks, and leverages a client library for the Mashery Platform API created by [Cox Automotive](https://github.com/Cox-Automotive/mashery) . The Web UI was designed to be extended using a simple configuration, hoping to encourage additional contribution and a growing set of API-driven tools.

## Prerequisites

Node.js v4.4.3 or later

## Installation
Post clone of repository, change into the api_definition_converter directory and perform the following commands/steps:

* npm update
* cp credentials.js.sample credentials.js and update to reflect your Mashery area information and V3 API key information.

## Usage

From within the api_definition_converter directory, run following command:

    node bin/www

Navigate to [http://localhost:3000](http://localhost:3000)

![Mashery API Tools](/../screenshots/MasheryTools.png?raw=true "Mashery Tools")

**Note:** Target domains _must_ be whitelisted before any of these tools are used, or the endpoint creation will fail.

## The Tools

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

**Caution:** No warning is provided before overwriting an existing IO Docs definition. _Use with care_.

**Note:** This initial release provides partial support for schema objects used as method parameters. Specifically, arrays/lists of schema objects are not supported at this point.

![Swagger IODocs Converter](/../screenshots/Swagger2IODocs.png?raw=true "Swagger IODocs Converter")
