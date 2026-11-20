import { PLAYER_HEIGHT, PLAYER_WIDTH } from './config';
import { signedByte } from './byteMath';
import { getPlayerPixelX, getPlayerPixelY, landPlayerAt, type PlayerState } from './smbPhysics';

export interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PLATFORMS: Platform[] = [
  { x: 320, y: 320, w: 96, h: 16 },
  { x: 520, y: 250, w: 96, h: 16 },
  { x: 720, y: 320, w: 128, h: 16 },
  { x: 980, y: 270, w: 96, h: 16 },
  { x: 1180, y: 330, w: 160, h: 16 },
];

/** Vertical band below a platform top that still counts as a landing. */
const LANDING_BAND_TOP = 4;
const LANDING_BAND_BOTTOM = 14;

/**
 * Demo/platform collision glue: land the player on top of platforms when falling
 * through their top surface band. SMB resolves collisions via BG/tile logic in-engine.
 */
export function resolvePlatformLandings(player: PlayerState, prevPy: number): void {
  const px = getPlayerPixelX(player);
  const py = getPlayerPixelY(player);
  if (signedByte(player.ySpeed) < 0) return; // moving up, don't land on top

  for (const platform of PLATFORMS) {
    const overlapX = px < platform.x + platform.w && px + PLAYER_WIDTH > platform.x;
    const prevBottom = prevPy + PLAYER_HEIGHT;
    const bottom = py + PLAYER_HEIGHT;
    const crossesTop =
      prevBottom <= platform.y + LANDING_BAND_TOP &&
      bottom >= platform.y &&
      bottom <= platform.y + LANDING_BAND_BOTTOM;

    if (overlapX && crossesTop) {
      landPlayerAt(player, platform.y - PLAYER_HEIGHT);
    }
  }
}
