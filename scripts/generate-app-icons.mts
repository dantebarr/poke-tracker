/**
 * Generates the app's browser-tab and home-screen icons from Warden Baoba's
 * head, transparent everywhere except the iOS icon.
 *
 * At icon sizes a full-body 32x32 overworld sprite is unreadable, so only the
 * head is used and it is scaled to fill the canvas edge to edge. Every
 * enlargement is an integer nearest-neighbour scale: a pixel sprite blurs the
 * moment it is resampled at a fractional factor, which is also why the tab
 * icon is 34px rather than the conventional 32 — 34 is 2x the head, and a
 * browser softening it by 6% costs far less than scaling by 1.88x here would.
 *
 * Outputs are committed. Re-run and commit the result if the sprite changes.
 *
 * Usage: node scripts/generate-app-icons.mts
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPRITE_PATH = path.join(REPO_ROOT, "public", "npc", "baoba-hgss.png");

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** `--safari-mid` from globals.css — the app chrome's mid green. */
const SAFARI_MID = { r: 0x2f, g: 0x8f, b: 0x47, alpha: 1 };

/**
 * Baoba's head within the trimmed 17x24 sprite: the hat down to the bottom of
 * his beard, stopping just as the collar starts. It happens to be square,
 * which is what lets the square canvases below come out evenly.
 */
const HEAD = { left: 0, top: 0, width: 17, height: 17 };

type IconTarget = {
  /** Repo-relative output path. */
  file: string;
  /** Output canvas, square. */
  size: number;
  /** Integer nearest-neighbour multiplier applied to the head crop. */
  scale: number;
  /** Canvas fill behind the head. Defaults to transparent. */
  background?: typeof SAFARI_MID;
};

/** Each scale is the largest that still fits, so the head all but fills the canvas. */
const TARGETS: IconTarget[] = [
  // Next serves these two from their file conventions: the tab icon and the
  // iOS home-screen icon.
  { file: "src/app/icon.png", size: 34, scale: 2 },
  // iOS ignores alpha on the home screen and composites apple-touch-icon onto
  // solid black, so this one carries the green rather than take that black.
  { file: "src/app/apple-icon.png", size: 180, scale: 10, background: SAFARI_MID },
  // Referenced by src/app/manifest.ts for Android home-screen shortcuts.
  { file: "public/icon-192.png", size: 192, scale: 11 },
  { file: "public/icon-512.png", size: 512, scale: 30 },
];

/**
 * The tab icon is emitted twice: as `icon.png` and as `favicon.ico`. Next
 * renders a `<link>` for each, and which one a browser prefers is not worth
 * guessing at — so both are generated from the same sprite and agree.
 */
const FAVICON_SOURCE = "src/app/icon.png";
const FAVICON_PATH = "src/app/favicon.ico";

/**
 * Wraps a PNG in a single-entry ICO container. Every browser that reads .ico
 * at all has accepted PNG-encoded entries since Vista, and re-encoding to BMP
 * would only cost us the alpha channel.
 */
function icoFromPng(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(size, 6); // width
  header.writeUInt8(size, 7); // height
  header.writeUInt8(0, 8); // palette size: not paletted
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

async function main() {
  // Trim first so the crop is measured against Baoba himself, not against the
  // transparent padding the source sprite carries.
  const head = await sharp(SPRITE_PATH)
    .trim({ threshold: 0 })
    .extract(HEAD)
    .toBuffer({ resolveWithObject: true });

  for (const target of TARGETS) {
    const width = head.info.width * target.scale;
    const height = head.info.height * target.scale;
    if (width > target.size || height > target.size) {
      throw new Error(`${target.file}: head at ${target.scale}x (${width}x${height}) overflows ${target.size}px`);
    }

    const scaled = await sharp(head.data)
      .resize(width, height, { kernel: "nearest" })
      .toBuffer();

    const outputPath = path.join(REPO_ROOT, target.file);
    await sharp({
      create: {
        width: target.size,
        height: target.size,
        channels: 4,
        background: target.background ?? TRANSPARENT,
      },
    })
      .composite([
        {
          input: scaled,
          left: Math.round((target.size - width) / 2),
          top: Math.round((target.size - height) / 2),
        },
      ])
      .png()
      .toFile(outputPath);

    console.log(`Wrote ${target.file} (${target.size}x${target.size}, head at ${target.scale}x)`);
  }

  const faviconSource = TARGETS.find((target) => target.file === FAVICON_SOURCE);
  if (!faviconSource) throw new Error(`No target generates ${FAVICON_SOURCE}`);

  const png = await readFile(path.join(REPO_ROOT, FAVICON_SOURCE));
  await writeFile(path.join(REPO_ROOT, FAVICON_PATH), icoFromPng(png, faviconSource.size));
  console.log(`Wrote ${FAVICON_PATH} (${faviconSource.size}x${faviconSource.size}, from ${FAVICON_SOURCE})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
