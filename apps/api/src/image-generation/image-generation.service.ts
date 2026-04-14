import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

type DiffusersScriptResponse = {
  output_path?: string;
  seed?: number;
};

@Injectable()
export class ImageGenerationService {
  private readonly pythonBin = process.env.DIFFUSERS_PYTHON_BIN ?? 'python3';
  private readonly scriptPath =
    process.env.DIFFUSERS_SCRIPT_PATH ??
    resolve(
      process.cwd(),
      'apps/api/src/image-generation/generate_with_diffusers.py',
    );
  private readonly modelId =
    process.env.DIFFUSERS_MODEL_ID ?? 'runwayml/stable-diffusion-v1-5';
  private readonly timeoutMs = Number(
    process.env.DIFFUSERS_TIMEOUT_MS ?? '600000',
  );
  private readonly numSteps = Number(process.env.DIFFUSERS_NUM_STEPS ?? '14');
  private readonly guidanceScale = Number(
    process.env.DIFFUSERS_GUIDANCE_SCALE ?? '6.5',
  );
  private readonly strength = Number(process.env.DIFFUSERS_STRENGTH ?? '0.6');
  private readonly device = process.env.DIFFUSERS_DEVICE ?? 'auto';

  get isEnabled() {
    return Boolean(this.pythonBin);
  }

  async generateImage(params: {
    prompt: string;
    aspectRatio: '1:1' | '3:4' | '4:5' | '9:16';
    referenceImageUrls?: string[];
  }) {
    if (!this.isEnabled) {
      throw new Error(
        'DIFFUSERS_PYTHON_BIN is not configured. Local image generation is disabled.',
      );
    }

    const { width, height } = this.getDimensions(params.aspectRatio);
    const referenceBoard = await this.createReferenceBoard({
      imageUrls: params.referenceImageUrls ?? [],
      width,
      height,
    });
    const tempDir = await mkdtemp(join(tmpdir(), 'closet-diffusers-'));
    const inputPath = join(tempDir, 'reference-board.png');
    const outputPath = join(tempDir, 'generated-image.png');

    try {
      await writeFile(inputPath, referenceBoard);

      const { stdout, stderr } = await execFileAsync(
        this.pythonBin,
        [
          this.scriptPath,
          '--prompt',
          params.prompt,
          '--input',
          inputPath,
          '--output',
          outputPath,
          '--model',
          this.modelId,
          '--width',
          String(width),
          '--height',
          String(height),
          '--steps',
          String(this.numSteps),
          '--guidance-scale',
          String(this.guidanceScale),
          '--strength',
          String(this.strength),
          '--device',
          this.device,
        ],
        {
          cwd: process.cwd(),
          timeout: this.timeoutMs,
          maxBuffer: 1024 * 1024 * 4,
        },
      );

      const scriptResult = this.parseScriptResponse(stdout);

      if (stderr?.trim()) {
        console.error('Diffusers stderr:', stderr.trim());
      }

      const generatedBuffer = await readFile(
        scriptResult.output_path ?? outputPath,
      );

      return {
        dataUrl: `data:image/png;base64,${generatedBuffer.toString('base64')}`,
        contentType: 'image/png',
        promptId: scriptResult.seed?.toString() ?? null,
      };
    } catch (error) {
      console.error('Diffusers image generation failed:', error);
      throw error;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private parseScriptResponse(stdout: string) {
    const trimmed = stdout.trim();

    if (!trimmed) {
      return {} as DiffusersScriptResponse;
    }

    try {
      return JSON.parse(trimmed) as DiffusersScriptResponse;
    } catch {
      return {} as DiffusersScriptResponse;
    }
  }

  private async createReferenceBoard(params: {
    imageUrls: string[];
    width: number;
    height: number;
  }) {
    const sourceImages = await this.downloadReferenceImages(params.imageUrls);
    const board = sharp({
      create: {
        width: params.width,
        height: params.height,
        channels: 3,
        background: '#f4efe8',
      },
    });

    if (sourceImages.length === 0) {
      return board.png().toBuffer();
    }

    const columns = sourceImages.length === 1 ? 1 : 2;
    const rows = Math.ceil(sourceImages.length / columns);
    const gap = 24;
    const outerPadding = 32;
    const cellWidth = Math.floor(
      (params.width - outerPadding * 2 - gap * (columns - 1)) / columns,
    );
    const cellHeight = Math.floor(
      (params.height - outerPadding * 2 - gap * (rows - 1)) / rows,
    );

    const composites = await Promise.all(
      sourceImages.map(async (image, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        const fitted = await sharp(image)
          .resize(cellWidth, cellHeight, {
            fit: 'contain',
            background: '#ffffff',
          })
          .extend({
            top: 16,
            bottom: 16,
            left: 16,
            right: 16,
            background: '#ffffff',
          })
          .png()
          .toBuffer();

        return {
          input: fitted,
          left: outerPadding + column * (cellWidth + gap),
          top: outerPadding + row * (cellHeight + gap),
        };
      }),
    );

    return board.composite(composites).png().toBuffer();
  }

  private async downloadReferenceImages(imageUrls: string[]) {
    const urls = imageUrls.slice(0, 4);
    const images: Buffer[] = [];

    for (const imageUrl of urls) {
      try {
        const response = await fetch(imageUrl);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch reference image ${imageUrl}. Status ${response.status}`,
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        images.push(Buffer.from(arrayBuffer));
      } catch (error) {
        console.error(
          `Reference image download failed for ${imageUrl}:`,
          error,
        );
      }
    }

    return images;
  }

  private getDimensions(aspectRatio: '1:1' | '3:4' | '4:5' | '9:16') {
    switch (aspectRatio) {
      case '1:1':
        return { width: 768, height: 768 };
      case '3:4':
        return { width: 768, height: 1024 };
      case '4:5':
        return { width: 768, height: 960 };
      case '9:16':
        return { width: 576, height: 1024 };
      default:
        return { width: 768, height: 960 };
    }
  }
}
