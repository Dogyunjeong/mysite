var express = require('express');
var router = express.Router();
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;
var Member = require('../models/member');
var facebookConfig = require('../config/facebook');
var logger = require('../common/logger');
var nodemailer = require('nodemailer');
var sesTransport = require('nodemailer-ses-transport');
var sesConfig = require('../config/aws_ses');
var generatorPassword = require('password-generator');


passport.use(new LocalStrategy({usernameField: 'username', passwordField: 'password'},    // req.body[options.usernameField] 연관배열 표기법
   function(username, password, done) {
      Member.findByUsername(username, function(err, user) {
         if (err) {
            return done(err);
         }
         if (!user) {
            return done(null, false);
         }
         Member.verifyPassword(password, user, function (err, result) {
            if (err) {
               return done(err);
            }
            if (!result) {
               return done(null, false);
            }
            delete user.password;
            done(null, user);
         })
      });
}));

passport.use(new FacebookStrategy({
   clientID: facebookConfig.appId,
   clientSecret: facebookConfig.appSecretCode,
   callbackURL:'https://localhost/auth/facebook/callback',
   profileFields: ['id', 'displayName', 'photos', 'email'] // 웹 브라우저일때만 필요.
}, function(accessToken, refreshToken, profile, done) {
   logger.log('debug', 'facebook token: %s(length: %d)', accessToken, accessToken.length);
   profile.token = accessToken;  // access Token을 profile 객체의 프로퍼티에 저장
   Member.findOrCreate(profile, function(err, member) {
      if (err)
         return done(err);
      done(null, member);
   });

}));


//일종의 이벤트 핸들러.
passport.serializeUser(function(user, done){
   done(null, user.id);
});

passport.deserializeUser(function(id, done){
   Member.findMember(id, function(err, user) {
     if (err) {
        return done(err);
     }
     done(null, user);
   });
});

router.post('/local/login', function(req, res, next) {
   passport.authenticate('local', function(err, user) {
      if (err) {
         return next(err);
      }
      if (!user){
         return res.status(401).send({
            message:'Login Failed!!'
         });
      }
      req.login(user, function(err){
         if (err) {
            return next(err);
         }
         next();
      });
   })(req, res, next);
}, function(req, res, next) {
   var user = {};
   user.usernmae = req.user.username;
   user.name = req.user.name;
   res.send({
      message: 'local login',
      user: user
   })
});

router.get('/local/logout', function (req, res, next) {
   req.logout();
   res.send({ message: 'local logout' });
});

router.get('/facebook', passport.authenticate('facebook', {scope: ['email']}));

router.get('/facebook/callback', passport.authenticate('facebook'), function(req, res, next) {
   var user = {};
   user.id = req.user.id;
   user.name = req.user.name;
   user.facebook_id = req.user.facebook_id;
   res.send({
      message: 'Facebook login',
      user: user
   });
});

router.post('/initpass', function(req, res, next) {
   var id = req.body.mid;

   // 1. id에 해당하는 email을 select 합니다.
   Member.findMember(id, function(err, member) {
      if (err)
         return next(err);
      // 2. 임시비밀번호를 생성하고, id를 이용해 password를 변경합니다.
      var tempPass = generatorPassword(6, false);
      member.password = tempPass;
      Member.updateMember(member, function(err, user) {
         if (err)
            return next(err);

         // 3. 2의 콜백에서 임시비밀번호를 기록한 메일을 전송합니다.
         var transporter = nodemailer.createTransport(sesTransport({
            "accessKeyId": sesConfig.accessKyeId,
            "secretAccessKey": sesConfig.secretAccessKey,
            "region": sesConfig.region
         }));

         var data = {
            "from": "spamholed@gmail.com",
            "to": ["deok2moon@gmail.com", "skdidimdol3@gmail.com"],
            "subject": "정도균의 임시비밀번호발행",
            "text": "정도균의 임시비밀번호는 " + tempPass + "입니다.",
            "html": "정도균의 임시비밀번호는 <strong>" + tempPass + "</strong>입니다."
         }

         transporter.sendMail(data, function(err, info) {
            if (err) {
               next(err);
            } else {
               res.json(info);
            }
         });
      });
   });




});


module.exports = router;