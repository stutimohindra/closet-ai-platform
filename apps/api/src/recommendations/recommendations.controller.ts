import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { GenerateRecommendationsDto } from './dto/generate-recommendations.dto';
import { RenderOutfitDto } from './dto/render-outfit.dto';
import { RecommendationsService } from './recommendations.service';

@Controller('recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @Get('outfits')
  getOutfitRecommendations() {
    return this.recommendationsService.getOutfitRecommendations();
  }

  @Get('generated-items')
  getGeneratedItems() {
    return this.recommendationsService.getGeneratedItems();
  }

  @Post('generate')
  generateRecommendations(
    @Body() generateRecommendationsDto: GenerateRecommendationsDto,
  ) {
    return this.recommendationsService.generateRecommendationsFromImages(
      generateRecommendationsDto,
    );
  }

  @Get('missing-items')
  getMissingItemRecommendations() {
    return this.recommendationsService.getMissingItemRecommendations();
  }

  @Get('taste-profile')
  getTasteProfile() {
    return this.recommendationsService.getTasteProfile();
  }

  @Post('feedback')
  createFeedback(@Body() createFeedbackDto: CreateFeedbackDto) {
    return this.recommendationsService.createFeedback(createFeedbackDto);
  }

  @Post('outfits/:id/render')
  renderOutfit(
    @Param('id') id: string,
    @Body() renderOutfitDto: RenderOutfitDto,
  ) {
    return this.recommendationsService.renderOutfit(id, renderOutfitDto);
  }
}
