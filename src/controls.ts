/** Player-facing controls, independent of physics implementation details. */
export const CONTROL_NAMES = ['up', 'down', 'left', 'right', 'a', 'b'] as const;

export type ControlName = (typeof CONTROL_NAMES)[number];

export function isControlButton(name: string | undefined): name is ControlName {
  return CONTROL_NAMES.includes(name as ControlName);
}

/** Normalized input snapshot consumed by physics and presentation code. */
export interface Buttons {
  /** D-pad up */
  up: boolean;
  /** D-pad down */
  down: boolean;
  /** D-pad left */
  left: boolean;
  /** D-pad right */
  right: boolean;
  /** A button (SPACE): jump */
  a: boolean;
  /** B button (SHIFT): run */
  b: boolean;
}

export const IDLE_BUTTONS: Buttons = {
  up: false,
  down: false,
  left: false,
  right: false,
  a: false,
  b: false,
};
