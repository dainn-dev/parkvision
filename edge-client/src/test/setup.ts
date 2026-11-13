import '@testing-library/jest-dom/vitest';

if (!Element.prototype.animate) {
  Element.prototype.animate = (() => ({
    finished: Promise.resolve(),
    cancel() {},
    finish() {},
    play() {},
    pause() {},
  })) as unknown as typeof Element.prototype.animate;
}
