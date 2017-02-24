var dbPool = require('../../common/dbpool').dbPool;
var async = require('async');
var fs = require('fs');
var aes_key = require('../../config/key').aes_key;


//updateMember ver0.2
function updateMemberVer_0_2 (member, callback) {
   // 1. Query 변수 선언
   // 1-1 sql_members_select, sql_members_update_inSecured,  sql_members_update_secured, sql_photos_select, sql_photos_update, sql_photos_delete.
   // 1-1 issues: 암호화된 비밀번호에 대한 변경, 비밀번호 체크 여부
   var sql_members_select =
      'select username, aes_decrypt(name, unhex(sha2(?, 512))) as name' +
      'from members ' +
      'where id = ?';
   var sql_member_update_inSecured =
      'update members ' +
      'set name = aes_encrypt(?, unhex(sha2(?, 512))) ' +
      'where id = ?';
   // cannot decrypt the password in the data base as it is secured as hash, so separately update hash values and decrypt
   var sql_member_update_secured =
      'update members ' +
      'set password = sha2(member.password, 512) ' +
      'where id = member.id';


   // 2. dbPool로부터 connection을 얻고 beginTransaction을 시작. callBack으로 async.waterfall을 이용해 동기 함수 작성.
   // 2-0 memberCheck에서 member.password를 sql_password_check 질의를 통해 db에 저장된 비밀번호와 비교후 reqMember, resMember 객체를 전달
   // 2-1 인자로 받은 member.id를 sql_member_select를 질의 결과 중 resMember 에 없는 값을 저장 후 다음 중첨함수로 전달.
   // 2-2 reqMember 정보를 sql_members_update 질의를 통해 members table 업데이트
   // 2-3 reqMember.id를 sql_photos_select 질의에서 인자로 기존 Photos 정보를 가져옴.
   // 2-4 reqMember.photos배열의 객체가 존재하면 async.each 사용, 중첩함수에서 item.path가 존재하면 db의 photos table 업데이트.
   // 2-4-1 nextCallback에서 중첨함수의 err발생시 updateMembers의 callback에 err 리턴, !err이면 다음 async.waterfall 중첨함수에 (null, member)전달
   // 2-5-1 nextCallback에서 중첨함수의 err발생시 callback(err)을 리턴, !err이면 nextTask(null, member) 실행
   // 2-6 checkUpdated 중첩함수에서 resMember와 reqMember를 비교하여 변경이 되었는지 확인한다.
   // 2-7 waterfall callback 처리.
   // 2-7-1 waterfall callback에 err가 발생시 rollback 후 connection을 release하고 err를 updateMember callback에 전달.
   // 2-7-2 !err이면, commit을 실행하고 commit의 callback에서 err처리
   // 2-7-4 updateMember callback에 (null, resMember)를 전달.


}

