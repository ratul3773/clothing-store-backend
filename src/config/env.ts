import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const env = process.env.NODE_ENV ?? "development";
const port = Number(process.env.PORT ?? 5000);
const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
const betterAuthUrl =
  process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`;

const storageDriver = (
  process.env.STORAGE_DRIVER ??
  (env === "production" ? "bunny" : "local")
).toLowerCase();

if (storageDriver !== "local" && storageDriver !== "bunny") {
  throw new Error('STORAGE_DRIVER must be either "local" or "bunny"');
}

if (env === "production" && storageDriver === "local") {
  throw new Error(
    "Production image storage must use Bunny CDN. Set STORAGE_DRIVER=bunny.",
  );
}

const uploadDir = path.resolve(
  process.cwd(),
  process.env.UPLOAD_DIR ?? "uploads",
);

const uploadPublicBaseUrl = (
  process.env.UPLOAD_PUBLIC_BASE_URL ?? `${betterAuthUrl}/uploads`
).replace(/\/+$/, "");

const bunnyPullUrl = (process.env.BUNNY_CDN_PULL_URL ?? "").replace(
  /\/+$/,
  "",
);

const bunnyStorageZone = process.env.BUNNY_CDN_STORAGE_ZONE ?? "";
const bunnyAccessKey = process.env.BUNNY_CDN_ACCESS_KEY ?? "";

if (storageDriver === "bunny") {
  const missing = [
    ["BUNNY_CDN_ACCESS_KEY", bunnyAccessKey],
    ["BUNNY_CDN_STORAGE_ZONE", bunnyStorageZone],
    ["BUNNY_CDN_PULL_URL", bunnyPullUrl],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing required Bunny configuration: ${missing.join(", ")}`,
    );
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is required");
}

const maxImageSizeMb = Number(process.env.MAX_IMAGE_SIZE_MB ?? 5);

if (!Number.isFinite(maxImageSizeMb) || maxImageSizeMb <= 0) {
  throw new Error("MAX_IMAGE_SIZE_MB must be a positive number");
}

const maxImagesPerProduct = Number(process.env.MAX_IMAGES_PER_PRODUCT ?? 8);

if (!Number.isInteger(maxImagesPerProduct) || maxImagesPerProduct < 1) {
  throw new Error("MAX_IMAGES_PER_PRODUCT must be a positive integer");
}

const config = {
  env,
  port,
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
  better_auth: {
    secret: process.env.BETTER_AUTH_SECRET,
    url: betterAuthUrl,
    api_key: process.env.BETTER_AUTH_API_KEY,
  },
  bunny_cdn: {
    access_key: bunnyAccessKey,
    storage_zone: bunnyStorageZone,
    pull_url: bunnyPullUrl,
    storage_endpoint: (
      process.env.BUNNY_STORAGE_ENDPOINT ?? "https://storage.bunnycdn.com"
    ).replace(/\/+$/, ""),
  },
  storage: {
    driver: storageDriver as "local" | "bunny",
    upload_dir: uploadDir,
    public_base_url: uploadPublicBaseUrl,
    max_image_size_bytes: Math.floor(maxImageSizeMb * 1024 * 1024),
    max_images_per_product: maxImagesPerProduct,
  },
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  googleCloudVisionKeyFile: process.env.GOOGLE_CLOUD_VISION_KEY_FILE,
  max_file_size: process.env.MAX_FILE_SIZE,
  smtp: {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    secure: process.env.SMTP_SECURE === "true",
    email_from: process.env.SMTP_FROM ?? process.env.EMAIL_FROM,
  },
  google: {
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
  },
  frontend_url: frontendUrl,
};

export default config;
