"use client";
/**
 * Branded catalogue image: PNG, 1080 px wide, up to 6 pieces. Drawn on the phone with a canvas,
 * so nothing extra is uploaded. Photos are placed as taken (cropped to a square, never filtered
 * or retouched), so the metal looks as it really is.
 */
export const IMAGE_MAX = 6;
const W = 1080;
const PAD = 48;
const GAP = 24;
const GOLD = "#8a6216";
const INK = "#16181d";
const MUTED = "#5b616e";
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Arabic", "Noto Sans Devanagari", "Noto Sans Malayalam", sans-serif';

export type ImageItem = { name: string; karat: number; weight: string; price: string | null; photo: string | null };

async function loadBitmap(url: string | null): Promise<ImageBitmap | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = last + "…";
    return kept;
  }
  return lines;
}

/** Square crop from the centre, scaled to fit. Nothing else is done to the photo. */
function drawCover(ctx: CanvasRenderingContext2D, img: ImageBitmap, x: number, y: number, size: number) {
  const s = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, x, y, size, size);
}

export async function renderCatalogueImage(p: {
  shop: string;
  dateLine: string;
  note: string;
  noPhoto: string;
  noPrice: string;
  items: ImageItem[];
  rtl?: boolean;
}): Promise<Blob> {
  const items = p.items.slice(0, IMAGE_MAX);
  const cols = items.length === 1 ? 1 : 2;
  const cell = (W - PAD * 2 - GAP * (cols - 1)) / cols;
  const textH = 190;
  const rows = Math.ceil(items.length / cols);
  const headerH = 190;
  const footerH = 150;
  const H = headerH + rows * (cell + textH) + (rows - 1) * GAP + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "top";
  ctx.direction = p.rtl ? "rtl" : "ltr";
  const startX = p.rtl ? W - PAD : PAD;
  ctx.textAlign = p.rtl ? "right" : "left";

  // Header
  ctx.fillStyle = INK;
  ctx.font = `700 54px ${FONT}`;
  ctx.fillText(wrap(ctx, p.shop, W - PAD * 2, 1)[0] ?? "", startX, PAD);
  ctx.fillStyle = MUTED;
  ctx.font = `400 30px ${FONT}`;
  ctx.fillText(p.dateLine, startX, PAD + 72);
  ctx.fillStyle = GOLD;
  ctx.fillRect(PAD, headerH - 26, W - PAD * 2, 4);

  const bitmaps = await Promise.all(items.map((i) => loadBitmap(i.photo)));
  items.forEach((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const visualCol = p.rtl ? cols - 1 - col : col;
    const x = PAD + visualCol * (cell + GAP);
    const y = headerH + row * (cell + textH + GAP);
    ctx.fillStyle = "#eef0f3";
    ctx.fillRect(x, y, cell, cell);
    const bmp = bitmaps[i];
    if (bmp) drawCover(ctx, bmp, x, y, cell);
    else {
      ctx.fillStyle = MUTED;
      ctx.font = `400 28px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(p.noPhoto, x + cell / 2, y + cell / 2 - 14);
      ctx.textAlign = p.rtl ? "right" : "left";
    }
    const tx = p.rtl ? x + cell : x;
    ctx.fillStyle = INK;
    ctx.font = `700 32px ${FONT}`;
    const nameLines = wrap(ctx, it.name, cell, 2);
    nameLines.forEach((l, k) => ctx.fillText(l, tx, y + cell + 18 + k * 40));
    const after = y + cell + 18 + nameLines.length * 40;
    // Figures are always drawn left to right ("AED 11,183", never "11,183 AED"), even in Arabic.
    ctx.direction = "ltr";
    ctx.fillStyle = MUTED;
    ctx.font = `400 28px ${FONT}`;
    ctx.fillText(`${it.karat}K · ${it.weight}`, tx, after + 4);
    ctx.fillStyle = GOLD;
    ctx.font = `700 ${it.price ? 40 : 28}px ${FONT}`;
    if (!it.price) ctx.direction = p.rtl ? "rtl" : "ltr";
    ctx.fillText(it.price ?? p.noPrice, tx, after + 46);
    ctx.direction = p.rtl ? "rtl" : "ltr";
  });

  // Footer note
  const fy = H - footerH + 24;
  ctx.fillStyle = "#e3e5ea";
  ctx.fillRect(PAD, fy - 12, W - PAD * 2, 2);
  ctx.fillStyle = MUTED;
  ctx.font = `400 28px ${FONT}`;
  wrap(ctx, p.note, W - PAD * 2, 3).forEach((l, k) => ctx.fillText(l, startX, fy + 10 + k * 38));

  bitmaps.forEach((b) => b?.close());
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}

/** Opens the phone's share sheet with the image, or downloads it where that isn't possible. */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
