/**
 * Open Color Wheel — fonts
 *
 * Fetches Mona Sans and Hubot Sans from GitHub's own type repos (pinned to a
 * tagged release, not `main`, so this is reproducible), subsets each to Latin,
 * and writes .woff2 + the OFL license text into fonts/.
 *
 * Run: npm run fonts
 *
 * Hubot Sans carries the headings, Mona Sans the body -- the pairing GitHub
 * itself uses. Only the weights css/site.css actually declares are fetched.
 * An earlier prototype inlined the full variable fonts as base64 and the page
 * hit ~845KB; static, subsetted, linked woff2 stays far under that.
 */

import subsetFont from 'subset-font';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS_DIR = join(ROOT, 'fonts');
mkdirSync(FONTS_DIR, { recursive: true });

const MONA_SANS_TAG = 'v2.0.27';
const HUBOT_SANS_TAG = 'v1.0.1';
const MONASPACE_TAG = 'v1.400';

const mona = file =>
  `https://raw.githubusercontent.com/github/mona-sans/${MONA_SANS_TAG}/fonts/webfonts/static/${file}`;
const hubot = file =>
  `https://raw.githubusercontent.com/github/hubot-sans/${HUBOT_SANS_TAG}/fonts/webfonts/${file}`;
// Monaspace's repo keeps its web fonts under directories with spaces in the
// names, so these have to stay percent-encoded.
const monaspace = file =>
  `https://raw.githubusercontent.com/githubnext/monaspace/${MONASPACE_TAG}` +
  `/fonts/Web%20Fonts/Static%20Web%20Fonts/Monaspace%20Neon/${file}`;

/* Exactly the faces css/site.css declares, and no more: every heading is
 * Hubot Bold, and body text only ever asks Mona for 400 and 500. A Mona Bold
 * was fetched at first and turned out to be requested by nothing on the
 * page -- 35KB of payload for zero glyphs rendered. */
const FONTS = [
  { url: mona('MonaSans-Regular.woff2'), out: 'MonaSans-Regular.woff2' },
  { url: mona('MonaSans-Medium.woff2'), out: 'MonaSans-Medium.woff2' },
  { url: mona('MonaSans-SemiBold.woff2'), out: 'MonaSans-SemiBold.woff2' },
  { url: hubot('HubotSans-Bold.woff2'), out: 'HubotSans-Bold.woff2' },
  { url: monaspace('MonaspaceNeon-Regular.woff2'), out: 'MonaspaceNeon-Regular.woff2' },
];

/* All three families ship the same OFL-1.1 text under different copyright
 * holders, so they are concatenated into one fonts/OFL.txt. OFL-1.1 requires
 * the licence travel with the fonts along with each copyright notice; it does
 * not require a separate file per family. */
const LICENSES = [
  { name: 'Mona Sans', url: `https://raw.githubusercontent.com/github/mona-sans/${MONA_SANS_TAG}/OFL.txt` },
  // hubot-sans ships its OFL text as LICENSE rather than OFL.txt at this tag.
  { name: 'Hubot Sans', url: `https://raw.githubusercontent.com/github/hubot-sans/${HUBOT_SANS_TAG}/LICENSE` },
  { name: 'Monaspace Neon', url: `https://raw.githubusercontent.com/githubnext/monaspace/${MONASPACE_TAG}/LICENSE` },
];

/**
 * Google Fonts' standard "latin" subset range, expanded to literal
 * characters -- the subset-font/hb-subset API takes text, not unicode
 * ranges. Printable characters only; control code points are excluded.
 */
function latinText() {
  const ranges = [
    [0x20, 0x7e], [0xa0, 0xff], // basic Latin + Latin-1 Supplement, printable
    [0x131, 0x131], [0x152, 0x153], [0x2bb, 0x2bc],
    [0x2000, 0x206f], // general punctuation
    [0x2074, 0x2074], [0x20ac, 0x20ac], [0x2122, 0x2122],
    [0x2191, 0x2191], [0x2193, 0x2193], [0x2212, 0x2212], [0x2215, 0x2215],
  ];
  let chars = '';
  for (const [start, end] of ranges) {
    for (let cp = start; cp <= end; cp++) chars += String.fromCodePoint(cp);
  }
  return chars;
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed for ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const text = latinText();
  let total = 0;

  for (const font of FONTS) {
    const buffer = await fetchBuffer(font.url);
    const subset = await subsetFont(buffer, text, { targetFormat: 'woff2' });
    writeFileSync(join(FONTS_DIR, font.out), subset);
    total += subset.length;
    console.log(`${font.out}  ${(buffer.length / 1024).toFixed(0)}KB -> ${(subset.length / 1024).toFixed(0)}KB`);
  }

  const notices = [];
  for (const license of LICENSES) {
    const res = await fetch(license.url);
    if (!res.ok) throw new Error(`fetch failed for ${license.url}: ${res.status}`);
    notices.push(`${'='.repeat(72)}
${license.name}
${license.url}
${'='.repeat(72)}

${await res.text()}`);
  }
  writeFileSync(join(FONTS_DIR, 'OFL.txt'), notices.join('

'));
  console.log('OFL.txt');

  console.log(`\ntotal font payload: ${(total / 1024).toFixed(0)}KB`);
}

main();
