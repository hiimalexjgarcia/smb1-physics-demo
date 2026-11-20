# Binary analysis notes (SMB1 movement)

This document summarizes the reverse-engineering and disassembly-correlation work used to derive the movement/jump/gravity behavior implemented in [`src/smbPhysics.ts`](../src/smbPhysics.ts).

> **Scope:** analysis focused on player horizontal/vertical movement and jump feel (land, non-water subset). It is not a complete disassembly of Super Mario Bros. 1.

## Artifacts and analysis setup

| Item | Details |
| --- | --- |
| Original ROM (reference) | `reference/smb.nes` (iNES). **REA `open_binary` could not open it**: `target_unavailable` / `unsupported_target` (`"Cannot open artifact: unsupported binary format."`). |
| Analyzed image | `reference/smb_prg_8000.bin` (headerless PRG, **32768 bytes**) treated as `raw-binary`, architecture **6502** (`6502:LE:16:default`), entry/load mapping at **`0x8000`** (NROM/SMB-style mapping). |
| REA/provider (observed) | `provider_id="ghidra"` (Ghidra 12.1.4). |
| Digest (observed) | `sha256: 5374abb64cfb9b5d961856c60166cedc55859164cf2b8867730e144fa2bdd594` |
| Correlation source | `SMBDIS.ASM` by doppelganger: <https://gist.github.com/1wErt3r/4048722> (raw used during analysis) |

**Interpretation note:** addresses and decodes below are in the PRG-mapped `$8000+` space. Some handlers were not recovered as named Ghidra procedures and were analyzed by byte/decode tracing. Symbol/routine names from `SMBDIS.ASM` are used as **correlated behavioral mappings** unless explicitly called out as directly observed in the tool output.

## Observed high-level structure

- **Vectors:** `NMI = $8082`, `RESET = $8000`, `IRQ/BRK = $FFF0`.
- **Main dispatch:** `OperMode` / `JumpEngine` at `$8E04`; mode/task flow through `$8212/$8218` and `$838B -> $83A0/$C047/$C882`.
- **Input:** joypad reads `ReadJoypads` `$8E5C/$8E6A` updating controller state (e.g. `$06FC/$074A`).
- **Gameplay/movement trace (static):** player-related flow traced through routines/regions including `$C8E0/$C935`, `$E87D,$E243,$DFC1,$DA33,$D853,$D67A` and dispatch/table handling at `$C905` (targets observed in trace: `$CA77,$C9D8,$CB89,$CC36,$C934,$CC4A,$C9B0,$D3B0,$CAF9,$CAFF`), correlated to movement/collision/bounds behaviors (e.g. relative/offscreen/bbox/collision/bounds/erase-style logic such as `F171/Relative*Position`, `E243/E252`, `E327`, `D67A/C998`, `DC41`-style gating in the disassembly).

## Key variables (from SMBDIS.ASM correlation)

| Address | Name | Role |
| --- | --- | --- |
| `$86` / `$6D` | `Player_X_Position` / `Player_PageLoc` | Horizontal position (low byte + page) |
| `$CE` / `$B5` | `Player_Y_Position` / `Player_Y_HighPos` | Vertical position (low byte + high) |
| `$57` | `Player_X_Speed` | Signed horizontal speed |
| `$0705` | `Player_X_MoveForce` | Horizontal fractional accumulator |
| `$0700` | `Player_XSpeedAbsolute` | Absolute horizontal speed |
| `$9F` | `Player_Y_Speed` | Signed vertical speed (negative = up) |
| `$0707`/`$0708` | `JumpOrigin_Y_HighPos` / `JumpOrigin_Y_Position` | Jump origin for variable-height check |
| `$0709`/`$070A` | `VerticalForce` / `VerticalForceDown` | Gravity/force (hold vs fall/cut) |
| `$0706` | `DiffToHaltJump` | Early-jump release threshold |
| `$1D` | `Player_State` | 0 ground, 1 jump/swim, 2 falling, 3 climbing |
| `$0780`/`$0703` | `RunningTimer` / `RunningSpeed` | Run state affecting speed/friction tiers |
| `$06FC`/`$074A` | (joypad state) | Current/processed controller input |

## Movement/jump routines modeled

Derived primarily from `SMBDIS.ASM` control flow and data tables:

