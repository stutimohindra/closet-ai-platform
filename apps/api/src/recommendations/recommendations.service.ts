import { Injectable } from '@nestjs/common';
import { AiStylistService } from '../ai/ai-stylist.service';
import { ImageGenerationService } from '../image-generation/image-generation.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { GenerateRecommendationsDto } from './dto/generate-recommendations.dto';
import { RenderOutfitDto } from './dto/render-outfit.dto';

type ClosetItemRecord = {
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
  pattern: string | null;
  material: string | null;
  fit: string | null;
  aiDescription: string | null;
  analysisConfidence: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type OutfitRecommendation = {
  id: string;
  pieces: {
    top: ClosetItemRecord | null;
    bottom: ClosetItemRecord | null;
    shoes: ClosetItemRecord | null;
    layer: ClosetItemRecord | null;
    accessory: ClosetItemRecord | null;
  };
  reason: string;
  personalizationSignals: string[];
};

type TasteProfile = {
  preferredColors: string[];
  preferredStyleTags: string[];
  preferredOccasions: string[];
  dislikedColors: string[];
  dislikedStyleTags: string[];
  summary: string;
};

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiStylistService: AiStylistService,
    private readonly imageGenerationService: ImageGenerationService,
    private readonly storageService: StorageService,
  ) {}

  async getOutfitRecommendations() {
    const items = await this.getClosetItems();
    const tasteProfile = await this.getTasteProfile();
    const recommendationPayload = await this.buildRecommendationsFromItems(
      items,
      tasteProfile,
    );

    return {
      totalItems: items.length,
      generatedAt: new Date().toISOString(),
      tasteProfile,
      outfits: recommendationPayload.outfits,
      ai: recommendationPayload.ai,
      summary: this.buildSummary(items, recommendationPayload.outfits.length),
    };
  }

  async getGeneratedItems() {
    const items = await this.storageService.listObjects({
      prefix: 'generated-outfits/',
      maxKeys: 50,
      target: 'recommendationRenders',
    });

    return {
      items: items.sort((left, right) => {
        if (!left.lastModified && !right.lastModified) {
          return right.key.localeCompare(left.key);
        }

        if (!left.lastModified) {
          return 1;
        }

        if (!right.lastModified) {
          return -1;
        }

        return right.lastModified.localeCompare(left.lastModified);
      }),
    };
  }

  async generateRecommendationsFromImages(
    generateRecommendationsDto: GenerateRecommendationsDto,
  ) {
    const tasteProfile = await this.getTasteProfile();
    const analyzedItems: ClosetItemRecord[] = [];

    for (const [
      index,
      itemImageUrl,
    ] of generateRecommendationsDto.itemImageUrls.entries()) {
      const inferredMetadata = this.inferMetadataFromImageUrl(itemImageUrl);
      const placeholderItem: ClosetItemRecord = {
        id: index + 1,
        name: inferredMetadata.name ?? this.getItemNameFromUrl(itemImageUrl),
        category: inferredMetadata.category,
        color: inferredMetadata.color,
        size: null,
        brand: null,
        imageUrl: itemImageUrl,
        occasion: generateRecommendationsDto.occasion ?? null,
        season: generateRecommendationsDto.season ?? null,
        styleTags: inferredMetadata.styleTags,
        pattern: inferredMetadata.pattern,
        material: inferredMetadata.material,
        fit: inferredMetadata.fit,
        aiDescription: null,
        analysisConfidence: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const shouldSkipAiAnalysis =
        placeholderItem.category !== null && placeholderItem.color !== null;
      const analysis = shouldSkipAiAnalysis
        ? {
            metadata: {
              category: placeholderItem.category,
              color: placeholderItem.color,
              occasion: placeholderItem.occasion,
              season: placeholderItem.season,
              styleTags: placeholderItem.styleTags,
              pattern: placeholderItem.pattern,
              material: placeholderItem.material,
              fit: placeholderItem.fit,
              aiDescription: null,
              analysisConfidence: 0.35,
            },
          }
        : await this.aiStylistService.analyzeItemImage(placeholderItem);

      analyzedItems.push({
        ...placeholderItem,
        ...analysis.metadata,
      });
    }

    const recommendationPayload = await this.buildRecommendationsFromItems(
      analyzedItems,
      tasteProfile,
      generateRecommendationsDto.count,
    );

    const renderRequests = generateRecommendationsDto.renderImages
      ? recommendationPayload.outfits.map((outfit) =>
          this.buildRenderPayload(
            outfit,
            recommendationPayload.ai.outfits.find(
              (candidate) => candidate.id === outfit.id,
            ),
            {
              aspectRatio: generateRecommendationsDto.aspectRatio,
              background: generateRecommendationsDto.background,
              genderPresentation: generateRecommendationsDto.genderPresentation,
              mood: generateRecommendationsDto.mood,
            },
          ),
        )
      : [];

    const uploadedRenders =
      generateRecommendationsDto.renderedImages &&
      generateRecommendationsDto.renderedImages.length > 0
        ? await Promise.all(
            generateRecommendationsDto.renderedImages
              .slice(0, recommendationPayload.outfits.length)
              .map(async (renderedImage, index) => {
                const outfit = recommendationPayload.outfits[index];

                if (!outfit) {
                  return null;
                }

                const extension = renderedImage.fileExtension ?? 'png';
                const key = `generated-outfits/${outfit.id}-${Date.now()}-${index}.${extension}`;
                const upload = await this.storageService.uploadBase64Image({
                  key,
                  dataUrl: renderedImage.imageDataUrl,
                  contentType: renderedImage.contentType,
                  target: 'recommendationRenders',
                });

                return {
                  outfitId: outfit.id,
                  upload,
                };
              }),
          )
        : [];

    const generatedUploads =
      generateRecommendationsDto.renderImages &&
      generateRecommendationsDto.renderedImages?.length !==
        recommendationPayload.outfits.length &&
      this.imageGenerationService.isEnabled
        ? await Promise.all(
            renderRequests.map(async (renderRequest, index) => {
              try {
                const outfit = recommendationPayload.outfits[index];

                if (!outfit) {
                  return null;
                }

                const generatedImage =
                  await this.imageGenerationService.generateImage({
                    prompt: renderRequest.prompt,
                    aspectRatio: renderRequest.aspectRatio,
                    referenceImageUrls:
                      this.getOutfitReferenceImageUrls(outfit),
                  });

                const upload = await this.storageService.uploadBase64Image({
                  key: renderRequest.generatedImageKey,
                  dataUrl: generatedImage.dataUrl,
                  contentType: generatedImage.contentType,
                  target: 'recommendationRenders',
                });

                return {
                  outfitId: outfit.id,
                  generation: {
                    promptId: generatedImage.promptId,
                  },
                  upload,
                };
              } catch (error) {
                console.error(
                  `Generated render failed for ${renderRequest.generatedImageKey}:`,
                  error,
                );
                return null;
              }
            }),
          )
        : [];

    const recommendations = [
      ...uploadedRenders.filter(Boolean).map((render) => {
        const outfit = recommendationPayload.outfits.find(
          (candidate) => candidate.id === render?.outfitId,
        );
        const aiOutfit = recommendationPayload.ai.outfits.find(
          (candidate) => candidate.id === render?.outfitId,
        );

        if (!render || !outfit) {
          return null;
        }

        return {
          url: render.upload.url,
          preview: this.buildPreview(outfit, aiOutfit),
        };
      }),
      ...generatedUploads.filter(Boolean).map((render) => {
        const outfit = recommendationPayload.outfits.find(
          (candidate) => candidate.id === render?.outfitId,
        );
        const aiOutfit = recommendationPayload.ai.outfits.find(
          (candidate) => candidate.id === render?.outfitId,
        );

        if (!render || !outfit) {
          return null;
        }

        return {
          url: render.upload.url,
          preview: this.buildPreview(outfit, aiOutfit),
        };
      }),
    ].filter(Boolean);

    return {
      recommendations,
    };
  }

  async getMissingItemRecommendations() {
    const items = await this.getClosetItems();
    const tasteProfile = await this.getTasteProfile();
    const ai = await this.aiStylistService.generateMissingItemRecommendations(
      items,
      tasteProfile,
    );

    return {
      totalItems: items.length,
      generatedAt: new Date().toISOString(),
      tasteProfile,
      ai,
    };
  }

  async createFeedback(createFeedbackDto: CreateFeedbackDto) {
    const feedback = await this.prisma.recommendationFeedback.create({
      data: {
        outfitId: createFeedbackDto.outfitId,
        signal: createFeedbackDto.signal,
        notes: createFeedbackDto.notes,
        itemIds: createFeedbackDto.itemIds ?? [],
      },
    });

    return {
      message: 'Feedback saved.',
      feedback,
      tasteProfile: await this.getTasteProfile(),
    };
  }

  async getTasteProfile(): Promise<TasteProfile> {
    const feedbacks = await this.prisma.recommendationFeedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    if (feedbacks.length === 0) {
      return {
        preferredColors: [],
        preferredStyleTags: [],
        preferredOccasions: [],
        dislikedColors: [],
        dislikedStyleTags: [],
        summary:
          'No preference history yet. Recommendations are based on closet metadata only.',
      };
    }

    const likedItemIds = feedbacks
      .filter(
        (feedback) => feedback.signal === 'like' || feedback.signal === 'save',
      )
      .flatMap((feedback) => feedback.itemIds);
    const dislikedItemIds = feedbacks
      .filter((feedback) => feedback.signal === 'dislike')
      .flatMap((feedback) => feedback.itemIds);
    const allItemIds = [...new Set([...likedItemIds, ...dislikedItemIds])];

    const items = allItemIds.length
      ? ((await this.prisma.closetItem.findMany({
          where: { id: { in: allItemIds } },
        })) as ClosetItemRecord[])
      : [];

    const likedItems = items.filter((item) => likedItemIds.includes(item.id));
    const dislikedItems = items.filter((item) =>
      dislikedItemIds.includes(item.id),
    );

    const preferredColors = this.getTopValues(
      likedItems.map((item) => item.color).filter(this.isString),
    );
    const preferredStyleTags = this.getTopValues(
      likedItems.flatMap((item) => item.styleTags),
    );
    const preferredOccasions = this.getTopValues(
      likedItems.map((item) => item.occasion).filter(this.isString),
    );
    const dislikedColors = this.getTopValues(
      dislikedItems.map((item) => item.color).filter(this.isString),
    );
    const dislikedStyleTags = this.getTopValues(
      dislikedItems.flatMap((item) => item.styleTags),
    );

    const summaryParts = [
      preferredColors.length > 0
        ? `leans toward ${preferredColors.join(', ')} colors`
        : null,
      preferredStyleTags.length > 0
        ? `prefers ${preferredStyleTags.join(', ')} style tags`
        : null,
      preferredOccasions.length > 0
        ? `responds well to ${preferredOccasions.join(', ')} outfits`
        : null,
    ].filter(Boolean);

    return {
      preferredColors,
      preferredStyleTags,
      preferredOccasions,
      dislikedColors,
      dislikedStyleTags,
      summary:
        summaryParts.join('; ') ||
        'Preference history exists, but there is not enough signal yet for a strong profile.',
    };
  }

  async renderOutfit(outfitId: string, renderOutfitDto: RenderOutfitDto) {
    const recommendationPayload = await this.getOutfitRecommendations();
    const outfit = recommendationPayload.outfits.find(
      (candidate) => candidate.id === outfitId,
    );
    const aiOutfit = recommendationPayload.ai.outfits.find(
      (candidate) => candidate.id === outfitId,
    );

    if (!outfit) {
      return {
        message: `Outfit ${outfitId} was not found.`,
      };
    }

    const renderPayload = this.buildRenderPayload(
      outfit,
      aiOutfit,
      renderOutfitDto,
    );

    if (renderOutfitDto.imageDataUrl) {
      const extension = renderOutfitDto.fileExtension ?? 'png';
      const uploadKey = `generated-outfits/${outfitId}-${Date.now()}.${extension}`;
      const uploadResult = await this.storageService.uploadBase64Image({
        key: uploadKey,
        dataUrl: renderOutfitDto.imageDataUrl,
        contentType: renderOutfitDto.contentType,
        target: 'recommendationRenders',
      });

      return {
        url: uploadResult.url,
        preview: this.buildPreview(outfit, aiOutfit),
      };
    }

    if (this.imageGenerationService.isEnabled) {
      const generatedImage = await this.imageGenerationService.generateImage({
        prompt: renderPayload.prompt,
        aspectRatio: renderPayload.aspectRatio,
        referenceImageUrls: this.getOutfitReferenceImageUrls(outfit),
      });
      const uploadResult = await this.storageService.uploadBase64Image({
        key: renderPayload.generatedImageKey,
        dataUrl: generatedImage.dataUrl,
        contentType: generatedImage.contentType,
        target: 'recommendationRenders',
      });

      return {
        url: uploadResult.url,
        preview: this.buildPreview(outfit, aiOutfit),
      };
    }

    return {
      url: `${
        process.env.S3_RECOMMENDATION_PUBLIC_BASE_URL ??
        `https://${
          process.env.S3_RECOMMENDATION_BUCKET ??
          'replace-me-recommendation-renders-bucket'
        }.s3.${process.env.S3_REGION ?? 'us-east-1'}.amazonaws.com`
      }/${renderPayload.generatedImageKey}`,
      preview: this.buildPreview(outfit, aiOutfit),
    };
  }

  private getOutfitReferenceImageUrls(outfit: OutfitRecommendation) {
    return [
      outfit.pieces.top?.imageUrl,
      outfit.pieces.bottom?.imageUrl,
      outfit.pieces.shoes?.imageUrl,
      outfit.pieces.layer?.imageUrl,
      outfit.pieces.accessory?.imageUrl,
    ].filter(this.isString);
  }

  private inferMetadataFromImageUrl(imageUrl: string) {
    const fileName = imageUrl
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    const normalized = (fileName ?? '').toLowerCase();
    const tokens = normalized.split(/\s+/).filter(Boolean);

    return {
      name: fileName ? this.toTitleCase(fileName) : null,
      category: this.inferCategory(tokens),
      color: this.inferColor(tokens),
      styleTags: this.inferStyleTags(tokens),
      pattern: tokens.includes('striped')
        ? 'Striped'
        : tokens.includes('floral')
          ? 'Floral'
          : tokens.includes('checked') || tokens.includes('plaid')
            ? 'Plaid'
            : tokens.includes('solid')
              ? 'Solid'
              : null,
      material: tokens.includes('denim')
        ? 'Denim'
        : tokens.includes('linen')
          ? 'Linen'
          : tokens.includes('cotton')
            ? 'Cotton'
            : tokens.includes('leather')
              ? 'Leather'
              : null,
      fit: tokens.includes('oversized')
        ? 'Oversized'
        : tokens.includes('relaxed')
          ? 'Relaxed'
          : tokens.includes('slim')
            ? 'Slim'
            : tokens.includes('regular')
              ? 'Regular'
              : null,
    };
  }

  private inferCategory(tokens: string[]) {
    const categoryMap: Array<{ keywords: string[]; category: string }> = [
      {
        keywords: ['tee', 'tshirt', 'shirt', 'blouse', 'top', 'sweater'],
        category: 'Top',
      },
      {
        keywords: [
          'jeans',
          'jean',
          'pants',
          'pant',
          'trousers',
          'skirt',
          'shorts',
        ],
        category: 'Bottom',
      },
      {
        keywords: [
          'shoe',
          'shoes',
          'sneakers',
          'sneaker',
          'boots',
          'boot',
          'heels',
          'loafer',
          'sandals',
        ],
        category: 'Shoes',
      },
      {
        keywords: [
          'earrings',
          'earring',
          'necklace',
          'bracelet',
          'ring',
          'bag',
          'belt',
        ],
        category: 'Accessory',
      },
      { keywords: ['jacket', 'coat', 'blazer', 'cardigan'], category: 'Layer' },
      { keywords: ['dress'], category: 'Dress' },
    ];

    for (const entry of categoryMap) {
      if (entry.keywords.some((keyword) => tokens.includes(keyword))) {
        return entry.category;
      }
    }

    return null;
  }

  private inferColor(tokens: string[]) {
    const colors = [
      'black',
      'white',
      'blue',
      'navy',
      'red',
      'green',
      'yellow',
      'gold',
      'golden',
      'silver',
      'brown',
      'beige',
      'cream',
      'pink',
      'purple',
      'orange',
      'gray',
      'grey',
    ];
    const match = colors.find((color) => tokens.includes(color));

    if (!match) {
      return null;
    }

    if (match === 'golden') {
      return 'Gold';
    }

    if (match === 'grey') {
      return 'Gray';
    }

    return this.toTitleCase(match);
  }

  private inferStyleTags(tokens: string[]) {
    const tags = new Set<string>();

    if (tokens.includes('black') || tokens.includes('white')) {
      tags.add('minimal');
    }

    if (
      tokens.some((token) =>
        ['jeans', 'tee', 'shirt', 'sneakers', 'shoe', 'shoes'].includes(token),
      )
    ) {
      tags.add('casual');
    }

    if (
      tokens.some((token) =>
        ['earrings', 'necklace', 'bracelet', 'ring'].includes(token),
      )
    ) {
      tags.add('elevated');
    }

    return [...tags];
  }

  private toTitleCase(value: string) {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private buildPreview(
    outfit: OutfitRecommendation,
    aiOutfit?: { stylistNote?: string | null } | null,
  ) {
    return {
      pieces: {
        top: outfit.pieces.top?.name ?? null,
        bottom: outfit.pieces.bottom?.name ?? null,
        shoes: outfit.pieces.shoes?.name ?? null,
        layer: outfit.pieces.layer?.name ?? null,
        accessory: outfit.pieces.accessory?.name ?? null,
      },
      reason: outfit.reason,
      stylistNote: aiOutfit?.stylistNote ?? null,
    };
  }

  private async buildRecommendationsFromItems(
    items: ClosetItemRecord[],
    tasteProfile: TasteProfile,
    requestedCount?: number,
  ) {
    const tops = items.filter((item) =>
      this.matchesCategory(item.category, [
        'top',
        'shirt',
        'tee',
        'blouse',
        'sweater',
        'hoodie',
        'dress',
      ]),
    );
    const bottoms = items.filter((item) =>
      this.matchesCategory(item.category, [
        'bottom',
        'pant',
        'jean',
        'trouser',
        'short',
        'skirt',
      ]),
    );
    const shoes = items.filter((item) =>
      this.matchesCategory(item.category, [
        'shoe',
        'sneaker',
        'boot',
        'loafer',
        'heel',
        'sandal',
      ]),
    );
    const layers = items.filter((item) =>
      this.matchesCategory(item.category, [
        'layer',
        'jacket',
        'coat',
        'blazer',
        'cardigan',
      ]),
    );
    const accessories = items.filter((item) =>
      this.matchesCategory(item.category, [
        'accessory',
        'bag',
        'belt',
        'hat',
        'scarf',
        'jewelry',
      ]),
    );

    const outfitCount = Math.min(
      requestedCount ??
        Math.max(tops.length, 1) *
          Math.max(bottoms.length, 1) *
          Math.max(Math.min(shoes.length, 1), 1),
      5,
    );

    const outfits: OutfitRecommendation[] = [];

    for (let index = 0; index < outfitCount; index += 1) {
      const top = tops[index % tops.length] ?? null;
      const bottom = this.pickBestMatch(top, bottoms, index, tasteProfile);
      const shoesMatch = this.pickBestMatch(
        top ?? bottom,
        shoes,
        index,
        tasteProfile,
      );
      const layer = this.pickBestMatch(
        top ?? bottom,
        layers,
        index,
        tasteProfile,
      );
      const accessory = this.pickBestMatch(
        top ?? bottom,
        accessories,
        index,
        tasteProfile,
      );

      if (!top && !bottom && !shoesMatch) {
        break;
      }

      const personalizationSignals = this.getPersonalizationSignals(
        [top, bottom, shoesMatch, layer, accessory],
        tasteProfile,
      );

      outfits.push({
        id: `outfit-${index + 1}`,
        pieces: {
          top,
          bottom,
          shoes: shoesMatch,
          layer,
          accessory,
        },
        reason: this.buildReason({
          top,
          bottom,
          shoe: shoesMatch,
          layer,
          accessory,
        }),
        personalizationSignals,
      });
    }

    const ai = await this.aiStylistService.generateOutfitEnhancements(
      items,
      outfits,
      tasteProfile,
    );

    return {
      outfits,
      ai,
    };
  }

  private buildRenderPayload(
    outfit: OutfitRecommendation,
    aiOutfit:
      | {
          id: string;
          stylistNote: string;
          whyItWorks: string;
          confidence: number;
        }
      | undefined,
    renderOutfitDto: Pick<
      RenderOutfitDto,
      'aspectRatio' | 'background' | 'genderPresentation' | 'mood'
    >,
  ) {
    const aspectRatio = renderOutfitDto.aspectRatio ?? '4:5';
    const background = renderOutfitDto.background ?? 'clean editorial studio';
    const genderPresentation =
      renderOutfitDto.genderPresentation ?? 'neutral fashion mannequin';
    const mood = renderOutfitDto.mood ?? 'polished, wearable, modern';
    const generatedImageKey = `generated-outfits/${outfit.id}-${Date.now()}.png`;
    const garmentSummary = [
      outfit.pieces.top?.name ? `top ${outfit.pieces.top.name}` : null,
      outfit.pieces.bottom?.name ? `bottom ${outfit.pieces.bottom.name}` : null,
      outfit.pieces.shoes?.name ? `shoes ${outfit.pieces.shoes.name}` : null,
      outfit.pieces.layer?.name ? `layer ${outfit.pieces.layer.name}` : null,
      outfit.pieces.accessory?.name
        ? `accessory ${outfit.pieces.accessory.name}`
        : null,
    ]
      .filter(Boolean)
      .join(', ');
    const styleHint =
      aiOutfit?.stylistNote ??
      aiOutfit?.whyItWorks ??
      outfit.reason ??
      'clean modern styling';

    const prompt = [
      'Photorealistic fashion editorial outfit image.',
      `${genderPresentation}.`,
      `${mood}.`,
      `${background}.`,
      garmentSummary ? `${garmentSummary}.` : null,
      `Style direction: ${this.compactPromptText(styleHint)}.`,
      'Full body, accurate clothing textures, wardrobe app recommendation card.',
    ]
      .filter(Boolean)
      .join(' ');

    return {
      aspectRatio,
      generatedImageKey,
      prompt,
    };
  }

  private compactPromptText(value: string) {
    return value
      .replace(/\s+/g, ' ')
      .replace(/[.]{2,}/g, '.')
      .trim()
      .split(/[.!?]/)[0]
      .slice(0, 120);
  }

  private getItemNameFromUrl(itemImageUrl: string) {
    const fileName = itemImageUrl.split('/').pop() ?? 'closet-item';
    const normalizedName =
      fileName.split('?')[0]?.split('.')[0] ?? 'closet-item';

    return normalizedName
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private async getClosetItems() {
    return (await this.prisma.closetItem.findMany({
      orderBy: { id: 'asc' },
    })) as ClosetItemRecord[];
  }

  private matchesCategory(category: string | null, keywords: string[]) {
    if (!category) {
      return false;
    }

    const normalizedCategory = category.toLowerCase();
    return keywords.some((keyword) => normalizedCategory.includes(keyword));
  }

  private pickBestMatch(
    anchor: ClosetItemRecord | null,
    candidates: ClosetItemRecord[],
    fallbackIndex: number,
    tasteProfile: TasteProfile,
  ) {
    if (candidates.length === 0) {
      return null;
    }

    if (!anchor) {
      return candidates[fallbackIndex % candidates.length] ?? null;
    }

    const rankedCandidates = [...candidates].sort(
      (left, right) =>
        this.getCompatibilityScore(anchor, right, tasteProfile) -
        this.getCompatibilityScore(anchor, left, tasteProfile),
    );

    return rankedCandidates[0] ?? null;
  }

  private getCompatibilityScore(
    anchor: ClosetItemRecord,
    candidate: ClosetItemRecord,
    tasteProfile: TasteProfile,
  ) {
    let score = 0;

    if (
      anchor.occasion &&
      candidate.occasion &&
      anchor.occasion.toLowerCase() === candidate.occasion.toLowerCase()
    ) {
      score += 3;
    }

    if (
      anchor.season &&
      candidate.season &&
      anchor.season.toLowerCase() === candidate.season.toLowerCase()
    ) {
      score += 2;
    }

    const sharedStyleTags = anchor.styleTags.filter((styleTag) =>
      candidate.styleTags.some(
        (candidateStyleTag) =>
          candidateStyleTag.toLowerCase() === styleTag.toLowerCase(),
      ),
    );
    score += sharedStyleTags.length * 2;

    if (
      anchor.color &&
      candidate.color &&
      anchor.color.toLowerCase() === candidate.color.toLowerCase()
    ) {
      score += 1;
    }

    if (
      candidate.color &&
      tasteProfile.preferredColors.includes(candidate.color.toLowerCase())
    ) {
      score += 2;
    }

    if (
      candidate.color &&
      tasteProfile.dislikedColors.includes(candidate.color.toLowerCase())
    ) {
      score -= 2;
    }

    const preferredTagMatches = candidate.styleTags.filter((styleTag) =>
      tasteProfile.preferredStyleTags.includes(styleTag.toLowerCase()),
    );
    score += preferredTagMatches.length * 2;

    const dislikedTagMatches = candidate.styleTags.filter((styleTag) =>
      tasteProfile.dislikedStyleTags.includes(styleTag.toLowerCase()),
    );
    score -= dislikedTagMatches.length * 2;

    if (
      candidate.occasion &&
      tasteProfile.preferredOccasions.includes(candidate.occasion.toLowerCase())
    ) {
      score += 2;
    }

    return score;
  }

  private getPersonalizationSignals(
    pieces: Array<ClosetItemRecord | null>,
    tasteProfile: TasteProfile,
  ) {
    const normalizedPieces = pieces.filter(
      (piece): piece is ClosetItemRecord => piece !== null,
    );

    const signals = new Set<string>();

    for (const piece of normalizedPieces) {
      if (
        piece.color &&
        tasteProfile.preferredColors.includes(piece.color.toLowerCase())
      ) {
        signals.add(`matches preferred color ${piece.color.toLowerCase()}`);
      }

      for (const styleTag of piece.styleTags) {
        if (tasteProfile.preferredStyleTags.includes(styleTag.toLowerCase())) {
          signals.add(`leans into preferred style ${styleTag.toLowerCase()}`);
        }
      }

      if (
        piece.occasion &&
        tasteProfile.preferredOccasions.includes(piece.occasion.toLowerCase())
      ) {
        signals.add(`fits preferred occasion ${piece.occasion.toLowerCase()}`);
      }
    }

    return [...signals];
  }

  private buildReason({
    top,
    bottom,
    shoe,
    layer,
    accessory,
  }: {
    top: ClosetItemRecord | null;
    bottom: ClosetItemRecord | null;
    shoe: ClosetItemRecord | null;
    layer: ClosetItemRecord | null;
    accessory: ClosetItemRecord | null;
  }) {
    const parts = [
      top ? `${top.name} anchors the outfit` : null,
      bottom ? `${bottom.name} pairs well as the base` : null,
      shoe ? `${shoe.name} finishes the look` : null,
      layer ? `${layer.name} adds a layer option` : null,
      accessory ? `${accessory.name} gives it a styled touch` : null,
      this.describeSharedSignals(top, bottom, shoe, layer, accessory),
    ].filter(Boolean);

    return parts.join('. ');
  }

  private describeSharedSignals(
    top: ClosetItemRecord | null,
    bottom: ClosetItemRecord | null,
    shoe: ClosetItemRecord | null,
    layer: ClosetItemRecord | null,
    accessory: ClosetItemRecord | null,
  ) {
    const pieces = [top, bottom, shoe, layer, accessory].filter(
      (piece): piece is ClosetItemRecord => piece !== null,
    );

    const sharedOccasion = this.getSharedValue(
      pieces.map((piece) => piece.occasion),
    );
    const sharedSeason = this.getSharedValue(
      pieces.map((piece) => piece.season),
    );
    const sharedStyleTag = this.getSharedStyleTag(pieces);

    const signals = [
      sharedOccasion ? `built around a ${sharedOccasion} occasion` : null,
      sharedSeason ? `works well for ${sharedSeason}` : null,
      sharedStyleTag ? `leans into a ${sharedStyleTag} style` : null,
    ].filter(Boolean);

    return signals.length > 0 ? signals.join(', ') : null;
  }

  private getSharedValue(values: Array<string | null>) {
    const normalizedValues = values
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    if (normalizedValues.length < 2) {
      return null;
    }

    const firstValue = normalizedValues[0];

    return normalizedValues.every((value) => value === firstValue)
      ? firstValue
      : null;
  }

  private getSharedStyleTag(pieces: ClosetItemRecord[]) {
    if (pieces.length < 2) {
      return null;
    }

    const [firstPiece, ...rest] = pieces;
    const normalizedTags = firstPiece.styleTags.map((styleTag) =>
      styleTag.toLowerCase(),
    );

    return (
      normalizedTags.find((styleTag) =>
        rest.every((piece) =>
          piece.styleTags.some(
            (candidateStyleTag) => candidateStyleTag.toLowerCase() === styleTag,
          ),
        ),
      ) ?? null
    );
  }

  private buildSummary(items: ClosetItemRecord[], outfitCount: number) {
    if (items.length === 0) {
      return 'Add closet items to start generating outfits.';
    }

    if (outfitCount === 0) {
      return 'Not enough categorized items yet to form recommendations.';
    }

    return `Generated ${outfitCount} outfit recommendations from ${items.length} closet items.`;
  }

  private getTopValues(values: string[]) {
    const counts = new Map<string, number>();

    for (const value of values.map((value) => value.toLowerCase())) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([value]) => value);
  }

  private readonly isString = (value: string | null): value is string =>
    Boolean(value);
}
