import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDLE_BUTTONS, type Buttons } from '../src/controls';
import { createIdleState, type IdleState, updateIdle, type IdleUpdateOptions } from '../src/idleBehavior';

function tick(idle: IdleState, now: number, overrides: Partial<IdleUpdateOptions> = {}) {
  return updateIdle(idle, {
    now,
    userInput: IDLE_BUTTONS,
    playerMoving: false,
    playerOnGround: true,
    ...overrides,
  });
}

test('eye tracking starts at 5 seconds', () => {
  const idle = createIdleState(0, () => 0.5);

  assert.equal(tick(idle, 4999).idleLooking, false);
  assert.equal(tick(idle, 5000).idleLooking, true);
});

test('attention mode starts at 10 seconds with an immediate blink and hop', () => {
  const idle = createIdleState(0, () => 0.5);

  const before = tick(idle, 9999);
  assert.equal(before.attentionState, 'off');
  assert.equal(before.physicsInput.a, false);

  const atThreshold = tick(idle, 10000);
  assert.equal(atThreshold.attentionState, 'hopping');
  assert.equal(atThreshold.physicsInput.a, true);
  assert.equal(atThreshold.blinking, true);
});

test('autonomous hop motion does not reset the idle timer', () => {
  const idle = createIdleState(0, () => 0.5);

  tick(idle, 10000);
  const midHop = tick(idle, 10050, {
    playerMoving: true,
    playerOnGround: false,
  });

  assert.equal(midHop.attentionState, 'hopping');
  assert.equal(midHop.physicsInput.a, true);
  assert.equal(midHop.idleLooking, true);
});

test('real input cancels attention mode and restores normal input', () => {
  const idle = createIdleState(0, () => 0.5);
  const userInput: Buttons = { ...IDLE_BUTTONS, left: true };

  tick(idle, 10000);
  const afterInput = tick(idle, 10090, { userInput });

  assert.equal(afterInput.attentionState, 'off');
  assert.equal(afterInput.physicsInput.left, true);
  assert.equal(afterInput.physicsInput.a, false);
  assert.equal(afterInput.idleLooking, false);
});
