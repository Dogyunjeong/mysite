var mysql = require('mysql');
var async = require('async');
var dbPool = require('../common/dbpool').dbPool;
var aes_key = require('../config/key').aes_key;
var fs = require('fs');
var AWS = require('aws-sdk');
var s3config = require('../config/aws_s3');

var S3 = new AWS.S3({
   region : s3config.region,
   accessKeyId: s3config.accessKeyId,
   secretAccessKey: s3config.secretAccessKey
});

   function create(member, callback) {
   var sql_insert_members = 'insert into members(username, name, password) ' +
                            'values(?, aes_encrypt(?, unhex(sha2(?, 512))), sha2(?, 512))';
   var sql_insert_photos = 'insert into photos(mid, location, bucket, s3_key) ' +
                           'values(?, ?, ?, ?)';
   var sql_select_members = 'select id, username, ' +
                            '   cast(aes_decrypt(name, unhex(sha2(?,512))) as char(40)) as name ' +
                            'from members ' +
                            'where id = ?';
   var sql_select_photos = 'select location, bucket, s3_key ' +
                           'from photos ' +
                           'where mid = ?';

   dbPool.getConnection(function(err, conn) {
      if (err)
         return callback(err);

      function insertMembers(nextTaskCallback) {
         conn.query(sql_insert_members,
            [member.username, member.name, aes_key, member.password], function(err, result) {
               if (err)
                  return callback(err);
               var id = result.insertId;
               var photos = member.photos;
               nextTaskCallback(null, id, member.photos);
         });

      }

      function insertPhotos(mid, photos, nextTaskCallback) {
         if (photos) {
            async.each(photos, function (item, nextItemCallback) {
               var location = item.location;
               var bucket = item.bucket;
               var s3_key = item.key;

               conn.query(sql_insert_photos, [mid, location, bucket, s3_key], function (err) {
                  if (err)
                     return nextItemCallback(err);
                  nextItemCallback(null);
               });

            }, function (err) {
               if (err)
                  return nextTaskCallback(err, mid);
               nextTaskCallback(null, mid);
            });
         } else {
            nextTaskCallback(null, mid)
         }
      }

      function selectMembers(mid, nextTaskCallback) {
         conn.query(sql_select_members, [aes_key, mid], function (err, rows, fields) {
            if (err)
               return nextTaskCallback(err);
            var member = {};
            member.id = rows[0].id;
            member.username = rows[0].username;
            member.name = rows[0].name;
            nextTaskCallback(null, member);
         });
      }

      function selectPhotos(member, nextTaskCallback) {
         conn.query(sql_select_photos, [member.id], function(err, rows, fields) {
            if (err)
               return nextTaskCallback(err);
            member.photos = [];

            // rows.forEach(function(row) {
            //    member.photos.push({
            //       url: row.url,
            //       mimetype: row.mimetype,
            //    });
            // });
            async.each(rows, function(row, nextItemCallback) {
               member.photos.push({
                  location: row.location,
                  bucket: row.bucket,
                  s3_key: row.s3_key
               });
               nextItemCallback(null);
            }, function(err) {
               if (err)
                  return nextTaskCallback(err);
               nextTaskCallback(null, member);
            });
         });
      }

      conn.beginTransaction(function(err) {
         if (err){
            conn.release();
            return callback(err);
         }

         async.waterfall([insertMembers, insertPhotos, selectMembers, selectPhotos], function (err, member) {
            if (err){
               conn.rollback(function() {
                  conn.release();
                  return callback(err);
               });
            } else {
               conn.commit(function(err) {
                  if (err){
                     conn.rollback(function() {
                        conn.release();
                        return callback(err);
                     });
                  }
                  conn.release();
                  callback(null, member);
               });
            }
         });

      });
   });
}


//  1: 멤버를 변경하기 위한 쿼리를 작성한다.
//  2: connection을 dbPool로부터 획득한다.
//  3: connection을 얻지 못했을 경우 err 처리를 한다.
//  4: connection을 이용해 query함수를 호출하고 작성한 쿼리와, escpae place holder 옵션과 콜백을 작성한다.
//  5: connection을 release 해준다.
//  6: error처리를 위해 callback에 err전달
//  7: 매개변수로 전달된 result의 changedRows 값이 1일때와 0일 때 나눠서 처리
//  8: changedRows 값 1일 때,
//  9: changedRows 값 0일 때,


