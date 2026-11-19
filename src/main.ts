import './style.css';
import { createPlayer, stepPlayer, getPlayerPixelX, getPlayerPixelY, setPlayerPixelY, debugInfo, type Buttons } from './smbPhysics';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const debugEl = document.getElementById('debug') as HTMLPreElement;

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GROUND_Y = 400;

const keys = new Set<string>();
const touchButtons: Buttons = {
  up: false,
  down: false,
  left: false,
  right: false,
  a: false,
  b: false,
};

function readButtons(): Buttons {
  return {
    up: keys.has('KeyW') || keys.has('ArrowUp') || touchButtons.up,
    down: keys.has('KeyS') || keys.has('ArrowDown') || touchButtons.down,
    left: keys.has('KeyA') || keys.has('ArrowLeft') || touchButtons.left,
    right: keys.has('KeyD') || keys.has('ArrowRight') || touchButtons.right,
    a: keys.has('Space') || touchButtons.a,
    b: keys.has('ShiftLeft') || keys.has('ShiftRight') || touchButtons.b,
  };
}

let player = createPlayer();
let cameraX = 0;

function reset() {
  player = createPlayer();
  // place on ground
  setPlayerPixelY(player, GROUND_Y - 32);
  player.onGround = true;
  player.playerState = 0;
  cameraX = 0;
}

window.addEventListener('keydown', (e) => {
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
  keys.add(e.code);
  if (e.code === 'KeyR') reset();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

function initTouchControls() {
  const controls = document.getElementById('controls');
  if (!controls) return;

  const activePointers = new Map<number, keyof Buttons>();

  const setPressed = (name: keyof Buttons, pressed: boolean) => {
    touchButtons[name] = pressed;
    const el = controls.querySelector<HTMLElement>(`[data-btn="${name}"]`);
    if (el) el.classList.toggle('active', pressed);
  };

  const getButtonName = (el: HTMLElement | null): keyof Buttons | null => {
    const btnEl = el?.closest<HTMLElement>('[data-btn]');
    const name = btnEl?.dataset.btn;
    if (!name) return null;
    if (name === 'up' || name === 'down' || name === 'left' || name === 'right' || name === 'a' || name === 'b') {
      return name;
    }
    return null;
  };

  controls.addEventListener('contextmenu', (e) => e.preventDefault());

  controls.addEventListener('pointerdown', (e) => {
    const name = getButtonName(e.target as HTMLElement);
    if (!name) return;
    e.preventDefault();
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-btn]');
    target?.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, name);
    setPressed(name, true);
  });

  const releasePointer = (e: PointerEvent) => {
    const name = activePointers.get(e.pointerId);
    if (!name) return;
    activePointers.delete(e.pointerId);
    const stillHeld = Array.from(activePointers.values()).includes(name);
    if (!stillHeld) setPressed(name, false);
  };

  controls.addEventListener('pointerup', releasePointer);
  controls.addEventListener('pointercancel', releasePointer);
  controls.addEventListener('lostpointercapture', releasePointer as EventListener);

  window.addEventListener('blur', () => {
    activePointers.clear();
    (Object.keys(touchButtons) as (keyof Buttons)[]).forEach((k) => setPressed(k, false));
  });

  document.getElementById('reset-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    reset();
  });
}

initTouchControls();

const platforms = [
  { x: 320, y: 320, w: 96, h: 16 },
  { x: 520, y: 250, w: 96, h: 16 },
  { x: 720, y: 320, w: 128, h: 16 },
  { x: 980, y: 270, w: 96, h: 16 },
  { x: 1180, y: 330, w: 160, h: 16 },
];

function applyPlatformLandings(prevPy: number) {
  const px = getPlayerPixelX(player);
  const py = getPlayerPixelY(player);
  const pw = 16, ph = 32;
  const ySpeedSigned = (player.ySpeed & 0x80) ? player.ySpeed - 256 : player.ySpeed;
  if (ySpeedSigned < 0) return; // moving up, don't land on top
  for (const plat of platforms) {
    const overlapX = px < plat.x + plat.w && px + pw > plat.x;
    const prevBottom = prevPy + ph;
    const bottom = py + ph;
    if (overlapX && prevBottom <= plat.y + 4 && bottom >= plat.y && bottom <= plat.y + 14) {
      setPlayerPixelY(player, plat.y - ph);
      player.ySpeed = 0;
      player.yMoveForce = 0;
      player.yMFDummy = 0;
      player.playerState = 0;
      player.onGround = true;
    }
  }
}

function draw() {
  ctx.fillStyle = '#5c94fc';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const px = getPlayerPixelX(player);
  const py = getPlayerPixelY(player);
  const targetCam = px - WIDTH * 0.35;
  cameraX += (targetCam - cameraX) * 0.12;
  if (cameraX < 0) cameraX = 0;

  // Ground
  ctx.fillStyle = '#c84c0c';
  ctx.fillRect(-cameraX, GROUND_Y, 6000, HEIGHT - GROUND_Y);
  ctx.fillStyle = '#d85c18';
  for (let x = -((cameraX % 32) + 32); x < WIDTH + 32; x += 32) {
    ctx.fillRect(x, GROUND_Y, 31, 6);
  }
  ctx.fillStyle = '#00000022';
  for (let x = -((cameraX % 32) + 32); x < WIDTH + 32; x += 32) {
    ctx.fillRect(x, GROUND_Y + 6, 31, 2);
  }

  // Platforms
  for (const p of platforms) {
    ctx.fillStyle = '#b85c00';
    ctx.fillRect(p.x - cameraX, p.y, p.w, p.h);
    ctx.fillStyle = '#e8a020';
    ctx.fillRect(p.x - cameraX, p.y, p.w, 4);
  }

  // Player block (16x32)
  const pw = 16, ph = 32;
  const sx = px - cameraX;
  const sy = py;
  ctx.fillStyle = '#e02020';
  ctx.fillRect(sx, sy, pw, ph);
  ctx.fillStyle = '#f8d878';
  ctx.fillRect(sx + 2, sy + 4, 12, 10);
  ctx.fillStyle = '#6b3f00';
  if (player.facingDir === 1) ctx.fillRect(sx + 9, sy + 7, 4, 3);
  else ctx.fillRect(sx + 3, sy + 7, 4, 3);
  if (readButtons().b) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - 1, sy - 1, pw + 2, ph + 2);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(8, 8, 240, 20);
  ctx.fillStyle = '#fff';
  ctx.font = '12px monospace';
  ctx.fillText(`X:${Math.floor(px)} Y:${Math.floor(py)} state:${player.playerState}`, 14, 22);
}

let last = performance.now();
let acc = 0;
const STEP = 1000 / 60;

reset();

function frame(now: number) {
  acc += Math.min(100, now - last);
  last = now;
  const btn = readButtons();
  while (acc >= STEP) {
    const prevPy = getPlayerPixelY(player);
    stepPlayer(player, btn, GROUND_Y);
    applyPlatformLandings(prevPy);
    acc -= STEP;
  }
  draw();
  debugEl.textContent =
    debugInfo(player, btn) +
    "\n\nControls: WASD move, SPACE jump (A), SHIFT run (B), R reset\n" +
    "SMB1-derived: ProcJumping jump tables/tiers, JumpSwimSub variable-height (A hold + DiffToHaltJump),\n" +
    "ImposeGravity velocity integration + VerticalForce/VerticalForceDown, X_Physics speed/friction tiers.";
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
