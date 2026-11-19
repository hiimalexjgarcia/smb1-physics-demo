import './style.css';
import { initInput, readInput } from './input';
import { render, updateCamera } from './render';
import {
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
};

function scheduleNextBlink(now: number): void {
  presentation.blinkUntil = now + BLINK_DURATION_MIN_MS + Math.random() * BLINK_DURATION_RANGE_MS;
  presentation.nextBlinkAt = now + BLINK_INTERVAL_MIN_MS + Math.random() * BLINK_INTERVAL_RANGE_MS;
}

function resetBlinkSchedule(now: number): void {
  presentation.blinkUntil = 0;
  presentation.nextBlinkAt = now + BLINK_INITIAL_MIN_MS + Math.random() * BLINK_INITIAL_RANGE_MS;
}

function updateBlink(now: number): void {
  if (now >= presentation.nextBlinkAt) {
    scheduleNextBlink(now);
  }
}

function hasActiveInputOrMotion(input: Buttons, player: PlayerState): boolean {
  return (
    input.left ||
    input.right ||
    input.up ||
    input.down ||
    input.a ||
    input.b ||
    player.xSpeed !== 0 ||
    player.ySpeed !== 0 ||
    !player.onGround ||
    player.playerState !== PlayerMotionState.OnGround
  );
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
  resetBlinkSchedule(now);
}

function updateDebug(input: Buttons): void {
  debugStateEl.textContent = debugInfo(sim.player, input);
}

initInput(() => resetSession(performance.now()));

let lastTime = performance.now();
let accumulator = 0;

resetSession(lastTime);

function frame(now: number): void {
  accumulator += Math.min(MAX_FRAME_DELTA_MS, now - lastTime);
  lastTime = now;

  updateBlink(now);
  const input = readInput();

  while (accumulator >= FIXED_STEP_MS) {
    const prevPy = getPlayerPixelY(sim.player);
    stepPlayerPhysics(sim.player, input);
    resolveDemoGround(sim.player, GROUND_Y, PLAYER_HEIGHT);
    resolvePlatformLandings(sim.player, prevPy);
    accumulator -= FIXED_STEP_MS;
  }

  if (hasActiveInputOrMotion(input, sim.player)) {
    presentation.lastActiveAt = now;
  }

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
