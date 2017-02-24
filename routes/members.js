var express = require('express');
var router = express.Router();
var isSecure = require('../common/security').isSecure;
var isLoggedIn = require('../common/security').isLoggedIn;
var Member = require('../models/member');
var multer = require('multer');
var multerS3 = require('multer-s3');
var AWS = require('aws-sdk');
var s3config = require('../config/aws_s3');


// server가 s3에겐 클라이언트이기 때문에 클라이언트 객체가 필요하고, 아래 S3가 클라이언트 객체임.
var S3 = new AWS.S3({
   region : s3config.region,
   accessKeyId: s3config.accessKeyId,
   secretAccessKey: s3config.secretAccessKey
});
var path = require('path');
var util = require('util');
// var upload = multer({dest: path.join(__dirname,'../uploads/images/members') });
var logger = require('../common/logger');

var upload = multer({
   storage: multerS3({
      s3: S3,
      bucket: 'didimdolpetpal',
      acl: 'public-read',
      contentType: multerS3.AUTO_CONTENT_TYPE,
      metadata: function (req, file, cb) {
         cb(null, {
            fieldName: file.fieldname
         });
      },
      key: function (req, file, cb) {
         cb(null, 'photos/' + Date.now().toString())
      }
   })
});

// mount point: /members
//CRUD +L

router.post('/', isSecure, upload.array('photos', 3), function(req, res, next){

   //바디파서가 처리해주는 것
   var username = req.body.username;
   var name = req.body.name;
   var password = req.body.password;
   var photos = req.files;

   Member.create({
      username: username,
      name: name,
      password: password,
      photos: photos
   }, function(err, member) {
      if (err)
         return next(err);
      res.json({
         result: {
            message: '가입된 정보는 다음과 같습니다.',
            data: {
               id: member.id,
               username: member.username,
               name: member.name,
               photos: member.photos
            }
         }
      });
   });
});

//  2017-02-09 까지 과제, 확장자 살려둘것
// 저장 url도 아래의 url과 같게 저장해줘야 한다.
router.get('/:mid/photos/:filename', isSecure, isLoggedIn, function(req, res, next) {
   var mid = req.params.mid;
   var filename =req.params.filename;

   var imagePath = path.join(__dirname, '../uploads/images/members', filename);

   //image/jpge mimetype은 db로 부터
   // res.set('content-type', 'image/jpg'); // mime type 설정
   var options = {
      root: path.join(__dirname, '../uploads/images/members'),
      headers: {
         'content-type': 'image/jap'
      }
   }
   // res.sendFile(imagePath, options, function (err) {
   res.sendFile(filename, options, function (err) {
      if (err)
         next(err);
   });
});

router.get('/:mid', isSecure, isLoggedIn, function(req, res, next) {

   var id = req.params.mid;
   Member.findMember(req.params.mid, function(err, member) {
      if (err)
         return next(err);
      if (!member) {
         var err = new Error('Not Found');
         err.status = 404;
         return next(err);
      }

      res.json({
         result: {
            message:'가입된 정보는 다음과 같습니다.',
            data: {
               id: member.id,
               username: member.username,
               password: member.password,
               name: member.name,
               photos : member.photos
            }
         }
      });
   });

});

router.put('/:mid', isSecure, isLoggedIn, upload.array('photos', 3), function(req, res, next){
   // 1. member 객체를 생성해서 req.body 정보 및 files 정보를 담음.
   // 2. updateMember로 member 객체와 콜백 전달.
   // 3. 콜백 err 처리.
   // 4. res.json 정의.
   if (parseInt(req.params.mid) === req.user.id) {


      var name = req.body.name;
      var photos = req.files;
      var password = req.body.password;
      var facebook_id = req.user.facebook_id;

      var member = {
         id: req.user.id,
         facebook_id: facebook_id,
         name: name,
         password: password,
         photos: photos
      };


      Member.updateMember(member, function(err, user) {
         if (err)
            return next(err);
         res.json({
            result: {
               message:'변경된 정보는 다음과 같습니다.',
               data: {
                  name: user.name,
                  photos: user.photos
               }
            }
         });
      });
   } else {
      var err = new Error('Forbidden');
      err.status = 403;
      next(err);
   }

});


// router.put('/:mid', isSecure, isLoggedIn, upload.single('photo'), function(req, res, next){
//
//    var name = req.body.name;
//    var password = req.body.password;
//
//    var filepath = req.file.path;
//    var filename = req.file.filename;
//    var fileurl = '/images/members/' + filename;
//    var member = {
//       name: name ,
//       password: password,
//       path: filepath,
//       url: fileurl
//    };
//
//    Member.updateMember(req.params.mid, member, function(err, user) {
//       if (err)
//          return next(err);
//       res.json({
//          result: {
//             message:'변경된 정보는 다음과 같습니다.',
//             data: {
//                id: user.id,
//                username: user.username,
//                password: user.password,
//                name: user.name,
//                path: user.path,
//                url: user.url,
//                changedRow: user.changedRow
//             }
//          }
//       });
//    });
// });

// router.delete('/:mid', isSecure, isLoggedIn, function(req, res, next){
//    Member.quiteMember(req.params.mid, function(err, member) {
//       if (err)
//          return next(err);
//       res.json({
//          result: {
//             message:'삭제된 정보는 다음과 같습니다.',
//             data: {
//                id: member.id,
//                username: member.username,
//                password: member.password,
//                name: member.name,
//                path: member.path,
//                url: member.url,
//                affectedRow: member.affectedRow
//             }
//          }
//       });
//    });
//
// });

router.delete('/:mid', isLoggedIn, function(req, res, next) {
   var id = req.params.mid;
   Member.remove(id, function(err, affectedRows) {
      var message = "";
      if (err)
         return next(err);
      if (affectedRows.memberAffectedRows)
         message = "회원이 삭제 되었습니다.";
      else
         message = '회원이 삭제되지 않았습니다.';
      if (affectedRows.photosAffectedRows)
         message = message + ' 사진이 삭제되었습니다.';
      else
         message = message + ' 사진이 삭제되지 않았습니다.';
      res.json({
         result: {
            message
         }
      })
   })
});



router.get('/', isSecure, isLoggedIn, function(req, res, next){
   // 1. query string에서 page, rows을 받아오기
   // 2. Member 객체의 showMembersList 함수에 page, rows를 인자로 넘겨주기
   // 3. callback 함수에서 err 처리 후 res.send 정의 하기.

   var setting = {
      page: parseInt(req.query.page),
      rows: parseInt(req.query.rows)
   };
   Member.showMembersList(setting, function(err, list) {
      if (err)
         return next(err);
      res.send({
         message : "요청한 페이지의 정보는 다음과 같습니다.",
         list : [...list]
      });
   });
});



module.exports = router;
