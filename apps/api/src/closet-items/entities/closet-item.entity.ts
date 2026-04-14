export class ClosetItem {
  id!: number;
  name!: string;
  category?: string;
  color?: string;
  size?: string;
  brand?: string;
  imageUrl?: string;
  occasion?: string;
  season?: string;
  styleTags?: string[];
  pattern?: string;
  material?: string;
  fit?: string;
  aiDescription?: string;
  analysisConfidence?: number;
  createdAt!: Date;
  updatedAt!: Date;
}
