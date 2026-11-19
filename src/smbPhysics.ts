/**
 * SMB1-inspired player movement physics.
 *
 * Derived from:
 * - SMBDIS.ASM (gist 1wErt3r/4048722) routine/table names and control flow
 * - Static analysis of reference/smb_prg_8000.bin (PRG mapped at $8000)
 *
 * Modeled SMB routines (land / non-water subset used by this demo):
 * - PlayerMovementSubs / PlayerPhysicsSub / ProcJumping / X_Physics
 * - GetPlayerAnimSpeed / ImposeFriction / MovePlayerHorizontally
 * - OnGroundStateSub / JumpSwimSub / FallingSub
 * - MovePlayerVertically / ImposeGravity
 *
 * Notes:
 * - NES math is byte-oriented: speeds are signed bytes, positions/forces use 8-bit
 *   values with fractional accumulators and 16-bit page/high bytes.
 * - 6502 ADC/SBC produce carries/borrows from unsigned byte addition/subtraction;
 *   high bytes also receive separate sign-extension terms. Position integration in
 *   this module preserves that behavior (important for left/up movement).
 */

export interface Buttons {
  /** D-pad right */
  right: boolean;
  /** D-pad left */
  left: boolean;
  /** D-pad down */
  down: boolean;
  /** D-pad up */
  up: boolean;
  /** A button (SPACE): jump */
  a: boolean;
  /** B button (SHIFT): run */
  b: boolean;
}

/** Player_State ($1D): movement sub dispatch. */
export const PlayerMotionState = {
  OnGround: 0,
  Jumping: 1, // JumpSwimSub (land jump in this demo)
  Falling: 2,
} as const;

export type PlayerMotionStateValue = (typeof PlayerMotionState)[keyof typeof PlayerMotionState];

/** Direction encoding used by SMB movement logic: 1 = right, 2 = left. */
export const Direction = {
  Right: 1,
  Left: 2,
} as const;

export type DirectionValue = (typeof Direction)[keyof typeof Direction];

export interface PlayerState {
  // --- Position (16-bit via page/high + low byte) ---
  /** Player_X_Position ($86) */
  xPos: number;
  /** Player_PageLoc ($6D) */
  xPage: number;
  /** Player_Y_Position ($CE) */
  yPos: number;
  /** Player_Y_HighPos ($B5) */
  yHigh: number;

  // --- Horizontal velocity ---
  /** Player_X_Speed ($57), signed byte */
  xSpeed: number;
  /** Player_X_MoveForce ($0705), fractional accumulator */
  xMoveForce: number;
  /** Player_XSpeedAbsolute ($0700) */
  xSpeedAbs: number;

  // --- Vertical velocity ---
  /** Player_Y_Speed ($9F), signed byte (negative = up) */
  ySpeed: number;
  /** Vertical fractional/move force (object slot semantics, e.g. $0433) */
  yMoveForce: number;
  /** Vertical dummy fractional accumulator (e.g. $0416) */
  yMFDummy: number;

  // --- Mode/direction ---
  /** Player_State ($1D): 0 ground, 1 jump/swim, 2 falling */
  playerState: PlayerMotionStateValue;
  /** PlayerFacingDir: 1 right, 2 left */
  facingDir: DirectionValue;
  /** Player_MovingDir: 1 right, 2 left */
  movingDir: DirectionValue;

  // --- Jump parameters ---
  /** JumpOrigin_Y_Position ($0708) */
  jumpOriginYPos: number;
  /** JumpOrigin_Y_HighPos ($0707) */
  jumpOriginYHigh: number;
  /** VerticalForce ($0709): gravity while holding/rising-jump window */
  verticalForce: number;
  /** VerticalForceDown ($070A): gravity when falling / jump cut */
  verticalForceDown: number;
  /** DiffToHaltJump ($0706): early-jump release threshold */
  diffToHaltJump: number;

