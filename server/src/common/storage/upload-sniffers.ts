import { ALLOWED_IMAGE_TYPES, sniffImageType } from './image-sniff';
import type { UploadSniffer } from './object-store-multer.engine';

/**
 * The sniffers the multer engine runs on an upload's leading bytes. Each is a
 * pure function of the head and the client's claims, returning the type to
 * store or `null` to refuse before a byte reaches the bucket.
 *
 * This site uploads images only (covers, screenshots, the headshot and logo),
 * so there is one sniffer here; `com_mycotools_app` has the media one too.
 */

/** The four raster formats and nothing else (no SVG: stored XSS on a same-origin API). */
export const sniffImageUpload: UploadSniffer = (head) => {
  const mimeType = sniffImageType(head);
  if (!mimeType) return null;
  return { mimeType, extension: ALLOWED_IMAGE_TYPES.get(mimeType)! };
};
