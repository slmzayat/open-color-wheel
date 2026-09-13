const state = { palette: null, current: null, history: [] };

const grid = document.getElementById('grid');
const dialog = document.getElementById('detail');
const detailSwatch = document.getElementById('detail-swatch');
const detailName = document.getElementById('detail-name');
const detailCode = document.getElementById('detail-code');
const detailFields = document.getElementById('detail-fields');
const detailHarmonies = document.getElementById('detail-harmonies');
const themeToggle = document.getElementById('theme-toggle');
const backButton = document.getElementById('back-button');

const HARMONY_INFO = {
  complementary: 'The color directly opposite this one on the wheel. Use it sparingly, for an accent that needs to stand out against this color.',
  analogous: "This hue's two neighbors on the wheel. They share a family resemblance, so they combine easily without clashing.",
  monochromatic: 'Every step of this same hue, from lightest to darkest. The safest palette: it already agrees with itself.',
};

function main() {
  if (!window.OCW_PALETTE) {
    grid.textContent = 'Could not load data/palette.js. Run npm run build, then reload the page.';
    return;
  }
  state.palette = window.OCW_PALETTE;
  buildGrid();
  wireDialog();
  wireTheme();
  animateStats();
}

const THEME_LABEL = { light: 'Light', dark: 'Dark' };
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function osTheme() {
  return darkQuery.matches ? 'dark' : 'light';
}

function currentTheme() {
  return document.documentElement.dataset.theme || osTheme();
}

function wireTheme() {
  const stored = localStorage.getItem('ocw-theme');
  if (stored === 'light' || stored === 'dark') {
    applyTheme(stored);
  } else {
    applyTheme(osTheme(), { followSystem: true });
  }

  themeToggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    withViewTransition(() => applyTheme(next));
    localStorage.setItem('ocw-theme', next);
  });

  darkQuery.addEventListener('change', () => {
    if (!localStorage.getItem('ocw-theme')) {
      applyTheme(osTheme(), { followSystem: true });
    }
  });
}

