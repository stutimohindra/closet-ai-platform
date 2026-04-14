import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.get(PrismaService).closetItem.deleteMany();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/closet-items (CRUD)', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/closet-items')
      .send({
        name: 'Linen Shirt',
        category: 'Tops',
        color: 'White',
        size: 'M',
        brand: 'Everlane',
        imageUrl: 'https://example.com/images/linen-shirt.jpg',
        occasion: 'Casual',
        season: 'Spring',
        styleTags: ['minimal', 'classic'],
      })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      id: 1,
      name: 'Linen Shirt',
      category: 'Tops',
      color: 'White',
      size: 'M',
      brand: 'Everlane',
      imageUrl: 'https://example.com/images/linen-shirt.jpg',
      occasion: 'Casual',
      season: 'Spring',
      styleTags: ['minimal', 'classic'],
    });
    expect(createResponse.body.createdAt).toEqual(expect.any(String));
    expect(createResponse.body.updatedAt).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .get('/closet-items')
      .expect(200)
      .expect([
        expect.objectContaining({
          id: 1,
          name: 'Linen Shirt',
        }),
      ]);

    await request(app.getHttpServer())
      .get('/closet-items/1')
      .expect(200)
      .expect(expect.objectContaining({ id: 1, name: 'Linen Shirt' }));

    const patchResponse = await request(app.getHttpServer())
      .patch('/closet-items/1')
      .send({
        color: 'Blue',
        size: 'L',
        imageUrl: 'https://example.com/images/linen-shirt-blue.jpg',
        season: 'Summer',
        styleTags: ['minimal', 'smart-casual'],
      })
      .expect(200);

    expect(patchResponse.body).toMatchObject({
      id: 1,
      name: 'Linen Shirt',
      category: 'Tops',
      color: 'Blue',
      size: 'L',
      brand: 'Everlane',
      imageUrl: 'https://example.com/images/linen-shirt-blue.jpg',
      occasion: 'Casual',
      season: 'Summer',
      styleTags: ['minimal', 'smart-casual'],
    });

    await request(app.getHttpServer())
      .delete('/closet-items/1')
      .expect(200)
      .expect(expect.objectContaining({ id: 1, name: 'Linen Shirt' }));

    await request(app.getHttpServer())
      .get('/closet-items')
      .expect(200)
      .expect([]);

    await request(app.getHttpServer()).get('/closet-items/1').expect(404);
  });

  it('/recommendations/outfits (GET)', async () => {
    await request(app.getHttpServer())
      .post('/closet-items')
      .send({
        name: 'White Tee',
        category: 'Top',
        color: 'White',
        imageUrl: 'https://example.com/images/white-tee.jpg',
        occasion: 'Casual',
        season: 'Summer',
        styleTags: ['minimal', 'weekend'],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/closet-items')
      .send({
        name: 'Blue Jeans',
        category: 'Bottom',
        color: 'Blue',
        imageUrl: 'https://example.com/images/blue-jeans.jpg',
        occasion: 'Casual',
        season: 'Summer',
        styleTags: ['minimal', 'denim'],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/closet-items')
      .send({
        name: 'White Sneakers',
        category: 'Shoes',
        color: 'White',
        imageUrl: 'https://example.com/images/white-sneakers.jpg',
        occasion: 'Casual',
        season: 'Summer',
        styleTags: ['minimal', 'weekend'],
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/recommendations/outfits')
      .expect(200);

    expect(response.body.totalItems).toBe(3);
    expect(response.body.generatedAt).toEqual(expect.any(String));
    expect(response.body.summary).toContain('Generated');
    expect(response.body.ai).toEqual(
      expect.objectContaining({
        enabled: false,
        source: 'rules-only',
      }),
    );
    expect(response.body.outfits).toHaveLength(1);
    expect(response.body.outfits[0]).toMatchObject({
      id: 'outfit-1',
      pieces: {
        top: expect.objectContaining({ name: 'White Tee' }),
        bottom: expect.objectContaining({ name: 'Blue Jeans' }),
        shoes: expect.objectContaining({ name: 'White Sneakers' }),
        layer: null,
        accessory: null,
      },
    });
    expect(response.body.outfits[0].reason).toEqual(expect.any(String));
    expect(response.body.outfits[0].reason).toContain('casual');
    expect(response.body.outfits[0].reason).toContain('summer');
  });
});
