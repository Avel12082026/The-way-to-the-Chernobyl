'use strict';

/*
 * Artifact selection radiation rules.
 * - "radiation" is the useful Radioprotection stat.
 * - "radiationLeak" is the legacy storage key for the harmful visible "Radiation +N" effect.
 * - Harmful radiation improves toward zero by exactly 1 on each selection step and disappears at zero.
 * - Harmful radiation never flips into a protective stat.
 * - Radioprotection remains separate and, when inherited, grows by exactly 1 per selection step.
 */

const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function mergeStats(firstStats, secondStats, options = {}) {
  const a = firstStats && typeof firstStats === 'object' ? firstStats : {};
  const b = secondStats && typeof secondStats === 'object' ? secondStats : {};
  const rawCap = Number(options.perStatCap);
  const perStatCap = Number.isFinite(rawCap) && rawCap >= 0 ? rawCap : Infinity;
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const merged = {};

  for (const key of allKeys) {
    const v1 = finite(a[key]);
    const v2 = finite(b[key]);

    if (key === 'radiationLeak') {
      // Runtime treats either historical sign as harmful. Canonicalize the selected
      // artifact back to a negative stored value so the UI shows "Radiation +N".
      const harmful = Math.max(Math.abs(v1), Math.abs(v2));
      const next = Math.max(0, Math.round(harmful) - 1);
      if (next > 0) merged.radiationLeak = -next;
      continue;
    }

    if (key === 'radiation') {
      // "radiation" is only Radioprotection. Selection improves the strongest
      // inherited protection by exactly 1, without exponential parent summing.
      // Old malformed negative values are ignored and never become harmful radiation.
      const protection = Math.max(0, v1, v2);
      if (protection > 0) {
        merged.radiation = Math.min(Math.round(protection) + 1, perStatCap);
      }
      continue;
    }

    if (v1 < 0 || v2 < 0) {
      // Preserve the game's established selection rule for every other negative stat:
      // take the worse parent and improve it by 1. Only radiationLeak is prevented
      // from crossing zero into a positive property.
      const worse = Math.min(v1, v2);
      merged[key] = worse >= -1 ? 1 : worse + 1;
    } else {
      merged[key] = Math.min(Math.round(v1 + v2), perStatCap);
    }
  }

  return merged;
}

module.exports = Object.freeze({ version: '20260920.2', mergeStats });
