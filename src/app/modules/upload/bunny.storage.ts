import { StorageProvider } from "../../../generated/prisma/enums";
import ApiError from "../../../errors/ApiError";
import { assertSafeStorageKey } from "./local.storage";
import { ImageStorage, UploadImageInput, UploadImageResult } from "./storage.interface";
import httpStatus from "http-status";

const encodeKey = (key: string) =>
  key.split("/").map(encodeURIComponent).join("/");

export class BunnyImageStorage implements ImageStorage {
  readonly provider = StorageProvider.BUNNY;

  constructor(
    private readonly endpoint: string,
    private readonly storageZone: string,
    private readonly accessKey: string,
    private readonly pullUrl: string,
  ) {}

  private objectUrl(key: string) {
    assertSafeStorageKey(key);
    return `${this.endpoint}/${encodeURIComponent(this.storageZone)}/${encodeKey(key)}`;
  }

  async upload(input: UploadImageInput): Promise<UploadImageResult> {
    const response = await fetch(this.objectUrl(input.key), {
      method: "PUT",
      headers: {
        AccessKey: this.accessKey,
        "Content-Type": input.contentType,
      },
      body: new Uint8Array(input.buffer),
    });

    if (!response.ok) {
      throw new ApiError(
        httpStatus.BAD_GATEWAY,
        "Image storage upload failed",
      );
    }

    return { key: input.key, provider: this.provider };
  }

  async delete(key: string): Promise<void> {
    const response = await fetch(this.objectUrl(key), {
      method: "DELETE",
      headers: {
        AccessKey: this.accessKey,
      },
    });

    if (!response.ok && response.status !== 404) {
      throw new ApiError(
        httpStatus.BAD_GATEWAY,
        "Image storage deletion failed",
      );
    }
  }

  publicUrl(key: string): string {
    assertSafeStorageKey(key);
    return `${this.pullUrl}/${encodeKey(key)}`;
  }
}