function applyTheme(theme, { followSystem = false } = {}) {
  if (followSystem) {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
  themeToggle.textContent = THEME_LABEL[theme];
  themeToggle.setAttribute('aria-label', `${THEME_LABEL[theme]} mode. Click to switch.`);
  syncThemeColor();
}

function syncThemeColor() {
  const resolved = getComputedStyle(document.body).backgroundColor;
  if (!resolved) return;
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = resolved;
}

function animateStats() {
  const nodes = document.querySelectorAll('.stat-number');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  for (const node of nodes) {
    const target = Number(node.textContent.replace(/,/g, ''));
    if (!Number.isFinite(target)) continue;
    const duration = 900;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = Math.round(target * eased).toLocaleString('en-US');
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

function stepKeys() {
  return sortedStepKeys(state.palette.steps);
}

function nameInk(scaleName) {
  return `light-dark(var(--color-${scaleName}-800), var(--color-${scaleName}-200))`;
}

function accentInk(scaleName) {
  return `light-dark(var(--color-${scaleName}-700), var(--color-${scaleName}-400))`;
}

function buildGrid() {
  const steps = stepKeys();
  let rowIndex = 0;
  for (const scaleName of Object.keys(state.palette.scales)) {
    const scale = state.palette.scales[scaleName];

    const row = document.createElement('div');
    row.className = 'scale-row';
    row.style.animationDelay = `${Math.min(rowIndex, 14) * 22}ms`;

    row.style.setProperty('--name-ink', nameInk(scaleName));
    rowIndex++;

    const label = document.createElement('span');
    label.className = 'scale-label meta';
    label.textContent = scaleName;
    row.appendChild(label);

    const swatches = document.createElement('div');
    swatches.className = 'scale-swatches';
    for (const stepKey of steps) {
      swatches.appendChild(swatchButton(scaleName, stepKey, scale.steps[stepKey]));
    }
    row.appendChild(swatches);

    grid.appendChild(row);
  }
}

function swatchButton(scaleName, stepKey, step) {
  const use = state.palette.steps[stepKey].use;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip chip--grid';
  btn.title = use;
  btn.setAttribute('aria-label', `${scaleName} ${stepKey}, ${use}. View details.`);

  const color = document.createElement('span');
  color.className = 'chip__color';
  color.style.background = `var(--color-${scaleName}-${stepKey})`;
  btn.appendChild(color);

  const label = document.createElement('span');
  label.className = 'chip__label';

  const code = document.createElement('span');
  code.className = 'chip__code';
  code.textContent = stepKey;
  label.appendChild(code);

  const name = document.createElement('span');
  name.className = 'chip__name';
  name.textContent = scaleName;
  label.appendChild(name);

  btn.appendChild(label);

  btn.addEventListener('click', () => openDetail(scaleName, stepKey));
  return btn;
}

function wireDialog() {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  detailSwatch.addEventListener('click', () => {
    copyToClipboard(detailSwatch.dataset.hex, detailSwatch);
  });
  backButton.addEventListener('click', goBack);
}

function openDetail(scaleName, stepKey) {
  state.history = [];
  renderDetail(scaleName, stepKey);
}

function navigateTo(scaleName, stepKey) {
  if (state.current) state.history.push(state.current);
  renderDetail(scaleName, stepKey);
}

function goBack() {
  const previous = state.history.pop();
  if (!previous) return;
  renderDetail(previous.scaleName, previous.stepKey);
}

function withViewTransition(update) {
  if (!document.startViewTransition) {
    update();
    return;
  }
  let applied = false;
  const applyOnce = () => {
    if (applied) return;
    applied = true;
    update();
  };
  try {

    const transition = document.startViewTransition(applyOnce);
    transition.ready.catch(() => {});
    transition.updateCallbackDone.catch(() => {});
    transition.finished.catch(() => {});
  } catch {
    applyOnce();
  }
  setTimeout(applyOnce, 150);
}

function renderDetail(scaleName, stepKey) {

  if (dialog.open) {
    withViewTransition(() => applyDetail(scaleName, stepKey));
  } else {
    applyDetail(scaleName, stepKey);
  }
}

function applyDetail(scaleName, stepKey) {
  state.current = { scaleName, stepKey };
  const scale = state.palette.scales[scaleName];
  const step = scale.steps[stepKey];
  const meta = state.palette.steps[stepKey];

  backButton.hidden = state.history.length === 0;

  detailSwatch.style.background = step.hex;
  detailSwatch.dataset.hex = step.hex;
  detailSwatch.setAttribute('aria-label', `Solid color ${step.hex}. Click to copy.`);
  detailName.textContent = `${capitalize(scaleName)} ${stepKey}`;
  detailCode.textContent = step.hex;
  dialog.style.setProperty('--name-ink', nameInk(scaleName));

  dialog.style.setProperty('--name-ink', nameInk(scaleName));
  dialog.style.setProperty('--ink-heading', nameInk(scaleName));
  dialog.style.setProperty('--ink-accent', accentInk(scaleName));

  detailFields.replaceChildren(
    fieldGroup([
      fieldRow('Usage', meta.use, { prose: true }),
      fieldRow('Pairs with', `${pairsWith(step)} text`, { prose: true }),
    ]),
    fieldGroup([
      fieldRow('Hex', step.hex, { copyable: true }),
      fieldRow('OKLCH', step.oklch, { copyable: true }),
    ]),
    fieldDetails('Wide gamut, alpha and contrast', [
      fieldGroup([
        fieldRow('P3', step.p3, { copyable: true }),
        fieldRow('Alpha', step.alphaLight.css, { copyable: true, info: 'A version of this color with transparency that, layered over a light background, reproduces it exactly. The "on dark" variant is the same idea for a dark background.' }),
        fieldRow('Alpha, on dark', step.alphaDark.css, { copyable: true }),
        fieldRow('P3 alpha', step.p3AlphaLight.css, { copyable: true }),
        fieldRow('P3 alpha, on dark', step.p3AlphaDark.css, { copyable: true }),
      ]),
      fieldGroup([
        fieldRow('Contrast with white', `${step.contrastWhite}:1`),
        fieldRow('Contrast with black', `${step.contrastBlack}:1`),
        fieldRow('APCA', `Lc ${step.apca.onWhite} on white, Lc ${step.apca.onBlack} on black`, { info: 'A newer, more accurate contrast model than WCAG. Reported for reference -- this project\'s contrast promises are still measured in WCAG, since APCA has no official pass/fail threshold yet.' }),
      ]),
    ]),
  );

  buildHarmonies(scale, stepKey);

  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}

function fieldGroup(rows) {
  const section = document.createElement('div');
  section.className = 'field-group';
  const list = document.createElement('dl');
  list.className = 'field-rows';
  list.append(...rows);
  section.appendChild(list);
  return section;
}

function fieldDetails(summaryText, groups) {
  const details = document.createElement('details');
  details.className = 'field-details';

  const summary = document.createElement('summary');
  summary.textContent = summaryText;
  details.appendChild(summary);
  details.append(...groups);

  return details;
}

function fieldRow(label, value, { copyable = false, info = null, prose = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = copyable ? 'field-row copyable' : 'field-row';

  const dt = document.createElement('dt');
  dt.textContent = label;
  if (info) {
    const icon = document.createElement('span');
    icon.className = 'info-icon';
    icon.textContent = 'i';
    icon.title = info;
    dt.appendChild(icon);
  }

  const dd = document.createElement('dd');
  if (prose) dd.className = 'prose';
  dd.textContent = value;

  wrap.append(dt, dd);

  if (copyable) {
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('aria-label', `Copy ${label}: ${value}`);
    const activate = () => copyToClipboard(value, wrap, dd);
    wrap.addEventListener('click', activate);
    wrap.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
  }

  return wrap;
}

function buildHarmonies(scale, stepKey) {
  detailHarmonies.replaceChildren();

  if (scale.harmonies) {
    detailHarmonies.appendChild(harmonyGroup(
      'Complementary', HARMONY_INFO.complementary,
      [harmonyChip(scale.harmonies.complementary.name, stepKey)],
    ));

    detailHarmonies.appendChild(harmonyGroup(
      'Analogous', HARMONY_INFO.analogous,
      scale.harmonies.analogous.map(h => harmonyChip(h.name, stepKey)),
    ));
  }

  detailHarmonies.appendChild(harmonyGroup(
    'Monochromatic', HARMONY_INFO.monochromatic,

    stepKeys().map(s => harmonyChip(state.current.scaleName, s, {
      label: s,
      isCurrent: s === stepKey,
    })),
  ));
}

function harmonyGroup(title, explanation, chips) {
  const group = document.createElement('div');
  group.className = 'harmony-group';

  const h = document.createElement('h4');
  h.className = 'harmony-group-title';
  h.textContent = title;
  group.appendChild(h);

  const p = document.createElement('p');
  p.className = 'harmony-explanation';
  p.textContent = explanation;
  group.appendChild(p);

  group.appendChild(chipRow(chips));
  return group;
}

function chipRow(chips) {
  const row = document.createElement('div');
  row.className = 'harmony-row';
  row.append(...chips);
  return row;
}

function harmonyChip(scaleName, stepKey, { label = scaleName, isCurrent = false } = {}) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip chip--mini';
  chip.setAttribute('aria-label', `${scaleName} ${stepKey}`);

  chip.style.setProperty('--name-ink', nameInk(scaleName));
  if (isCurrent) {
    chip.setAttribute('aria-current', 'true');
    chip.title = 'The color you are viewing';
  }
  chip.addEventListener('click', () => navigateTo(scaleName, stepKey));

  const color = document.createElement('span');
  color.className = 'chip__color';
  color.style.background = `var(--color-${scaleName}-${stepKey})`;
  chip.appendChild(color);

  const strip = document.createElement('span');
  strip.className = 'chip__label';

  const code = document.createElement('span');
  code.className = 'chip__code';
  code.textContent = label;
  strip.appendChild(code);

  chip.appendChild(strip);
  return chip;
}

async function copyToClipboard(text, feedbackEl, textEl = feedbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    flashCopied(feedbackEl, textEl);
  } catch {

  }
}

function flashCopied(feedbackEl, textEl) {
  const original = textEl.textContent;
  textEl.textContent = 'Copied';
  feedbackEl.classList.add('just-copied');
  setTimeout(() => {
    textEl.textContent = original;
    feedbackEl.classList.remove('just-copied');
  }, 1200);
}

main();
