import { type Screenshot } from "./ai/provider";
export async function prepareScreenshots(files: File[]): Promise<Screenshot[]> {
  if (files.length < 1 || files.length > 6) throw new Error("Choose 1–6 screenshots of the same recipe.");
  const result: Screenshot[] = [];
  let total = 0;
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} exceeds 20 MB. Choose a smaller screenshot.`);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error(`${file.name}: choose JPEG, PNG, or WebP. Convert HEIC in Photos first.`);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (img.naturalWidth * img.naturalHeight > 40_000_000) throw new Error("Image dimensions are too large.");
      const scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser cannot prepare screenshots.");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
      const bytes = Math.floor(data.length * 3 / 4);
      total += bytes;
      if (bytes > 1_500_000 || total > 2_800_000) throw new Error("The prepared screenshots are too large. Try fewer images or crop them to the recipe text.");
      result.push({ mimeType: "image/jpeg", data });
    } catch (error) {
      if (error instanceof Error && error.name === "EncodingError") throw new Error(`${file.name} could not be read. Choose a valid screenshot.`, { cause: error });
      throw error;
    } finally { URL.revokeObjectURL(url); }
  }
  return result;
}
