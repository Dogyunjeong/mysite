var dbPoolconfig = {
   host: process.env.LOCAL_DB_HOST,
   port: process.env.LOCAL_DB_PORT,
   user: process.env.LOCAL_DB_USER,
   password: process.env.LOCAL_DB_PASSWORD,
   database: process.env.LOCAL_DB_NAME,
   connectionLimit: process.env.LOCAL_DB_CONNCETION_LIMIT,
   debug: process.env.LOCAL_DB_DEBUG
};

module.exports = dbPoolconfig;