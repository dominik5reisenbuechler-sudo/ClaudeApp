import { describe, expect, it } from 'vitest';

import {
  barcodeFormat,
  computeCheckDigit,
  isValidBarcode,
  normalizeBarcode,
  toEan13,
} from './barcode';

describe('normalizeBarcode', () => {
  it('strips spaces, dashes and anything else non-numeric', () => {
    expect(normalizeBarcode(' 5000 112-546415 ')).toBe('5000112546415');
  });
});

describe('computeCheckDigit', () => {
  it('computes the EAN-13 check digit', () => {
    // 5000112546415 — Coca-Cola 330 ml, a well-known valid EAN-13.
    expect(computeCheckDigit('500011254641')).toBe(5);
  });

  it('computes the UPC-A check digit', () => {
    // 036000291452 — the classic Wrigley's gum UPC from the format's spec.
    expect(computeCheckDigit('03600029145')).toBe(2);
  });

  it('computes the EAN-8 check digit', () => {
    expect(computeCheckDigit('9638507')).toBe(4);
  });
});

describe('isValidBarcode', () => {
  it('accepts valid codes of each supported length', () => {
    expect(isValidBarcode('5000112546415')).toBe(true);
    expect(isValidBarcode('036000291452')).toBe(true);
    expect(isValidBarcode('96385074')).toBe(true);
  });

  it('rejects a code whose check digit does not match', () => {
    expect(isValidBarcode('5000112546416')).toBe(false);
    expect(isValidBarcode('036000291453')).toBe(false);
  });

  it('rejects codes of an unsupported length', () => {
    expect(isValidBarcode('12345')).toBe(false);
    expect(isValidBarcode('12345678901234')).toBe(false);
    expect(isValidBarcode('')).toBe(false);
  });

  it('accepts a formatted code once separators are stripped', () => {
    expect(isValidBarcode('5000112-546415')).toBe(true);
  });
});

describe('barcodeFormat', () => {
  it('identifies the format by length', () => {
    expect(barcodeFormat('5000112546415')).toBe('ean13');
    expect(barcodeFormat('036000291452')).toBe('upca');
    expect(barcodeFormat('96385074')).toBe('ean8');
    expect(barcodeFormat('123')).toBeNull();
  });
});

describe('toEan13', () => {
  it('pads a UPC-A to 13 digits so both forms hit the same cached row', () => {
    expect(toEan13('036000291452')).toBe('0036000291452');
  });

  it('leaves an EAN-13 alone', () => {
    expect(toEan13('5000112546415')).toBe('5000112546415');
  });

  it('returns null for a length it cannot widen', () => {
    expect(toEan13('96385074')).toBeNull();
  });
});
