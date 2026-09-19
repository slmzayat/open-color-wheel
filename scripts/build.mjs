/**
 * Open Color Wheel — build
 *
 * Reads data/spec.json (the only hand-authored numbers in the repo) and emits:
 *   data/palette.js     — every resolved color with its measured contrast,
 *                         as a global that index.html and verify.mjs both read
 *   css/tokens.css      — the shippable custom properties
 *
 * Run: node scripts/build.mjs
 *
 * Nothing here is hand-tuned. If a color looks wrong, fix the spec, not the output.
 */

import { resolve, solveLightness, gamutBoundary, nearestHue } from './color.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(readFileSync(join(ROOT, 'data/spec.json'), 'utf8'));

const STEPS = Object.keys(spec.steps).filter(k => !k.startsWith('$')).map(Number);

/* ---------- generate ----------------------------------------------------- */

const lightness = Object.fromEntries(
  STEPS.map(s => [s, solveLightness(spec.steps[String(s)].contrastTarget)])
);

const envelope = spec.chromaEnvelope;
const peakEnvelope = Math.max(...STEPS.map(s => envelope[String(s)]));

const scales = {};

// Gray families: same lightness curve, chroma scaled by the envelope shape
// so the tint peaks mid-ramp and fades at both ends.
for (const [name, cfg] of Object.entries(spec.grayFamilies)) {
  if (name.startsWith('$')) continue;
  scales[name] = { kind: 'gray', note: cfg.note, hue: cfg.hue, steps: {} };
  for (const s of STEPS) {
    const c = (envelope[String(s)] / peakEnvelope) * cfg.peakChroma;
    scales[name].steps[s] = resolve(lightness[s], c, cfg.hue, true);
  }
}

// Chromatic hues: full envelope, gamut-mapped per hue.
for (const [name, cfg] of Object.entries(spec.hues)) {
  if (name.startsWith('$')) continue;
  scales[name] = { kind: 'chromatic', angle: cfg.angle, origin: cfg.origin, steps: {} };
  for (const s of STEPS) {
    scales[name].steps[s] = resolve(lightness[s], envelope[String(s)], cfg.angle);
  }
}

/* ---------- the contract -------------------------------------------------
 * onSolid is COMPUTED, never authored. For any color, contrast-vs-white
 * multiplied by contrast-vs-black always equals 21, so the worse of the two
 * can never drop below sqrt(21) = 4.583. Picking the better foreground
 * therefore clears 4.5:1 for every hue, with no exceptions and no asterisks.
 * This is why the palette's promise is stated as a PAIRING, not as
 * "step 600 is readable on white" — which is false for 7 hues.
 * ------------------------------------------------------------------------ */

const solidStep = spec.roles.accent.solid.light;
for (const [name, scale] of Object.entries(scales)) {
  if (scale.kind !== 'chromatic') continue;
  const s = scale.steps[solidStep];
  scale.onSolid = s.contrastWhite >= s.contrastBlack ? 'white' : 'black';
  scale.onSolidContrast = Math.max(s.contrastWhite, s.contrastBlack);
}

for (const [name, scale] of Object.entries(scales)) {
  if (scale.kind !== 'chromatic') continue;
  const snap = offset => nearestHue(spec.hues, scale.angle + offset, name);
  // Split-complementary deliberately skips the complement for the two hues
  // flanking it, and triadic takes the even thirds. Audited across all 17
  // hues: no pair ever snaps to the same name, and no split-complement ever
  // lands on the complement, so neither needs extra exclusion logic.
  scale.harmonies = {
    complementary: snap(180),
    analogous: [snap(30), snap(-30)],
    splitComplementary: [snap(150), snap(210)],
    triadic: [snap(120), snap(240)],
  };
}

/* No build timestamp here on purpose. The same spec has to produce a
 * byte-identical palette, because CI asserts exactly that with a
 * git diff --exit-code; a date field fails that check on any day after
 * the commit. Provenance lives in the git history, not in the artifact. */
