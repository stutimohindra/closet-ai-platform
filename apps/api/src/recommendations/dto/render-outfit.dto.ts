export class RenderOutfitDto {
  genderPresentation?: string;
  background?: string;
  aspectRatio?: '1:1' | '3:4' | '4:5' | '9:16';
  mood?: string;
  imageDataUrl?: string;
  fileExtension?: 'png' | 'jpg' | 'jpeg' | 'webp';
  contentType?: string;
}
