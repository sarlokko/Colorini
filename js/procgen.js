/**
 * Seeded RNG + hard-scaling procedural water-sort puzzles.
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

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
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
    const amt = Math.min(
      capacity - dst.length,
      topRun(src),
      maxUnits == null ? Infinity : maxUnits
    );
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

  function countRuns(bottle) {
    if (!bottle.length) return 0;
    let runs = 1;
    for (let i = 1; i < bottle.length; i++) {
      if (bottle[i] !== bottle[i - 1]) runs++;
    }
    return runs;
  }

  function fragmentation(bottles) {
    return bottles.reduce((s, b) => s + countRuns(b), 0);
  }

  /** Soft scramble from a solved state (early floors). */
  function scrambleFromSolved(used, capacity, emptyCount, scrambleMoves, rng) {
    let bottles = used.map((c) => Array(capacity).fill(c));
    for (let i = 0; i < emptyCount; i++) bottles.push([]);

    function moves(preferSplit) {
      const out = [];
      for (let i = 0; i < bottles.length; i++) {
        for (let j = 0; j < bottles.length; j++) {
          if (i === j || !canPour(bottles[i], bottles[j], capacity)) continue;
          if (preferSplit) {
            if (isUniformFull(bottles[i], capacity) && !bottles[j].length) out.push([i, j]);
            else if (!isUniformFull(bottles[i], capacity)) out.push([i, j]);
          } else {
            out.push([i, j]);
          }
        }
      }
      return out;
    }

    let done = 0;
    let guard = 0;
    while (done < scrambleMoves && guard < scrambleMoves * 60) {
      guard++;
      let c = moves(true);
      if (!c.length) c = moves(false);
      if (!c.length) break;
      const [i, j] = c[Math.floor(rng() * c.length)];
      pour(bottles[i], bottles[j], capacity, 1);
      done++;
    }
    return bottles;
  }

  /**
   * Targeted hard layout: each layer is a derangement of colors across bottles,
   * so stacks are rainbow-like and deeply interleaved.
   */
  function buildLayered(used, capacity, emptyCount, rng, twist) {
    const n = used.length;
    const bottles = Array.from({ length: n + emptyCount }, () => []);
    let prev = used.slice();

    for (let layer = 0; layer < capacity; layer++) {
      let order = shuffle(used, rng);
      // Avoid aligning same color as previous layer in same bottle (when possible)
      if (twist > 0 && layer > 0) {
        let best = order;
        let bestScore = -1;
        for (let attempt = 0; attempt < 6 + twist * 3; attempt++) {
          const cand = shuffle(used, rng);
          let score = 0;
          for (let i = 0; i < n; i++) {
            if (cand[i] !== prev[i]) score += 3;
            // also avoid long vertical pairs of same neighbor pattern
            if (layer > 1 && cand[i] === bottles[i][layer - 2]) score += 1;
          }
          if (score > bestScore) {
            bestScore = score;
            best = cand;
          }
        }
        order = best;
      }
      for (let i = 0; i < n; i++) bottles[i].push(order[i]);
      prev = order;
    }

    // Extra adversarial pours: prefer moves that increase fragmentation
    const pourBudget = 4 + twist * 8;
    for (let m = 0; m < pourBudget; m++) {
      const candidates = [];
      for (let i = 0; i < bottles.length; i++) {
        for (let j = 0; j < bottles.length; j++) {
          if (i === j || !canPour(bottles[i], bottles[j], capacity)) continue;
          // score: breaking a run / filling a mixed bottle
          let score = 1;
          if (topRun(bottles[i]) === 1) score += 2;
          if (bottles[j].length && countRuns(bottles[j]) >= 2) score += 2;
          if (!bottles[j].length && topRun(bottles[i]) <= 2) score += 3;
          candidates.push([i, j, score]);
        }
      }
      if (!candidates.length) break;
      candidates.sort((a, b) => b[2] - a[2]);
      const topN = candidates.slice(0, Math.min(5, candidates.length));
      const pick = topN[Math.floor(rng() * topN.length)];
      pour(bottles[pick[0]], bottles[pick[1]], capacity, 1);
    }

    return bottles;
  }

  function applyPreSorted(bottles, used, capacity, preSorted, rng) {
    if (preSorted <= 0) return bottles;
    let next = clone(bottles);
    const colorPool = used.slice();
    for (let p = 0; p < preSorted && colorPool.length; p++) {
      const ci = Math.floor(rng() * colorPool.length);
      const color = colorPool.splice(ci, 1)[0];
      next = next.map((b) => b.filter((x) => x !== color));
      let slot = next.findIndex((b) => !b.length);
      if (slot < 0) {
        next.push([]);
        slot = next.length - 1;
      }
      next[slot] = Array(capacity).fill(color);
    }
    return next;
  }

  function trimEmpties(bottles, emptyCount) {
    const empties = bottles.filter((b) => !b.length).length;
    if (empties <= emptyCount) return bottles;
    let remove = empties - emptyCount;
    return bottles.filter((b) => {
      if (!b.length && remove > 0) {
        remove--;
        return false;
      }
      return true;
    });
  }

  function generatePuzzle(rng, opts) {
    const capacity = opts.capacity || 4;
    const colorCount = opts.colors;
    const emptyCount = opts.empty;
    const scrambleMoves = opts.scramble || 0;
    const preSorted = opts.preSorted || 0;
    const style = opts.style || "gentle"; // gentle | layered | nightmare
    const twist = opts.twist || 0;

    const used = shuffle(ALL_COLORS, rng).slice(0, colorCount);

    let bottles;
    if (style === "gentle") {
      bottles = scrambleFromSolved(used, capacity, emptyCount, scrambleMoves, rng);
    } else {
      bottles = buildLayered(used, capacity, emptyCount, rng, twist);
      // nightmare gets an extra fragmentation pass
      if (style === "nightmare") {
        const extra = 10 + twist * 6;
        for (let m = 0; m < extra; m++) {
          const candidates = [];
          const before = fragmentation(bottles);
          for (let i = 0; i < bottles.length; i++) {
            for (let j = 0; j < bottles.length; j++) {
              if (i === j || !canPour(bottles[i], bottles[j], capacity)) continue;
              // simulate 1 pour
              const a = clone(bottles);
              pour(a[i], a[j], capacity, 1);
              const gain = fragmentation(a) - before;
              if (gain >= 0) candidates.push([i, j, gain + rng()]);
            }
          }
          if (!candidates.length) break;
          candidates.sort((x, y) => y[2] - x[2]);
          const [i, j] = candidates[0];
          pour(bottles[i], bottles[j], capacity, 1);
        }
      }
    }

    let guard = 0;
    while (isSolved(bottles, capacity) && guard < 80) {
      guard++;
      bottles = scrambleFromSolved(used, capacity, emptyCount, 12 + guard, rng);
    }

    bottles = applyPreSorted(bottles, used, capacity, preSorted, rng);
    bottles = trimEmpties(bottles, emptyCount);

    return {
      capacity,
      bottles: clone(bottles),
      colors: used,
      name: opts.name || "Piano",
      style,
    };
  }

  /**
   * Steep difficulty curve: easy start → targeted layered mid → nightmare finale.
   * floorIndex is 0-based.
   */
  function floorSpec(floorIndex, totalFloors) {
    const last = totalFloors - 1;
    const midBoss = Math.floor(totalFloors / 2) - 1;
    const isFinal = floorIndex === last;
    const isMini = floorIndex === midBoss;
    const isBoss = isFinal || isMini;
    const t = floorIndex / Math.max(1, last);

    let colors;
    let empty;
    let scramble;
    let style;
    let twist;
    let baseUndos;

    if (floorIndex === 0) {
      colors = 3;
      empty = 2;
      scramble = 10;
      style = "gentle";
      twist = 0;
      baseUndos = 5;
    } else if (floorIndex === 1) {
      colors = 3;
      empty = 2;
      scramble = 18;
      style = "gentle";
      twist = 0;
      baseUndos = 4;
    } else if (floorIndex === 2) {
      colors = 4;
      empty = 2;
      scramble = 28;
      style = "gentle";
      twist = 1;
      baseUndos = 4;
    } else if (floorIndex <= 4) {
      colors = 5 + (floorIndex - 3);
      empty = 2;
      scramble = 0;
      style = "layered";
      twist = 2 + (floorIndex - 3);
      baseUndos = 3;
    } else if (!isBoss && floorIndex < last) {
      // After mid-boss: never ease up — climb toward the finale
      const after = floorIndex - midBoss;
      colors = Math.min(10, 8 + Math.floor(after * 0.6));
      empty = after >= 2 ? 1 : 1;
      scramble = 0;
      style = "layered";
      twist = 6 + after;
      baseUndos = 2;
    } else {
      colors = 7;
      empty = 1;
      scramble = 0;
      style = "layered";
      twist = 5;
      baseUndos = 2;
    }

    if (isMini) {
      colors = 8;
      empty = 1;
      style = "layered";
      twist = 7;
      baseUndos = 2;
      scramble = 0;
    }

    if (isFinal) {
      colors = Math.min(ALL_COLORS.length, 11);
      empty = 1;
      style = "nightmare";
      twist = 12;
      baseUndos = 2;
      scramble = 0;
    }

    return {
      colors,
      empty,
      scramble,
      capacity: 4,
      style,
      twist,
      baseUndos,
      isBoss,
      isFinal,
      name: isFinal
        ? "Boss finale"
        : isMini
          ? "Mini-boss"
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
    fragmentation,
  };
})();
