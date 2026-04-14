import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';

type StorageTarget = 'userUploads' | 'recommendationRenders';

const DEFAULT_S3_REGION = 'us-east-1';
const DEFAULT_USER_UPLOAD_BUCKET = 'replace-me-user-uploads-bucket';
const DEFAULT_RECOMMENDATION_BUCKET = 'replace-me-recommendation-renders-bucket';

@Injectable()
export class StorageService {
  private readonly region = process.env.S3_REGION ?? DEFAULT_S3_REGION;
  private readonly targets: Record<
    StorageTarget,
    { bucket: string; publicBaseUrl: string }
  > = {
    userUploads: {
      bucket: process.env.S3_USER_UPLOAD_BUCKET ?? DEFAULT_USER_UPLOAD_BUCKET,
      publicBaseUrl:
        process.env.S3_USER_UPLOAD_PUBLIC_BASE_URL ??
        `https://${
          process.env.S3_USER_UPLOAD_BUCKET ?? DEFAULT_USER_UPLOAD_BUCKET
        }.s3.${this.region}.amazonaws.com`,
    },
    recommendationRenders: {
      bucket:
        process.env.S3_RECOMMENDATION_BUCKET ?? DEFAULT_RECOMMENDATION_BUCKET,
      publicBaseUrl:
        process.env.S3_RECOMMENDATION_PUBLIC_BASE_URL ??
        `https://${
          process.env.S3_RECOMMENDATION_BUCKET ?? DEFAULT_RECOMMENDATION_BUCKET
        }.s3.${this.region}.amazonaws.com`,
    },
  };
  private readonly s3Client = new S3Client({
    region: this.region,
  });

  async uploadBase64Image(params: {
    key: string;
    dataUrl: string;
    contentType?: string;
    target?: StorageTarget;
  }) {
    const { buffer, contentType } = this.decodeDataUrl(
      params.dataUrl,
      params.contentType,
    );
    const target = this.targets[params.target ?? 'recommendationRenders'];

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: target.bucket,
        Key: params.key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return {
      bucket: target.bucket,
      key: params.key,
      contentType,
      url: `${target.publicBaseUrl}/${params.key}`,
    };
  }

  async listObjects(params: {
    prefix?: string;
    maxKeys?: number;
    target?: StorageTarget;
  }) {
    const target = this.targets[params.target ?? 'recommendationRenders'];
    const response = await this.s3Client.send(
      new ListObjectsV2Command({
        Bucket: target.bucket,
        Prefix: params.prefix,
        MaxKeys: params.maxKeys,
      }),
    );

    return (response.Contents ?? [])
      .filter((object) => Boolean(object.Key))
      .map((object) => ({
        bucket: target.bucket,
        key: object.Key as string,
        size: object.Size ?? 0,
        lastModified: object.LastModified?.toISOString() ?? null,
        url: `${target.publicBaseUrl}/${object.Key as string}`,
      }));
  }

  private decodeDataUrl(dataUrl: string, fallbackContentType?: string) {
    const dataUrlMatch = dataUrl.match(/^data:(.+);base64,(.+)$/);

    if (!dataUrlMatch) {
      throw new Error(
        'Expected a base64 data URL like data:image/png;base64,...',
      );
    }

    const [, contentTypeFromDataUrl, base64Payload] = dataUrlMatch;

    return {
      contentType: fallbackContentType ?? contentTypeFromDataUrl,
      buffer: Buffer.from(base64Payload, 'base64'),
    };
  }
}
