import { DOWNLOAD_BODY, DOWNLOAD_FILENAME } from './capability-types';

export function createSampleDownloadAnchor(doc: Document = document): HTMLAnchorElement {
  const blob = new Blob([DOWNLOAD_BODY], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = DOWNLOAD_FILENAME;
  return anchor;
}

export function triggerSampleDownload(doc: Document = document): void {
  const anchor = createSampleDownloadAnchor(doc);
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(anchor.href);
}
