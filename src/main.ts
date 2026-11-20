import './style.css';
import { initInput, readInput } from './input';
import { render, updateCamera } from './render';
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
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FIXED_STEP_MS,
  GROUND_Y,
  IDLE_ATTENTION_DELAY_MS,
  IDLE_LOOK_DELAY_MS,
  MAX_FRAME_DELTA_MS,
  PLAYER_HEIGHT,
} from './config';
import { resolvePlatformLandings } from './world';
import {
  PlayerMotionState,
  createPlayer,
  debugInfo,
  getPlayerPixelX,
  getPlayerPixelY,
  resolveDemoGround,
  setPlayerPixelY,
  stepPlayerPhysics,
  type Buttons,
  type PlayerState,
} from './smbPhysics';

interface SimState {
  player: PlayerState;
}

interface ViewState {
  cameraX: number;
}

interface PresentationState {
  blinkUntil: number;
  nextBlinkAt: number;
  lastActiveAt: number;
  attentionMode: boolean;
  attentionJumpActive: boolean;
  attentionJumpHoldUntil: number;
  nextAttentionJumpAt: number;
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const maybeCtx = canvas.getContext('2d');
const debugStateEl = document.getElementById('debug-state') as HTMLPreElement;
if (!maybeCtx) {
  throw new Error('Canvas 2D context unavailable');
}
const ctx = maybeCtx;

const sim: SimState = { player: createPlayer() };
const view: ViewState = { cameraX: 0 };
const presentation: PresentationState = {
  blinkUntil: 0,
  nextBlinkAt: 0,
  lastActiveAt: 0,
  attentionMode: false,
  attentionJumpActive: false,
  attentionJumpHoldUntil: 0,
  nextAttentionJumpAt: 0,
};

function scheduleNextBlink(now: number, frequent = false): void {
  const intervalMin = frequent ? ATTENTION_BLINK_INTERVAL_MIN_MS : BLINK_INTERVAL_MIN_MS;
  const intervalRange = frequent ? ATTENTION_BLINK_INTERVAL_RANGE_MS : BLINK_INTERVAL_RANGE_MS;

  presentation.blinkUntil = now + BLINK_DURATION_MIN_MS + Math.random() * BLINK_DURATION_RANGE_MS;
  presentation.nextBlinkAt = now + intervalMin + Math.random() * intervalRange;
}

function resetBlinkSchedule(now: number, frequent = false): void {
  presentation.blinkUntil = 0;
  if (frequent) {
    scheduleNextBlink(now, true);
    return;
  }
  presentation.nextBlinkAt = now + BLINK_INITIAL_MIN_MS + Math.random() * BLINK_INITIAL_RANGE_MS;
}

function updateBlink(now: number, frequent = false): void {
  if (now >= presentation.nextBlinkAt) {
    scheduleNextBlink(now, frequent);
  }
}

function hasActiveInput(input: Buttons): boolean {
  return input.left || input.right || input.up || input.down || input.a || input.b;
}

function hasActiveMotion(player: PlayerState): boolean {
  return (
    player.xSpeed !== 0 ||
    player.ySpeed !== 0 ||
    !player.onGround ||
    player.playerState !== PlayerMotionState.OnGround
  );
}

function hasActiveInputOrMotion(input: Buttons, player: PlayerState, ignoreMotion: boolean): boolean {
  return hasActiveInput(input) || (!ignoreMotion && hasActiveMotion(player));
}

function clearAttentionJump(): void {
  presentation.attentionJumpActive = false;
  presentation.attentionJumpHoldUntil = 0;
}

function enterAttentionMode(now: number): void {
  presentation.attentionMode = true;
  presentation.nextAttentionJumpAt = now;
  resetBlinkSchedule(now, true);
}

function exitAttentionMode(now: number): void {
  presentation.attentionMode = false;
  clearAttentionJump();
  resetBlinkSchedule(now);
}

/** Build the physics input for this frame, adding a short A press for attention hops. */
function inputForFrame(now: number, userInput: Buttons): Buttons {
  if (!presentation.attentionMode) return userInput;

  if (
    !presentation.attentionJumpActive &&
    sim.player.onGround &&
    now >= presentation.nextAttentionJumpAt
  ) {
    presentation.attentionJumpActive = true;
    presentation.attentionJumpHoldUntil = now + ATTENTION_JUMP_HOLD_MS;
    presentation.nextAttentionJumpAt =
      now + ATTENTION_JUMP_INTERVAL_MIN_MS + Math.random() * ATTENTION_JUMP_INTERVAL_RANGE_MS;
  }

  if (!presentation.attentionJumpActive || now >= presentation.attentionJumpHoldUntil) {
    return userInput;
  }

  return { ...userInput, a: true };
}

function finishAttentionJump(now: number): void {
  if (
    presentation.attentionJumpActive &&
    sim.player.onGround &&
    now >= presentation.attentionJumpHoldUntil
  ) {
    clearAttentionJump();
  }
}

function placePlayerOnGround(player: PlayerState): void {
  setPlayerPixelY(player, GROUND_Y - PLAYER_HEIGHT);
  player.onGround = true;
  player.playerState = PlayerMotionState.OnGround;
}

function resetSession(now = performance.now()): void {
  sim.player = createPlayer();
  placePlayerOnGround(sim.player);
  view.cameraX = 0;
  presentation.lastActiveAt = now;
  presentation.attentionMode = false;
  presentation.nextAttentionJumpAt = now + IDLE_ATTENTION_DELAY_MS;
  clearAttentionJump();
  resetBlinkSchedule(now);
}

function updateDebug(input: Buttons): void {
  const attentionState = presentation.attentionMode
    ? presentation.attentionJumpActive
      ? 'hopping'
      : 'active'
    : 'off';
  debugStateEl.textContent = `${debugInfo(sim.player, input)}\nattention: ${attentionState}`;
}

initInput(() => resetSession(performance.now()));

let lastTime = performance.now();
let accumulator = 0;

resetSession(lastTime);

function frame(now: number): void {
  accumulator += Math.min(MAX_FRAME_DELTA_MS, now - lastTime);
  lastTime = now;

  const input = readInput();

  // Autonomous attention hops should not reset the idle timer; real input does.
  if (hasActiveInputOrMotion(input, sim.player, presentation.attentionJumpActive)) {
    presentation.lastActiveAt = now;
  }

  const attentionMode = now - presentation.lastActiveAt >= IDLE_ATTENTION_DELAY_MS;
  if (attentionMode !== presentation.attentionMode) {
    if (attentionMode) {
      enterAttentionMode(now);
    } else {
      exitAttentionMode(now);
    }
  }

  updateBlink(now, presentation.attentionMode);
  const physicsInput = inputForFrame(now, input);

  while (accumulator >= FIXED_STEP_MS) {
    const prevPy = getPlayerPixelY(sim.player);
    stepPlayerPhysics(sim.player, physicsInput);
    resolveDemoGround(sim.player, GROUND_Y, PLAYER_HEIGHT);
    resolvePlatformLandings(sim.player, prevPy);
    accumulator -= FIXED_STEP_MS;
  }

  finishAttentionJump(now);

  const idleLooking = now - presentation.lastActiveAt >= IDLE_LOOK_DELAY_MS;
  const blinking = now < presentation.blinkUntil;
  view.cameraX = updateCamera(view.cameraX, getPlayerPixelX(sim.player), CANVAS_WIDTH);

  render(
    ctx,
    {
      player: sim.player,
      cameraX: view.cameraX,
      blinking,
      idleLooking,
      runHighlight: input.b,
    },
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
  );

  updateDebug(input);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
