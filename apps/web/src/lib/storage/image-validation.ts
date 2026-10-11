import { createHash } from "node:crypto";
import { ApiRequestError } from "@/lib/api/errors";

export const CLIENT_LOGO_LIMIT_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface ValidatedImage {
  bytes: Uint8Array;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  extension: "png" | "jpg" | "webp";
  width: number;
  height: number;
  sha256: string;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 24 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 30
    && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF"
    && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] ?? 0) * 256 + (bytes[offset + 3] ?? 0);
    if (length < 2) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker ?? 0)) {
      return {
        height: (bytes[offset + 5] ?? 0) * 256 + (bytes[offset + 6] ?? 0),
        width: (bytes[offset + 7] ?? 0) * 256 + (bytes[offset + 8] ?? 0),
      };
    }
    offset += length + 2;
  }
  throw new ApiRequestError("INVALID_IMAGE", "JPEG dimensions could not be read.", { status: 422 });
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } {
  const chunk = new TextDecoder().decode(bytes.slice(12, 16));
  if (chunk === "VP8X") {
    return {
      width: 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16),
      height: 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16),
    };
  }
  throw new ApiRequestError("INVALID_IMAGE", "Only extended WebP images are accepted.", { status: 422 });
}

export function validateClientLogo(bytes: Uint8Array, declaredType: string | null): ValidatedImage {
  if (bytes.byteLength === 0) throw new ApiRequestError("EMPTY_UPLOAD", "A logo image is required.", { status: 400 });
  if (bytes.byteLength > CLIENT_LOGO_LIMIT_BYTES) throw new ApiRequestError("BODY_TOO_LARGE", "Client logos may not exceed 5 MiB.", { status: 413 });
  if (!declaredType || !ALLOWED_TYPES.has(declaredType)) {
    throw new ApiRequestError("UNSUPPORTED_IMAGE_TYPE", "Client logos must be PNG, JPEG, or WebP.", { status: 415 });
  }

  let detected: Pick<ValidatedImage, "contentType" | "extension" | "width" | "height">;
  if (isPng(bytes)) detected = { contentType: "image/png", extension: "png", ...pngDimensions(bytes) };
  else if (isJpeg(bytes)) detected = { contentType: "image/jpeg", extension: "jpg", ...jpegDimensions(bytes) };
  else if (isWebp(bytes)) detected = { contentType: "image/webp", extension: "webp", ...webpDimensions(bytes) };
  else throw new ApiRequestError("INVALID_IMAGE", "The uploaded file is not a supported image.", { status: 422 });

  if (detected.contentType !== declaredType) throw new ApiRequestError("IMAGE_TYPE_MISMATCH", "Declared and detected image types do not match.", { status: 422 });
  if (detected.width < 1 || detected.height < 1 || detected.width > 4096 || detected.height > 4096) {
    throw new ApiRequestError("INVALID_IMAGE_DIMENSIONS", "Logo dimensions must be between 1 and 4096 pixels.", { status: 422 });
  }
  return { bytes, ...detected, sha256: createHash("sha256").update(bytes).digest("hex") };
}
