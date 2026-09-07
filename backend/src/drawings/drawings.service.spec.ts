import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { createFakePrisma, FakePrisma } from '../../test/prisma-mock';
import { ServiceUnconfiguredError } from '../common/errors';
import { DomainConfigService } from '../config/domain-config.service';
import { DxfService } from '../dxf/dxf.service';
import { MinioStorageService } from '../integrations/minio-s3';
import { CORRUPT_DXF, rectangleDxf } from '../../test/dxf-fixtures';
import { DrawingsService } from './drawings.service';

const OWNER = 'user-owner';

describe('DrawingsService.upload', () => {
  let prisma: FakePrisma;
  let drawings: DrawingsService;
  let storage: { putObject: jest.Mock };

  const fileFrom = (name: string, buffer: Buffer, size = buffer.length) => ({
    originalname: name,
    buffer,
    size,
  });

  beforeEach(() => {
    const fake = createFakePrisma();
    prisma = fake;
    storage = { putObject: jest.fn().mockResolvedValue(undefined) };
    drawings = new DrawingsService(
      fake,
      new DomainConfigService(fake),
      new DxfService(),
      storage as unknown as MinioStorageService,
    );
  });

  describe('rejection order', () => {
    it('rejects a disallowed extension before reading or storing anything', async () => {
      const file = fileFrom('drawing.step', rectangleDxf());
      await expect(drawings.upload(OWNER, file)).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(drawings.upload(OWNER, file)).rejects.toThrow(/only \.dxf files can be uploaded/i);
      expect(storage.putObject).not.toHaveBeenCalled();
      expect(prisma.drawing.rows).toHaveLength(0);
    });

    it('rejects a file with no extension at all', async () => {
      await expect(drawings.upload(OWNER, fileFrom('drawing', rectangleDxf()))).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('rejects an oversize file before parsing it', async () => {
      const parse = jest.spyOn(DxfService.prototype, 'parseDxf');
      const oversize = fileFrom('huge.dxf', rectangleDxf(), 11 * 1024 * 1024);
      await expect(drawings.upload(OWNER, oversize)).rejects.toThrow(/maximum upload size is 10.0 MB/i);
      expect(parse).not.toHaveBeenCalled();
      expect(storage.putObject).not.toHaveBeenCalled();
      parse.mockRestore();
    });

    it('rejects an unparseable DXF with the parser’s own message, and stores nothing', async () => {
      await expect(drawings.upload(OWNER, fileFrom('broken.dxf', CORRUPT_DXF))).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(storage.putObject).not.toHaveBeenCalled();
      expect(prisma.drawing.rows).toHaveLength(0);
    });

    it('accepts the extension case-insensitively', async () => {
      await expect(drawings.upload(OWNER, fileFrom('PART.DXF', rectangleDxf()))).resolves.toBeTruthy();
    });
  });

  describe('a drawing that survives every check', () => {
    it('stores the source file under an owner-scoped key and persists the measurements', async () => {
      const result = await drawings.upload(OWNER, fileFrom('bracket.dxf', rectangleDxf(100, 50)));

      expect(storage.putObject).toHaveBeenCalledTimes(1);
      const [key, , contentType] = storage.putObject.mock.calls[0];
      expect(key).toMatch(new RegExp(`^drawings/${OWNER}/[0-9a-f-]+\\.dxf$`));
      expect(contentType).toBe('application/dxf');

      expect(result.filename).toBe('bracket.dxf');
      expect(result.bboxWMm).toBeCloseTo(100, 6);
      expect(result.cutLengthMm).toBeCloseTo(300, 6);
      expect(result.detectedUnits).toBe('Millimetres');
      expect(prisma.drawing.rows).toHaveLength(1);
    });

    it('keeps the customer’s work when object storage is unavailable', async () => {
      storage.putObject.mockRejectedValue(new ServiceUnconfiguredError('MINIO'));
      const result = await drawings.upload(OWNER, fileFrom('bracket.dxf', rectangleDxf()));
      expect(result.id).toBeTruthy();
      expect(prisma.drawing.rows[0]['objectKey']).toBeNull();
    });
  });

  describe('ownership', () => {
    it('404s an unknown drawing and 403s another account’s drawing', async () => {
      const mine = await drawings.upload(OWNER, fileFrom('mine.dxf', rectangleDxf()));
      await expect(drawings.get('nope', OWNER)).rejects.toBeInstanceOf(NotFoundException);
      await expect(drawings.get(mine.id, 'someone-else')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(drawings.get(mine.id, OWNER)).resolves.toBeTruthy();
    });
  });
});
