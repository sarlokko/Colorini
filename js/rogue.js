/**
 * Roguelike relics — passives stay for the run; strong effects are consumable.
 */
window.ColoriniRogue = (function () {
  "use strict";

  const TOTAL_FLOORS = 12;
  const BASE_HP = 1;
  const BASE_UNDOS = 1;

  /**
   * consumable: true → removed from inventory when triggered once.
   * Fixed relics apply every floor for the whole run.
   */
  const RELICS = {
    step_cache: {
      id: "step_cache",
      name: "Scorte di passo",
      desc: "+4 mosse ogni piano.",
      rarity: "common",
      consumable: false,
    },
    quick_pour: {
      id: "quick_pour",
      name: "Verso rapido",
      desc: "+2 mosse ogni piano.",
      rarity: "common",
      consumable: false,
    },
    efficient_mind: {
      id: "efficient_mind",
      name: "Mente efficiente",
      desc: "+1 mossa permanente alla run.",
      rarity: "rare",
      consumable: false,
    },
    undo_kit: {
      id: "undo_kit",
      name: "Kit di ripensamento",
      desc: "+1 undo ogni piano.",
      rarity: "common",
      consumable: false,
    },
    gambler_cork: {
      id: "gambler_cork",
      name: "Tappo scommettitore",
      desc: "+6 mosse ogni piano, −1 undo base.",
      rarity: "common",
      consumable: false,
    },
    ghost_bottle: {
      id: "ghost_bottle",
      name: "Bottiglia fantasma",
      desc: "+1 bottiglia vuota ogni piano.",
      rarity: "legendary",
      consumable: false,
    },
    soft_reset: {
      id: "soft_reset",
      name: "Tappo di scorta",
      desc: "Monouso: rifai il piano attuale senza morire.",
      rarity: "rare",
      consumable: true,
    },
    last_gasp: {
      id: "last_gasp",
      name: "Ultimo sussulto",
      desc: "Monouso: a 0 mosse ottieni +3 mosse.",
      rarity: "rare",
      consumable: true,
    },
    boss_ration: {
      id: "boss_ration",
      name: "Razione del boss",
      desc: "Monouso: al prossimo boss, +10 mosse.",
      rarity: "legendary",
      consumable: true,
    },
    thrift: {
      id: "thrift",
      name: "Parsimonia",
      desc: "Monouso: se chiudi con ≥5 mosse residue, +2 mosse permanenti.",
      rarity: "rare",
      consumable: true,
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
      score: 0,
      floorsCleared: 0,
      bestFloor: 0,
      deaths: 0,
      alive: true,
      won: false,
      deathCycle: 0,
      lastClearMovesLeft: 0,
      lastClearMovesMax: 0,
      pendingBossRation: false,
    };
  }

  function hasRelic(run, id) {
    return run.relics.includes(id);
  }

  function countRelic(run, id) {
    return run.relics.filter((r) => r === id).length;
  }

  function isConsumable(id) {
    return !!(RELICS[id] && RELICS[id].consumable);
  }

  function consumeRelic(run, id) {
    const idx = run.relics.indexOf(id);
    if (idx < 0) return false;
    run.relics.splice(idx, 1);
    return true;
  }

  function applyRelicPickup(run, id) {
    run.relics.push(id);
    if (id === "efficient_mind") {
      run.permanentMoves += 1;
    }
    // Soft reset: one charge for the whole run, not every floor
    if (id === "soft_reset") {
      run.freeRestarts += 1;
    }
    if (id === "boss_ration") {
      run.pendingBossRation = true;
    }
  }

  function movesForFloor(run, spec) {
    let n = spec && spec.moveLimit != null ? spec.moveLimit : 20;
    n += countRelic(run, "step_cache") * 4;
    n += countRelic(run, "quick_pour") * 2;
    n += countRelic(run, "gambler_cork") * 6;
    n += run.permanentMoves || 0;
    return Math.max(5, n);
  }

  function undosForFloor(run, spec) {
    let n = spec && spec.baseUndos != null ? spec.baseUndos : BASE_UNDOS;
    n += countRelic(run, "undo_kit");
    n -= countRelic(run, "gambler_cork");
    return Math.max(0, n);
  }

  function prepareFloorCharges(run, spec) {
    let moves = movesForFloor(run, spec);
    // Consumable boss ration: fires once on a boss floor, then gone
    if (
      spec &&
      spec.isBoss &&
      (run.pendingBossRation || hasRelic(run, "boss_ration"))
    ) {
      moves += 10;
      run.pendingBossRation = false;
      consumeRelic(run, "boss_ration");
      run._bossRationJustUsed = true;
    } else {
      run._bossRationJustUsed = false;
    }

    run.movesMax = moves;
    run.movesLeft = moves;
    run.undosLeft = undosForFloor(run, spec);
    run.undosFloorBase = run.undosLeft;
    // freeRestarts is NOT refreshed each floor — only from picking soft_reset
  }

  function emptyBonus(run) {
    return hasRelic(run, "ghost_bottle") ? 1 : 0;
  }

  function preSortedBonus() {
    return 0;
  }

  /** Consumable: +3 moves once, then relic is destroyed. */
  function tryLastGasp(run) {
    if (!hasRelic(run, "last_gasp")) return false;
    if (run.movesLeft > 0) return false;
    consumeRelic(run, "last_gasp");
    run.movesLeft += 3;
    return true;
  }

  /** Consumable soft reset: spend freeRestart charge and remove relic. */
  function trySoftReset(run) {
    if (run.freeRestarts <= 0) return false;
    run.freeRestarts -= 1;
    consumeRelic(run, "soft_reset");
    return true;
  }

  /** Call after a successful clear — thrift is consumable on trigger. */
  function onFloorCleared(run, movesLeft, movesMax) {
    run.lastClearMovesLeft = movesLeft;
    run.lastClearMovesMax = movesMax;
    if (hasRelic(run, "thrift") && movesLeft >= 5) {
      run.permanentMoves += 2;
      consumeRelic(run, "thrift");
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
    // Keep freeRestarts / consumables — death does not wipe unused charges
    return { resetToStart: true };
  }

  function pickRelicOffers(run, rng, count, movesLeft, movesMax) {
    const ratio = movesMax > 0 ? movesLeft / movesMax : 0;
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
      if (!isConsumable(id) && STACKABLE.has(id) && n < 2) return true;
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
    run.freeRestarts = 0;
    run.pendingBossRation = false;
  }

  return {
    TOTAL_FLOORS,
    BASE_HP,
    BASE_UNDOS,
    RELICS,
    createRun,
    hasRelic,
    countRelic,
    isConsumable,
    consumeRelic,
    applyRelicPickup,
    prepareFloorCharges,
    emptyBonus,
    preSortedBonus,
    tryLastGasp,
    trySoftReset,
    onFloorCleared,
    onDeath,
    pickRelicOffers,
    floorScore,
    clearRelics,
    movesForFloor,
    undosForFloor,
  };
})();
