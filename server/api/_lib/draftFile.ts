export const MAX_DRAFT_FILE_BYTES = 2 * 1024 * 1024;
export const draftFileTypes = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type DraftFileType = typeof draftFileTypes[number];

/** Format boundary checks, not a document sanitiser. PDFs are served as downloads. */
export function validDraftFile(bytes: Buffer, contentType: unknown): contentType is DraftFileType {
  if (!bytes.length || bytes.length > MAX_DRAFT_FILE_BYTES) return false;
  if (contentType === 'image/jpeg') return bytes.length >= 5 && bytes.subarray(0, 3).equals(Buffer.from([255,216,255])) && bytes.subarray(-2).equals(Buffer.from([255,217]));
  if (contentType === 'image/png') return bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16) === 'IHDR' && bytes.subarray(-12).equals(Buffer.from([0,0,0,0,73,69,78,68,174,66,96,130]));
  if (contentType === 'application/pdf') return /^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(bytes.toString('ascii',0,10)) && /%%EOF\s*$/.test(bytes.subarray(-1024).toString('ascii'));
  return false;
}
export function decodeDraftFile(encoded: unknown, contentType: unknown) {
  if (typeof encoded !== 'string' || encoded.length > Math.ceil(MAX_DRAFT_FILE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const bytes = Buffer.from(encoded, 'base64');
  return bytes.toString('base64') === encoded && validDraftFile(bytes, contentType) ? { bytes, contentType } : null;
}
export function draftFileExtension(type: string) { return type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : 'jpg'; }
