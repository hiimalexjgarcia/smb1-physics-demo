import { GROUND_Y, PLAYER_HEIGHT } from './config';
import type { Buttons } from './controls';
import {
  getPlayerPixelY,
  landPlayerAt,
  resolveDemoGround,
  stepPlayerPhysics,
  type PlayerState,
} from './smbPhysics';
import { resolvePlatformLandings } from './world';

/** Place the player on the flat demo ground at session start/reset. */
export function placePlayerOnGround(player: PlayerState): void {
  landPlayerAt(player, GROUND_Y - PLAYER_HEIGHT);
}

/**
 * Advance the player one fixed simulation step.
 *
 * The order matters: SMB core physics runs first, then demo ground collision,
 * then platform landing using the pre-step Y so thin surfaces are not missed.
 */
export function stepSimulation(player: PlayerState, input: Buttons): void {
  const prevPy = getPlayerPixelY(player);

  stepPlayerPhysics(player, input);
  resolveDemoGround(player, GROUND_Y, PLAYER_HEIGHT);
  resolvePlatformLandings(player, prevPy);
}
