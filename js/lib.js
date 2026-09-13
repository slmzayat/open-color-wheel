function pairsWith(step) {
  return step.contrastWhite >= step.contrastBlack ? 'white' : 'black';
}

function sortedStepKeys(stepsObj) {
  return Object.keys(stepsObj)
    .filter(k => !k.startsWith('$'))
    .sort((a, b) => Number(a) - Number(b));
}

function capitalize(word) {
  return word[0].toUpperCase() + word.slice(1);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pairsWith, sortedStepKeys, capitalize };
}
