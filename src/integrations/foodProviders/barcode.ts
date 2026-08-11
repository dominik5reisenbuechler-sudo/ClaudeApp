/**
 * Barcode validation.
 *
 * EAN-8/13 and UPC-A all carry a modulo-10 check digit. Verifying it locally
 * catches a misread scan before it becomes a network request and a "product not
 * found" message — which would otherwise send the user hunting for a product
 * that exists perfectly well under the barcode they actually have.
 */

export type BarcodeFormat = 'ean8' | 'upca' | 'ean13';

const LENGTH_TO_FORMAT: Record<number, BarcodeFormat> = {
  8: 'ean8',
  12: 'upca',
  13: 'ean13',
};

/** Strip anything a scanner or a human might add around the digits. */
export function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * The modulo-10 check digit for a code *without* its check digit.
 *
 * Weights alternate 3, 1 counting from the check-digit end, which is why the
 * same routine works for all three lengths rather than needing one per format.
 */
export function computeCheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  for (let i = digitsWithoutCheck.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
    sum += Number(digitsWithoutCheck[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

export function barcodeFormat(barcode: string): BarcodeFormat | null {
  return LENGTH_TO_FORMAT[normalizeBarcode(barcode).length] ?? null;
}

export function isValidBarcode(raw: string): boolean {
  const digits = normalizeBarcode(raw);
  if (!LENGTH_TO_FORMAT[digits.length]) return false;

  const body = digits.slice(0, -1);
  const check = Number(digits[digits.length - 1]);
  return computeCheckDigit(body) === check;
}

/**
 * A UPC-A code is an EAN-13 with a leading zero. Product databases index on the
 * 13-digit form, so normalising here means a US barcode and its European
 * equivalent resolve to the same cached row instead of two.
 */
export function toEan13(raw: string): string | null {
  const digits = normalizeBarcode(raw);
  if (digits.length === 13) return digits;
  if (digits.length === 12) return `0${digits}`;
  return null;
}
