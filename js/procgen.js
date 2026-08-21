/**
 * Seeded RNG + procedural water-sort puzzles for Colorini Rogue.
 */
window.ColoriniProcgen = (function () {
  "use strict";

  const ALL_COLORS = [
    "red", "orange", "amber", "yellow", "lime", "green",
    "teal", "sky", "blue", "indigo", "pink", "rose",
  ];

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function clone(bottles) {
    return bottles.map((b) => b.slice());
  }

  function top(b) {
    return b.length ? b[b.length - 1] : null;
  }

  function topRun(b) {
    if (!b.length) return 0;
    const c = top(b);
    let n = 0;
    for (let i = b.length - 1; i >= 0 && b[i] === c; i--) n++;
    return n;
  }

  function canPour(src, dst, capacity) {
    if (!src.length) return false;
    const free = capacity - dst.length;
    if (free <= 0) return false;
    if (!dst.length) return true;
    return top(src) === top(dst);
  }

  function pour(src, dst, capacity, maxUnits) {
    const amt = Math.min(capacity - dst.length, topRun(src), maxUnits == null ? Infinity : maxUnits);
    for (let i = 0; i < amt; i++) dst.push(src.pop());
    return amt;
  }

  function isSolved(bottles, capacity) {
    return bottles.every(
      (b) => !b.length || (b.length === capacity && b.every((x) => x === b[0]))
    );
  }

  function isUniformFull(b, capacity) {
    return b.length === capacity && b.every((x) => x === b[0]);
  }

  /**
   * Build a solved rack, then scramble with legal pours (1 unit at a time).
   */
  function generatePuzzle(rng, opts) {
    const capacity = opts.capacity || 4;
    const colorCount = opts.colors;
    const emptyCount = opts.empty;
    const scrambleMoves = opts.scramble;
    const preSorted = opts.preSorted || 0;

    const colors = ALL_COLORS.slice();
    for (let i = colors.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    const used = colors.slice(0, colorCount);

    let bottles = used.map((c) => Array(capacity).fill(c));
    for (let i = 0; i < emptyCount; i++) bottles.push([]);

    function legalMoves(preferBreak) {
      const candidates = [];
      for (let i = 0; i < bottles.length; i++) {
        for (let j = 0; j < bottles.length; j++) {
          if (i === j) continue;
          if (!canPour(bottles[i], bottles[j], capacity)) continue;
          const breaks =
            isUniformFull(bottles[i], capacity) && bottles[j].length > 0
              ? false
              : isUniformFull(bottles[i], capacity) ||
                (bottles[i].length > 0 && bottles[j].length > 0 && top(bottles[i]) !== top(bottles[j]));
          // Always allow pouring 1 unit into empty or matching
          if (preferBreak) {
            // Prefer splitting a uniform bottle into empty, or mixing
            if (isUniformFull(bottles[i], capacity) && bottles[j].length === 0) {
              candidates.push([i, j, 2]);
            } else if (
              bottles[j].length > 0 &&
              top(bottles[i]) === top(bottles[j]) &&
              !isUniformFull(bottles[i], capacity)
            ) {
              candidates.push([i, j, 1]);
            } else if (!isUniformFull(bottles[i], capacity)) {
              candidates.push([i, j, 1]);
            } else if (bottles[j].length === 0) {
              candidates.push([i, j, 1]);
            }
          } else {
            candidates.push([i, j, 1]);
          }
        }
      }
      return candidates;
    }

    let guard = 0;
    let done = 0;
    while (done < scrambleMoves && guard < scrambleMoves * 50) {
      guard++;
      let candidates = legalMoves(true);
      if (!candidates.length) candidates = legalMoves(false);
      if (!candidates.length) break;
      const [i, j] = candidates[Math.floor(rng() * candidates.length)];
      // Always move exactly 1 unit while scrambling so uniforms break
      pour(bottles[i], bottles[j], capacity, 1);
      done++;
    }

    let extra = 0;
    while (isSolved(bottles, capacity) && extra < 120) {
      extra++;
      let candidates = legalMoves(true);
      if (!candidates.length) candidates = legalMoves(false);
      if (!candidates.length) break;
      const [i, j] = candidates[Math.floor(rng() * candidates.length)];
      pour(bottles[i], bottles[j], capacity, 1);
    }

    if (preSorted > 0 && !isSolved(bottles, capacity)) {
      const colorPool = used.slice();
      for (let p = 0; p < preSorted && colorPool.length; p++) {
        const ci = Math.floor(rng() * colorPool.length);
        const color = colorPool.splice(ci, 1)[0];
        bottles = bottles.map((b) => b.filter((x) => x !== color));
        let slot = bottles.findIndex((b) => !b.length);
        if (slot < 0) {
          bottles.push([]);
          slot = bottles.length - 1;
        }
        bottles[slot] = Array(capacity).fill(color);
      }
    }

    // Drop trailing empties beyond emptyCount (keep at least emptyCount empties)
    const empties = bottles.filter((b) => !b.length).length;
    if (empties > emptyCount) {
      let remove = empties - emptyCount;
      bottles = bottles.filter((b) => {
        if (!b.length && remove > 0) {
          remove--;
          return false;
        }
        return true;
      });
    }

    return {
      capacity,
      bottles: clone(bottles),
      colors: used,
      name: opts.name || "Piano",
    };
  }

  /** Difficulty curve for floor index (0-based) of a run. */
  function floorSpec(floorIndex, totalFloors) {
    const t = floorIndex / Math.max(1, totalFloors - 1);
    const isBoss = floorIndex === totalFloors - 1 || floorIndex === Math.floor(totalFloors / 2) - 1;
    let colors = 3 + Math.floor(t * 5); // 3..8
    let empty = 2;
    let scramble = 10 + Math.floor(t * 28);
    if (isBoss) {
      colors = Math.min(9, colors + 1);
      empty = floorIndex === totalFloors - 1 ? 2 : 2;
      scramble += 8;
    }
    if (floorIndex === 0) {
      colors = 3;
      empty = 2;
      scramble = 8;
    }
    return {
      colors,
      empty,
      scramble,
      capacity: 4,
      isBoss,
      name: isBoss
        ? floorIndex === totalFloors - 1
          ? "Boss finale"
          : "Mini-boss"
        : `Piano ${floorIndex + 1}`,
    };
  }

  return {
    mulberry32,
    hashSeed,
    generatePuzzle,
    floorSpec,
    ALL_COLORS,
    clone,
    isSolved,
    isUniformFull,
  };
})();
