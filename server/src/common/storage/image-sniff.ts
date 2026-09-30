/**
 * Identifies an image from its leading bytes.
 *
 * The declared `Content-Type` on a multipart part is a claim by the client, and
 * the extension is a claim by whoever named the file. Neither is evidence of
 * anything. This reads what the bytes actually are, so a `.png` containing a
 * script is refused rather than stored under a name that lies about it.
 *
 * An allowlist of four raster formats, and nothing else — deliberately not
 * `image/svg+xml`. This API is same-origin with the site, so an inline SVG is
 * stored XSS with the session cookie in reach. A pasted URL may point at an
 * SVG on somebody else's origin; an upload may not.
 */
export const ALLOWED_IMAGE_TYPES: ReadonlyMap<string, string> = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
]);

export const isAllowedImageType = (mime: string): boolean =>
  ALLOWED_IMAGE_TYPES.has(mime);

const startsWith = (buffer: Buffer, ...bytes: number[]): boolean =>
  bytes.every((byte, index) => buffer[index] === byte);

/** The type these bytes are, or `null` for anything not on the allowlist. */
export function sniffImageType(buffer: Buffer): string | null {
  if (startsWith(buffer, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return 'image/png';
  }
  if (startsWith(buffer, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(buffer, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}