  // --- Horizontal physics parameters (from X_Physics tables) ---
  frictionAdderLow: number;
  frictionAdderHigh: number;
  /** MaximumLeftSpeed ($0450), signed byte stored as u8 */
  maximumLeftSpeed: number;
  /** MaximumRightSpeed ($0456), signed byte stored as u8 */
  maximumRightSpeed: number;
  /** Player_X_Scroll (horizontal movement delta result) */
  playerXScroll: number;

  // --- Run state ---
  /** RunningTimer ($0780) */
  runningTimer: number;
  /** RunningSpeed ($0703) */
  runningSpeed: number;

  /** Previous A-button state for edge/sustain checks */
  prevA: boolean;
  /** Demo collision flag (SMB resolves via BG collision in-engine) */
  onGround: boolean;
}

// ---------------------------------------------------------------------------
// 8-bit helpers
// ---------------------------------------------------------------------------

/** Mask to an unsigned byte (0..255). */
const u8 = (n: number): number => n & 0xff;

/** Interpret a byte as signed (-128..127). */
const s8 = (n: number): number => {
  const v = n & 0xff;
  return v & 0x80 ? v - 256 : v;
};

// ---------------------------------------------------------------------------
// SMBDIS.ASM data tables (land-relevant entries)
// ---------------------------------------------------------------------------

/** Upward (held-jump) vertical force by horizontal-speed tier. */
const JUMP_M_FORCE_DATA = [0x20, 0x20, 0x1e, 0x28, 0x28, 0x0d, 0x04] as const;
/** Falling / jump-cut vertical force by horizontal-speed tier. */
const FALL_M_FORCE_DATA = [0x70, 0x70, 0x60, 0x90, 0x90, 0x0a, 0x09] as const;
/** Initial vertical speed by tier (signed: $FC=-4, $FB=-5, $FE=-2, $FF=-1). */
const PLAYER_Y_SPEED_DATA = [0xfc, 0xfc, 0xfc, 0xfb, 0xfb, 0xfe, 0xff] as const;
/** Initial vertical move-force by tier. */
const INIT_M_FORCE_DATA = [0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x00] as const;

/** MaxLeftXSpdData: -40, -24, -16 */
const MAX_LEFT_X_SPEED_DATA = [0xd8, 0xe8, 0xf0] as const;
/** MaxRightXSpdData: 40, 24, 16, 12 */
const MAX_RIGHT_X_SPEED_DATA = [0x28, 0x18, 0x10, 0x0c] as const;
/** FrictionData (low byte base values). */
const FRICTION_DATA = [0xe4, 0x98, 0xd0] as const;

// ---------------------------------------------------------------------------
// Small domain helpers
// ---------------------------------------------------------------------------

function isLeft(dir: number): boolean {
  return dir === Direction.Left;
}

/** L/R input as SMB movement direction code (0 = none). */
function leftRightPressed(btn: Buttons): number {
  if (btn.right && !btn.left) return Direction.Right;
  if (btn.left && !btn.right) return Direction.Left;
  if (btn.right) return Direction.Right;
  if (btn.left) return Direction.Left;
  return 0;
}

/** Update movingDir from current signed X speed (or held direction when stopped). */
function syncMovingDirFromSpeed(p: PlayerState, lr: number): void {
  const xs = s8(p.xSpeed);
  if (xs > 0) p.movingDir = Direction.Right;
  else if (xs < 0) p.movingDir = Direction.Left;
  else if (lr !== 0) p.movingDir = lr as DirectionValue;
}

/** Update facing and moving direction during air/ground movement (LRAir-style). */
function updateDirectionsFromInputAndSpeed(p: PlayerState, btn: Buttons): number {
  const lr = leftRightPressed(btn);
  if (lr !== 0) p.facingDir = lr as DirectionValue;
  syncMovingDirFromSpeed(p, lr);
  return lr;
}

// ---------------------------------------------------------------------------
// Public API: state & debug
// ---------------------------------------------------------------------------

