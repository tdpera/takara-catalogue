/// <reference lib="webworker" />
// Resizes a camera photo off the main thread so the form stays responsive on cheap phones.
// Only scales and re-encodes: no filters, no colour changes, so the metal looks as shot.
// Re-encoding also drops EXIF metadata such as GPS location.

type Req = { id: number; file: Blob; max: number; thumb: number; quality: number; thumbQuality: number };

async function encode(src: ImageBitmap, w: number, h: number, quality: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return canvas.convertToBlob({ type: "image/jpeg", quality });
}

function fit(w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, file, max, thumb, quality, thumbQuality } = e.data;
  try {
    // Browsers apply the EXIF orientation by default, so portrait shots stay upright.
    const bmp = await createImageBitmap(file);
    const f = fit(bmp.width, bmp.height, max);
    const full = await encode(bmp, f.w, f.h, quality);
    const t = fit(bmp.width, bmp.height, thumb);
    const small = await encode(bmp, t.w, t.h, thumbQuality);
    bmp.close();
    (self as unknown as Worker).postMessage({ id, ok: true, full, thumb: small, width: f.w, height: f.h });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) });
  }
};
