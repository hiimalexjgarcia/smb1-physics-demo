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

On-screen controls appear below the canvas: a directional pad plus **A** (Jump), **B** (Run), and Reset buttons. Touch and hold buttons for continuous input (including holding Jump for a higher jump). The canvas renders at 512×480 internally and scales to fit smaller screens.

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

## Project structure

```text
.
├─ index.html                 # App shell, canvas, and debug/help UI
├─ package.json               # Scripts and dev dependencies (Vite, TypeScript)
├─ tsconfig.json
├─ src/
│  ├─ main.ts                 # App orchestrator: session state, fixed-step loop, and wiring
│  ├─ config.ts               # Shared canvas/world/timing/view constants
│  ├─ input.ts                # Keyboard/touch input handling and input-state snapshots
│  ├─ world.ts                # Demo platforms and platform-collision resolution
│  ├─ render.ts               # Canvas rendering (world, player sprite, HUD)
│  ├─ smbPhysics.ts           # SMB-derived physics/state and integration routines
│  └─ style.css               # Layout, responsive canvas, debug panel, and touch controls
└─ docs/
   └─ binary-analysis.md      # Binary analysis and disassembly-correlation notes
```

## How the physics maps to SMB1

The core logic in [`src/smbPhysics.ts`](src/smbPhysics.ts) models (land, non-water subset) the behavior of SMB routines and tables correlated from `SMBDIS.ASM` / PRG analysis, including:

- **Jump initiation and tiers** (`ProcJumping` / speed-tier selection): initial vertical speed and jump/fall force parameters from `PlayerYSpdData`, `JumpMForceData`, `FallMForceData`, `InitMForceData` based on horizontal speed.
- **Variable jump height** (`JumpSwimSub`): hold **A** across frames (and/or within `DiffToHaltJump` from the jump origin) to keep lighter `VerticalForce`; release/fall uses heavier `VerticalForceDown`.
- **Gravity/integration** (`ImposeGravity` / `MovePlayerVertically`): velocity-first integration with fractional accumulators, signed speeds, and SMB-style clamping.
- **Horizontal movement** (`X_Physics`, `ImposeFriction`, `MovePlayerHorizontally`): max-speed and friction tiers from `MaxLeftXSpdData`, `MaxRightXSpdData`, `FrictionData`, with running/skid-related side effects modeled for movement.

**Implementation detail:** NES math uses unsigned byte ADC/SBC carries with separate sign-extension for high bytes; position integration preserves this (not signed-JS carry math) so left/up movement behaves correctly. See [docs/binary-analysis.md](docs/binary-analysis.md) for details.

## Demo environment vs. original game

This is **not** a full SMB1 engine. The demo provides a canvas "block" player, a flat ground, a few platforms, camera follow, and a debug HUD. The following are simplified or out of scope compared to the original: BG/tile collision, swimming/climbing, enemies/objects, slopes, power-up/damage states, exact scroll/camera rules, and complete animation/audio/timer subsystems.

## Binary analysis

Background on the analyzed artifact (`smb_prg_8000.bin` headerless PRG, 6502 at `$8000`), observed vectors/flow, correlated routines/variables/tables, and implementation findings (including the carry-semantics fix) are documented in:

- [docs/binary-analysis.md](docs/binary-analysis.md)

## Development notes

- **Demo/app structure:** `main.ts` is a thin orchestrator; input, world/collision helpers, rendering, and shared constants live in dedicated modules (`src/input.ts`, `src/world.ts`, `src/render.ts`, `src/config.ts`). Rendering is driven by explicit view/presentation state (camera, blink, idle-look, run highlight) instead of reading input/time internally.
- **Physics core:** `smbPhysics.ts` keeps SMB-correlated routine structure and naming; core frame integration (`stepPlayerPhysics`) is separated from demo ground resolution (`resolveDemoGround`). Unused code was removed and player motion state typing was tightened.
- **Responsive canvas:** the game renders to a 512×480 buffer and scales to fit smaller screens while preserving aspect ratio (pixelated). On-screen touch controls support mobile play.

## Disclaimer

Super Mario Bros. is property of Nintendo. This repository is an educational reverse-engineering/physics-recreation exercise; no original game assets or ROM contents are distributed here.
