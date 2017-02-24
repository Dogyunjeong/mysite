var mysql = require('mysql');
var dbPoolConfig = require('../config/aws_rds');

var dbPool = mysql.createPool(dbPoolConfig);

module.exports.dbPool = dbPool;
