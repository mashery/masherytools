/*jslint node: true */
'use strict';

var mashery = require('../lib/mashery');
var assert = require('chai').assert;

describe('mashery-api-client', function(){
    it('should fail without parameters', function(done){
        try{
            var apiClient = mashery.init();
        } catch(e){
            assert.isNotNull(e);
        }

        done();
    });
    it('should pass with parameters', function(done){
        var apiClient;
        try{
            apiClient = mashery.init({
                user: 'foo',
                pass: 'foo',
                key: 'foo',
                secret: 'foo',
                areaUuid: 'foo'
            });
        } catch(e){
            assert.isNull(e);
        }
        assert.isDefined(apiClient);
        done();
    });
});