// updateMember ver0.1
//  : 1. sql_select_members 작성
//  : 2. sql_select_photos 작성
//  : 3. sql_update_members 작성
//  : 4. sql_delete_photos 와 sql_insert_photos 작성 (업데이트로 활용. 1개 등록후 -> 3개 업데이트 및 3->1 업데이트 대응
//  : 5. selectMembers, selectPhotos, updateMembers, updatePhotos 함수 작성
//  : 6. async.waterfall함수를 이용해

//updateMember ver0.2
// 1. Query 변수 선언
// 1-1 sql_members_select, sql_members_update, sql_photos_select, sql_photos_update, sql_photos_delete.
// 2. dbPool로부터 connection을 얻고 beginTransaction을 시작. callBack으로 async.waterfall을 이용해 동기 함수 작성.
// 2-1 인자로 받은 reqMember.id를 sql_select_query를 질의 결과 중 member에 없는 값을 저장 후 다음 중첨함수로 전달.
// 2-2 member 정보를 sql_members_update 질의를 통해 members table 업데이트
// 2-3 member.id를 sql_photos_select 질의에서 인자로 기존 Photos 정보를 가져옴.
// 2-4 member.photos배열의 객체가 존재하면 async.each 사용, 중첩함수에서 item.path가 존재하면 db의 photos table 업데이트.
// 2-4-1 nextCallback에서 중첨함수의 err발생시 updateMembers의 callback에 err 리턴, !err이면 다음 async.waterfall 중첨함수에 (null, member)전달
// 2-5 2-3에 얻은 기존 photos 정보 async.each를 사용, 중첨함수에서 sql_photos_delete 질의를 mid, path를 인자로 삭제.
// 2-5-1 nextCallback에서 중첨함수의 err발생시 callback(err)을 리턴, !err이면 nextTask(null, member) 실행
// 2-6 waterfall callback 처리.
// 2-6-1 waterfall callback에 err가 발생시 rollback 후 connection을 release하고 err를 updateMember callback에 전달.
// 2-6-2 !err이면, commit을 실행하고 commit의 callback에서 err처리와 updateMember callback에 (null, member)를 전달.




