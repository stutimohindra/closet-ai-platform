export type ClothingCategory =
  | "top"
  | "bottom"
  | "shoes"
  | "outerwear"
  | "accessory";

export interface ClothingItem {
  id: string;
  name: string;
  category: ClothingCategory;
  color: string;
  style: string;
  season: string[];
}
