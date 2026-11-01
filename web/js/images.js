// Fotos verkleinern/komprimieren, bevor sie gespeichert oder an die KI geschickt werden.

const MAX_EDGE = 1568; // empfohlene Maximalkante für Claude Vision
const THUMB_EDGE = 320;

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* Fallback unten */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(src, maxEdge) {
  const w0 = src.width;
  const h0 = src.height;
  const scale = Math.min(1, maxEdge / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return canvas;
}

const toBlob = (canvas, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht kodiert werden'))), 'image/jpeg', quality));

/** Datei -> { blob (JPEG), thumb (Data-URL), width, height } */
export async function processImage(file) {
  const bmp = await loadBitmap(file);
  const big = draw(bmp, MAX_EDGE);
  const blob = await toBlob(big, 0.82);
  const thumb = draw(big, THUMB_EDGE).toDataURL('image/jpeg', 0.7);
  if (bmp.close) bmp.close();
  return { blob, thumb, width: big.width, height: big.height };
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function base64ToBlob(b64, type = 'image/jpeg') {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
