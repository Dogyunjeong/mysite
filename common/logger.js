var winston = require('winston');
var DailyRotateFile = require('winston-daily-rotate-file');
var path = require('path');
var moment = require('moment-timezone');
var timeZone = "Asia/Seoul";

var logger = new winston.Logger({
  transports: [
    new winston.transports.Console({
      level: 'info',
      silent: false,
      colorize: true,
      prettyPrint: true,
      timestamp: false
    }),
    new winston.transports.DailyRotateFile({
      level: 'debug',
      silent: false,
      colorize: false,
      prettyPrint: true,
      timestamp: function() {
        return moment().tz(timeZone).format();
      },
      dirname: path.join(__dirname, '../logs'),
      filename: 'debug_logs_',
      datePattern: 'yyyy-MM-ddTHH.log', // THH 시각 패턴, 매 시간마다 생성. 일자별 'yyyy-MM-dd.log'
      maxsize: 1024 * 1024,  // 1MB 만큼만 찍겠다는 것, 이것을 넘으면 자동으로 시리얼 넘버가 붙음.
      json: false  // log를 json형태로 저장할 수도 있음.
    })
  ],
  exceptionHandlers: [
    new winston.transports.DailyRotateFile({
      level: "debug",
      silent: false,
      colorize: false,
      prettyPrint: true,
      timestamp: function() {
        return moment().tz(timeZone).format();
      },
      dirname: path.join(__dirname, '../logs'),
      filename: 'exception_logs_',
      datePattern: 'yyyy-MM-ddTHH.log',
      maxsize: 1024,
      json: false,
      handleExceptions: true,
      humanReadableUnhandledException: true
    })
  ],
  exitOnError: false
});

module.exports = logger;