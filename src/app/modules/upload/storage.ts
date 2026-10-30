import config from "../../../config/env";
import { StorageProvider } from "../../../generated/prisma/enums";
import { BunnyImageStorage } from "./bunny.storage";
import { LocalImageStorage } from "./local.storage";
import { ImageStorage } from "./storage.interface";

const local = new LocalImageStorage(
  config.storage.upload_dir,
  config.storage.public_base_url,
);

const bunny = new BunnyImageStorage(
  config.bunny_cdn.storage_endpoint,
  config.bunny_cdn.storage_zone,
  config.bunny_cdn.access_key,
  config.bunny_cdn.pull_url,
);

export const activeImageStorage: ImageStorage =
  config.storage.driver === "bunny" ? bunny : local;

export const storageForProvider = (
  provider: StorageProvider,
): ImageStorage => (provider === StorageProvider.BUNNY ? bunny : local);

export const publicUrlFor = (provider: StorageProvider, key: string) =>
  storageForProvider(provider).publicUrl(key);
