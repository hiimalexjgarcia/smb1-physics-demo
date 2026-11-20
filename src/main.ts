import './style.css';
import { CANVAS_HEIGHT, CANVAS_WIDTH, FIXED_STEP_MS, MAX_FRAME_DELTA_MS } from './config';
import { createIdleState, resetIdle, updateIdle } from './idleBehavior';
import { initInput, readInput } from './input';
import { render, updateCamera } from './render';
import { placePlayerOnGround, stepSimulation } from './simulation';
import { createPlayer, debugInfo, getPlayerPixelX, hasActiveMotion, type PlayerState } from './smbPhysics';

interface SimState {
  player: PlayerState;
}

interface ViewState {
  cameraX: number;
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
const idle = createIdleState(performance.now());

function resetSession(now = performance.now()): void {
  sim.player = createPlayer();
  placePlayerOnGround(sim.player);
  view.cameraX = 0;
  resetIdle(idle, now);
}

initInput(() => resetSession(performance.now()));

let lastTime = performance.now();
let accumulator = 0;

resetSession(lastTime);

function frame(now: number): void {
  accumulator += Math.min(MAX_FRAME_DELTA_MS, now - lastTime);
  lastTime = now;

  const input = readInput();
  const idleFrame = updateIdle(idle, {
    now,
    userInput: input,
    playerMoving: hasActiveMotion(sim.player),
    playerOnGround: sim.player.onGround,
  });

  while (accumulator >= FIXED_STEP_MS) {
    stepSimulation(sim.player, idleFrame.physicsInput);
    accumulator -= FIXED_STEP_MS;
  }

  view.cameraX = updateCamera(view.cameraX, getPlayerPixelX(sim.player), CANVAS_WIDTH);

  render(
    ctx,
    {
      player: sim.player,
      cameraX: view.cameraX,
      blinking: idleFrame.blinking,
      idleLooking: idleFrame.idleLooking,
      runHighlight: input.b,
    },
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
  );

  debugStateEl.textContent = `${debugInfo(sim.player, input)}\nattention: ${idleFrame.attentionState}`;
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