function updateMember(member, callback) {
   // .1 member의 정보들을 업데이트 하기 위한 쿼리 변수를 선언한다.
   var sql_select_members = 'select id,' +
      '       username, ' +
      '       cast(aes_decrypt(name, unhex(sha2(?, 512))) as  char(40)) as name, ' +
      '       password ' +
      'from members ' +
      'where id = ? ';

   // 변경하는 비밀번호가 없는 경우 (이중암호화 방지)
   var sql_update_members = 'update members ' +
      'set username = ?, ' +
      '    name = aes_encrypt(?, unhex(sha2(?, 512))) ' +
      'where id = ? ';

   // 변경하는 비밀번호가 있는 경우
   var sql_update_members_pw = 'update members ' +
      'set username = ?, ' +
      '    name = aes_encrypt(?, unhex(sha2(?, 512))), ' +
      '    password = sha2(?, 512) ' +
      'where id = ? ';

   var sql_select_photos = 'select mid, location, bucket, s3_key ' +
      'from photos ' +
      'where mid = ? ';

   var sql_insert_photos = 'insert into photos (mid, location, bucket, s3_key) ' +
      'values (?, ?, ?, ?) ';

   var sql_delete_photos = 'delete ' +
      'from photos ' +
      'where location = ? ';

   var beforePhotos = []; // 변경 전의 사진정보를 임시 저장

   // .2 dbPool에서 connection객체를 빌려온다. (반드시 반환할것!!!)
   dbPool.getConnection(function (err, conn) {
      // .3 err가 발생할 경우 콜백함수에 err객체를 전달한다.
      if (err)
         return callback(err);
      // 4 selectMembersForUpdate 중첩함수(id에 해당하는 멤버객체 반환)를 작성한다.
      function selectMemberForUpdate (nextTaskCallback) {
         var pwFlag = 0; // 비밀번호가 변경 유무를 나타내는 상태 변수(0 = 변경되었을때, 1 = 변경되지않았을때)
         conn.query(sql_select_members, [aes_key, member.id], function (err, rows, fields) {
            if (err)
               return nextTaskCallback(err);

            if (rows.length !== 1) {
               err = new Error('Not Found');
               err.status = 404;
               return nextTaskCallback(err);
            } else {
               if (!member.username)
                  member.username = rows[0].username;
               if (!member.name)
                  member.name = rows[0].name;
               if (!member.password) {
                  pwFlag = 1;
                  member.password = rows[0].password;
               }
               nextTaskCallback(null, pwFlag, member);
            }
         })
      }

      // 5 updateMembersForUpdate 중첩함수(id에 해당하는 멤버객체 변경)를 작성한다.
      function updateMemberForUpdate(pwFlag, member, nextTaskCallback) {
         if (pwFlag === 1) { // 비밀번호가 변경되지 않았을때
            conn.query(sql_update_members, [member.username, member.name, aes_key, member.id],
               function (err) {
                  if (err)
                     return nextTaskCallback(err);

                  nextTaskCallback(null, member);
               });
         } else { // 비밀번호 변경되었을때
            conn.query(sql_update_members_pw, [member.username, member.name, aes_key, member.password, member.id],
               function (err) {
                  if (err)
                     return nextTaskCallback(err);

                  nextTaskCallback(null, member);
               });
         }
      }


      // 6 selectPhotosForUpdate 중첩함수(id에 해당하는 사진정보를 가진 멤버객체 반환)를 작성한다.
      function selectPhotosForUpdate(member, nextTaskCallback) {
         conn.query(sql_select_photos, [member.id], function (err, rows, fields) {
            if (err)
               return nextTaskCallback(err);

            if (member.photos) {
               async.each(rows, function (row, nextItemCallback) {
                  beforePhotos.push({
                     location: row.location,
                     bucket: row.bucket,
                     key: row.s3_key
                  });
                  nextItemCallback(null);
               }, function (err) {
                  if (err)
                     return nextTaskCallback(err);
                  nextTaskCallback(null, beforePhotos);
               });
            } else {
               nextTaskCallback(null, beforePhotos);
            }
         });
      }

      // 7 insertPhotosForUpdate 중첩함수(id에 해당하는 사진정보를 추가)를 작성한다.
      function insertPhotosForUpdate(beforePhotos, nextTaskCallback) {
         var photos = member.photos;

         if (photos) { // 복수의 사진 파일이 업로드 되었을 경우
            var photoLocation;
            var photoBucket;
            var photoKey;

            async.each(photos, function (photo, nextItemCallback) {

               if (photo) {
                  photoLocation = photo.location;
                  photoBucket = photo.bucket;
                  photoKey = photo.key;
               }

               conn.query(sql_insert_photos, [member.id, photoLocation, photoBucket, photoKey], function (err) {
                  if (err)
                     return nextItemCallback(err);
                  nextItemCallback(null);
               });
            }, function (err) {
               if (err)
                  return nextTaskCallback(err);
               nextTaskCallback(null, beforePhotos);
            });
         } else {
            nextTaskCallback(null, beforePhotos);
         }
      }

      // 8 deletePhotosForUpdate 중첩함수(id에 해당하는 사진정보 및 beforePhoto 해당하는 사진파일을 삭제)를 작성한다.
      function deletePhotosForUpdate(beforePhotos, nextTaskCallback) {
         if (beforePhotos) { // beforePhoto 파일의 경로를 가지고 있을 때
            async.each(beforePhotos, function (beforePhoto, nextItemCallback) {
               var beforePhotoLocation = beforePhoto.location;
               conn.query(sql_delete_photos, [beforePhotoLocation], function (err) {
                  if (err)
                     return nextItemCallback(err);
                  nextItemCallback(null);
               });
            }, function (err) {
               if (err)
                  return nextTaskCallback(err);
               member.beforePhotos = beforePhotos; //commit시 지울 파일의 경로를 member 객체에 등록
               nextTaskCallback(null, member);
            })
         } else { // beforePhotos 빈 배열일 때
            nextTaskCallback(null, member);
         }
      }
      // .9 transaction 을 시작한다.
      conn.beginTransaction(function (err) {
         if (err) {
            conn.release();
            return callback(err);
         }

         async.waterfall([selectMemberForUpdate, updateMemberForUpdate, selectPhotosForUpdate,
            insertPhotosForUpdate, deletePhotosForUpdate], function (err, member) {
            // .10 async.waterfall의 task로 중첩함수들을 전달한다.
            if (err) {
               // .11 에러가 발생할 경우 rollback을, 정상적으로 처리될 경우 commit을 수행한다.(connection객체를 반환할것!!!)
               conn.rollback(function () {
                  conn.release();
                  callback(err);
               });
            } else {
               conn.commit(function (err) {
                  if (err) {
                     conn.rollback(function () {
                        conn.release();
                        callback(err);
                     })
                  } else {
                     conn.release();
                     async.each(beforePhotos, function (deletePhoto, nextItemCallback) {
                        var params = {
                           Bucket: deletePhoto.bucket + '',
                           Key: deletePhoto.key + ''
                        };
                        S3.deleteObject(params, function (err) {
                           if (err)
                              return callback(err)
                        });
                        nextItemCallback(null);
                     }, function (err) {
                        if (err)
                           return callback(err);
                        callback(null, member);
                     });
                  }
               });
            }
         });
      });
   });
}

