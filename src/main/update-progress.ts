import { Transform } from 'node:stream';

export type DownloadProgressSnapshot = {
  downloadedBytes: number;
  totalBytes?: number;
  percent?: number;
};

export function parseContentLength(value: string | null | undefined): number | undefined {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function createDownloadProgressMeter(
  totalBytes: number | undefined,
  onProgress: (progress: DownloadProgressSnapshot) => void
): { stream: Transform; downloadedBytes: () => number } {
  let downloaded = 0;
  let lastPercent = -1;
  let lastEmitAt = 0;

  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      downloaded += chunk.length;
      const now = Date.now();
      const percent = totalBytes
        ? Math.min(100, Math.floor((downloaded / totalBytes) * 100))
        : undefined;      const shouldEmit = percent !== lastPercent || now - lastEmitAt >= 250;
      if (shouldEmit) {
        lastPercent = percent ?? lastPercent;
        lastEmitAt = now;
        onProgress({ downloadedBytes: downloaded, totalBytes, percent });
      }
      callback(null, chunk);
    }
  });

  return { stream, downloadedBytes: () => downloaded };
}