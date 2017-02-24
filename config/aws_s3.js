var s3Config = {
   region: process.env.S3_REGION,
   accessKeyId: process.env.S3_ACCESS_KEY_ID,
   secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
};

module.exports = s3Config;