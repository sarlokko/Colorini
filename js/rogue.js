/**
 * Roguelike relics & run helpers — 1 life, death keeps relics, steep climb.
 */
window.ColoriniRogue = (function () {
  "use strict";

  const TOTAL_FLOORS = 12;
  const BASE_HP = 1;
  const BASE_UNDOS = 3;

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
    echo_vial: {
      id: "echo_vial",
      name: "Fiala eco",
      desc: "+1 undo permanente su ogni piano.",
      rarity: "rare",
    },
    soft_reset: {
      id: "soft_reset",
      name: "Tappo di scorta",
      desc: "1 ricomincia del piano senza morire.",
      rarity: "rare",
    },
    chromatic_luck: {
      id: "chromatic_luck",
      name: "Fortuna cangiante",
      desc: "Un colore parte già ordinato (non sui boss).",
      rarity: "rare",
    },
    tidy_hands: {
      id: "tidy_hands",
      name: "Mani ordinate",
      desc: "+1 undo all’inizio di ogni piano.",
      rarity: "common",
    },
    boss_ward: {
      id: "boss_ward",
      name: "Sigillo anti-boss",
      desc: "Nei boss parti con +3 undo.",
      rarity: "legendary",
    },
    crystal_focus: {
      id: "crystal_focus",
      name: "Focus di cristallo",
      desc: "Suggerisce una mossa valida (1/piano).",
      rarity: "common",
    },
    iron_cork: {
      id: "iron_cork",
      name: "Tappo di ferro",
      desc: "Nei piani con 1 vuoto, +1 undo.",
      rarity: "common",
    },
  };

  const POOL = Object.keys(RELICS);
  const STACKABLE = new Set(["liquid_memory", "deep_pockets", "tidy_hands", "echo_vial"]);

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
      hintsLeft: 0,
      undosLeft: BASE_UNDOS,
      undosFloorBase: BASE_UNDOS,
      score: 0,
      floorsCleared: 0,
      bestFloor: 0,
      deaths: 0,
      alive: true,
      won: false,
      deathCycle: 0,
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
  }

  function undosForFloor(run, spec) {
    let n = spec && spec.baseUndos != null ? spec.baseUndos : BASE_UNDOS;
    n += countRelic(run, "liquid_memory") * 2;
    n += countRelic(run, "deep_pockets");
    n += countRelic(run, "tidy_hands");
    n += countRelic(run, "echo_vial");
    if (spec && spec.isBoss && hasRelic(run, "boss_ward")) n += 3;
    if (spec && spec.empty === 1 && hasRelic(run, "iron_cork")) n += 1;
    return Math.max(1, n);
  }

  function prepareFloorCharges(run, spec) {
    run.undosLeft = undosForFloor(run, spec);
    run.undosFloorBase = run.undosLeft;
    run.freeRestarts = hasRelic(run, "soft_reset") ? 1 : 0;
    run.hintsLeft = hasRelic(run, "crystal_focus") ? 1 : 0;
  }

  function emptyBonus(run) {
    return Math.min(1, countRelic(run, "ghost_bottle"));
  }

  function preSortedBonus(run, spec) {
    if (!hasRelic(run, "chromatic_luck")) return 0;
    if (spec && (spec.isBoss || spec.isFinal)) return 0;
    if (spec && spec.style === "nightmare") return 0;
    return 1;
  }

  /**
   * Death: back to floor 1, keep relics & score, refresh the single life.
   * Run continues until victory (or player quits to title).
   */
  function onDeath(run) {
    run.deaths += 1;
    run.deathCycle += 1;
    run.floor = 0;
    run.hp = BASE_HP;
    run.maxHp = BASE_HP;
    run.alive = true;
    run.freeRestarts = 0;
    return { resetToStart: true };
  }

  function pickRelicOffers(run, rng, count) {
    let available = POOL.filter((id) => {
      const n = countRelic(run, id);
      if (n === 0) return true;
      if (STACKABLE.has(id) && n < 2) return true;
      if (id === "ghost_bottle") return false;
      return false;
    });

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

  function floorScore(undosLeft, undosBase, floorIndex) {
    return 80 + floorIndex * 25 + undosLeft * 20 + Math.max(0, undosBase) * 2;
  }

  /** Clear relics only when a run is fully won or a brand-new run starts. */
  function clearRelics(run) {
    run.relics = [];
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
    onDeath,
    pickRelicOffers,
    floorScore,
    clearRelics,
    undosForFloor,
  };
})();
