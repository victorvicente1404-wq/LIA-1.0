import type { Attachment } from "./types";

const MAX_FILES = 6;
const MAX_IMAGE_SOURCE = 20 * 1024 * 1024;
const MAX_PDF = 4 * 1024 * 1024;
const MAX_TEXT = 400_000;
const MAX_EDGE = 1600;
const TARGET_BYTES = 1_800_000;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const TEXT_TYPES = new Set(["text/plain", "text/csv", "application/json"]);

function readDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Não consegui comprimir a imagem."))),
      type,
      quality,
    );
  });
}

async function compressImage(file: File): Promise<Attachment> {
  if (file.size > MAX_IMAGE_SOURCE) throw new Error(`${file.name} ultrapassa 20 MB.`);
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Este navegador não conseguiu preparar a imagem.");
    context.drawImage(bitmap, 0, 0, width, height);

    const outputType = file.type === "image/webp" ? "image/webp" : "image/jpeg";
    let quality = 0.84;
    let blob = await canvasBlob(canvas, outputType, quality);
    while (blob.size > TARGET_BYTES && quality > 0.52) {
      quality -= 0.1;
      blob = await canvasBlob(canvas, outputType, quality);
    }
    if (blob.size > 3_800_000) throw new Error(`${file.name} ainda ficou grande demais após a compressão.`);
    const base = file.name.replace(/\.[^.]+$/, "") || "imagem";
    return {
      name: `${base}.${outputType === "image/webp" ? "webp" : "jpg"}`,
      mime: outputType,
      size: blob.size,
      dataUrl: await readDataUrl(blob),
    };
  } finally {
    bitmap.close();
  }
}

export async function prepareFiles(files: FileList | File[]): Promise<Attachment[]> {
  const selected = Array.from(files).slice(0, MAX_FILES);
  const prepared: Attachment[] = [];
  for (const file of selected) {
    if (IMAGE_TYPES.has(file.type)) {
      prepared.push(await compressImage(file));
      continue;
    }
    if (file.type === "application/pdf") {
      if (file.size > MAX_PDF) throw new Error(`${file.name} ultrapassa 4 MB.`);
      prepared.push({ name: file.name, mime: file.type, size: file.size, dataUrl: await readDataUrl(file) });
      continue;
    }
    if (TEXT_TYPES.has(file.type) || /\.(txt|csv|json)$/i.test(file.name)) {
      const text = await file.text();
      if (text.length > MAX_TEXT) throw new Error(`${file.name} tem texto demais para um único envio.`);
      prepared.push({ name: file.name, mime: file.type || "text/plain", size: file.size, text });
      continue;
    }
    throw new Error(`${file.name} não é um formato compatível.`);
  }
  return prepared;
}
