# SMB Movement Demo (Vite + TypeScript)

A small browser demo that moves a block on a canvas using **Super Mario Bros. 1–inspired player movement physics** (horizontal acceleration/friction, jump tiers, variable jump height, and gravity) derived from static analysis of an SMB1 PRG image and correlation with the [`SMBDIS.ASM`](https://gist.github.com/1wErt3r/4048722) disassembly.

The project is built with **Vite** and **TypeScript** (vanilla, no framework).

## Controls

**Keyboard**

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` or Arrow keys | Directional input (Up / Left / Down / Right) |
| `Space` | Jump (**A** button). Hold briefly after takeoff for a higher jump (variable jump height), release to cut the jump short (SMB-style). |
| `Shift` | Run (**B** button) |
| `R` | Reset player/camera |

**Mobile / touch**

On touch-capable devices, on-screen controls appear below the canvas: a directional pad plus **A** (Jump), **B** (Run), and Reset buttons. Touch and hold buttons for continuous input (including holding Jump for a higher jump). The canvas renders at 512×480 internally and scales to fit smaller screens.

## Idle behavior

After 5 seconds without input or movement, the player's eye centers as if looking at the viewer. After 10 seconds, blinking becomes more frequent and the player periodically performs a short, autonomous hop to get attention. Any input returns the player to normal behavior and restarts both idle timers.

## Getting started

### Prerequisites

- Node.js and npm (tested with recent Node/npm; Vite 6 / TypeScript 5)

### Install and run

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

### Build and preview

```bash
npm run build
npm run preview
```

> `npm run build` runs `tsc && vite build`. If `tsc` is not on your `PATH`, use the local binaries (e.g. `./node_modules/.bin/tsc && ./node_modules/.bin/vite build`) or run via npm scripts after install.

### Tests

```bash
npm test
```

Tests use Node's built-in `node:test` runner. `esbuild` bundles the TypeScript test files before execution; no separate test framework is required.

## Project structure

```text
.
├─ index.html                 # App shell, canvas, and debug/help UI
├─ package.json               # Scripts and dev dependencies (Vite, TypeScript, esbuild)
├─ tsconfig.json
├─ src/
│  ├─ main.ts                 # Thin app bootstrap and fixed-step frame loop
│  ├─ config.ts               # Shared canvas/world/timing/view constants
│  ├─ controls.ts             # Normalized Buttons type and control-name helpers
│  ├─ input.ts                # Keyboard/touch input handling and input-state snapshots
│  ├─ idleBehavior.ts         # Idle look/blink/attention-hop state machine
│  ├─ simulation.ts           # One-step simulation and collision ordering
│  ├─ byteMath.ts             # Shared 6502-style byte/carry helpers
│  ├─ world.ts                # Demo platforms and platform-collision resolution
│  ├─ render.ts               # Canvas rendering (world, player sprite, HUD)
│  ├─ smbPhysics.ts           # SMB-derived physics/state and integration routines
│  └─ style.css               # Layout, responsive canvas, debug panel, and touch controls
├─ tests/
│  ├─ byteMath.test.ts        # Byte/carry helper tests
│  ├─ idleBehavior.test.ts    # Idle timing and attention-hop tests
│  ├─ physics.test.ts         # Jump, acceleration, and landing tests
│  └─ world.test.ts           # Platform landing tests
└─ docs/
   └─ binary-analysis.md      # Binary analysis and disassembly-correlation notes
```

## How the physics maps to SMB1

The core logic in [`src/smbPhysics.ts`](src/smbPhysics.ts) models (land, non-water subset) the behavior of SMB routines and tables correlated from `SMBDIS.ASM` / PRG analysis, including:

- **Jump initiation and tiers** (`ProcJumping` / speed-tier selection): initial vertical speed and jump/fall force parameters from `PlayerYSpdData`, `JumpMForceData`, `FallMForceData`, `InitMForceData` based on horizontal speed.
- **Variable jump height** (`JumpSwimSub`): hold **A** across frames (and/or within `DiffToHaltJump` from the jump origin) to keep lighter `VerticalForce`; release/fall uses heavier `VerticalForceDown`.
- **Gravity/integration** (`ImposeGravity` / `MovePlayerVertically`): velocity-first integration with fractional accumulators, signed speeds, and SMB-style clamping.
- **Horizontal movement** (`X_Physics`, `ImposeFriction`, `MovePlayerHorizontally`): max-speed and friction tiers from `MaxLeftXSpdData`, `MaxRightXSpdData`, `FrictionData`, with running/skid-related side effects modeled for movement.

**Implementation detail:** NES math uses unsigned byte ADC/SBC carries with separate sign-extension for high bytes. Those helpers now live in [`src/byteMath.ts`](src/byteMath.ts) and are shared with demo collision code, so left/up movement keeps its 6502-style behavior without duplicating carry logic. See [docs/binary-analysis.md](docs/binary-analysis.md) for background.

## Demo environment vs. original game

This is **not** a full SMB1 engine or ROM recreation. The demo provides a colored rectangular "block" player, flat ground, a few platforms, a simple smooth-follow camera, and a debug HUD. The following are simplified or out of scope compared to the original: tilemap and wall/ceiling collision, swimming/climbing, enemies/objects, slopes, power-up/damage states, exact scroll/camera rules, and complete animation/audio/timer subsystems.

### Known caveats

- Collision is intentionally minimal: landing on flat ground or on the top surface band of a platform. There are no walls, ceilings, or tile-based solid objects.
- The camera is a simple smoothed horizontal follow, not SMB's scroll/camera engine.
- The player is a colored rectangle rather than original SMB art. Random blinking, the post-idle "look at player/viewer" eye shift, and extended-idle attention hops are demo-only cosmetic effects.

## Binary analysis

Background on the analyzed artifact (`smb_prg_8000.bin` headerless PRG, 6502 at `$8000`), observed vectors/flow, correlated routines/variables/tables, and implementation findings (including the carry-semantics fix) are documented in:

- [docs/binary-analysis.md](docs/binary-analysis.md)

## Development notes

- **Demo/app structure:** `main.ts` only wires modules and runs the fixed-step loop. Simulation order lives in `src/simulation.ts`, idle/presentation behavior in `src/idleBehavior.ts`, input types in `src/controls.ts`, and byte arithmetic in `src/byteMath.ts`. Rendering is split into small drawing helpers and driven by explicit view state.
- **Physics core:** `smbPhysics.ts` keeps SMB-correlated routine structure and naming. Landing cleanup is shared by ground and platform collisions via `landPlayerAt`, and jump tiers are explicitly clamped to the land-only range. The unused `upMode` gravity branch was removed.
- **Responsive canvas:** the game renders to a 512×480 buffer and scales to fit smaller screens while preserving aspect ratio (pixelated). On-screen touch controls appear only on touch-capable devices and support mobile play.
- **Input focus handling:** keyboard and touch state are cleared when the window loses focus or the document becomes hidden, preventing stuck inputs after tab/app switches.

## Disclaimer

Super Mario Bros. is property of Nintendo. This repository is an educational reverse-engineering/physics-recreation exercise; no original game assets or ROM contents are distributed here.
