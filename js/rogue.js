/**
 * Roguelike — move budget is the core resource; relics bend that budget.
 */
window.ColoriniRogue = (function () {
  "use strict";

  const TOTAL_FLOORS = 12;
  const BASE_HP = 1;
  const BASE_UNDOS = 1;

  /**
   * Relics are move-centric. Empty bottle is legendary (breaks the 1-empty choke).
   */
  const RELICS = {
    step_cache: {
      id: "step_cache",
      name: "Scorte di passo",
      desc: "+4 mosse ogni piano.",
      rarity: "common",
    },
    quick_pour: {
      id: "quick_pour",
      name: "Verso rapido",
      desc: "+2 mosse ogni piano.",
      rarity: "common",
    },
    efficient_mind: {
      id: "efficient_mind",
      name: "Mente efficiente",
      desc: "+1 mossa permanente alla run.",
      rarity: "rare",
    },
    undo_kit: {
      id: "undo_kit",
      name: "Kit di ripensamento",
      desc: "+1 undo ogni piano.",
      rarity: "common",
    },
    soft_reset: {
      id: "soft_reset",
      name: "Tappo di scorta",
      desc: "1 rifai-piano senza morire.",
      rarity: "rare",
    },
    last_gasp: {
      id: "last_gasp",
      name: "Ultimo sussulto",
      desc: "A 0 mosse: +3 mosse, una volta a piano.",
      rarity: "rare",
    },
    boss_ration: {
      id: "boss_ration",
      name: "Razione del boss",
      desc: "+10 mosse solo nei boss.",
      rarity: "legendary",
    },
    ghost_bottle: {
      id: "ghost_bottle",
      name: "Bottiglia fantasma",
      desc: "+1 bottiglia vuota ogni piano.",
      rarity: "legendary",
    },
    thrift: {
      id: "thrift",
      name: "Parsimonia",
      desc: "Se chiudi con ≥5 mosse residue, +2 mosse permanenti.",
      rarity: "rare",
    },
    gambler_cork: {
      id: "gambler_cork",
      name: "Tappo scommettitore",
      desc: "+6 mosse, ma −1 undo base (min 0).",
      rarity: "common",
    },
  };

  const POOL = Object.keys(RELICS);
  const STACKABLE = new Set([
    "step_cache",
    "quick_pour",
    "efficient_mind",
    "undo_kit",
  ]);

  function createRun(seedStr) {
    const Proc =
      typeof window !== "undefined" && window.ColoriniProcgen
        ? window.ColoriniProcgen
        : globalThis.ColoriniProcgen;
    const seed = Proc.hashSeed(seedStr || String(Date.now()));
    return {
      seed,
      seedStr: seedStr || String(seed),
      floor: 0,
      totalFloors: TOTAL_FLOORS,
      hp: BASE_HP,
      maxHp: BASE_HP,
      relics: [],
      freeRestarts: 0,
      undosLeft: BASE_UNDOS,
      undosFloorBase: BASE_UNDOS,
      movesLeft: 0,
      movesMax: 0,
      permanentMoves: 0,
      lastGaspUsed: false,
      score: 0,
      floorsCleared: 0,
      bestFloor: 0,
      deaths: 0,
      alive: true,
      won: false,
      deathCycle: 0,
      lastClearMovesLeft: 0,
      lastClearMovesMax: 0,
    };
  }

  function hasRelic(run, id) {
    return run.relics.includes(id);
  }

  function countRelic(run, id) {
    return run.relics.filter((r) => r === id).length;
  }

  function applyRelicPickup(run, id) {
    run.relics.push(id);
    if (id === "efficient_mind") {
      run.permanentMoves += 1;
    }
  }

  function movesForFloor(run, spec) {
    let n = spec && spec.moveLimit != null ? spec.moveLimit : 20;
    n += countRelic(run, "step_cache") * 4;
    n += countRelic(run, "quick_pour") * 2;
    n += countRelic(run, "gambler_cork") * 6;
    n += run.permanentMoves || 0;
    if (spec && spec.isBoss && hasRelic(run, "boss_ration")) n += 10;
    return Math.max(5, n);
  }

  function undosForFloor(run, spec) {
    let n = spec && spec.baseUndos != null ? spec.baseUndos : BASE_UNDOS;
    n += countRelic(run, "undo_kit");
    n -= countRelic(run, "gambler_cork");
    return Math.max(0, n);
  }

  function prepareFloorCharges(run, spec) {
    run.movesMax = movesForFloor(run, spec);
    run.movesLeft = run.movesMax;
    run.undosLeft = undosForFloor(run, spec);
    run.undosFloorBase = run.undosLeft;
    run.freeRestarts = hasRelic(run, "soft_reset") ? 1 : 0;
    run.lastGaspUsed = false;
  }

  function emptyBonus(run) {
    return hasRelic(run, "ghost_bottle") ? 1 : 0;
  }

  function preSortedBonus() {
    return 0;
  }

  function tryLastGasp(run) {
    if (!hasRelic(run, "last_gasp") || run.lastGaspUsed) return false;
    if (run.movesLeft > 0) return false;
    run.lastGaspUsed = true;
    run.movesLeft += 3;
    return true;
  }

  /** Call after a successful clear — thrift may bump permanent moves. */
  function onFloorCleared(run, movesLeft, movesMax) {
    run.lastClearMovesLeft = movesLeft;
    run.lastClearMovesMax = movesMax;
    if (hasRelic(run, "thrift") && movesLeft >= 5) {
      run.permanentMoves += 2;
      return { thriftBonus: 2 };
    }
    return { thriftBonus: 0 };
  }

  function onDeath(run) {
    run.deaths += 1;
    run.deathCycle += 1;
    run.floor = 0;
    run.hp = BASE_HP;
    run.maxHp = BASE_HP;
    run.alive = true;
    run.freeRestarts = 0;
    run.lastGaspUsed = false;
    return { resetToStart: true };
  }

  /**
   * Offer quality tracks how tight the clear was (moves left).
   * Efficient clears → rarer relics.
   */
  function pickRelicOffers(run, rng, count, movesLeft, movesMax) {
    const ratio = movesMax > 0 ? movesLeft / movesMax : 0;
    // Low ratio = clutch clear = better loot; high leftover = common loot
    let commonW = 5;
    let rareW = 3;
    let legW = 1;
    if (ratio <= 0.15) {
      commonW = 1;
      rareW = 4;
      legW = 4;
    } else if (ratio <= 0.35) {
      commonW = 2;
      rareW = 5;
      legW = 2;
    } else if (ratio >= 0.55) {
      commonW = 7;
      rareW = 2;
      legW = 0.5;
    }

    let available = POOL.filter((id) => {
      const n = countRelic(run, id);
      if (n === 0) return true;
      if (STACKABLE.has(id) && n < 2) return true;
      return false;
    });

    const weight = (id) => {
      const r = RELICS[id].rarity;
      if (r === "common") return commonW;
      if (r === "rare") return rareW;
      return legW;
    };

    const picks = [];
    available = available.slice();
    for (let n = 0; n < count && available.length; n++) {
      const total = available.reduce((s, id) => s + weight(id), 0);
      let roll = rng() * total;
      let chosen = available[0];
      for (const id of available) {
        roll -= weight(id);
        if (roll <= 0) {
          chosen = id;
          break;
        }
      }
      picks.push(RELICS[chosen]);
      available = available.filter((id) => id !== chosen);
    }
    return picks;
  }

  function floorScore(movesLeft, movesMax, floorIndex) {
    const clutch = Math.max(0, 12 - movesLeft) * 8;
    const depth = floorIndex * 40;
    const lean = movesMax > 0 ? Math.round((1 - movesLeft / movesMax) * 40) : 0;
    return 50 + depth + clutch + lean;
  }

  function clearRelics(run) {
    run.relics = [];
    run.permanentMoves = 0;
  }

  return {
    TOTAL_FLOORS,
    BASE_HP,
    BASE_UNDOS,
    RELICS,
    createRun,
    hasRelic,
    countRelic,
    applyRelicPickup,
    prepareFloorCharges,
    emptyBonus,
    preSortedBonus,
    tryLastGasp,
    onFloorCleared,
    onDeath,
    pickRelicOffers,
    floorScore,
    clearRelics,
    movesForFloor,
    undosForFloor,
  };
})();
