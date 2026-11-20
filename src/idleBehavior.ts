import {
  ATTENTION_BLINK_INTERVAL_MIN_MS,
  ATTENTION_BLINK_INTERVAL_RANGE_MS,
  ATTENTION_JUMP_HOLD_MS,
  ATTENTION_JUMP_INTERVAL_MIN_MS,
  ATTENTION_JUMP_INTERVAL_RANGE_MS,
  BLINK_DURATION_MIN_MS,
  BLINK_DURATION_RANGE_MS,
  BLINK_INITIAL_MIN_MS,
  BLINK_INITIAL_RANGE_MS,
  BLINK_INTERVAL_MIN_MS,
  BLINK_INTERVAL_RANGE_MS,
  IDLE_ATTENTION_DELAY_MS,
  IDLE_LOOK_DELAY_MS,
} from './config';
import type { Buttons } from './controls';

export type AttentionState = 'off' | 'active' | 'hopping';

/** Mutable timing state for idle/presentation behavior. */
export interface IdleState {
  blinkUntil: number;
  nextBlinkAt: number;
  lastActiveAt: number;
  attentionMode: boolean;
  attentionJumpActive: boolean;
  attentionJumpHoldUntil: number;
  nextAttentionJumpAt: number;
  /** Injectable for deterministic tests. */
  random: () => number;
}

export interface IdleFrame {
  blinking: boolean;
  idleLooking: boolean;
  physicsInput: Buttons;
  attentionState: AttentionState;
}

export interface IdleUpdateOptions {
  now: number;
  userInput: Buttons;
  /** True when the player is still moving under physics. */
  playerMoving: boolean;
  /** True when the player is standing on ground or a platform. */
  playerOnGround: boolean;
}

export function createIdleState(now: number, random: () => number = Math.random): IdleState {
  const idle: IdleState = {
    blinkUntil: 0,
    nextBlinkAt: 0,
    lastActiveAt: now,
    attentionMode: false,
    attentionJumpActive: false,
    attentionJumpHoldUntil: 0,
    nextAttentionJumpAt: now + IDLE_ATTENTION_DELAY_MS,
    random,
  };
  resetBlinkSchedule(idle, now, false);
  return idle;
}

export function resetIdle(idle: IdleState, now: number): void {
  idle.lastActiveAt = now;
  idle.attentionMode = false;
  idle.nextAttentionJumpAt = now + IDLE_ATTENTION_DELAY_MS;
  clearAttentionJump(idle);
  resetBlinkSchedule(idle, now, false);
}

/**
 * Advance idle/presentation state for this frame.
 *
 * Autonomous attention hops are suppressed from the activity check so they do
 * not reset the idle timers; real input and ordinary player motion do.
 */
export function updateIdle(idle: IdleState, options: IdleUpdateOptions): IdleFrame {
  const { now, userInput, playerMoving, playerOnGround } = options;

  clearLandedAttentionJump(idle, now, playerOnGround);

  const userInputActive = hasActiveInput(userInput);
  if (userInputActive || (!idle.attentionJumpActive && playerMoving)) {
    idle.lastActiveAt = now;
  }

  const attentionMode = now - idle.lastActiveAt >= IDLE_ATTENTION_DELAY_MS;
  if (attentionMode !== idle.attentionMode) {
    if (attentionMode) {
      enterAttentionMode(idle, now);
    } else {
      exitAttentionMode(idle, now);
    }
  }

  updateBlink(idle, now, idle.attentionMode);
  const physicsInput = physicsInputFor(idle, now, userInput, playerOnGround);

  return {
    blinking: now < idle.blinkUntil,
    idleLooking: now - idle.lastActiveAt >= IDLE_LOOK_DELAY_MS,
    physicsInput,
    attentionState: getAttentionState(idle),
  };
}

function hasActiveInput(input: Buttons): boolean {
  return input.left || input.right || input.up || input.down || input.a || input.b;
}

function startBlink(idle: IdleState, now: number, frequent: boolean): void {
  const intervalMin = frequent ? ATTENTION_BLINK_INTERVAL_MIN_MS : BLINK_INTERVAL_MIN_MS;
  const intervalRange = frequent ? ATTENTION_BLINK_INTERVAL_RANGE_MS : BLINK_INTERVAL_RANGE_MS;

  idle.blinkUntil = now + BLINK_DURATION_MIN_MS + idle.random() * BLINK_DURATION_RANGE_MS;
  idle.nextBlinkAt = now + intervalMin + idle.random() * intervalRange;
}

function resetBlinkSchedule(idle: IdleState, now: number, frequent: boolean): void {
  idle.blinkUntil = 0;
  if (frequent) {
    startBlink(idle, now, true);
    return;
  }
  idle.nextBlinkAt = now + BLINK_INITIAL_MIN_MS + idle.random() * BLINK_INITIAL_RANGE_MS;
}

function updateBlink(idle: IdleState, now: number, frequent: boolean): void {
  if (now >= idle.nextBlinkAt) {
    startBlink(idle, now, frequent);
  }
}

function clearAttentionJump(idle: IdleState): void {
  idle.attentionJumpActive = false;
  idle.attentionJumpHoldUntil = 0;
}

function clearLandedAttentionJump(idle: IdleState, now: number, playerOnGround: boolean): void {
  if (idle.attentionJumpActive && playerOnGround && now >= idle.attentionJumpHoldUntil) {
    clearAttentionJump(idle);
  }
}

function enterAttentionMode(idle: IdleState, now: number): void {
  idle.attentionMode = true;
  idle.nextAttentionJumpAt = now;
  resetBlinkSchedule(idle, now, true);
}

function exitAttentionMode(idle: IdleState, now: number): void {
  idle.attentionMode = false;
  clearAttentionJump(idle);
  resetBlinkSchedule(idle, now, false);
}

function physicsInputFor(
  idle: IdleState,
  now: number,
  userInput: Buttons,
  playerOnGround: boolean,
): Buttons {
  if (!idle.attentionMode) return userInput;

  if (
    !idle.attentionJumpActive &&
    playerOnGround &&
    now >= idle.nextAttentionJumpAt
  ) {
    idle.attentionJumpActive = true;
    idle.attentionJumpHoldUntil = now + ATTENTION_JUMP_HOLD_MS;
    idle.nextAttentionJumpAt =
      now + ATTENTION_JUMP_INTERVAL_MIN_MS + idle.random() * ATTENTION_JUMP_INTERVAL_RANGE_MS;
  }

  if (!idle.attentionJumpActive || now >= idle.attentionJumpHoldUntil) {
    return userInput;
  }

  return { ...userInput, a: true };
}

function getAttentionState(idle: IdleState): AttentionState {
  if (!idle.attentionMode) return 'off';
  return idle.attentionJumpActive ? 'hopping' : 'active';
}