export function createPlayer(): PlayerState {
  return {
    xPos: 0x30,
    xPage: 0x00,
    yPos: 0xb0,
    yHigh: 0x00,

    xSpeed: 0,
    xMoveForce: 0,
    xSpeedAbs: 0,

    ySpeed: 0,
    yMoveForce: 0,
    yMFDummy: 0,

    playerState: PlayerMotionState.OnGround,
    facingDir: Direction.Right,
    movingDir: Direction.Right,

    jumpOriginYPos: 0,
    jumpOriginYHigh: 0,
    verticalForce: JUMP_M_FORCE_DATA[0],
    verticalForceDown: FALL_M_FORCE_DATA[0],
    diffToHaltJump: 1,

    frictionAdderLow: FRICTION_DATA[0],
    frictionAdderHigh: 0,
    maximumLeftSpeed: MAX_LEFT_X_SPEED_DATA[1],
    maximumRightSpeed: MAX_RIGHT_X_SPEED_DATA[1],
    playerXScroll: 0,

    runningTimer: 0,
    runningSpeed: 0,

    prevA: false,
    onGround: true,
  };
}

/** 16-bit horizontal position in pixels (demo units). */
export function getPlayerPixelX(p: PlayerState): number {
  return p.xPage * 256 + p.xPos;
}

/** 16-bit vertical position in pixels (demo units). */
export function getPlayerPixelY(p: PlayerState): number {
  return p.yHigh * 256 + p.yPos;
}

export function setPlayerPixelY(p: PlayerState, py: number): void {
  const v = Math.max(0, Math.min(0xffff, Math.round(py)));
  p.yHigh = (v >> 8) & 0xff;
  p.yPos = v & 0xff;
}

