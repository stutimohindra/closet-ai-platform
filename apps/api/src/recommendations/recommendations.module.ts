import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ImageGenerationModule } from '../image-generation/image-generation.module';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModule } from '../storage/storage.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [AiModule, StorageModule, ImageGenerationModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService, PrismaService],
})
export class RecommendationsModule {}
