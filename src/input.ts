import type { Buttons } from './smbPhysics';

const PREVENTED_KEYS = new Set([
  'Space',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ShiftLeft',
  'ShiftRight',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

const keys = new Set<string>();
const touchButtons: Buttons = {
  up: false,
  down: false,
  left: false,
  right: false,
  a: false,
  b: false,
};

export function readInput(): Buttons {
  return {
    up: keys.has('KeyW') || keys.has('ArrowUp') || touchButtons.up,
    down: keys.has('KeyS') || keys.has('ArrowDown') || touchButtons.down,
    left: keys.has('KeyA') || keys.has('ArrowLeft') || touchButtons.left,
    right: keys.has('KeyD') || keys.has('ArrowRight') || touchButtons.right,
    a: keys.has('Space') || touchButtons.a,
    b: keys.has('ShiftLeft') || keys.has('ShiftRight') || touchButtons.b,
  };
}

function isControlButton(name: string | undefined): name is keyof Buttons {
  return name === 'up' || name === 'down' || name === 'left' || name === 'right' || name === 'a' || name === 'b';
}

export function initInput(onReset: () => void): void {
  window.addEventListener('keydown', (e) => {
    if (PREVENTED_KEYS.has(e.code)) {
      e.preventDefault();
    }
    keys.add(e.code);
    if (e.code === 'KeyR') onReset();
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });

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
    return isControlButton(name) ? name : null;
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
    onReset();
  });
}
