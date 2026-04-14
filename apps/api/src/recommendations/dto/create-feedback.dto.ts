export class CreateFeedbackDto {
  outfitId!: string;
  signal!: 'like' | 'dislike' | 'save';
  notes?: string;
  itemIds?: number[];
}
