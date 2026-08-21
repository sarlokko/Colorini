/**
 * Seeded RNG + hard-scaling procedural water-sort puzzles.
 */
window.ColoriniProcgen = (function () {
  "use strict";

  const ALL_COLORS = [
    "red", "orange", "yellow", "green", "cyan", "blue",
    "purple", "magenta", "brown", "cream", "navy", "coral",
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

    // Keep layered stacks intact — extra pours tend to re-sort and make puzzles trivial.
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

  function stateKey(bottles) {
    return bottles.map((b) => b.join(",")).join("|");
  }

  function legalGameMoves(bottles, capacity, opts) {
    const allowFinishedToEmpty = opts && opts.allowFinishedToEmpty;
    const moves = [];
    for (let i = 0; i < bottles.length; i++) {
      for (let j = 0; j < bottles.length; j++) {
        if (i === j) continue;
        if (!canPour(bottles[i], bottles[j], capacity)) continue;
        if (
          !allowFinishedToEmpty &&
          isUniformFull(bottles[i], capacity) &&
          bottles[j].length === 0
        ) {
          continue;
        }
        moves.push([i, j]);
      }
    }
    return moves;
  }

  function applyGamePour(bottles, i, j, capacity) {
    const next = clone(bottles);
    pour(next[i], next[j], capacity);
    return next;
  }

  /** Scramble always moves 1 unit to create fine-grained mess. */
  function applyScramblePour(bottles, i, j, capacity) {
    const next = clone(bottles);
    pour(next[i], next[j], capacity, 1);
    return next;
  }

  /** Shortest solution length (game pours), or -1 if budget exhausted. */
  function bfsMinMoves(bottles, capacity, maxStates) {
    if (isSolved(bottles, capacity)) return 0;
    const start = clone(bottles);
    const dist = new Map([[stateKey(start), 0]]);
    const q = [start];
    let head = 0;
    while (head < q.length && dist.size < maxStates) {
      const cur = q[head++];
      const d = dist.get(stateKey(cur));
      const moves = legalGameMoves(cur, capacity);
      for (let m = 0; m < moves.length; m++) {
        const next = applyGamePour(cur, moves[m][0], moves[m][1], capacity);
        const k = stateKey(next);
        if (dist.has(k)) continue;
        const nd = d + 1;
        if (isSolved(next, capacity)) return nd;
        dist.set(k, nd);
        q.push(next);
      }
    }
    return -1;
  }

  function scoreMove(bottles, i, j, capacity) {
    const src = bottles[i];
    const dst = bottles[j];
    const amt = Math.min(capacity - dst.length, topRun(src));
    let s = 0;
    if (dst.length && top(dst) === top(src)) s += 20;
    if (dst.length + amt === capacity) s += 40;
    if (src.length === amt) s += 8;
    if (!dst.length) s += 3;
    // Prefer consolidating single-unit tops
    if (topRun(src) === 1) s += 5;
    return s;
  }

  /** Approximate upper bound via repeated greedy play. */
  function greedyMinMoves(bottles, capacity, rng, trials, maxMoves) {
    let best = Infinity;
    for (let t = 0; t < trials; t++) {
      let cur = clone(bottles);
      let steps = 0;
      let stuck = false;
      while (!isSolved(cur, capacity) && steps < maxMoves) {
        const moves = legalGameMoves(cur, capacity);
        if (!moves.length) {
          stuck = true;
          break;
        }
        let bestScore = -Infinity;
        let picks = [];
        for (let m = 0; m < moves.length; m++) {
          const sc = scoreMove(cur, moves[m][0], moves[m][1], capacity) + rng() * 0.5;
          if (sc > bestScore + 1e-9) {
            bestScore = sc;
            picks = [moves[m]];
          } else if (Math.abs(sc - bestScore) < 1e-9) {
            picks.push(moves[m]);
          }
        }
        const pick = picks[Math.floor(rng() * picks.length)];
        cur = applyGamePour(cur, pick[0], pick[1], capacity);
        steps++;
      }
      if (!stuck && isSolved(cur, capacity) && steps < best) best = steps;
    }
    return best === Infinity ? -1 : best;
  }

  /**
   * Best-known solution length for move budget.
   * Prefer BFS optimum; fall back to greedy upper bound.
   */
  function estimateMinMoves(bottles, capacity, rng) {
    const n = bottles.length;
    const maxStates = n <= 7 ? 400000 : n <= 10 ? 220000 : 120000;
    const exact = bfsMinMoves(bottles, capacity, maxStates);
    if (exact >= 0) return { moves: exact, exact: true };

    const trials = n <= 8 ? 120 : 60;
    const cap = 90;
    const approx = greedyMinMoves(bottles, capacity, rng || mulberry32(1), trials, cap);
    if (approx >= 0) return { moves: approx, exact: false };

    // Last resort heuristic: unfinished bottles * 3
    const messy = bottles.filter((b) => b.length && !isUniformFull(b, capacity)).length;
    return { moves: Math.max(8, messy * 3 + 4), exact: false };
  }

  function moveSlack(spec) {
    if (!spec) return 2;
    if (spec.floorIndex != null && spec.floorIndex === 0) return 3;
    return 2;
  }

  function generatePuzzle(rng, opts) {
    const capacity = opts.capacity || 4;
    const colorCount = opts.colors;
    const emptyCount = opts.empty;
    const depth = opts.depth != null ? opts.depth : opts.scramble || 12;
    const preSorted = opts.preSorted || 0;
    const style = opts.style || "gentle";
    const twist = opts.twist || 0;
    const minOptimal = opts.minOptimal || 0;

    const used = shuffle(ALL_COLORS, rng).slice(0, colorCount);
    let bottles;

    if (style === "gentle") {
      bottles = used.map((c) => Array(capacity).fill(c));
      for (let i = 0; i < emptyCount; i++) bottles.push([]);
      let done = 0;
      let guard = 0;
      while (done < depth && guard < depth * 100) {
        guard++;
        const moves = legalGameMoves(bottles, capacity, { allowFinishedToEmpty: true });
        if (!moves.length) break;
        const ranked = moves.map(([i, j]) => {
          const next = applyScramblePour(bottles, i, j, capacity);
          let gain = fragmentation(next) - fragmentation(bottles);
          if (isSolved(next, capacity)) gain -= 100;
          const rebuilt = next.some(
            (b, idx) =>
              b.length === capacity &&
              isUniformFull(b, capacity) &&
              !(bottles[idx].length === capacity && isUniformFull(bottles[idx], capacity))
          );
          if (rebuilt) gain -= 20;
          return [i, j, gain + rng() * 0.2];
        });
        ranked.sort((a, b) => b[2] - a[2]);
        const pick = ranked[Math.floor(rng() * Math.min(4, ranked.length))];
        bottles = applyScramblePour(bottles, pick[0], pick[1], capacity);
        done++;
      }
    } else {
      // Layered rainbow stacks — hard and not accidentally near-solved
      bottles = buildLayered(used, capacity, emptyCount, rng, Math.max(2, twist));
      if (style === "nightmare") {
        // Tiny chaos only: 2–4 one-unit pours into empties to break perfect patterns
        const moves = legalGameMoves(bottles, capacity, { allowFinishedToEmpty: true });
        const intoEmpty = moves.filter(([, j]) => bottles[j].length === 0);
        const pool = intoEmpty.length ? intoEmpty : moves;
        const nChaos = Math.min(4, pool.length);
        for (let m = 0; m < nChaos; m++) {
          const pick = pool[Math.floor(rng() * pool.length)];
          bottles = applyScramblePour(bottles, pick[0], pick[1], capacity);
        }
      }
    }

    let guardSolved = 0;
    while (isSolved(bottles, capacity) && guardSolved < 80) {
      guardSolved++;
      const moves = legalGameMoves(bottles, capacity, { allowFinishedToEmpty: true });
      if (!moves.length) break;
      const pick = moves[Math.floor(rng() * moves.length)];
      bottles = applyScramblePour(bottles, pick[0], pick[1], capacity);
    }

    bottles = applyPreSorted(bottles, used, capacity, preSorted, rng);
    bottles = trimEmpties(bottles, emptyCount);

    if (minOptimal > 0) {
      let attempts = 0;
      let est = estimateMinMoves(bottles, capacity, rng);
      while (est.moves < minOptimal && attempts < 40) {
        attempts++;
        // Force-split a finished bottle if any
        const fulls = [];
        const empties = [];
        for (let i = 0; i < bottles.length; i++) {
          if (isUniformFull(bottles[i], capacity)) fulls.push(i);
          if (!bottles[i].length) empties.push(i);
        }
        if (fulls.length && empties.length) {
          const fi = fulls[Math.floor(rng() * fulls.length)];
          const ei = empties[Math.floor(rng() * empties.length)];
          bottles = applyScramblePour(bottles, fi, ei, capacity);
        }
        const moves = legalGameMoves(bottles, capacity, { allowFinishedToEmpty: true });
        if (moves.length) {
          const ranked = moves.map(([i, j]) => {
            const next = applyScramblePour(bottles, i, j, capacity);
            return [i, j, fragmentation(next) - fragmentation(bottles) + rng()];
          });
          ranked.sort((a, b) => b[2] - a[2]);
          bottles = applyScramblePour(bottles, ranked[0][0], ranked[0][1], capacity);
        }
        est = estimateMinMoves(bottles, capacity, rng);
      }
    }

    return {
      capacity,
      bottles: clone(bottles),
      colors: used,
      name: opts.name || "Piano",
      style,
      depth,
    };
  }

  /**
   * Hard curve. `depth` = scramble pours (solution scale); move budget comes from solver.
   */
  function floorSpec(floorIndex, totalFloors) {
    const last = totalFloors - 1;
    const midBoss = Math.floor(totalFloors / 2) - 1;
    const isFinal = floorIndex === last;
    const isMini = floorIndex === midBoss;
    const isBoss = isFinal || isMini;

    let colors = 4;
    let empty = 1;
    let style = "layered";
    let twist = 3;
    let baseUndos = 1;
    let depth = 20;
    let minOptimal = 8;

    if (floorIndex === 0) {
      colors = 3;
      empty = 2;
      style = "layered";
      depth = 12;
      minOptimal = 5;
      baseUndos = 2;
      twist = 2;
    } else if (floorIndex === 1) {
      colors = 4;
      empty = 2;
      style = "layered";
      depth = 16;
      minOptimal = 8;
      baseUndos = 1;
      twist = 2;
    } else if (floorIndex === 2) {
      colors = 5;
      empty = 1;
      style = "layered";
      depth = 20;
      minOptimal = 12;
      twist = 3;
    } else if (floorIndex === 3) {
      colors = 6;
      empty = 1;
      style = "layered";
      depth = 24;
      minOptimal = 14;
      twist = 3;
    } else if (floorIndex === 4) {
      colors = 7;
      empty = 1;
      style = "layered";
      depth = 28;
      minOptimal = 16;
      twist = 4;
    } else if (!isBoss) {
      const after = Math.max(0, floorIndex - midBoss);
      colors = Math.min(ALL_COLORS.length - 1, 9 + Math.floor(after * 0.5));
      empty = 1;
      style = "layered";
      depth = 32 + after * 2;
      minOptimal = 18 + after;
      twist = 5 + after;
      baseUndos = 1;
    }

    if (isMini) {
      colors = 9;
      empty = 1;
      style = "layered";
      depth = 36;
      minOptimal = 22;
      twist = 6;
      baseUndos = 1;
    }

    if (isFinal) {
      colors = ALL_COLORS.length;
      empty = 1;
      style = "nightmare";
      depth = 40;
      minOptimal = 28;
      twist = 8;
      baseUndos = 1;
    }

    return {
      colors,
      empty,
      scramble: depth,
      depth,
      minOptimal,
      capacity: 4,
      style,
      twist,
      baseUndos,
      moveLimit: minOptimal + 4,
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
    estimateMinMoves,
    bfsMinMoves,
    moveSlack,
  };
})();
