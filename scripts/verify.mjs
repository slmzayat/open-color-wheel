/**
 * Open Color Wheel — verify
 *
 * Asserts the promises in docs/CONTRACT.md against the generated palette and
 * exits non-zero if any fail. Wire this into CI. A guarantee that isn't tested
 * on every commit is a guarantee that quietly rots.
 *
 * Run: node scripts/verify.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* palette.js is the single generated data artifact -- it is a plain global
 * assignment so the page can load it over file://, so strip the wrapper to get
 * back to JSON rather than keeping a second .json copy in sync. */
const paletteSource = readFileSync(join(ROOT, 'data/palette.js'), 'utf8');
const palette = JSON.parse(paletteSource.slice(paletteSource.indexOf('{'), paletteSource.lastIndexOf('}') + 1));

const AA_TEXT = 4.5;
const AA_LARGE = 3.0;
const AAA_TEXT = 7.0;
const TOLERANCE = 0.02; // rounding slack on 2-decimal stored ratios

let failures = 0;
let checks = 0;

const pass = (label, detail = '') => { checks++; console.log(`  ok    ${label}${detail ? '  ' + detail : ''}`); };
const fail = (label, detail = '') => { checks++; failures++; console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`); };

const chromatic = Object.entries(palette.scales).filter(([, s]) => s.kind === 'chromatic');
const grays = Object.entries(palette.scales).filter(([, s]) => s.kind === 'gray');

/* ---- C1: the solid pairing ----------------------------------------------
 * Every hue's solid step must clear AA text against its designated
 * foreground. This is the headline promise. It is stated as a PAIRING
 * (solid + its on-solid color), not as "readable on white" — the latter is
 * false for roughly seven hues and always will be, because sRGB simply
 * cannot make a yellow that is both yellow and dark.
 * ------------------------------------------------------------------------ */
console.log('\nC1  solid step clears AA text against its designated foreground');
for (const [name, scale] of chromatic) {
  const s = scale.steps['600'];
  const actual = scale.onSolid === 'white' ? s.contrastWhite : s.contrastBlack;
  const better = Math.max(s.contrastWhite, s.contrastBlack);
  if (actual + TOLERANCE < AA_TEXT) {
    fail(`${name}-600 on ${scale.onSolid}`, `${actual.toFixed(2)}:1 < ${AA_TEXT}`);
  } else if (actual + TOLERANCE < better) {
    fail(`${name}-600`, `chose ${scale.onSolid} but the other foreground is better`);
  } else {
    pass(`${name}-600 on ${scale.onSolid}`, `${actual.toFixed(2)}:1`);
  }
}

/* ---- C2: text steps on their own light backgrounds ---------------------- */
console.log('\nC2  text step (700) clears AA text on the same hue\'s 50 background');
for (const [name, scale] of chromatic) {
  // Contrast between two colors, both expressed as ratios against white.
  const lum = r => 1.05 / r - 0.05;
  const a = lum(scale.steps['700'].contrastWhite);
  const b = lum(scale.steps['50'].contrastWhite);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  ratio + TOLERANCE >= AA_TEXT
    ? pass(`${name}-700 on ${name}-50`, `${ratio.toFixed(2)}:1`)
    : fail(`${name}-700 on ${name}-50`, `${ratio.toFixed(2)}:1 < ${AA_TEXT}`);
}

/* ---- C3: AAA at step 700, gray families only ----------------------------
 * Gray families are solved directly for their contrast targets, so AAA at
 * step 700 is exact by construction. Chromatic hues are NOT promised AAA:
 * see C3b. Writing this as a universal promise would be a lie, and a lie in
 * a contract file is worse than a missing feature.
 * ------------------------------------------------------------------------ */
console.log('\nC3  step 700 clears AAA text against white (gray families — promised)');
for (const [name, scale] of grays) {
  const r = scale.steps['700'].contrastWhite;
  r + TOLERANCE >= AAA_TEXT
    ? pass(`${name}-700`, `${r.toFixed(2)}:1`)
    : fail(`${name}-700`, `${r.toFixed(2)}:1 < ${AAA_TEXT}`);
}

/* ---- C3b: chromatic 700 — AA promised, AAA advisory ---------------------
 * Every chromatic hue must clear AA text at 700. AAA is reported but not
 * required: hues in the green-through-cyan region physically cannot reach
 * 7:1 at this lightness without leaving sRGB, so requiring it would either
 * break the shared lightness curve or force those hues off the ramp.
 * ------------------------------------------------------------------------ */
console.log('\nC3b chromatic step 700 clears AA text (promised); AAA reported');
for (const [name, scale] of chromatic) {
  const r = scale.steps['700'].contrastWhite;
  const aaa = r + TOLERANCE >= AAA_TEXT ? ' [AAA]' : ' [AA only]';
  r + TOLERANCE >= AA_TEXT
    ? pass(`${name}-700`, `${r.toFixed(2)}:1${aaa}`)
    : fail(`${name}-700`, `${r.toFixed(2)}:1 < ${AA_TEXT}`);
}

/* ---- C4: non-text contrast for component borders ------------------------
 * WCAG 1.4.11 requires 3:1 for visual boundaries that identify a UI
 * component. Only border-strong (step 500 light / 600 dark) promises this.
 * Plain `border` (step 300, 1.70:1) is decorative — dividers and table
 * rules — and is intentionally exempt, which is why it is not tested here.
 * ------------------------------------------------------------------------ */
console.log('\nC4  border-strong (500 light / 600 dark) clears 3:1 for non-text');
for (const [name, scale] of grays) {
  const light = scale.steps['500'].contrastWhite;
  const dark = scale.steps['600'].contrastBlack;
  light + TOLERANCE >= AA_LARGE
    ? pass(`${name}-500 vs white`, `${light.toFixed(2)}:1`)
    : fail(`${name}-500 vs white`, `${light.toFixed(2)}:1 < ${AA_LARGE}`);
  dark + TOLERANCE >= AA_LARGE
    ? pass(`${name}-600 vs black`, `${dark.toFixed(2)}:1`)
    : fail(`${name}-600 vs black`, `${dark.toFixed(2)}:1 < ${AA_LARGE}`);
}

/* ---- C5: lightness is shared across every scale -------------------------
 * The reason a step number is portable between hues. If gamut mapping ever
 * starts moving lightness wholesale instead of mostly reducing chroma, this
 * catches it.
 *
 * Tolerance note: sRGB gamut mapping is not perfectly lightness-preserving —
 * the algorithm trades a little L to stay perceptually closest to the
 * requested color, and out-of-gamut hues drift up to ~0.009. That is well
 * below a perceptible step and does not move measured contrast materially,
 * so the bound is set at 0.012 rather than pretending drift is zero.
 * ------------------------------------------------------------------------ */
const LIGHTNESS_DRIFT_MAX = 0.012;
console.log('\nC5  every scale shares one lightness curve');
const reference = palette.scales.neutral.steps;
for (const [name, scale] of Object.entries(palette.scales)) {
  const drift = Math.max(
    ...Object.keys(reference).map(s => Math.abs(scale.steps[s].l - reference[s].l))
  );
  drift <= LIGHTNESS_DRIFT_MAX
    ? pass(`${name}`, `max drift ${drift.toFixed(4)}`)
    : fail(`${name}`, `lightness drifts ${drift.toFixed(4)}, over ${LIGHTNESS_DRIFT_MAX}`);
}

/* ---- C6: monotonic ramps ------------------------------------------------ */
console.log('\nC6  every scale darkens monotonically');
for (const [name, scale] of Object.entries(palette.scales)) {
  const ls = Object.keys(scale.steps).sort((a, b) => +a - +b).map(s => scale.steps[s].l);
  const monotonic = ls.every((v, i) => i === 0 || v < ls[i - 1]);
  monotonic ? pass(name) : fail(name, 'lightness is not strictly decreasing');
}

/* ---- C7: new fields are present and well-formed --------------------------
 * Structural completeness, not an accessibility promise: these checks catch
 * the generator silently omitting P3/APCA/alpha/harmony data, the same way
 * C5/C6 catch it silently breaking the lightness curve. Nothing here is
 * asserted as a CONTRACT.md promise (see docs/CONTRACT.md N4 on why APCA
 * specifically stays informational).
 * ------------------------------------------------------------------------ */
console.log('\nC7  P3 / APCA / alpha / harmonies are present and well-formed');

const P3_RE = /^color\(display-p3 -?\d+(\.\d+)? -?\d+(\.\d+)? -?\d+(\.\d+)?\)$/;
const HEX_ALPHA_RE = /^#[0-9a-f]{8}$/;
const P3_ALPHA_RE = /^color\(display-p3 -?\d+(\.\d+)? -?\d+(\.\d+)? -?\d+(\.\d+)? \/ \d+(\.\d+)?\)$/;

function isFiniteNonNegative(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function checkAlpha(label, a, re) {
  const ok = a && a.alpha > 0 && a.alpha <= 1 && re.test(a.css);
  ok ? pass(label, `${a.alpha}`) : fail(label, JSON.stringify(a));
}

for (const [name, scale] of Object.entries(palette.scales)) {
  for (const [step, s] of Object.entries(scale.steps)) {
    const label = `${name}-${step}`;
    P3_RE.test(s.p3) ? pass(`${label} p3`) : fail(`${label} p3`, s.p3);
    isFiniteNonNegative(s.apca?.onWhite) && isFiniteNonNegative(s.apca?.onBlack)
      ? pass(`${label} apca`, `${s.apca.onWhite} / ${s.apca.onBlack}`)
      : fail(`${label} apca`, JSON.stringify(s.apca));
    checkAlpha(`${label} alphaLight`, s.alphaLight, HEX_ALPHA_RE);
    checkAlpha(`${label} alphaDark`, s.alphaDark, HEX_ALPHA_RE);
    checkAlpha(`${label} p3AlphaLight`, s.p3AlphaLight, P3_ALPHA_RE);
    checkAlpha(`${label} p3AlphaDark`, s.p3AlphaDark, P3_ALPHA_RE);
  }
}

const hueNames = new Set(chromatic.map(([name]) => name));
for (const [name, scale] of chromatic) {
  const refs = [scale.harmonies?.complementary, ...(scale.harmonies?.analogous || [])];
  const valid = refs.every(r => r && hueNames.has(r.name) && r.name !== name);
  valid
    ? pass(`${name} harmonies`, refs.map(r => r.name).join(', '))
    : fail(`${name} harmonies`, JSON.stringify(scale.harmonies));
}

/* ---- report ------------------------------------------------------------- */
console.log(`\n${'-'.repeat(64)}`);
if (failures) {
  console.log(`FAILED  ${failures} of ${checks} checks\n`);
  process.exit(1);
}
console.log(`PASSED  all ${checks} checks  (v${palette.version})\n`);
