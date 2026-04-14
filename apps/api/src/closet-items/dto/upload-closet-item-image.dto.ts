export class UploadClosetItemImageDto {
  imageDataUrl!: string;
  fileExtension?: 'png' | 'jpg' | 'jpeg' | 'webp';
  contentType?: string;
  fileName?: string;
}
