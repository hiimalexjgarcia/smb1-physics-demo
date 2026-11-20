import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GROUND_Y, PLAYER_HEIGHT } from '../src/config';
import { IDLE_BUTTONS, type Buttons } from '../src/controls';
import {
  PlayerMotionState,
  createPlayer,
  getPlayerPixelX,
  getPlayerPixelY,
  hasActiveMotion,
  landPlayerAt,
  resolveDemoGround,
  setPlayerPixelX,
  setPlayerPixelY,
  signedByte,
  stepPlayerPhysics,
} from '../src/smbPhysics';

const START_X = 0x1000;

function jumpHeight(holdFrames: number): number {
  const player = createPlayer();
  landPlayerAt(player, GROUND_Y - PLAYER_HEIGHT);
  setPlayerPixelX(player, START_X);

  const startY = getPlayerPixelY(player);
  let minY = startY;

  for (let frame = 0; frame < 120; frame++) {
    const input: Buttons = { ...IDLE_BUTTONS, a: frame < holdFrames };
    stepPlayerPhysics(player, input);
    resolveDemoGround(player, GROUND_Y, PLAYER_HEIGHT);
    minY = Math.min(minY, getPlayerPixelY(player));
  }

  return startY - minY;
}

function horizontalTravel(frames: number, direction: 'left' | 'right'): number {
  const player = createPlayer();
  setPlayerPixelX(player, START_X);

  const input: Buttons = { ...IDLE_BUTTONS, [direction]: true };
  for (let frame = 0; frame < frames; frame++) {
    stepPlayerPhysics(player, input);
  }

  return getPlayerPixelX(player) - START_X;
}

test('a short A hold produces a smaller jump than a sustained hold', () => {
  const shortHop = jumpHeight(5);
  const fullJump = jumpHeight(40);

  assert.ok(shortHop > 0, 'short hop should leave the ground');
  assert.ok(fullJump > shortHop, 'sustained hold should jump higher');
});

test('horizontal acceleration is near-symmetric left and right', () => {
  const right = horizontalTravel(60, 'right');
  const left = horizontalTravel(60, 'left');

  assert.ok(right > 0);
  assert.ok(left < 0);
  // NES borrow timing lets left acceleration lead by roughly one frame.
  assert.ok(Math.abs(Math.abs(left) - right) <= 2);
});

test('landPlayerAt resets vertical state consistently', () => {
  const player = createPlayer();
  setPlayerPixelY(player, 100);
  player.ySpeed = 0x80;
  player.yMoveForce = 0x55;
  player.yMFDummy = 0xaa;
  player.playerState = PlayerMotionState.Jumping;
  player.onGround = false;

  landPlayerAt(player, 200);

  assert.equal(getPlayerPixelY(player), 200);
  assert.equal(player.ySpeed, 0);
  assert.equal(player.yMoveForce, 0);
  assert.equal(player.yMFDummy, 0);
  assert.equal(player.playerState, PlayerMotionState.OnGround);
  assert.equal(player.onGround, true);
  assert.equal(hasActiveMotion(player), false);
});

test('signedByte is available for demo collision callers', () => {
  assert.equal(signedByte(0xff), -1);
  assert.equal(signedByte(0x01), 1);
});
