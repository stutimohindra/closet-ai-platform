export class GenerateRecommendationsDto {
  itemImageUrls!: string[];
  count?: number;
  renderImages?: boolean;
  genderPresentation?: string;
  background?: string;
  aspectRatio?: '1:1' | '3:4' | '4:5' | '9:16';
  mood?: string;
  occasion?: string;
  season?: string;
  renderedImages?: Array<{
    imageDataUrl: string;
    fileExtension?: 'png' | 'jpg' | 'jpeg' | 'webp';
    contentType?: string;
  }>;
}
