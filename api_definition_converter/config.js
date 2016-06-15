mashery_tools = [
    {
        name: 'RAML2Mashery',
        description: 'This tool generates a Mashery API definition in the target area from a RAML-based source. RAML 0.8 and 1.0 are supported.',
        link: '/raml2mashery'
    },
    {
        name: 'Swagger2Mashery',
        description: 'This tool generates a Mashery API definition in the target area from a Swagger-based source. Swagger 1.2 and 2.0 are supported.',
        link: '/swagger2mashery'
    },
    {
        name: 'WADL2Mashery',
        description: 'This tool generates a Mashery API definition in the target area from a WADL-based source.',
        link: '/wadl2mashery'
    },
    {
        name: 'WSDL2Mashery',
        description: 'This tool generates a Mashery API definition in the target area from a WSDL-based source.',
        link: '/wsdl2mashery'
    },
    {
        name: 'Copy API',
        description: 'This tool allows the user to copy an API definition from a source area to a destination area.',
        link: '/copyapi'
    },
    {
        name: 'Swagger2IODocs',
        description: 'This tool generates an IO Docs definition for a given API in the target area from a Swagger-based source. Swagger 1.2 and 2.0 are supported.',
        link: '/swagger2iodocs'
    }
];

// Not used in Web UI (onli in CLI)
sample_response_raml_dir = './Samples/RAML'; // TODO: RAML can have inline !includes
sample_response_wadl_dir = './Samples/WADL';
sample_response_wsdl_dir = './Samples/WSDL';
sample_response_swagger_dir = './Samples/Swagger';
