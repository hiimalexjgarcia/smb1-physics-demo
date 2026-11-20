/**
 * Small byte-oriented math helpers shared by SMB physics and demo collision.
 *
 * These preserve the 6502-style unsigned-carry / signed-byte semantics used by
 * the original routines while keeping carry/borrow handling in one place.
 */

/** Mask a number to an unsigned byte (0..255). */
export const u8 = (n: number): number => n & 0xff;

/** Interpret an unsigned byte as a signed value (-128..127). */
export const s8 = (n: number): number => {
  const v = n & 0xff;
  return v & 0x80 ? v - 256 : v;
};

/** Alias used by demo collision code. */
export const signedByte = s8;

/** Add unsigned bytes and return the masked result plus the carry bit. */
export function addWithCarry(a: number, b: number, extra = 0): { value: number; carry: number } {
  const sum = a + b + extra;
  return { value: u8(sum), carry: sum > 0xff ? 1 : 0 };
}

/** Subtract unsigned bytes and return the masked result plus the borrow bit. */
export function subWithBorrow(a: number, b: number): { value: number; borrow: number } {
  const diff = a - b;
  return { value: u8(diff), borrow: diff < 0 ? 1 : 0 };
}

/** 6502 sign-extension byte for a signed value: $ff when negative, $00 otherwise. */
export const signExtensionByte = (value: number): number => (value < 0 ? 0xff : 0x00);

/** High-byte delta form of sign extension: -1 when negative, 0 otherwise. */
export const signExtensionDelta = (value: number): number => (value < 0 ? -1 : 0);