function remove(mid, callback) {
   var sql_remove_member = 'delete from members ' +
      'where id = ?';
   var sql_select_photos = 'select bucket, s3_key ' +
      'from photos ' +
      'where mid = ?';
   var sql_remove_photos = 'delete from photos ' +
      'where mid = ?';
   var s3Objects = [];
   var bucket = {}

   dbPool.getConnection(function (err, conn) {
      if (err)
         return callback(err);
      function selectPhotos(nextTaskCallback) {
         conn.query(sql_select_photos, [mid], function(err, rows, fields) {
            if (err)
               return nextTaskCallback(err);
            if (rows.length) {
               bucket = rows[0].bucket;
               async.each(rows, function(row, nextItemCallback) {
                  s3Objects.push({
                     Key: row.s3_key
                  });
                  nextItemCallback(null);
               }, function(err) {
                  if (err)
                     return nextTaskCallback(err);
                  nextTaskCallback(null, s3Objects);
               });
            } else {
               nextTaskCallback(null, null);
            }
         });
      }
      function removePhotos(paramsObject, nextTaskCallback) {
         conn.query(sql_remove_photos, [mid], function(err, result) {
            if (err)
               return nextTaskCallback(err);
            nextTaskCallback(null, paramsObject, result.affectedRows);
         });
      }

      function removeMember(paramsObject, photosAffectedRows, nextTaskCallback) {
         conn.query(sql_remove_member, [mid], function (err, result) {
            if (err)
               return nextTaskCallback(err);
            var affectedRows = {
               memberAffectedRows: result.affectedRows,
               photosAffectedRows: photosAffectedRows
            };
            nextTaskCallback(null, affectedRows);
         });
      }

      conn.beginTransaction(function (err) {
         if (err) {
            conn.release();
            return callback(err);
         }
         async.waterfall([selectPhotos, removePhotos, removeMember], function (err, result) {
            if (err) {
               conn.rollback(function () {
                  conn.release();
                  return callback(err);
               });
            } else {
               conn.commit(function (err) {
                  if (err) {
                     conn.rollback(function () {
                        conn.release();
                        return callback(err);
                     });
                  } else {
                     conn.release();
                     S3.deleteObjects({
                        Bucket: bucket,
                        Delete: {
                           Objects: s3Objects
                        }
                     }, function (err, data) {
                        if (err)
                           callback(err);
                     });
                     callback(null, result);
                  }
               });
            }
         });
      });
   });
}


/*
   dbPool을 통해 커넥션을 얻어오거나 err를 얻게 된다.
 */

function findByUsername(username, callback) {
   /*
    ? : escape place holder, 나중에 옵션으로 넘겨주는 인자가 여기에 들어간다.
    만약 ?가 4개였다면, 배열의 순서대로 맞춰 들어감.
    마지막에 반드시 space를 넣을것 to avoid syntax error
    */
   var sql = 'select id, username, ' +
             'cast(aes_decrypt(name, unhex(sha2(?, 512))) as char(40)), password ' +
             'from members ' +
             'where username = ?';

   dbPool.getConnection(function (err, conn) {
      if (err)
         return callback(err);

      /*
       when sql is of select then function(err, rows, fields)
       when sql is of insert, updateMember and delete then function(err, result)
       */
      conn.query(sql, [aes_key, username], function (err, rows, fields) {
         conn.release();
         if (err)
            return callback(err);
         if (rows.length === 1) {
            var user = {};
            user.id = rows[0].id;
            user.username = rows[0].username;
            user.name = rows[0].name;
            user.password = rows[0].password;
            callback(null, user);
         } else {
            callback(null, null);
         }

      });

   });
}

