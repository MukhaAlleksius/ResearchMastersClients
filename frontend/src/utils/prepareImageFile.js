/** Сжать фото с телефона перед загрузкой, чтобы не упираться в лимит сервера. */

export const IMAGE_PRESETS = {
  avatar: { maxEdge: 1600, maxBytes: 4.5 * 1024 * 1024 },
  portfolio: { maxEdge: 2200, maxBytes: 8 * 1024 * 1024 },
};

const PASSTHROUGH_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function isAlreadySmallEnough(file, maxBytes) {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  const known =
    PASSTHROUGH_TYPES.has(type) || /\.(jpe?g|png|webp|gif)$/.test(name);
  return known && file.size > 0 && file.size <= maxBytes;
}

function loadImageSource(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).then((bitmap) => ({
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close() {
        bitmap.close?.();
      },
    }));
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        close() {},
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          "Не удалось прочитать фото. Сохраните его как JPG и попробуйте снова.",
        ),
      );
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Не удалось обработать изображение"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

function drawScaled(image, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Не удалось обработать изображение");
  }
  context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function jpegName(file) {
  const base = (file.name || "photo").replace(/\.[^.]+$/, "") || "photo";
  return `${base}.jpg`;
}

/**
 * Возвращает исходный файл, если он уже лёгкий JPG/PNG/WEBP/GIF.
 * Иначе уменьшает длинную сторону и сохраняет JPEG легче лимита.
 */
export async function prepareImageFile(file, options = {}) {
  const maxEdge = options.maxEdge ?? IMAGE_PRESETS.avatar.maxEdge;
  const maxBytes = options.maxBytes ?? IMAGE_PRESETS.avatar.maxBytes;

  if (!file) {
    throw new Error("Файл не выбран");
  }
  if (isAlreadySmallEnough(file, maxBytes)) {
    return file;
  }

  const image = await loadImageSource(file).catch(() => {
    throw new Error(
      "Не удалось прочитать фото. Сохраните его как JPG и попробуйте снова.",
    );
  });

  try {
    let edge = maxEdge;
    let quality = 0.86;
    let blob = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = drawScaled(image, edge);
      blob = await canvasToBlob(canvas, quality);
      if (blob.size <= maxBytes) break;
      if (quality > 0.55) {
        quality -= 0.12;
      } else {
        edge = Math.round(edge * 0.75);
        quality = 0.72;
      }
    }

    if (!blob || blob.size > maxBytes) {
      throw new Error("Фото слишком большое даже после сжатия");
    }

    return new File([blob], jpegName(file), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    image.close();
  }
}
