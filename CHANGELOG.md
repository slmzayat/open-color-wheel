# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Step numbers are structural, so a color value may shift in a minor or patch
release. See [`docs/CONTRACT.md`](docs/CONTRACT.md) for what counts as breaking.

## [Unreleased]

## [0.1.0] - 2026-09-19

First public release. 242 colors across 22 scales, 11 steps each.

### Added

- OKLCH palette generated from `data/spec.json`: 5 gray families and 17
  chromatic hues, numbered 50 to 950 to match Tailwind v4.
- `css/tokens.css` with a `:root` block for plain CSS and a `@theme` block for
  Tailwind v4. Roles use `light-dark()`, so `color-scheme` switches modes.
- Computed `on-solid` foreground per hue, guaranteeing WCAG AA on every solid.
- P3 values, alpha approximations for light and dark surfaces, and APCA scores.
- Four harmony families per hue, snapped to real palette tokens:
  complementary, analogous, split-complementary and triadic.
- `docs/CONTRACT.md` with seven promises, six non-promises and a stability
  policy, asserted by 1579 checks in `scripts/verify.mjs`.
- 45 unit tests covering the color math, the generated CSS, the gamut drift
  budget, and the measured figures the contract quotes.
- Documentation site with a swatch grid and a per-color detail dialog,
  self-hosted fonts, and no runtime dependencies.
- `og.png`, a 1200x630 social preview rendered from the palette by the build.
- `LICENSE`, `.gitattributes`, and one CI workflow that runs the contract, the
  tests and a drift check, then publishes to Pages only if all three pass.

### Fixed

- Hex values now always render six digits. `colorjs.io` collapsed `#777777` to
  `#777`, so `neutral-600` and `neutral-900` shipped three-digit while the
  other 240 shipped six.
- The role banner above the grid inverts in dark mode. Role bindings flip
  between schemes, so the light order labelled the wrong end of every ramp.
- Builds are reproducible. A build timestamp made every rebuild differ from the
  committed output and broke the CI drift check a day after any commit.
- `CONTRACT.md` N1 and N2 corrected against the data. N2 named six hues capping
  below AAA at step 700 when there are seven, omitting yellow at 6.98:1.

[Unreleased]: https://github.com/slmzayat/open-color-wheel/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/slmzayat/open-color-wheel/releases/tag/v0.1.0
