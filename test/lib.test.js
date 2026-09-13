/**
 * Open Color Wheel — tests for js/lib.js (the page's DOM-free logic).
 * Run: npm test (node --test)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { pairsWith, sortedStepKeys, capitalize } = require('../js/lib.js');

test('pairsWith picks white when white contrast is higher', () => {
  assert.equal(pairsWith({ contrastWhite: 8, contrastBlack: 3 }), 'white');
});

test('pairsWith picks black when black contrast is higher', () => {
  assert.equal(pairsWith({ contrastWhite: 3, contrastBlack: 8 }), 'black');
});

test('pairsWith breaks an exact tie toward white', () => {
  assert.equal(pairsWith({ contrastWhite: 4.583, contrastBlack: 4.583 }), 'white');
});

test('sortedStepKeys orders steps numerically, not lexicographically', () => {
  const steps = { '950': {}, '100': {}, '50': {}, '600': {}, '200': {} };
  assert.deepEqual(sortedStepKeys(steps), ['50', '100', '200', '600', '950']);
});

test('sortedStepKeys drops $comment-style keys', () => {
  const steps = { $comment: 'source of truth', '50': {}, '100': {} };
  assert.deepEqual(sortedStepKeys(steps), ['50', '100']);
});

test('capitalize uppercases only the first letter', () => {
  assert.equal(capitalize('red'), 'Red');
  assert.equal(capitalize('slate'), 'Slate');
});
