import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClosetItemsModule } from './closet-items/closet-items.module';
import { RecommendationsModule } from './recommendations/recommendations.module';

@Module({
  imports: [ClosetItemsModule, RecommendationsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
