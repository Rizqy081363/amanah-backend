import { UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';
import { AvatarProcessingService } from './avatar-processing.service';

describe('AvatarProcessingService', () => {
  let service: AvatarProcessingService;

  beforeEach(() => {
    service = new AvatarProcessingService();
  });

  it('should reject non-image buffers with UnprocessableEntityException', async () => {
    const fakeTextBuffer = Buffer.from('This is definitely not an image file');
    await expect(service.process(fakeTextBuffer)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('should process a valid JPEG or PNG image into WebP format with <=512 dimensions and stripped metadata', async () => {
    // Generate a valid 600x400 PNG test image using sharp
    const sampleInputBuffer = await sharp({
      create: {
        width: 600,
        height: 400,
        channels: 3,
        background: { r: 2, g: 132, b: 199 },
      },
    })
      .png()
      .toBuffer();

    const result = await service.process(sampleInputBuffer);

    expect(result.mimeType).toBe('image/webp');
    expect(result.buffer).toBeInstanceOf(Buffer);

    // Verify the output image properties
    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
  });
});
