import { Module } from '@nestjs/common';
import { AiStylistService } from './ai-stylist.service';

@Module({
  providers: [AiStylistService],
  exports: [AiStylistService],
})
export class AiModule {}
