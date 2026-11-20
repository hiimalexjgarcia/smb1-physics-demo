import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addWithCarry,
  s8,
  signExtensionByte,
  signExtensionDelta,
  subWithBorrow,
  u8,
} from '../src/byteMath';

test('byte masking and signed interpretation', () => {
  assert.equal(u8(0x1ff), 0xff);
  assert.equal(s8(0x7f), 127);
  assert.equal(s8(0x80), -128);
  assert.equal(s8(0xfc), -4);
});

test('addWithCarry reports overflow past one byte', () => {
  assert.deepEqual(addWithCarry(0x10, 0x20), { value: 0x30, carry: 0 });
  assert.deepEqual(addWithCarry(0xff, 0x01), { value: 0x00, carry: 1 });
  assert.deepEqual(addWithCarry(0xff, 0x00, 1), { value: 0x00, carry: 1 });
});

test('subWithBorrow reports underflow below zero', () => {
  assert.deepEqual(subWithBorrow(0x30, 0x10), { value: 0x20, borrow: 0 });
  assert.deepEqual(subWithBorrow(0x00, 0x01), { value: 0xff, borrow: 1 });
});

test('sign extension helpers cover both encodings', () => {
  assert.equal(signExtensionByte(-4), 0xff);
  assert.equal(signExtensionByte(4), 0x00);
  assert.equal(signExtensionDelta(-4), -1);
  assert.equal(signExtensionDelta(4), 0);
});
