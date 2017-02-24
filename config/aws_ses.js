/**
 * Created by T on 2017-02-01.
 */
var  sesConfig = {
   accessKyeId: process.env.SES_ACCESS_KEY_ID,
   secretAccessKey: process.env.SES_SECRET_ACCESS_KEY,
   region: process.env.SES_REGION
};

module.exports = sesConfig;

