const MAX_SIZE = 1000;

export async function resizeCover(file: Blob): Promise<Blob> {
  let image: ImageBitmap | HTMLImageElement | undefined;
  let url: string | undefined;
  if (typeof createImageBitmap === "function") {
    try { image = await createImageBitmap(file); } catch { /* Try browser image decoding below. */ }
  }
  if (!image) {
    url = URL.createObjectURL(file);
    const element = new Image();
    element.src = url;
    try { await element.decode(); } catch (error) { URL.revokeObjectURL(url); throw error; }
    image = element;
  }
  try {
    const scale = Math.min(1, MAX_SIZE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(image, 0, 0, width, height);
        try {
          const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
          if (blob.type === "image/webp") return blob;
        } catch { /* Try HTML canvas below. */ }
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.85));
    if (!blob || blob.type !== "image/webp") throw new Error("WebP encoding unavailable");
    return blob;
  } finally {
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
    if (url) URL.revokeObjectURL(url);
  }
}