const palette = {
  version: spec.version,
  steps: spec.steps,
  scales,
};

/* One data artifact, not two copies of the same numbers. It is a plain global
 * rather than JSON because index.html loads it with a classic <script src> and
 * js/app.js reads window.OCW_PALETTE synchronously -- fetch()-ing a local file
 * is blocked as cross-origin in every major browser, so a JSON-plus-fetch page
 * breaks the instant someone opens it with a double-click instead of a server.
 * scripts/verify.mjs parses this same file. It stays minified: it is the only
 * data payload the page downloads, and nothing reads it by hand. */
writeFileSync(join(ROOT, 'data/palette.js'), `window.OCW_PALETTE = ${JSON.stringify(palette)};\n`);

/* ---------- emit CSS ----------------------------------------------------- */

const grayNames = Object.keys(spec.grayFamilies).filter(k => !k.startsWith('$'));
const hueNames = Object.keys(spec.hues).filter(k => !k.startsWith('$'));
const bind = spec.roles.familyBinding;

const ref = (family, token) =>
  token === 'white' || token === 'black' ? token : `var(--color-${family}-${token})`;

let tokens = '';

for (const name of [...grayNames, ...hueNames]) {
  tokens += `\n  /* ${name} */\n`;
  for (const s of STEPS) {
    tokens += `  --color-${name}-${s}: ${scales[name].steps[s].oklch};\n`;
  }
}

tokens += `\n  /* ---- neutral roles (bound to "${bind}") ---- */\n`;
for (const [role, pair] of Object.entries(spec.roles.neutral)) {
  tokens += `  --color-${role}: light-dark(${ref(bind, pair.light)}, ${ref(bind, pair.dark)});\n`;
}

tokens += `\n  /* ---- accent roles ----\n`;
tokens += `   * on-solid is computed per hue: whichever of white/black actually\n`;
tokens += `   * clears 4.5:1 against that hue's solid step. Never assume white.\n`;
tokens += `   */\n`;
for (const name of hueNames) {
  const a = spec.roles.accent;
  tokens += `\n  --color-${name}-solid: var(--color-${name}-${a.solid.light});\n`;
  tokens += `  --color-${name}-on-solid: ${scales[name].onSolid}; /* ${scales[name].onSolidContrast.toFixed(2)}:1 */\n`;
  tokens += `  --color-${name}-text: light-dark(var(--color-${name}-${a.text.light}), var(--color-${name}-${a.text.dark}));\n`;
  tokens += `  --color-${name}-border: light-dark(var(--color-${name}-${a.border.light}), var(--color-${name}-${a.border.dark}));\n`;
}

/* ---------- the same tokens, twice ---------------------------------------
 * :root makes this plain, working CSS with no build step -- what the README
 * promises with a bare <link rel="stylesheet">. @theme is Tailwind v4's own
 * token syntax: inert in a browser on its own, but picked up by Tailwind's
 * build to also generate matching utility classes (bg-red-600 and so on) --
 * what "drop into a Tailwind v4 project with no class renaming" promises.
 * Shipping only @theme (as an earlier version of this file did) satisfies
 * neither claim in a plain browser: unknown at-rule bodies without a
 * selector are never applied as custom properties.
 * ------------------------------------------------------------------------ */
const css = `/* Open Color Wheel v${spec.version} — GENERATED by scripts/build.mjs. Do not edit.
 * Regenerate with: node scripts/build.mjs
 * Contract and stability policy: docs/CONTRACT.md
 */

:root {
  color-scheme: light dark;
${tokens}}

@theme {
${tokens}}
`;

writeFileSync(join(ROOT, 'css/tokens.css'), css);

const total = Object.keys(scales).length * STEPS.length;
console.log(`built ${Object.keys(scales).length} scales x ${STEPS.length} steps = ${total} colors`);
console.log(`  data/palette.js`);
console.log(`  css/tokens.css`);
