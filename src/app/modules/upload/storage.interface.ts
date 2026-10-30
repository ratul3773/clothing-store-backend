import { StorageProvider } from "../../../generated/prisma/enums";

export type UploadImageInput = {
  key: string;
  buffer: Buffer;
  contentType: string;
};

export type UploadImageResult = {
  key: string;
  provider: StorageProvider;
};

export interface ImageStorage {
  readonly provider: StorageProvider;
  upload(input: UploadImageInput): Promise<UploadImageResult>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}
