import { describe, expect, it, vi, beforeEach } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@fastgpt/service/worker/function', () => ({
  readRawContentFromBuffer: vi.fn(async ({ extension }: { extension: string }) => ({
    rawText: `parsed:${extension}`
  }))
}));

describe('readS3FileContentByBuffer - legacy office convert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // minimal globals used by the function
    // @ts-ignore
    global.systemEnv = {
      officeFileConvert: {
        url: '',
        key: 'test-token',
        timeout: 1000
      },
      customPdfParse: {}
    };
  });

  it('should convert .doc to .docx before parsing', async () => {
    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith('/convert')) {
        res.statusCode = 404;
        return res.end('not found');
      }
      req.on('error', () => {});
      req.resume(); // ignore body
      res.writeHead(200, {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      return res.end(Buffer.from('converted-docx'));
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    // @ts-ignore
    global.systemEnv.officeFileConvert.url = `http://127.0.0.1:${port}/convert`;

    const { readS3FileContentByBuffer } = await import('@fastgpt/service/common/file/read/utils');
    const { readRawContentFromBuffer } = await import('@fastgpt/service/worker/function');
    const mockReadRawContentFromBuffer = vi.mocked(readRawContentFromBuffer);

    try {
      const result = await readS3FileContentByBuffer({
        teamId: 'team',
        tmbId: 'tmb',
        extension: 'doc',
        buffer: Buffer.from('legacy-doc'),
        encoding: 'utf-8'
      });

      expect(mockReadRawContentFromBuffer).toHaveBeenCalledWith(
        expect.objectContaining({ extension: 'docx' })
      );
      expect(result.rawText).toBe('parsed:docx');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should throw a clear error when convert service is not configured', async () => {
    // @ts-ignore
    global.systemEnv = { customPdfParse: {} };

    const { readS3FileContentByBuffer } = await import('@fastgpt/service/common/file/read/utils');

    await expect(
      readS3FileContentByBuffer({
        teamId: 'team',
        tmbId: 'tmb',
        extension: 'ppt',
        buffer: Buffer.from('legacy-ppt'),
        encoding: 'utf-8'
      })
    ).rejects.toContain('officeFileConvert.url');
  });
});
