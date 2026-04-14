import { Injectable, NotFoundException } from '@nestjs/common';
import { AiStylistService } from '../ai/ai-stylist.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateClosetItemDto } from './dto/create-closet-item.dto';
import { UploadClosetItemImageDto } from './dto/upload-closet-item-image.dto';
import { UpdateClosetItemDto } from './dto/update-closet-item.dto';

@Injectable()
export class ClosetItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiStylistService: AiStylistService,
    private readonly storageService: StorageService,
  ) {}

  create(createClosetItemDto: CreateClosetItemDto) {
    return this.prisma.closetItem.create({
      data: {
        name: createClosetItemDto.name,
        ...this.normalizeClosetItemInput(createClosetItemDto),
        styleTags: createClosetItemDto.styleTags ?? [],
      },
    });
  }

  findAll() {
    return this.prisma.closetItem.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async uploadImage(uploadClosetItemImageDto: UploadClosetItemImageDto) {
    const extension = uploadClosetItemImageDto.fileExtension ?? 'png';
    const normalizedFileName =
      uploadClosetItemImageDto.fileName
        ?.toLowerCase()
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) ?? 'closet-item';
    const key = `closet-items/${normalizedFileName}-${Date.now()}.${extension}`;
    const upload = await this.storageService.uploadBase64Image({
      key,
      dataUrl: uploadClosetItemImageDto.imageDataUrl,
      contentType: uploadClosetItemImageDto.contentType,
      target: 'userUploads',
    });

    return {
      message: 'Image uploaded successfully.',
      upload,
    };
  }

  async findOne(id: number) {
    const closetItem = await this.prisma.closetItem.findUnique({
      where: { id },
    });

    if (!closetItem) {
      throw new NotFoundException(`Closet item with ID ${id} not found`);
    }

    return closetItem;
  }

  async update(id: number, updateClosetItemDto: UpdateClosetItemDto) {
    await this.findOne(id);

    return this.prisma.closetItem.update({
      where: { id },
      data: this.normalizeClosetItemInput(updateClosetItemDto),
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.closetItem.delete({
      where: { id },
    });
  }

  async analyzeImage(id: number) {
    const closetItem = (await this.findOne(id)) as never;
    const analysis = await this.aiStylistService.analyzeItemImage(closetItem);

    const updatedItem = await this.prisma.closetItem.update({
      where: { id },
      data: this.normalizeClosetItemInput(analysis.metadata),
    });

    return {
      ...analysis,
      item: updatedItem,
    };
  }

  private normalizeClosetItemInput(input: {
    category?: string | null;
    color?: string | null;
    size?: string | null;
    brand?: string | null;
    imageUrl?: string | null;
    occasion?: string | null;
    season?: string | null;
    styleTags?: string[];
    pattern?: string | null;
    material?: string | null;
    fit?: string | null;
    aiDescription?: string | null;
    analysisConfidence?: number | null;
  }) {
    return {
      category: input.category ?? undefined,
      color: input.color ?? undefined,
      size: input.size ?? undefined,
      brand: input.brand ?? undefined,
      imageUrl: input.imageUrl ?? undefined,
      occasion: input.occasion ?? undefined,
      season: input.season ?? undefined,
      styleTags: input.styleTags ?? undefined,
      pattern: input.pattern ?? undefined,
      material: input.material ?? undefined,
      fit: input.fit ?? undefined,
      aiDescription: input.aiDescription ?? undefined,
      analysisConfidence: input.analysisConfidence ?? undefined,
    };
  }
}
