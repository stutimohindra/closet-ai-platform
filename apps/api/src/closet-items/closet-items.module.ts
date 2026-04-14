import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PrismaService } from '../prisma/prisma.service';
import { StorageModule } from '../storage/storage.module';
import { ClosetItemsController } from './closet-items.controller';
import { ClosetItemsService } from './closet-items.service';

@Module({
  imports: [AiModule, StorageModule],
  controllers: [ClosetItemsController],
  providers: [ClosetItemsService, PrismaService],
})
export class ClosetItemsModule {}
