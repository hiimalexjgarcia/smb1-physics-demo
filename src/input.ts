import { isControlButton, type Buttons, type ControlName } from './controls';

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

export function initInput(onReset: () => void): void {
  window.addEventListener('keydown', (e) => {
    if (PREVENTED_KEYS.has(e.code)) {
      e.preventDefault();
    }
    keys.add(e.code);
    if (e.code === 'KeyR' && !e.repeat) onReset();
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });

  const controls = document.getElementById('controls');
  const activePointers = new Map<number, ControlName>();

  const setPressed = (name: ControlName, pressed: boolean) => {
    touchButtons[name] = pressed;
    const el = controls?.querySelector<HTMLElement>(`[data-btn="${name}"]`);
    if (el) el.classList.toggle('active', pressed);
  };

  /** Clear held keys/buttons so focus changes never leave input stuck on. */
  const clearAllInput = () => {
    keys.clear();
    activePointers.clear();
    (Object.keys(touchButtons) as ControlName[]).forEach((k) => setPressed(k, false));
  };

  window.addEventListener('blur', clearAllInput);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearAllInput();
  });

  // Reset wiring is independent of the d-pad markup, so register it first.
  document.getElementById('reset-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    onReset();
  });

  if (!controls) return;

  const getButtonName = (el: HTMLElement | null): ControlName | null => {
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
}