- **`PlayerMovementSubs` / `PlayerPhysicsSub`**: runs jump-check + `X_Physics`, dispatches by `Player_State` to `OnGroundStateSub`, `JumpSwimSub`, `FallingSub`, `ClimbingSub`.
- **`ProcJumping` (CheckForJumping path)**: on A rising edge (and eligible ground state, land), captures jump origin, sets `Player_State = $01`, `DiffToHaltJump = $01`, and selects tiered parameters from horizontal speed.
- **`JumpSwimSub`**: variable jump height — while rising, keeps lighter `VerticalForce` if A is held across frames (`A & PreviousA`) or if risen distance `< DiffToHaltJump`; otherwise uses `VerticalForceDown`. When `Y_Speed >= 0`, uses `VerticalForceDown`. Applies L/R control/friction, moves horizontally, then vertically.
- **`FallingSub`**: uses `VerticalForceDown`, then same air-control tail (horizontal + vertical integration).
- **`OnGroundStateSub`**: updates facing/anim side-effects, imposes friction, moves horizontally (no gravity integration; landing handled by collision in the original engine).
- **`X_Physics`**: selects max-speed and friction tiers (`MaxLeft/RightXSpdData`, `FrictionData`) from ground/air state, L/R vs moving direction, B/run timer, and speed thresholds; doubles friction when facing ≠ moving.
- **`ImposeFriction` / `GetPlayerAnimSpeed`**: signed acceleration/deceleration with fractional carry/borrow, speed clamping, skid/stop and running-speed side effects at defined thresholds.
- **`MovePlayerHorizontally` / `MovePlayerVertically` / `ImposeGravity`**: nibble-split horizontal integration and vertical velocity-first integration with fractional accumulators and clamping.

## Data tables (SMBDIS.ASM)

Used directly in the implementation:

- `JumpMForceData`: `$20,$20,$1E,$28,$28,$0D,$04`
- `FallMForceData`: `$70,$70,$60,$90,$90,$0A,$09`
- `PlayerYSpdData`: `$FC,$FC,$FC,$FB,$FB,$FE,$FF` (signed initial Y speeds)
- `InitMForceData`: `$00,$00,$00,$00,$00,$80,$00`
- `MaxLeftXSpdData`: `$D8,$E8,$F0` (−40, −24, −16)
- `MaxRightXSpdData`: `$28,$18,$10,$0C` (40, 24, 16, 12)
- `FrictionData`: `$E4,$98,$D0`

## Important implementation finding: unsigned carry semantics

During investigation of "excessive acceleration when moving left or jumping", the core issue was **carry propagation in position integration**:

- The 6502 `ADC` produces a carry from **unsigned** byte addition. SMB integrates position bytes with speed/fractional carries as unsigned ADC chains while applying sign-extension (`$00/$FF`) to the page/high byte separately.
- A pre-fix demo implementation computed page/high-byte carry using signed JavaScript sums (e.g. `Math.floor` on signed results). For leftward (negative nibble component) and upward (negative `Y_Speed`) movement this introduced spurious `-1` carries in common non-wrap cases, causing too-large displacement per frame.
- **Fix (applied):** compute position-byte carry from the unsigned byte sum (`> 0xFF ? 1 : 0`) and add the sign-extension term separately in both horizontal and vertical integration. These helpers now live in `src/byteMath.ts` and are used by `movePlayerHorizontally` and `imposeGravity` in `src/smbPhysics.ts`.

This preserves SMB-like behavior: signed speeds/forces control direction and magnitude, but address/page carries follow unsigned byte ADC semantics.

## Limitations and non-goals

- **Artifact access:** the iNES ROM could not be opened directly via REA in this environment; analysis used a headerless PRG image and disassembly correlation.
- **Evidence type:** parts of the trace are static/decode-level and correlated to `SMBDIS.ASM` names/behavior; not every mapped routine was independently recovered as a named procedure with complete call-graph evidence.
- **Subset:** implementation targets land movement/jump/gravity feel (non-water). Swimming, climbing, enemy/object interactions, BG tile collision, slopes, damage/power-up state machines, exact subpixel/camera/scroll engine behavior, and full animation/timer systems are simplified or omitted.
- **Demo glue:** ground and platform collisions are canvas/demo approximations layered on top of the SMB-derived physics core. `stepSimulation` in `src/simulation.ts` orders the SMB-like frame step (`stepPlayerPhysics`), ground resolution (`resolveDemoGround`), and platform landings (`src/world.ts`). Both collision paths share `landPlayerAt` in `src/smbPhysics.ts`.
