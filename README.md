# 🌈 Open Color Wheel

242 open-source UI colors in [OKLCH](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch): 22 scales of 11 steps, numbered 50 to 950 like Tailwind v4. CI verifies every contrast promise on every commit.

**Mathematically rigorous.** Contrast floors, gamut-mapping drift, and `:root` / `@theme` token parity are asserted in CI, not assumed.

**[Live demo](https://slmzayat.github.io/open-color-wheel/)**

## Use it

```html
<link rel="stylesheet" href="css/tokens.css">
```

```css
.button {
  background: var(--color-blue-solid);
  color: var(--color-blue-on-solid);
}
```

`on-solid` picks black or white per hue, so every pair clears WCAG AA. Dark mode needs no extra CSS: roles use [`light-dark()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark), so setting `color-scheme` switches them. `tokens.css` also emits a Tailwind v4 `@theme` block.

## How it works

Open Color named its scales well but hand-picked its hex values, so contrast drifted from hue to hue. This project keeps the naming and generates the numbers. OKLCH holds perceptual lightness steady, so step 600 reads the same weight in red as in teal.

`data/spec.json` holds every hand-authored number. The build derives the rest, and adds P3 values, alpha approximations, [APCA](https://github.com/Myndex/apca-w3) scores, and harmonies snapped to real tokens. [`docs/CONTRACT.md`](docs/CONTRACT.md) states what this palette promises and what it does not.

```bash
npm install
npm run check   # rebuild from spec, then assert the contract
npm test        # unit tests
```

Edit `data/spec.json`, never `css/tokens.css` or `data/palette.js`. CI rejects any drift.

The two commands check different things, and CI runs both:

- **`npm run verify`** asserts the 1579 contract checks against the generated
  palette. It tells you the output is wrong, not which line made it wrong.
- **`npm test`** covers the arithmetic in `scripts/color.mjs` and the shape of
  the generated files, including inputs the spec never produces: hue wraparound,
  degenerate alpha solves, gamut edges, and the drift budget the mapping has to
  stay inside. It caught a hex serialization bug the contract checks could not see.

## Credits

- Palette: [Open Color](https://github.com/yeun/open-color) by Heeyeun Joo
- Color math: [Color.js](https://colorjs.io), [apca-w3](https://github.com/Myndex/apca-w3)
- Type: [Mona Sans, Hubot Sans](https://github.com/github/mona-sans) and [Monaspace](https://monaspace.githubnext.com/) by GitHub
- Icons: [Material Design Icons](https://github.com/google/material-design-icons) by Google
- Interface: [Radix Colors](https://www.radix-ui.com/colors), [Pantone](https://www.pantone.com), motion by [Emil Kowalski](https://github.com/emilkowalski/skills)
- Built with Claude Opus 5 by Anthropic

MIT for code and palette, OFL-1.1 for fonts, Apache-2.0 for icons.