export function debugInfo(p: PlayerState, btn: Buttons): string {
  return [
    `pos: (${getPlayerPixelX(p).toFixed(1)}, ${getPlayerPixelY(p).toFixed(1)})`,
    `xSpeed(s): ${s8(p.xSpeed)}  xMoveForce: ${p.xMoveForce}  xAbs: ${p.xSpeedAbs}`,
    `ySpeed(s): ${s8(p.ySpeed)}  yMoveForce: ${p.yMoveForce}  yMFDummy: ${p.yMFDummy}`,
    `vForce: ${p.verticalForce}  vForceDown: ${p.verticalForceDown}  diffToHalt: ${p.diffToHaltJump}`,
    `state: ${p.playerState} (0=gnd,1=jump,2=fall)  onGround: ${p.onGround}`,
    `facing: ${p.facingDir}  moving: ${p.movingDir}`,
    `runTimer: ${p.runningTimer}  runningSpeed: ${p.runningSpeed}`,
    `maxL(s): ${s8(p.maximumLeftSpeed)}  maxR(s): ${s8(p.maximumRightSpeed)}`,
    `fric: lo=${p.frictionAdderLow} hi=${p.frictionAdderHigh}  xScroll: ${s8(p.playerXScroll)}`,
    `input: L:${btn.left} R:${btn.right} U:${btn.up} D:${btn.down} A(jump):${btn.a} B(run):${btn.b}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// GetPlayerAnimSpeed (movement-relevant side effects)
// ---------------------------------------------------------------------------

/**
 * SMB GetPlayerAnimSpeed: updates RunningSpeed and, at low speed with opposing
 * L/R input, performs a skid/stop (clears X speed/force and aligns moving dir).
 * Animation timing itself is omitted (not needed for physics).
 */
function getPlayerAnimSpeed(p: PlayerState, btn: Buttons): void {
  if (p.xSpeedAbs >= 0x1c) {
    // SetRunSpd
    p.runningSpeed = p.xSpeedAbs;
    return;
  }

  // ChkSkid path
  const anyDirectionalOrB = btn.b || btn.up || btn.down || btn.left || btn.right;
  if (!anyDirectionalOrB) return;

  const lr = leftRightPressed(btn);
  if (lr !== 0 && lr !== p.movingDir) {
    // ProcSkid
    if (p.xSpeedAbs < 0x0b) {
      p.movingDir = p.facingDir;
      p.xSpeed = 0;
      p.xMoveForce = 0;
      p.xSpeedAbs = 0;
    }
    // >= $0B: keep speed, no runningSpeed clear here
  } else {
    p.runningSpeed = 0;
  }
}

// ---------------------------------------------------------------------------
// Friction / horizontal acceleration (ImposeFriction, Left/RightFrict)
// ---------------------------------------------------------------------------

function setXSpeedAbsFromSpeed(p: PlayerState): void {
  const v = s8(p.xSpeed);
  p.xSpeedAbs = v >= 0 ? u8(v) : u8(-v);
}

/** LeftFrict: increases X speed toward the right / maximum right speed. */
function applyLeftFriction(p: PlayerState): void {
  const sum = p.xMoveForce + p.frictionAdderLow;
  p.xMoveForce = u8(sum);
  const carry = sum > 0xff ? 1 : 0;

  const nextSpeed = s8(p.xSpeed) + s8(p.frictionAdderHigh) + carry;
  p.xSpeed = u8(nextSpeed);

  if (s8(p.xSpeed) >= s8(p.maximumRightSpeed)) {
    p.xSpeed = u8(p.maximumRightSpeed);
  }
  setXSpeedAbsFromSpeed(p);
}

/** RghtFrict: decreases X speed toward the left / maximum left speed. */
function applyRightFriction(p: PlayerState): void {
  const diff = p.xMoveForce - p.frictionAdderLow;
  p.xMoveForce = u8(diff);
  const borrow = diff < 0 ? 1 : 0;

  const nextSpeed = s8(p.xSpeed) - s8(p.frictionAdderHigh) - borrow;
  p.xSpeed = u8(nextSpeed);

  if (s8(p.xSpeed) < s8(p.maximumLeftSpeed)) {
    p.xSpeed = u8(p.maximumLeftSpeed);
  }
  setXSpeedAbsFromSpeed(p);
}

/**
 * SMB ImposeFriction (collision bits not modeled in this demo):
 * - no L/R input: decelerate based on current speed sign
 * - L/R input: apply JoypFrict (left input -> RghtFrict, right input -> LeftFrict)
 */
function imposeFriction(p: PlayerState, btn: Buttons): void {
  const lr = leftRightPressed(btn);

  if (lr === 0) {
    if (p.xSpeed === 0) {
      p.xSpeedAbs = 0;
      return;
    }
    if (s8(p.xSpeed) > 0) applyRightFriction(p);
    else applyLeftFriction(p);
    return;
  }

  if (isLeft(lr)) applyRightFriction(p);
  else applyLeftFriction(p);
}

// ---------------------------------------------------------------------------
// Horizontal integration (MovePlayerHorizontally / MoveObjectHorizontally)
// ---------------------------------------------------------------------------

/**
 * Integrate horizontal position from X speed and fractional move force.
 *
 * Carry into Player_PageLoc comes from unsigned byte ADC of the position byte;
 * the sign-extended speed component is applied separately to the page (6502-style).
 */
function movePlayerHorizontally(p: PlayerState): void {
  const speed = u8(p.xSpeed);

  // Split speed into nibbles as in SMB (low nibble shifted up; high nibble sign-extended)
  const fractionalDelta = u8(speed << 4); // n1
  let highNibble = (speed >>> 4) & 0x0f;
  if (highNibble >= 0x08) highNibble |= 0xf0;

  const speedNibbleSigned = s8(highNibble); // n0 (signed contribution)
  const speedNibbleByte = u8(speedNibbleSigned); // same byte value for unsigned ADC
  const pageSignExtension = speedNibbleSigned >= 0 ? 0x00 : 0xff;

  // Fractional accumulator: X_MoveForce += n1
  const sumForce = p.xMoveForce + fractionalDelta;
  const carryFromForce = sumForce > 0xff ? 1 : 0;
  p.xMoveForce = u8(sumForce);

  // Position byte: unsigned ADC with carry, then apply sign-extension to page
  const posSum = p.xPos + speedNibbleByte + carryFromForce;
  const carryToPage = posSum > 0xff ? 1 : 0;
  p.xPos = u8(posSum);
  p.xPage = u8(p.xPage + pageSignExtension + carryToPage);

  // Player_X_Scroll result
  p.playerXScroll = u8(carryFromForce + speedNibbleSigned);
}

// ---------------------------------------------------------------------------
// Vertical integration (MovePlayerVertically / ImposeGravity)
// ---------------------------------------------------------------------------

/**
 * SMB ImposeGravity:
 * 1) yMFDummy += yMoveForce (carry out)
 * 2) integrate Y position by ySpeed (+ carry, + sign extension on high byte)
 * 3) apply downForce to yMoveForce/ySpeed
 * 4) clamp downward to maxSpeed when in fast-fall fractional range
 * (upMode path exists in SMB for upward/platform cases; unused for normal player gravity)
 */
function imposeGravity(
  p: PlayerState,
  downForce: number,
  maxDownSpeed: number,
  upMode: boolean,
  upForce = 0,
): void {
  // 1) Dummy fractional accumulator
  const sumDummy = p.yMFDummy + p.yMoveForce;
  const carryDummy = sumDummy > 0xff ? 1 : 0;
  p.yMFDummy = u8(sumDummy);

  // 2) Position integration: unsigned ADC for carry, separate sign extension for high byte
  const ySpeedSigned = s8(p.ySpeed);
  const ySpeedByte = u8(p.ySpeed);
  const signExtensionTerm = ySpeedSigned < 0 ? -1 : 0;

  const posSum = p.yPos + ySpeedByte + carryDummy;
  const carryToHigh = posSum > 0xff ? 1 : 0;
  p.yPos = u8(posSum);
  p.yHigh = u8(p.yHigh + signExtensionTerm + carryToHigh);

  // 3) Apply gravity/force to velocity accumulators
  const moveForceSum = p.yMoveForce + downForce;
  const carryToSpeed = moveForceSum > 0xff ? 1 : 0;
  p.yMoveForce = u8(moveForceSum);
  p.ySpeed = u8(s8(p.ySpeed) + carryToSpeed);

  // 4) Clamp downward speed (positive in SMB coordinates)
  if (s8(p.ySpeed) >= s8(maxDownSpeed) && p.yMoveForce >= 0x80) {
    p.ySpeed = u8(maxDownSpeed);
    p.yMoveForce = 0x00;
  }

  if (upMode) {
    const negMaxSpeed = -s8(maxDownSpeed);
    const moveForceDiff = p.yMoveForce - upForce;
    const borrow = moveForceDiff < 0 ? 1 : 0;
    p.yMoveForce = u8(moveForceDiff);
    p.ySpeed = u8(s8(p.ySpeed) - borrow);

    if (s8(p.ySpeed) < negMaxSpeed && p.yMoveForce < 0x80) {
      p.ySpeed = u8(negMaxSpeed);
      p.yMoveForce = 0xff;
    }
  }
}

/** Player MovePlayerVertically: apply current VerticalForce with max fall speed $04. */
function movePlayerVertically(p: PlayerState): void {
  imposeGravity(p, p.verticalForce, 0x04, false);
}

// ---------------------------------------------------------------------------
// X_Physics: select max speeds and friction from state/input
// ---------------------------------------------------------------------------

/** Compute (max-speed tier, friction tier) like SMB X_Physics for non-water land/air. */
function getXPhysicsParams(
  p: PlayerState,
  btn: Buttons,
): { maxSpeedTier: number; frictionTier: number } {
  let maxSpeedTier = 0;
  let frictionTier = 0;
  const lr = leftRightPressed(btn);

  if (p.playerState !== PlayerMotionState.OnGround) {
    // Air
    if (p.xSpeedAbs < 0x19) {
      maxSpeedTier = 1;
      frictionTier = p.runningSpeed !== 0 || p.xSpeedAbs >= 0x21 ? 2 : 1;
    }
    // else fast air: (0,0)
    return { maxSpeedTier, frictionTier };
  }

  // Ground (ProcPRun, non-water)
  const holdingMoveInMovingDir = lr !== 0 && lr === p.movingDir;
  if (holdingMoveInMovingDir) {
    if (btn.b) {
      // SetRTmr -> GetXPhy
      p.runningTimer = 0x0a;
      return { maxSpeedTier: 0, frictionTier: 0 };
    }
    if (p.runningTimer !== 0) {
      return { maxSpeedTier: 0, frictionTier: 0 };
    }
  }

  // ChkRFast
  maxSpeedTier = 1;
  frictionTier = p.runningSpeed !== 0 || p.xSpeedAbs >= 0x21 ? 2 : 1;
  return { maxSpeedTier, frictionTier };
}

/**
 * SMB X_Physics: sets MaximumLeft/RightSpeed and FrictionAdderLow/High based on
 * movement state, L/R + B input, RunningTimer/RunningSpeed, and facing vs moving dir.
 */
function xPhysics(p: PlayerState, btn: Buttons): void {
  const { maxSpeedTier, frictionTier } = getXPhysicsParams(p, btn);

  const leftTier = Math.max(0, Math.min(2, maxSpeedTier));
  p.maximumLeftSpeed = u8(MAX_LEFT_X_SPEED_DATA[leftTier]);

  const rightTier = Math.max(0, Math.min(3, maxSpeedTier));
  p.maximumRightSpeed = u8(MAX_RIGHT_X_SPEED_DATA[rightTier]);

  const t = Math.max(0, Math.min(2, frictionTier));
  p.frictionAdderLow = FRICTION_DATA[t];
  p.frictionAdderHigh = 0x00;

  if (p.facingDir !== p.movingDir) {
    // asl FrictionAdderLow; rol FrictionAdderHigh (double friction when skidding/turning)
    const highBit = (p.frictionAdderLow & 0x80) !== 0 ? 1 : 0;
    p.frictionAdderLow = u8(p.frictionAdderLow << 1);
    p.frictionAdderHigh = highBit;
  }
}

// ---------------------------------------------------------------------------
// Jump (ProcJumping / CheckForJumping)
// ---------------------------------------------------------------------------

/** Jump parameter tier index from Player_XSpeedAbsolute (land). */
function getJumpTierFromXSpeedAbs(xSpeedAbs: number): number {
  let tier = 0;
  if (xSpeedAbs >= 0x09) tier++;
  if (xSpeedAbs >= 0x10) tier++;
  if (xSpeedAbs >= 0x19) tier++;
  if (xSpeedAbs >= 0x1c) tier++;
  return tier; // 0-4 on land
}

/**
 * SMB ProcJumping (land): initialize jump state and vertical parameters from tables.
 * Only valid when starting from ground in this demo.
 */
function procJumping(p: PlayerState): void {
  if (p.playerState !== PlayerMotionState.OnGround) return;

  p.yMFDummy = 0;
  p.yMoveForce = 0;
  p.jumpOriginYHigh = p.yHigh;
  p.jumpOriginYPos = p.yPos;
  p.playerState = PlayerMotionState.Jumping;

  const tier = getJumpTierFromXSpeedAbs(p.xSpeedAbs);
  p.diffToHaltJump = 1;
  p.verticalForce = JUMP_M_FORCE_DATA[tier];
  p.verticalForceDown = FALL_M_FORCE_DATA[tier];
  p.yMoveForce = INIT_M_FORCE_DATA[tier];
  p.ySpeed = u8(PLAYER_Y_SPEED_DATA[tier]);
}

/**
 * SMB PlayerPhysicsSub (land subset): handle jump start on A rising edge, then X_Physics.
 * ProcJumping falls through to X_Physics in SMB.
 */
function playerPhysicsSub(p: PlayerState, btn: Buttons): void {
  if (btn.a && !p.prevA) {
    procJumping(p);
  }

  xPhysics(p, btn);

  // RunningTimer is engine-managed in SMB; approximated per physics step here.
  if (p.runningTimer > 0) p.runningTimer--;
}

// ---------------------------------------------------------------------------
// Movement state subroutines
// ---------------------------------------------------------------------------

/** OnGroundStateSub: animation/side-effects, facing, friction, horizontal move. */
function onGroundStateSub(p: PlayerState, btn: Buttons): void {
  getPlayerAnimSpeed(p, btn);

  const lr = leftRightPressed(btn);
  if (lr !== 0) p.facingDir = lr as DirectionValue;
  syncMovingDirFromSpeed(p, lr);

  imposeFriction(p, btn);
  movePlayerHorizontally(p);
}

/**
 * JumpSwimSub (land): choose vertical force (variable jump height), apply horizontal
 * control, integrate horizontally then vertically.
 */
function jumpSwimSub(p: PlayerState, btn: Buttons): void {
  const ySpeedSigned = s8(p.ySpeed);

  if (ySpeedSigned >= 0) {
    // DumpFall: descending or zero -> use heavier gravity
    p.verticalForce = p.verticalForceDown;
  } else {
    // Rising: keep light gravity if A held across frames or still within early-jump window
    const aHeldAcrossFrames = btn.a && p.prevA; // A_B_Buttons & PreviousA_B_Buttons
    if (!aHeldAcrossFrames) {
      const riseFromOrigin = u8(p.jumpOriginYPos - p.yPos);
      if (riseFromOrigin >= p.diffToHaltJump) {
        p.verticalForce = p.verticalForceDown; // cut jump short
      }
    }
  }

  const lr = updateDirectionsFromInputAndSpeed(p, btn);
  if (lr !== 0) {
    imposeFriction(p, btn);
  }

  movePlayerHorizontally(p);
  movePlayerVertically(p);
}

/** FallingSub: force heavy gravity, apply air control, integrate. */
function fallingSub(p: PlayerState, btn: Buttons): void {
  p.verticalForce = p.verticalForceDown;

  const lr = updateDirectionsFromInputAndSpeed(p, btn);
  if (lr !== 0) {
    imposeFriction(p, btn);
  }

  movePlayerHorizontally(p);
  movePlayerVertically(p);
}

// ---------------------------------------------------------------------------
// Step integration (SMB core + demo environment helpers)
// ---------------------------------------------------------------------------

/** Ensure fall forces are initialized (e.g. ledge drop without a jump tier context). */
function ensureFallForces(p: PlayerState): void {
  if (p.verticalForceDown === 0) p.verticalForceDown = FALL_M_FORCE_DATA[0];
  if (p.verticalForce === 0) p.verticalForce = p.verticalForceDown;
}

/**
 * Advance one SMB-physics frame (core movement dispatch).
 *
 * SMB core: PlayerPhysicsSub + dispatch by Player_State to the movement sub.
 * Demo/environment collision (ground/platforms) is resolved by the caller.
 */
export function stepPlayerPhysics(p: PlayerState, btn: Buttons): void {
  if (p.onGround) p.playerState = PlayerMotionState.OnGround;

  playerPhysicsSub(p, btn);

  if (p.playerState === PlayerMotionState.OnGround) {
    onGroundStateSub(p, btn);
  } else if (p.playerState === PlayerMotionState.Jumping) {
    jumpSwimSub(p, btn);
  } else {
    ensureFallForces(p);
    fallingSub(p, btn);
  }

  p.prevA = btn.a;
}

/**
 * Demo collision/landing against a flat ground line and ledge/fall transitions.
 * SMB resolves this via BG/tile collision in-engine.
 */
export function resolveDemoGround(p: PlayerState, groundY: number, playerHeight: number): void {
  const py = getPlayerPixelY(p);

  if (py + playerHeight >= groundY) {
    setPlayerPixelY(p, groundY - playerHeight);
    p.ySpeed = 0;
    p.yMoveForce = 0;
    p.yMFDummy = 0;
    p.playerState = PlayerMotionState.OnGround;
    p.onGround = true;
    return;
  }

  p.onGround = false;

  if (p.playerState === PlayerMotionState.OnGround) {
    // Walked off a ledge
    p.playerState = PlayerMotionState.Falling;
    ensureFallForces(p);
  } else if (p.playerState === PlayerMotionState.Jumping && s8(p.ySpeed) >= 0) {
    p.playerState = PlayerMotionState.Falling;
  }
}

/** Convenience wrapper used by the demo: core step + flat ground resolution. */
export function stepPlayer(p: PlayerState, btn: Buttons, groundY: number, playerHeight = 32): void {
  stepPlayerPhysics(p, btn);
  resolveDemoGround(p, groundY, playerHeight);
}
