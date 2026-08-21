/**
 * Roguelike relics & run helpers for Colorini.
 */
window.ColoriniRogue = (function () {
  "use strict";

  const TOTAL_FLOORS = 8;
  const BASE_HP = 3;
  const BASE_UNDOS = 3;

  /** @type {Record<string, { id: string, name: string, desc: string, rarity: string, stack?: boolean }>} */
  const RELICS = {
    ghost_bottle: {
      id: "ghost_bottle",
      name: "Bottiglia fantasma",
      desc: "+1 bottiglia vuota ogni piano.",
      rarity: "rare",
    },
    liquid_memory: {
      id: "liquid_memory",
      name: "Memoria liquida",
      desc: "+2 undo all’inizio di ogni piano.",
      rarity: "common",
    },
    deep_pockets: {
      id: "deep_pockets",
      name: "Tasche profonde",
      desc: "+1 undo all’inizio di ogni piano.",
      rarity: "common",
    },
    spare_heart: {
      id: "spare_heart",
      name: "Cuore di vetro",
      desc: "+1 vita massima e cura 1 ♥.",
      rarity: "rare",
    },
    soft_reset: {
      id: "soft_reset",
      name: "Tappo di scorta",
      desc: "1 ricomincia gratis per piano.",
      rarity: "common",
    },
    chromatic_luck: {
      id: "chromatic_luck",
      name: "Fortuna cangiante",
      desc: "Un colore parte già ordinato.",
      rarity: "rare",
    },
    second_wind: {
      id: "second_wind",
      name: "Secondo soffio",
      desc: "La prima morte diventa 1 ♥.",
      rarity: "legendary",
    },
    tidy_hands: {
      id: "tidy_hands",
      name: "Mani ordinate",
      desc: "All’inizio del piano: +1 undo extra.",
      rarity: "common",
    },
    boss_ward: {
      id: "boss_ward",
      name: "Sigillo anti-boss",
      desc: "Nei boss parti con +2 undo.",
      rarity: "rare",
    },
    crystal_focus: {
      id: "crystal_focus",
      name: "Focus di cristallo",
      desc: "Suggerisce una mossa valida (1/piano).",
      rarity: "common",
    },
  };

  const POOL = Object.keys(RELICS);

  function createRun(seedStr) {
    const seed = (typeof window !== "undefined" && window.ColoriniProcgen
      ? window.ColoriniProcgen
      : globalThis.ColoriniProcgen
    ).hashSeed(seedStr || String(Date.now()));
    return {
      seed,
      seedStr: seedStr || String(seed),
      floor: 0,
      totalFloors: TOTAL_FLOORS,
      hp: BASE_HP,
      maxHp: BASE_HP,
      relics: [],
      freeRestarts: 0,
      hintsLeft: 0,
      undosLeft: BASE_UNDOS,
      undosFloorBase: BASE_UNDOS,
      secondWindAvailable: false,
      score: 0,
      floorsCleared: 0,
      alive: true,
      won: false,
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
    if (id === "spare_heart") {
      run.maxHp += 1;
      run.hp = Math.min(run.maxHp, run.hp + 1);
    }
    if (id === "second_wind") {
      run.secondWindAvailable = true;
    }
  }

  function undosForFloor(run, isBoss) {
    let n = BASE_UNDOS;
    n += countRelic(run, "liquid_memory") * 2;
    n += countRelic(run, "deep_pockets");
    n += countRelic(run, "tidy_hands");
    if (isBoss && hasRelic(run, "boss_ward")) n += 2;
    return n;
  }

  function prepareFloorCharges(run, isBoss) {
    run.undosLeft = undosForFloor(run, isBoss);
    run.undosFloorBase = run.undosLeft;
    run.freeRestarts = hasRelic(run, "soft_reset") ? 1 : 0;
    run.hintsLeft = hasRelic(run, "crystal_focus") ? 1 : 0;
  }

  function emptyBonus(run) {
    return countRelic(run, "ghost_bottle");
  }

  function preSortedBonus(run) {
    return hasRelic(run, "chromatic_luck") ? 1 : 0;
  }

  function loseHp(run, amount) {
    run.hp -= amount;
    if (run.hp <= 0) {
      if (run.secondWindAvailable) {
        run.secondWindAvailable = false;
        run.hp = 1;
        // consume the relic visually: keep it but flag used
        run.secondWindUsed = true;
        return { dead: false, secondWind: true };
      }
      run.hp = 0;
      run.alive = false;
      return { dead: true, secondWind: false };
    }
    return { dead: false, secondWind: false };
  }

  function pickRelicOffers(run, rng, count) {
    const owned = new Set(run.relics);
    // second_wind only once; spare_heart can stack once or twice
    let available = POOL.filter((id) => {
      if (owned.has(id) && id === "second_wind") return false;
      if (owned.has(id) && id === "chromatic_luck") return false;
      if (owned.has(id) && id === "soft_reset") return false;
      if (owned.has(id) && id === "crystal_focus") return false;
      if (owned.has(id) && id === "boss_ward") return false;
      if (countRelic(run, id) >= 2 && (id === "liquid_memory" || id === "deep_pockets" || id === "ghost_bottle" || id === "spare_heart" || id === "tidy_hands")) {
        return false;
      }
      if (owned.has(id) && !["liquid_memory", "deep_pockets", "ghost_bottle", "spare_heart", "tidy_hands"].includes(id)) {
        return false;
      }
      return true;
    });

    // Weighted by rarity
    const weight = (id) => {
      const r = RELICS[id].rarity;
      if (r === "common") return 5;
      if (r === "rare") return 3;
      return 1;
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

  function floorScore(undosLeft, undosBase, hp) {
    return 100 + undosLeft * 15 + hp * 5 + Math.max(0, undosBase - 3) * 2;
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
    loseHp,
    pickRelicOffers,
    floorScore,
  };
})();
