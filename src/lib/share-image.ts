"use client";
/**
 * The tray as an image: PNG, 1080 px wide, every piece of the tray (up to 24), with a QR code to
 * the live tray at the bottom. Drawn on the phone with a canvas, so nothing extra is uploaded.
 *
 * Photos are placed as taken (cropped to a square, never filtered or retouched), so the metal
 * looks as it really is. The shop's name is drawn faintly across each photo, as on the tray page,
 * so a forwarded image still says whose designs these are.
 */
import QRCode from "qrcode";
import { noPriceText, priceNote, trayImageText, type MsgLang } from "./share-message";

export const IMAGE_MAX = 24;
const W = 1080;
const PAD = 48;
const GAP = 24;
const QR = 264;
// Maison colours (see globals.css).
const PAPER = "#fbf9f5";
const TILE = "#f2eee6";
const LINE = "#e7e1d6";
const GOLD = "#86621f";
const INK = "#16130f";
const MUTED = "#6e665c";
const SCRIPTS = '"Noto Sans", "Noto Sans Arabic", "Noto Sans Devanagari", "Noto Sans Malayalam", sans-serif';

/** The app's own fonts (from next/font's CSS variables), loaded before drawing; system fonts otherwise. */
async function fonts(): Promise<{ sans: string; serif: string }> {
  const css = getComputedStyle(document.documentElement);
  const sans = `${css.getPropertyValue("--font-manrope").trim() || "system-ui"}, system-ui, ${SCRIPTS}`;
  const serif = `${css.getPropertyValue("--font-bodoni").trim() || "Georgia"}, Georgia, ${SCRIPTS}`;
  try {
    await Promise.all([document.fonts.load(`500 52px ${serif}`), document.fonts.load(`600 32px ${sans}`), document.fonts.load(`400 28px ${sans}`)]);
  } catch {}
  return { sans, serif };
}

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

