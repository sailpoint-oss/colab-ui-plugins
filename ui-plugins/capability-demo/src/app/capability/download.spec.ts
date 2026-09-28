import { createSampleDownloadAnchor } from './download';
import { DOWNLOAD_FILENAME } from './capability-types';

describe('download helper', () => {
  it('creates an anchor named plugin-capability-demo.txt', () => {
    const anchor = createSampleDownloadAnchor(document);
    expect(anchor.download).toBe(DOWNLOAD_FILENAME);
    expect(anchor.href).toMatch(/^blob:/);
    URL.revokeObjectURL(anchor.href);
  });
});