function verifyPassword(password, user, callback){
   var sql = 'select password = sha2(?, 512) as col ' +
             'from members ' +
             'where username = ?';

   dbPool.getConnection(function(err, conn) {
      if (err)
         return callback(err);

      conn.query(sql, [password, user.username], function(err, rows, fields) {
         conn.release();  // 가장 중요
         if (err)
            return callback(err);
         if (rows[0].col === 1)
            callback(null, true);
         else
            callback(null, false);
      });
   });
}

function findMember(memberId, callback) {
   var sql = 'select id, username, ' +






      'cast(aes_decrypt(name, unhex(sha2(?,512))) as char(40)) as name ' +
      'from members ' +
      'where id = ?';

   dbPool.getConnection(function (err, conn) {
      if (err)
         return callback(err);

      conn.query(sql, [aes_key, memberId], function (err, rows, fields) {
         conn.release();
         if (err)
            return callback(err);

         if (rows.length === 1) {   //id -primary key column
            var user = {};
            user.id = rows[0].id;
            user.username = rows[0].username;
            user.name = rows[0].name;
            user.password = rows[0].password;
            user.path = rows[0].path;
            user.url = rows[0].url;
            user.mimetype = rows[0].mimetype;
            callback(null, user);
         } else {
            callback(null, null);
         }

      });

   });
}

function findOrCreate(profile, callback) {
   var sql_select = 'select id, username, ' +
                    '        cast(aes_decrypt(name, unhex(sha2(?, 512))) as char(40)) as name, ' +
                    '        facebook_id, facebook_token ' +
                    'from members ' +
                    'where facebook_id = ?';
   var sql_insert = 'insert into members (name, facebook_id, facebook_token) ' +
                    'values (aes_encrypt(?, unhex(sha2(?, 512))), ?, ?)';
   var sql_update = 'update members ' +
                    'set facebook_token = ? ' +
                    'where id = ?';
   var sql_dml, sql_params;

   dbPool.getConnection(function(err, conn) {
      if (err)
         return callback(err);
      conn.query(sql_select, [aes_key, profile.id], function(err, rows, fields) {
         if (err)
            return callback(err);
         var member = {};
         if (rows.length === 0) {
            sql_dml = sql_insert;
            sql_params = [profile.displayName, aes_key, profile.id, profile.token];
         } else {
            sql_dml = sql_update;
            sql_params = [profile.token, rows[0].id];
            member.id = rows[0].id;
            member.name = rows[0].name;
            member.facebook_id = rows[0].facebook_id;
            // member 객체의 맴버를 가져옴.
         }
         conn.query(sql_dml, sql_params, function(err, result) {
            conn.release();
            if (err)
               return callback(err);
            if (result.insertId){
               member.id = result.insertId;
               member.name = profile.displayName;
               member.facebook_id = profile.id;
            }
            callback(null, member);

         });

         // if (rows.length === 0) {
         //    conn.query(sql_insert, [], function(err, result) {
         //       conn.release();
         //    });
         // } else{
         //    conn.query(sql_update, [], function(err, result) {
         //       conn.release();
         //    });
         // }
      });
   });
}

// 전체 행의 수를 구할 select query 문 만들기
//
// setting에 있는 정보를 이용해 limit에 들어갈 escape place holders 생성
// DB Pool의 getConnection을 하고 err 처리
// connection에서 쿼리문, 옵션, 콜백 전달
// 콜백에서 err 처리 후 rows 검사.
// list 객체를 생성해 page정보를 담고, 처음에 전달 받은 callback을 처리.
function showMembersList(setting, callback) {

   var sql_select_as_page =
      'select id, username, ' +
      '       cast(aes_decrypt(name, unhex(sha2(?,512))) as char(40)) as name, ' +
      'from members ' +
      'limit ?, ? ';
   var offSet = setting.rows * (setting.page - 1);
   var counts = setting.rows ;

   dbPool.getConnection(function(err, conn) {
      if (err)
         return callback(err);

      conn.query(sql_select_as_page, [aes_key, offSet, counts], function(err, rows, fields) {
         conn.release();
         if (err)
            return callback(err);
         if (rows.length === 0) {
            err = new Error('Not found');
            err.status = 404;
            return callback(err);
         }
         callback(null, rows);
      });
   });
}


module.exports.findMember = findMember;
module.exports.findByUsername = findByUsername;
module.exports.verifyPassword = verifyPassword;
module.exports.create = create;
module.exports.updateMember = updateMember;
module.exports.remove = remove;
module.exports.showMembersList = showMembersList;
module.exports.findOrCreate = findOrCreate;