/** The shop's name, three times, slanted and faint, over the photo (never into it). */
function drawWatermark(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, font: string) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate((-24 * Math.PI) / 180);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = "ltr";
  ctx.font = `500 ${Math.round(size / 15)}px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  // Spaced capitals for Latin names; other scripts as written (spacing would break joined letters).
  const latin = /^[\x20-\x7E]+$/.test(text);
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (latin && "letterSpacing" in c) c.letterSpacing = `${Math.round(size / 50)}px`;
  const label = latin ? text.toUpperCase() : text;
  for (const dy of [-size / 3, 0, size / 3]) ctx.fillText(label, 0, dy, size * 1.2);
  ctx.restore();
}

/** QR code, drawn module by module so it stays sharp at any size. */
function drawQr(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, size: number) {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const quiet = 4;
  const cell = size / (n + quiet * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) ctx.fillRect(Math.floor(x + (c + quiet) * cell), Math.floor(y + (r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }
}

export async function renderTrayImage(p: {
  shop: string;
  dateLine: string;
  note: string;
  noPhoto: string;
  noPrice: string;
  items: ImageItem[];
  /** The tray's link, drawn as a QR code and as text. */
  url: string;
  scan: string;
  valid: string;
  rtl?: boolean;
}): Promise<Blob> {
  const items = p.items.slice(0, IMAGE_MAX);
  // One big photo, two columns up to six pieces, then three so a full tray stays a sensible size.
  const cols = items.length === 1 ? 1 : items.length <= 6 ? 2 : 3;
  const cell = (W - PAD * 2 - GAP * (cols - 1)) / cols;
  const s = cols === 3 ? 0.78 : 1; // text scale
  const textH = Math.round(190 * s);
  const rows = Math.ceil(items.length / cols);
  const headerH = 190;
  const footerH = QR + PAD * 2 + 40;
  const H = headerH + rows * (cell + textH) + (rows - 1) * GAP + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const { sans: FONT, serif: SERIF } = await fonts();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "top";
  const dir = p.rtl ? "rtl" : "ltr";
  ctx.direction = dir;
  const startX = p.rtl ? W - PAD : PAD;
  const align: CanvasTextAlign = p.rtl ? "right" : "left";
  ctx.textAlign = align;

  // Header
  ctx.fillStyle = INK;
  ctx.font = `500 54px ${SERIF}`;
  ctx.fillText(wrap(ctx, p.shop, W - PAD * 2, 1)[0] ?? "", startX, PAD);
  ctx.fillStyle = MUTED;
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(p.dateLine, startX, PAD + 76);
  ctx.fillStyle = GOLD;
  ctx.fillRect(PAD, headerH - 28, W - PAD * 2, 2);

  const bitmaps = await Promise.all(items.map((i) => loadBitmap(i.photo)));
  items.forEach((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const visualCol = p.rtl ? cols - 1 - col : col;
    const x = PAD + visualCol * (cell + GAP);
    const y = headerH + row * (cell + textH + GAP);
    ctx.fillStyle = TILE;
    ctx.fillRect(x, y, cell, cell);
    const bmp = bitmaps[i];
    if (bmp) {
      drawCover(ctx, bmp, x, y, cell);
      drawWatermark(ctx, p.shop, x, y, cell, SERIF);
    } else {
      ctx.fillStyle = MUTED;
      ctx.font = `400 ${Math.round(28 * s)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(p.noPhoto, x + cell / 2, y + cell / 2 - 14);
      ctx.textAlign = align;
    }
    const tx = p.rtl ? x + cell : x;
    const lh = Math.round(40 * s);
    ctx.fillStyle = INK;
    ctx.font = `500 ${Math.round(34 * s)}px ${SERIF}`;
    const nameLines = wrap(ctx, it.name, cell, 2);
    nameLines.forEach((l, k) => ctx.fillText(l, tx, y + cell + 18 * s + k * lh));
    const after = y + cell + 18 * s + nameLines.length * lh;
    // Figures are always drawn left to right ("AED 11,183", never "11,183 AED"), even in Arabic.
    ctx.direction = "ltr";
    ctx.fillStyle = MUTED;
    ctx.font = `400 ${Math.round(28 * s)}px ${FONT}`;
    ctx.fillText(`${it.karat}K · ${it.weight}`, tx, after + 4);
    ctx.fillStyle = INK;
    ctx.font = `700 ${Math.round((it.price ? 38 : 28) * s)}px ${FONT}`;
    if (!it.price) ctx.direction = dir;
    ctx.fillText(it.price ?? p.noPrice, tx, after + 46 * s);
    ctx.direction = dir;
  });

  // Footer: the QR code to the live tray, what it's for, the link and until when it works.
  const fy = H - footerH + PAD;
  ctx.fillStyle = LINE;
  ctx.fillRect(PAD, fy - 24, W - PAD * 2, 2);
  const qrX = p.rtl ? PAD : W - PAD - QR;
  drawQr(ctx, p.url, qrX, fy, QR);
  const textW = W - PAD * 3 - QR;
  const textX = p.rtl ? W - PAD : PAD;
  let ty = fy;
  ctx.fillStyle = INK;
  ctx.font = `600 32px ${FONT}`;
  for (const l of wrap(ctx, p.scan, textW, 3)) {
    ctx.fillText(l, textX, ty);
    ty += 42;
  }
  ty += 10;
  ctx.direction = "ltr";
  ctx.fillStyle = GOLD;
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(wrap(ctx, p.url.replace(/^https?:\/\//, ""), textW, 1)[0] ?? "", textX, ty);
  ctx.direction = dir;
  ty += 40;
  ctx.fillStyle = MUTED;
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(p.valid, textX, ty);
  ty += 44;
  ctx.font = `400 24px ${FONT}`;
  for (const l of wrap(ctx, p.note, textW, Math.max(1, Math.floor((fy + QR + 30 - ty) / 32)))) {
    ctx.fillText(l, textX, ty);
    ty += 32;
  }

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

/** Dates on the image, in the client's language, with Western digits like the prices. */
function dubaiDate(iso: string | Date, lang: MsgLang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : lang, { timeZone: "Asia/Dubai", day: "numeric", month: "long", year: "numeric", numberingSystem: "latn" }).format(new Date(iso));
}

/**
 * Draws a sent tray as an image, in the client's language, and offers it to the phone's share
 * sheet (or downloads it). Used by the composer and by each card under "Trays you sent".
 */
export async function saveTrayImage(p: {
  shop: string;
  vat: boolean;
  lang: MsgLang;
  url: string;
  expiresAt: string;
  items: ImageItem[];
  noPhoto: string;
}): Promise<"shared" | "downloaded" | "cancelled"> {
  const text = trayImageText(p.lang, dubaiDate(p.expiresAt, p.lang));
  const blob = await renderTrayImage({
    shop: p.shop,
    dateLine: dubaiDate(new Date(), p.lang),
    note: priceNote(p.lang, p.vat),
    noPhoto: p.noPhoto,
    noPrice: noPriceText(p.lang),
    items: p.items,
    url: p.url,
    scan: text.scan,
    valid: text.valid,
    rtl: p.lang === "ar",
  });
  const name = p.shop.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "tray";
  return shareOrDownload(blob, `${name}-tray.png`, p.shop);
}
