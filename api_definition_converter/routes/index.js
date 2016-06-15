var express = require('express');
var router = express.Router();

var path = require('path');  // Directory

/* GET home page. */
router.get('/', function (req, res) {
    var config = require(path.join(__dirname, '..', 'config.js'));
    var sorted_tools = mashery_tools.sort(function (a, b) {
        if (a.name > b.name) {
            return 1;
        }
        if (a.name < b.name) {
            return -1;
        }
        // a must be equal to b
        return 0;
    });
    res.render('index', {
        title: 'Mashery Tools',
        tools: sorted_tools
    });
});

module.exports = router;
