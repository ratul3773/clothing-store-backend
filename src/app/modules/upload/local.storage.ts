import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { StorageProvider } from "../../../generated/prisma/enums";
import { ImageStorage, UploadImageInput, UploadImageResult } from "./storage.interface";

export const assertSafeStorageKey = (key: string) => {
  if (
    !key ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.split("/").some((part) => part === ".." || part === "." || !part)
  ) {
    throw new Error("Invalid storage key");
  }
};

export const buildStorageKey = (prefix: string, extension: string) =>
  `${prefix}/${randomUUID()}.${extension}`;

export class LocalImageStorage implements ImageStorage {
  readonly provider = StorageProvider.LOCAL;

  constructor(
    private readonly uploadDir: string,
    private readonly publicBaseUrl: string,
  ) {}

  private resolvePath(key: string) {
    assertSafeStorageKey(key);
    const resolved = path.resolve(this.uploadDir, key);
    const base = path.resolve(this.uploadDir);

    if (
      resolved !== base &&
      !resolved.startsWith(`${base}${path.sep}`)
    ) {
      throw new Error("Invalid storage key");
    }

    return resolved;
  }

  async upload(input: UploadImageInput): Promise<UploadImageResult> {
    const destination = this.resolvePath(input.key);
    const directory = path.dirname(destination);
    const temporary = `${destination}.${randomUUID()}.tmp`;

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(temporary, input.buffer, { flag: "wx" });
    await fs.rename(temporary, destination);

    return { key: input.key, provider: this.provider };
  }

  async delete(key: string): Promise<void> {
    const destination = this.resolvePath(key);

    try {
      await fs.unlink(destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  publicUrl(key: string): string {
    assertSafeStorageKey(key);
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    return `${this.publicBaseUrl}/${encoded}`;
  }
} 
