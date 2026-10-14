import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
  env: process.env.NODE_ENV,
  port: process.env.PORT,
  database_url: process.env.DATABASE_URL,
  bycrypt_salt_rounds: process.env.BYCRYPT_SALT_ROUNDS,
  reset_pass_ui_link: process.env.RESET_PASS_UI_LINK,
  change_email_ui_link: process.env.CHANGE_EMAIL_UI_LINK,
  jwt: {
    secret: process.env.JWT_SECRET,
    refresh_secret: process.env.JWT_REFRESH_SECRET,
    expires_in: process.env.JWT_EXPIRES_IN,
    refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN,
  },
  bunny_cdn: {
    access_key: process.env.BUNNY_CDN_ACCESS_KEY as string,
    storage_zone: process.env.BUNNY_CDN_STORAGE_ZONE as string,
    pull_url: process.env.BUNNY_CDN_PULL_URL as string,
  },
  openRouterApiKey: process.env.OPENROUTER_API_KEY as string,
  googleCloudVisionKeyFile: process.env.GOOGLE_CLOUD_VISION_KEY_FILE,
  max_file_size: process.env.MAX_FILE_SIZE as string,
  smtp: {
    host: process.env.SMTP_HOST as string,
    port: process.env.SMTP_PORT as string,
    user: process.env.SMTP_USER as string,
    pass: process.env.SMTP_PASS as string,
    secure: process.env.SMTP_SECURE === "true",
    email_from: process.env.EMAIL_FROM as string,
  },
  google: {
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
  },
  frontend_url: process.env.FRONTEND_URL,
};
