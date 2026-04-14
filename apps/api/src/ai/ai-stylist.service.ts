import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

type ClosetItemInput = {
  id: number;
  name: string;
  category: string | null;
  color: string | null;
  size: string | null;
  brand: string | null;
  imageUrl: string | null;
  occasion: string | null;
  season: string | null;
  styleTags: string[];
  pattern?: string | null;
  material?: string | null;
  fit?: string | null;
  aiDescription?: string | null;
  analysisConfidence?: number | null;
};

type OutfitInput = {
  id: string;
  pieces: {
    top: ClosetItemInput | null;
    bottom: ClosetItemInput | null;
    shoes: ClosetItemInput | null;
    layer: ClosetItemInput | null;
    accessory: ClosetItemInput | null;
  };
  reason: string;
};

type TasteProfile = {
  preferredColors: string[];
  preferredStyleTags: string[];
  preferredOccasions: string[];
  dislikedColors: string[];
  dislikedStyleTags: string[];
  summary: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

@Injectable()
export class AiStylistService {
  private readonly apiKey = process.env.AI_API_KEY ?? '';
  private readonly baseUrl =
    process.env.AI_BASE_URL ?? 'https://openrouter.ai/api/v1';
  private readonly textModel =
    process.env.AI_TEXT_MODEL ?? 'meta-llama/llama-3.3-70b-instruct';
  private readonly visionModel =
    process.env.AI_VISION_MODEL ?? 'meta-llama/llama-3.2-11b-vision-instruct';
  private readonly timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? '180000');
  private readonly maxImageDimension = Number(
    process.env.AI_IMAGE_MAX_DIMENSION ?? '768',
  );

  get isEnabled() {
    return Boolean(this.apiKey);
  }

  async analyzeItemImage(item: ClosetItemInput) {
    if (!this.apiKey || !item.imageUrl) {
      return {
        source: 'rules-only',
        message: item.imageUrl
          ? 'Set AI_API_KEY to enable automatic image analysis.'
          : 'Add an imageUrl before requesting image analysis.',
        metadata: {
          category: item.category,
          color: item.color,
          occasion: item.occasion,
          season: item.season,
          styleTags: item.styleTags ?? [],
          pattern: item.pattern ?? null,
          material: item.material ?? null,
          fit: item.fit ?? null,
          aiDescription: item.aiDescription ?? null,
          analysisConfidence: item.analysisConfidence ?? null,
        },
      };
    }

    try {
      const imageDataUrl = await this.fetchImageAsDataUrl(item.imageUrl);

      const content = await this.createChatCompletion({
        model: this.visionModel,
        messages: [
          {
            role: 'system',
            content:
              'You analyze fashion item images. Return valid JSON only with the shape {"category": string|null, "color": string|null, "occasion": string|null, "season": string|null, "styleTags": string[], "pattern": string|null, "material": string|null, "fit": string|null, "aiDescription": string|null, "analysisConfidence": number}.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this clothing item image. Existing metadata: ${JSON.stringify(
                  {
                    name: item.name,
                    category: item.category,
                    color: item.color,
                    occasion: item.occasion,
                    season: item.season,
                    styleTags: item.styleTags,
                  },
                )}`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl,
                },
              },
            ],
          },
        ],
      });

      const parsed = this.parseJson<{
        category?: string | null;
        color?: string | null;
        occasion?: string | null;
        season?: string | null;
        styleTags?: string[];
        pattern?: string | null;
        material?: string | null;
        fit?: string | null;
        aiDescription?: string | null;
        analysisConfidence?: number;
      }>(content);

      return {
        source: 'llama-provider',
        message: 'Image analyzed successfully.',
        metadata: {
          category: parsed?.category ?? item.category,
          color: parsed?.color ?? item.color,
          occasion: parsed?.occasion ?? item.occasion,
          season: parsed?.season ?? item.season,
          styleTags: this.normalizeStringArray(
            parsed?.styleTags ?? item.styleTags,
          ),
          pattern: parsed?.pattern ?? item.pattern ?? null,
          material: parsed?.material ?? item.material ?? null,
          fit: parsed?.fit ?? item.fit ?? null,
          aiDescription: parsed?.aiDescription ?? item.aiDescription ?? null,
          analysisConfidence: this.normalizeConfidence(
            parsed?.analysisConfidence,
          ),
        },
      };
    } catch (error) {
      console.error('AI image analysis failed:', error);

      return {
        source: 'rules-only',
        message: 'AI image analysis is temporarily unavailable.',
        metadata: {
          category: item.category,
          color: item.color,
          occasion: item.occasion,
          season: item.season,
          styleTags: item.styleTags ?? [],
          pattern: item.pattern ?? null,
          material: item.material ?? null,
          fit: item.fit ?? null,
          aiDescription: item.aiDescription ?? null,
          analysisConfidence: item.analysisConfidence ?? null,
        },
      };
    }
  }

  async generateOutfitEnhancements(
    items: ClosetItemInput[],
    outfits: OutfitInput[],
    tasteProfile: TasteProfile,
  ) {
    if (!this.apiKey) {
      return {
        enabled: false,
        source: 'rules-only',
        message:
          'Set AI_API_KEY to enable AI stylist notes and personalized outfit explanations.',
        outfits: [],
      };
    }

    if (items.length === 0 || outfits.length === 0) {
      return {
        enabled: true,
        source: 'llama-provider',
        message: 'No outfits available to enhance yet.',
        outfits: [],
      };
    }

    try {
      const content = await this.createChatCompletion({
        model: this.textModel,
        messages: [
          {
            role: 'system',
            content:
              'You are a personal fashion stylist. Return valid JSON only with the shape {"summary": string, "outfits": [{"id": string, "stylistNote": string, "whyItWorks": string, "confidence": number}]}. Use the user taste profile when available.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              tasteProfile,
              closetItems: items.map((item) => ({
                id: item.id,
                name: item.name,
                category: item.category,
                color: item.color,
                occasion: item.occasion,
                season: item.season,
                styleTags: item.styleTags,
                pattern: item.pattern,
                material: item.material,
                fit: item.fit,
              })),
              outfits: outfits.map((outfit) => ({
                id: outfit.id,
                pieces: {
                  top: outfit.pieces.top?.name ?? null,
                  bottom: outfit.pieces.bottom?.name ?? null,
                  shoes: outfit.pieces.shoes?.name ?? null,
                  layer: outfit.pieces.layer?.name ?? null,
                  accessory: outfit.pieces.accessory?.name ?? null,
                },
                ruleReason: outfit.reason,
              })),
            }),
          },
        ],
      });

      const parsed = this.parseJson<{
        summary?: string;
        outfits?: Array<{
          id?: string;
          stylistNote?: string;
          whyItWorks?: string;
          confidence?: number;
        }>;
      }>(content);

      return {
        enabled: true,
        source: 'llama-provider',
        message: parsed?.summary ?? 'AI stylist notes generated.',
        outfits:
          parsed?.outfits?.map((outfit) => ({
            id: outfit.id ?? 'unknown',
            stylistNote: outfit.stylistNote ?? 'No stylist note returned.',
            whyItWorks: outfit.whyItWorks ?? 'No explanation returned.',
            confidence: this.normalizeConfidence(outfit.confidence) ?? 0.5,
          })) ?? [],
      };
    } catch (error) {
      console.error('AI outfit enhancement failed:', error);

      return {
        enabled: false,
        source: 'rules-only',
        message:
          'AI styling is temporarily unavailable, so the API returned the rules-based outfit recommendations.',
        outfits: [],
      };
    }
  }

  async generateMissingItemRecommendations(
    items: ClosetItemInput[],
    tasteProfile: TasteProfile,
  ) {
    if (!this.apiKey) {
      return {
        enabled: false,
        source: 'rules-only',
        message:
          'Set AI_API_KEY to enable wardrobe gap and shopping recommendations.',
        gaps: [],
      };
    }

    try {
      const content = await this.createChatCompletion({
        model: this.textModel,
        messages: [
          {
            role: 'system',
            content:
              'You are a wardrobe stylist. Return valid JSON only with the shape {"summary": string, "gaps": [{"item": string, "reason": string, "priority": "low"|"medium"|"high"}]}. Suggest practical missing items to buy based on the closet and taste profile.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              tasteProfile,
              closetItems: items.map((item) => ({
                name: item.name,
                category: item.category,
                color: item.color,
                occasion: item.occasion,
                season: item.season,
                styleTags: item.styleTags,
              })),
            }),
          },
        ],
      });

      const parsed = this.parseJson<{
        summary?: string;
        gaps?: Array<{
          item?: string;
          reason?: string;
          priority?: 'low' | 'medium' | 'high';
        }>;
      }>(content);

      return {
        enabled: true,
        source: 'llama-provider',
        message: parsed?.summary ?? 'AI wardrobe gap analysis generated.',
        gaps:
          parsed?.gaps?.map((gap) => ({
            item: gap.item ?? 'Unknown item',
            reason: gap.reason ?? 'No reason returned.',
            priority: gap.priority ?? 'medium',
          })) ?? [],
      };
    } catch (error) {
      console.error('AI missing item analysis failed:', error);

      return {
        enabled: false,
        source: 'rules-only',
        message:
          'AI gap analysis is temporarily unavailable, so no buy suggestions were returned.',
        gaps: [],
      };
    }
  }

  private async createChatCompletion(payload: {
    model: string;
    messages: Array<Record<string, unknown>>;
  }) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: payload.model,
        messages: payload.messages,
        temperature: 0.3,
        response_format: {
          type: 'json_object',
        },
      }),
    });

    const json = (await response.json()) as ChatCompletionResponse;

    if (!response.ok) {
      throw new Error(
        json.error?.message ??
          `Llama provider request failed with status ${response.status}`,
      );
    }

    const content = json.choices?.[0]?.message?.content;

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => part.text ?? '')
        .join('')
        .trim();
    }

    throw new Error('Llama provider returned an empty response.');
  }

  private async fetchImageAsDataUrl(imageUrl: string) {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to download image for AI analysis. Upstream status: ${response.status}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const resizedImage = await sharp(Buffer.from(arrayBuffer))
      .rotate()
      .resize(this.maxImageDimension, this.maxImageDimension, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
      .toBuffer();
    const base64 = resizedImage.toString('base64');

    return `data:image/jpeg;base64,${base64}`;
  }

  private parseJson<T>(outputText: string | null | undefined) {
    if (!outputText) {
      return null;
    }

    try {
      return JSON.parse(outputText) as T;
    } catch {
      return null;
    }
  }

  private normalizeStringArray(values: string[] | undefined) {
    return (values ?? []).filter(Boolean);
  }

  private normalizeConfidence(value: number | null | undefined) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return null;
    }

    return Math.max(0, Math.min(1, value));
  }
}
