var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var session = require('express-session');   // session을 관리해줌
var passport = require('passport');  // session과 연동됨
var redis = require('redis');
var redisClient = redis.createClient();  // redis에 접근하기 위한 클라이언트
var RedisStore = require('connect-redis')(session);  // session store를 redis와 연결하기 위한 생성자.

var auth = require('./routes/auth');
var members = require('./routes/members');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

// next를 호출하는 미들웨어, 통과하는 애들
// logging의 format을 설정 'dev' tiny, long and etc
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser(process.env.SECRET_KEY));
app.use(session({
   secret: process.env.SECRET_KEY,
   store: new RedisStore({
      host: "127.0.0.1",
      port: 6379,
      client: redisClient
   }),
   resave: true,
   saveUninitialized: false,
   cookie: {
      path: '/',
      httpOnly: true,
      secure: true,
      maxAge: 1000 * 60 * 60 * 24 * 30 }
}));

/*
 app.js는 closure를 반환하는 함수들이 자주 사용됨.
 passport.initialize()가 호출되어 middleware를 반환. 초기화된 framework에 접근할 수 잇는 미들웨어를 반환
 passport.session()가 호출되어 middleware를 반환, express-session이 관리하던 session정보를 passport framework이 관리하도록 만들어주는 미들웨어를 반환.
 */

app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));

//app.use(express.static(path.join(__dirname, 'uploads')))

app.use('/auth', auth);
app.use('/members', members);



// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  //res.render('error');
  res.json({
     error: {
        message: err.message,
        status: err.status || 500,
        stack: err.stack
     }
  });
});

module.exports = app;

