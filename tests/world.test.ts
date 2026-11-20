import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAYER_HEIGHT } from '../src/config';
import { createPlayer, getPlayerPixelY, PlayerMotionState, setPlayerPixelX, setPlayerPixelY } from '../src/smbPhysics';
import { PLATFORMS, resolvePlatformLandings } from '../src/world';

const platform = PLATFORMS[0];

test('platform landing snaps the player to the top surface', () => {
  const player = createPlayer();
  const prevPy = platform.y - PLAYER_HEIGHT - 2;

  setPlayerPixelX(player, platform.x + 10);
  setPlayerPixelY(player, platform.y - PLAYER_HEIGHT + 2);
  player.ySpeed = 1;
  player.playerState = PlayerMotionState.Falling;
  player.onGround = false;

  resolvePlatformLandings(player, prevPy);

  assert.equal(getPlayerPixelY(player), platform.y - PLAYER_HEIGHT);
  assert.equal(player.ySpeed, 0);
  assert.equal(player.playerState, PlayerMotionState.OnGround);
  assert.equal(player.onGround, true);
});

test('platform landing is ignored while moving upward', () => {
  const player = createPlayer();
  const prevPy = platform.y - PLAYER_HEIGHT - 2;
  const currentY = platform.y - PLAYER_HEIGHT + 2;

  setPlayerPixelX(player, platform.x + 10);
  setPlayerPixelY(player, currentY);
  player.ySpeed = 0xff; // -1
  player.playerState = PlayerMotionState.Jumping;
  player.onGround = false;

  resolvePlatformLandings(player, prevPy);

  assert.equal(getPlayerPixelY(player), currentY);
  assert.equal(player.playerState, PlayerMotionState.Jumping);
  assert.equal(player.onGround, false);
});
