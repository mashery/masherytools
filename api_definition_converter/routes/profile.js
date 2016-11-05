var express = require('express');
var router = express.Router();
var passport = require('passport');

/******************
 * GET login page *
 ******************/
router.get('/',
    require('connect-ensure-login').ensureLoggedIn(),
    function(req, res){
        res.render('profile', { user: req.user });
    });

module.exports = router;