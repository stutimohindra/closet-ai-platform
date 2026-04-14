import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ClosetItemsService } from './closet-items.service';
import { CreateClosetItemDto } from './dto/create-closet-item.dto';
import { UploadClosetItemImageDto } from './dto/upload-closet-item-image.dto';
import { UpdateClosetItemDto } from './dto/update-closet-item.dto';

@Controller('closet-items')
export class ClosetItemsController {
  constructor(private readonly closetItemsService: ClosetItemsService) {}

  @Post()
  create(@Body() createClosetItemDto: CreateClosetItemDto) {
    return this.closetItemsService.create(createClosetItemDto);
  }

  @Get()
  findAll() {
    return this.closetItemsService.findAll();
  }

  @Post('upload-image')
  uploadImage(@Body() uploadClosetItemImageDto: UploadClosetItemImageDto) {
    return this.closetItemsService.uploadImage(uploadClosetItemImageDto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.closetItemsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateClosetItemDto: UpdateClosetItemDto,
  ) {
    return this.closetItemsService.update(id, updateClosetItemDto);
  }

  @Post(':id/analyze-image')
  analyzeImage(@Param('id', ParseIntPipe) id: number) {
    return this.closetItemsService.analyzeImage(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.closetItemsService.remove(id);
  }
}
