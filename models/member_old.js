var mysql = require('mysql');
var async = require('async');
var dbPool = require('../common/dbpool').dbPool;
var aes_key = require('../config/key').aes_key;
var fs = require('fs');



function create(member, callback) {
   var sql_insert_members = 'insert into members(username, name, password) ' +
                            'values(?, aes_encrypt(?, unhex(sha2(?, 512))), sha2(?, 512))';
   var sql_insert_photos = 'insert into photos(mid, path, url, mimetype) ' +
                           'values(?, ?, ?, ?)';
   var sql_select_members = 'select id, username, ' +
                            '   cast(aes_decrypt(name, unhex(sha2(?,512))) as char(40)) as name ' +
                            'from members ' +
                            'where id = ?';
   var sql_select_photos = 'select url, mimetype ' +
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
               var photoPath = item.path;
               var fileName = item.filename;
               var photoUrl = 'https://localhost/members/' + mid + '/photos/' + fileName;
               var mimetype = item.mimetype;

               conn.query(sql_insert_photos, [mid, photoPath, photoUrl, mimetype], function (err) {
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
                  url: row.url,
                  mimetype: row.mimetype
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




function updateMember(reqMember, callback) {
   var sql_select_members =
      'select id, username, ' +
      '   cast(aes_decrypt(name, unhex(sha2(?,512))) as char(40)) as name, facebook_id ' +
      'from members ' +
      'where id = ?';

   var sql_select_photos =
      'select mid, location, bucket, key ' +
      'from photos ' +
      'where mid = ?';

   var sql_update_members_secured =
      'update members ' +
      'set name = aes_encrypt(?, unhex(sha2(?, 512))), password = sha2(?, 512)  ' +
      'where id = ?';

   var sql_insert_photos = 'insert into photos(mid, path, url, mimetype) ' +
                           'values(?, ?, ?, ?)';

   var sql_delete_photos = 'delete ' +
                           'from photos ' +
                           'where mid = ? and path = ?';




   dbPool.getConnection(function(err, conn) {
      function selectMembers(nextTask) {
         var member = {};
         member.updateMember = {};
         member.updateMember = reqMember;
         conn.query(sql_select_members, [aes_key, reqMember.id], function(err, rows, fields) {
            if(err)
               return nextTask(err);
            if(rows.length === 0)
               return nextTask(err);
            member = rows[0];
            member.updateMember = {};
            member.updateMember = reqMember;
            nextTask(null, member);
         });
      }
      function selectPhotos(member, nextTask) {
         conn.query(sql_select_photos, [member.id], function(err, rows, fields) {
            if(err)
               return nextTask(err);
            if(rows.length === 0)
               return nextTask(null, member);
            member.photos = [];
            // rows.forEach(function(item) {
            //     member.photos.push(item);
            // });
            async.each(rows, function(row, nextCallback) {
               member.photos.push({
                  mid: row.mid,
                  url: row.url,
                  path: row.path,
                  mimetype: row.mimetype
               });
               nextCallback(null)
            }, function(err) {
               if (err)
                  return nextTask(err);
            });
            nextTask(null, member);
         });
      }
      function updateMembers(member, nextTask) {
         var  changeMember = {
            id: member.updateMember.id,
            name: member.updateMember.name || member.name ,
            password: member.updateMember.password
         };
         conn.query(sql_update_members, [changeMember.name, aes_key, changeMember.password, changeMember.id], function(err, results) {
            if (err)
               return nextTask(err);
            if (results.affectedRows !== 1)
               return nextTask(err);
            nextTask(null, member);
         });
      }
      function updatePhotos(member, nextTask) {
         if (member.updateMember.photos.length !=0){
            async.each(member.updateMember.photos, function(item, nextCallback) {
               var photoPath = item.path;
               var photoName = item.filename;
               var photoUrl = 'https://localhost/uploads/images/members/' + photoName;
               var mimetype = item.mimetype;
               conn.query(sql_insert_photos, [member.id, photoPath, photoUrl, mimetype], function(err) {
                  if (err)
                     return nextCallback(err);
                  return nextCallback(null);
               })
            }, function(err) {
               if(err)
                  return nextTask(err);
            });
         }
         if(member.photos){
            async.each(member.photos, function(item, nextCallback) {
               var mid = item.mid;
               var path = item.path;
               conn.query(sql_delete_photos, [mid, path], function (err) {
                  if (err)
                     return nextCallback(err);
               });
               // fs.unlink(path, function(err) {
               //    if (err)
               //       return nextCallback(err);
               // });

               nextCallback(null);
            }, function(err) {
               if (err)
                  return nextTask(err);
            });
         }
         return nextTask(null, member);
      }
      function selectUpdatedMembers(member, nextTask) {
         var updatedMember = {};

         conn.query(sql_select_members, [aes_key, member.id], function(err, rows, fields) {
            if(err)
               return nextTask(err);
            if(rows.length === 0)
               return nextTask(err);
            updatedMember = rows[0];
            nextTask(null, updatedMember);
         });
      }
      function selectUpdatedPhotos(member, nextTask) {
         conn.query(sql_select_photos, [member.id], function(err, rows, fields) {
            if(err)
               return nextTask(err);
            if(rows.length === 0)
               return nextTask(null, member);
            member.photos = [];
            // rows.forEach(function(item) {
            //     member.photos.push(item);
            // });
            async.each(rows, function(row, nextCallback) {
               member.photos.push({
                  url: row.url,
                  mimetype: row.mimetype
               });
               nextCallback(null)
            }, function(err) {
               if (err)
                  return nextTask(err);
            });
            nextTask(null, member);
         });
      }

      conn.beginTransaction(function(err) {
         if (err)
            return callback(err);
         async.waterfall([selectMembers, selectPhotos, updateMembers, updatePhotos, selectUpdatedMembers, selectUpdatedPhotos],
                         function(err, member) {
                            if (err) {
                               conn.rollback(function() {
                                  conn.release();
                                  return callback(err);
                               });
                            }
                            conn.commit(function(err) {
                               if (err) {
                                  conn.rollback(function() {
                                     conn.release();
                                     return callback(err);
                                  });
                               }
                               conn.release();
                               callback(null, member);
                            });
                         }
         );

      });
   });
}

function quiteMember (userId, callback) {
   var sql_delete = 'delete ' +
                    'from members ' +
                    'where id = ?';

   var sql_select = 'select id, username, ' +
      '   cast(aes_decrypt(name, unhex(sha2(?,512))) as char(40)) as name, '+
      '   password, path, url ' +
      'from members ' +
      'where id = ?';



   dbPool.getConnection(function(err, conn) {
      if (err)
         return callback(err);

      conn.query(sql_select, [aes_key, userId], function(err, rows, fields){
            if (err)
               return callback(err);
            var deletedMember = {};
            deletedMember.id = rows[0].id;
            deletedMember.username = rows[0].username;
            deletedMember.name = rows[0].name;
            deletedMember.password = rows[0].password;
            deletedMember.path = rows[0].path;
            deletedMember.url = 'https://localhost' + rows[0].url;

            conn.query(sql_delete, [userId], function(err, result) {
               conn.release();
               if (err)
                  return callback(err);
               if (result.affectedRows ===  1 )
                  callback(null, deletedMember);
               else
                  callback(err)

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
module.exports.quiteMember = quiteMember;
module.exports.showMembersList = showMembersList;
module.exports.findOrCreate = findOrCreate;
