import { Direction, getPlayerPixelX, getPlayerPixelY, type PlayerState } from './smbPhysics';
import {
  CAMERA_FOLLOW_X_FACTOR,
  CAMERA_LERP,
  GROUND_EXTENT_X,
  GROUND_TILE_WIDTH,
  GROUND_Y,
  HUD_HEIGHT,
  HUD_WIDTH,
  HUD_X,
  HUD_Y,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
} from './config';
import { PLATFORMS } from './world';

export interface RenderView {
  player: PlayerState;
  cameraX: number;
  blinking: boolean;
  idleLooking: boolean;
  runHighlight: boolean;
}

interface PlayerSpriteView {
  blinking: boolean;
  idleLooking: boolean;
  runHighlight: boolean;
}

export function updateCamera(cameraX: number, playerPx: number, canvasWidth: number): number {
  const targetCam = playerPx - canvasWidth * CAMERA_FOLLOW_X_FACTOR;
  let next = cameraX + (targetCam - cameraX) * CAMERA_LERP;
  if (next < 0) next = 0;
  return next;
}

export function render(ctx: CanvasRenderingContext2D, view: RenderView, canvasWidth: number, canvasHeight: number): void {
  const { player, cameraX, blinking, idleLooking, runHighlight } = view;
  const px = getPlayerPixelX(player);
  const py = getPlayerPixelY(player);

  drawSky(ctx, canvasWidth, canvasHeight);
  drawGround(ctx, cameraX, canvasWidth, canvasHeight);
  drawPlatforms(ctx, cameraX);
  drawPlayer(ctx, px - cameraX, py, player, { blinking, idleLooking, runHighlight });
  drawHud(ctx, player, px, py);
}

function drawSky(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = '#5c94fc';
  ctx.fillRect(0, 0, width, height);
}

function drawGround(ctx: CanvasRenderingContext2D, cameraX: number, width: number, height: number): void {
  ctx.fillStyle = '#c84c0c';
  ctx.fillRect(-cameraX, GROUND_Y, GROUND_EXTENT_X, height - GROUND_Y);

  ctx.fillStyle = '#d85c18';
  for (let x = -((cameraX % GROUND_TILE_WIDTH) + GROUND_TILE_WIDTH); x < width + GROUND_TILE_WIDTH; x += GROUND_TILE_WIDTH) {
    ctx.fillRect(x, GROUND_Y, GROUND_TILE_WIDTH - 1, 6);
  }

  ctx.fillStyle = '#00000022';
  for (let x = -((cameraX % GROUND_TILE_WIDTH) + GROUND_TILE_WIDTH); x < width + GROUND_TILE_WIDTH; x += GROUND_TILE_WIDTH) {
    ctx.fillRect(x, GROUND_Y + 6, GROUND_TILE_WIDTH - 1, 2);
  }
}

function drawPlatforms(ctx: CanvasRenderingContext2D, cameraX: number): void {
  for (const platform of PLATFORMS) {
    ctx.fillStyle = '#b85c00';
    ctx.fillRect(platform.x - cameraX, platform.y, platform.w, platform.h);
    ctx.fillStyle = '#e8a020';
    ctx.fillRect(platform.x - cameraX, platform.y, platform.w, 4);
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  player: PlayerState,
  sprite: PlayerSpriteView,
): void {
  ctx.fillStyle = '#e02020';
  ctx.fillRect(sx, sy, PLAYER_WIDTH, PLAYER_HEIGHT);

  ctx.fillStyle = '#f8d878';
  ctx.fillRect(sx + 2, sy + 4, 12, 10);

  ctx.fillStyle = '#6b3f00';
  const eyeX = sprite.idleLooking ? sx + 6 : player.facingDir === Direction.Right ? sx + 9 : sx + 3;
  if (sprite.blinking) {
    ctx.fillRect(eyeX, sy + 8, 4, 1);
  } else {
    ctx.fillRect(eyeX, sy + 7, 4, 3);
  }

  if (sprite.runHighlight) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - 1, sy - 1, PLAYER_WIDTH + 2, PLAYER_HEIGHT + 2);
  }
}

function drawHud(ctx: CanvasRenderingContext2D, player: PlayerState, px: number, py: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(HUD_X, HUD_Y, HUD_WIDTH, HUD_HEIGHT);
  ctx.fillStyle = '#fff';
  ctx.font = '12px monospace';
  ctx.fillText(`X:${Math.floor(px)} Y:${Math.floor(py)} state:${player.playerState}`, HUD_X + 6, HUD_Y + 14);
}
