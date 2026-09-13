# The contract

What Open Color Wheel promises, what it deliberately does not, and what counts
as a breaking change. Everything here is asserted by `scripts/verify.mjs` and
enforced on every commit. A guarantee that isn't tested is a guarantee that
quietly rots — which is roughly how the original Open Color ended up needing
this rewrite.

## Promises

**P1 — Solid pairing.** Every chromatic hue's `solid` step (600) clears 4.5:1
against its own `on-solid` foreground. `on-solid` is computed per hue, not
assumed to be white.

**P2 — Accent text on accent background.** Every hue's step 700 clears 4.5:1
against its own step 50.

**P3 — Gray AAA.** Every gray family's step 700 clears 7:1 against white.

**P4 — Chromatic AA.** Every chromatic hue's step 700 clears 4.5:1 against white.

**P5 — Component borders.** `border-strong` clears 3:1 (WCAG 1.4.11) in both
light and dark mode.

**P6 — Portable steps.** A step number means the same lightness on every scale,
within 0.012 OKLCH L.

**P7 — Monotonic ramps.** Every scale darkens strictly from 50 to 950.

## Deliberate non-promises

Stating these plainly is the point. A contract with silent exceptions is worse
than a smaller contract.

**N1 — Step 600 is not readable on white for every hue.** It is not, and it
cannot be. Seven hues in the yellow-through-cyan region land at 4.09–4.48:1.
This is a property of sRGB, not a bug: a yellow dark enough for 4.5:1 against
white is no longer recognizably yellow. **This is exactly why P1 is written as
a pairing.** For any color, contrast-vs-white × contrast-vs-black = 21 exactly,
so the worse of the two can never fall below √21 ≈ 4.583. Picking the better
foreground therefore always clears 4.5:1. The promise is achievable for all 17
hues; "readable on white" never was.

**N2 — Chromatic hues are not promised AAA.** Grays are (P3). Six hues —
lime, green, emerald, teal, cyan, sky — reach only 6.4–6.7:1 at step 700.
Requiring AAA would force them off the shared lightness curve and break P6.

**N3 — Plain `border` is decorative.** Step 300 is 1.70:1. Use it for dividers
and table rules. It is not a valid sole boundary for an interactive component;
`border-strong` is.

**N4 — APCA is reported, not promised.** Every step's `apca.onWhite` /
`apca.onBlack` (Lc) is computed via `apca-w3`, the reference implementation
licensed to W3C/AGWG — not hand-rolled, resolving the original concern about
the math. What's still missing is a *threshold*: WCAG3's APCA conformance
levels aren't finalized, so this project isn't going to invent its own
pass/fail cutoff. All promises above (P1–P7) remain WCAG 2.x only. Lc is
informational until APCA has an official threshold to promise against.

**N5 — P3 is reported, not shipped as tokens.** Every step's `p3` field (plus
`p3AlphaLight`/`p3AlphaDark`) is computed via gamut-mapping the unclamped
OKLCH request into Display P3, so hues that clip in sRGB keep their extra
chroma here. This is available in `data/palette.json` for tooling and the
color detail view. `css/tokens.css` still ships sRGB-safe `oklch()` values
only — turning P3 into actual CSS custom properties is `vivid` mode's job
(see the roadmap), not a promise this contract makes today.

**N6 — Alpha and harmonies are derived, not promised.** `alphaLight` /
`alphaDark` / `p3AlphaLight` / `p3AlphaDark` are a best-fit {alpha,
foreground} pair solved to *approximate* the opaque step over white or black
— least squares across R/G/B, not an exact reconstruction, because one alpha
value can't satisfy three independent channels at once. `harmonies`
(complementary/analogous) are nearest-angle matches against the 17 hue
angles, not guaranteed to be within any particular angular tolerance for
every hue — some hues have wide open gaps on one side by design (see
`spec.json`'s hue comments) and will snap further than others. Neither is an
accessibility promise; both are reported as-computed.

## Stability policy

The durable half of this system is that **step numbers carry use cases**. Step
600 means "solid fill" regardless of what hex it currently resolves to. That is
what lets values improve without breaking anyone.

**Breaking (major version):**

- Removing a scale or a step
- Changing what a step is *for* (the `use` field in `spec.json`)
- Changing a role's meaning, or removing a role
- Weakening or removing a promise above

**Not breaking (minor or patch):**

- Hex and OKLCH values shifting because the generator improved
- Gamut mapping changing
- Adding scales, steps, roles, or output formats
- Adding P3 or APCA output alongside existing output
- Tightening a promise, or converting a non-promise into a promise

Without this written down, the first accuracy improvement becomes a frightening
major-version decision. With it, values can be regenerated freely for years.

## Verifying

```
npm run check      # build, then verify
```

Exits non-zero on any failed promise. Wire it into CI before anything else.
