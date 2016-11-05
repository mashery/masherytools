var express  = require('express');
var router   = express.Router();
var passport = require('passport');
var url      = require('url');	  // URL parser

/******************
 * GET login page *
 ******************/
router.get('/', function (req, res) {
    res.render( 'login', {title: "Mashery Tools"} );
});

/*******************
 * POST login page *
 *******************/
router.post('/',
    passport.authenticate('local', { failureRedirect: '/login' }), function(req, res) {
        //res.redirect('/profile', { user: req.user });
        //res.render('index', { user: req.user });
        res.redirect('/');
});

module.exports = router;