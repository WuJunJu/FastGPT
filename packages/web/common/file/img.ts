export type CompressImgProps = {
  maxW?: number;
  maxH?: number;
  maxSize?: number;
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('图片压缩异常'));
        resolve(blob);
      },
      type,
      quality
    );
  });

const getCompressedFilename = ({
  filename,
  outputType
}: {
  filename: string;
  outputType: string;
}) => {
  const ext = (() => {
    if (outputType === 'image/jpeg') return 'jpg';
    if (outputType === 'image/webp') return 'webp';
    if (outputType === 'image/png') return 'png';
    return '';
  })();
  if (!ext) return filename;

  // If filename already matches type, keep it.
  if (new RegExp(`\\.${ext}$`, 'i').test(filename)) return filename;

  return filename.replace(/\.[^.]+$/, '') + `.${ext}`;
};

export const compressImageFile = async ({
  file,
  maxSide = 1536,
  maxBytes = 1024 * 1024,
  outputType = 'image/jpeg',
  initialQuality = 0.9,
  minQuality = 0.5,
  maxSideTries = 3,
  maxQualityTries = 6
}: {
  file: File;
  maxSide?: number;
  maxBytes?: number;
  outputType?: 'image/jpeg' | 'image/webp' | 'image/png';
  initialQuality?: number;
  minQuality?: number;
  maxSideTries?: number;
  maxQualityTries?: number;
}) => {
  // Skip non-image
  if (!file.type?.startsWith('image/')) return file;
  // Small enough
  if (file.size <= maxBytes) return file;

  // Some formats (eg: heic) may not be decodable by browser canvas; fall back to original.
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = objectUrl;
    });

    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    if (!naturalWidth || !naturalHeight) return file;

    let currentMaxSide = maxSide;
    let bestBlob: Blob | undefined;

    for (let sideTry = 0; sideTry < maxSideTries; sideTry++) {
      const scale = Math.min(1, currentMaxSide / Math.max(naturalWidth, naturalHeight));
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      // JPEG 不支持透明通道，先铺白底避免透明区域变黑
      if (outputType === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(img, 0, 0, width, height);

      let quality = initialQuality;
      for (let qTry = 0; qTry < maxQualityTries; qTry++) {
        const blob = await canvasToBlob(canvas, outputType, quality);
        if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
        if (blob.size <= maxBytes) {
          const compressedFile = new File(
            [blob],
            getCompressedFilename({ filename: file.name, outputType }),
            {
              type: outputType
            }
          );
          // Ensure we never increase size
          return compressedFile.size < file.size ? compressedFile : file;
        }
        quality = Math.max(minQuality, quality - 0.1);
      }

      // Next try: reduce max side
      currentMaxSide = Math.max(512, Math.floor(currentMaxSide * 0.8));
      canvas.remove();
    }

    if (!bestBlob) return file;

    const fallbackFile = new File(
      [bestBlob],
      getCompressedFilename({ filename: file.name, outputType }),
      {
        type: outputType
      }
    );
    return fallbackFile.size < file.size ? fallbackFile : file;
  } catch (error) {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const compressBase64Img = ({
  base64Img,
  maxW = 1080,
  maxH = 1080,
  maxSize = 1024 * 500 // 500kb
}: CompressImgProps & {
  base64Img: string;
}) => {
  return new Promise<string>((resolve, reject) => {
    const fileType =
      /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,/.exec(base64Img)?.[1] || 'image/jpeg';

    const img = new Image();
    img.src = base64Img;
    img.onload = async () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxW) {
          height *= maxW / width;
          width = maxW;
        }
      } else {
        if (height > maxH) {
          width *= maxH / height;
          height = maxH;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return reject('压缩图片异常');
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL(fileType, 1);
      // 移除 canvas 元素
      canvas.remove();

      if (compressedDataUrl.length > maxSize) {
        return reject('图片太大了');
      }

      resolve(compressedDataUrl);
    };
    img.onerror = reject;
  });
};
