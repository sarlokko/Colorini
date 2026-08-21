/**
 * Roguelike catalog:
 * - RELICS = passives that stay for the whole run
 * - ITEMS  = consumables kept until triggered once
 */
window.ColoriniRogue = (function () {
  "use strict";

  const TOTAL_FLOORS = 12;
  const BASE_HP = 1;
  const BASE_UNDOS = 1;

  /** Passive relics — unique effects, persist until run ends. */
  const RELICS = {
    steady_drip: {
      id: "steady_drip",
      name: "Goccia costante",
      desc: "+1 mossa all’inizio di ogni piano.",
      rarity: "common",
      kind: "relic",
      consumable: false,
      cost: 3,
    },
    undo_kit: {
      id: "undo_kit",
      name: "Kit di ripensamento",
      desc: "+1 undo all’inizio di ogni piano.",
      rarity: "common",
      kind: "relic",
      consumable: false,
      cost: 3,
    },
    gambler_cork: {
      id: "gambler_cork",
      name: "Tappo scommettitore",
      desc: "+2 mosse ogni piano, ma −1 undo base.",
      rarity: "common",
      kind: "relic",
      consumable: false,
      cost: 4,
    },
    efficient_mind: {
      id: "efficient_mind",
      name: "Mente efficiente",
      desc: "+1 mossa permanente alla run (stack max 2).",
      rarity: "rare",
      kind: "relic",
      consumable: false,
      cost: 5,
    },
    ghost_bottle: {
      id: "ghost_bottle",
      name: "Bottiglia fantasma",
      desc: "+1 bottiglia vuota ogni piano.",
      rarity: "legendary",
      kind: "relic",
      consumable: false,
      cost: 10,
    },
  };

  /** Consumable items — sit in inventory until used once, then gone. */
  const ITEMS = {
    soft_reset: {
      id: "soft_reset",
      name: "Tappo di scorta",
      desc: "Rifai il piano attuale senza morire.",
      rarity: "rare",
      kind: "item",
      consumable: true,
      cost: 6,
    },
    last_gasp: {
      id: "last_gasp",
      name: "Ultimo sussulto",
      desc: "A 0 mosse: +2 mosse, poi si consuma.",
      rarity: "rare",
      kind: "item",
      consumable: true,
      cost: 5,
    },
    boss_ration: {
      id: "boss_ration",
      name: "Razione del boss",
      desc: "Al prossimo boss: +10 mosse, poi si consuma.",
      rarity: "legendary",
      kind: "item",
      consumable: true,
      cost: 10,
    },
    ordered_vial: {
      id: "ordered_vial",
      name: "Fiala ordinata",
      desc: "Prossimo piano (non boss): un colore parte già completo.",
      rarity: "rare",
      kind: "item",
      consumable: true,
      cost: 5,
    },
  };

  /** Combined lookup for inventory ids */
  const CATALOG = Object.assign({}, RELICS, ITEMS);
  const POOL = Object.keys(CATALOG);
  const STACKABLE = new Set(["efficient_mind"]);

  const LEGENDARY_WEIGHT = {
    boss_ration: 0.08,
    ghost_bottle: 0.15,
  };

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
      wallet: 0,
      pinnedItem: null,
      nextFloorMoves: 0,
      nextFloorUndos: 0,
      nextFloorPresort: 0,
    };
  }

  function entry(id) {
    return CATALOG[id] || null;
  }

  function hasRelic(run, id) {
    return run.relics.includes(id);
  }

  function countRelic(run, id) {
    return run.relics.filter((r) => r === id).length;
  }

  function isConsumable(id) {
    const e = entry(id);
    return !!(e && e.consumable);
  }

  function isRelicKind(id) {
    const e = entry(id);
    return !!(e && e.kind === "relic");
  }

  function consumeRelic(run, id) {
    const idx = run.relics.indexOf(id);
    if (idx < 0) return false;
    run.relics.splice(idx, 1);
    return true;
  }

  function applyRelicPickup(run, id) {
    if (!CATALOG[id]) return;
    run.relics.push(id);
    if (id === "efficient_mind") run.permanentMoves += 1;
    if (id === "soft_reset") run.freeRestarts += 1;
    if (id === "boss_ration") run.pendingBossRation = true;
  }

  function movesForFloor(run, spec) {
    let n = spec && spec.moveLimit != null ? spec.moveLimit : 20;
    n += countRelic(run, "steady_drip");
    n += countRelic(run, "gambler_cork") * 2;
    n += run.permanentMoves || 0;
    n += run.nextFloorMoves || 0;
    return Math.max(5, n);
  }

  function undosForFloor(run, spec) {
    let n = spec && spec.baseUndos != null ? spec.baseUndos : BASE_UNDOS;
    n += countRelic(run, "undo_kit");
    n -= countRelic(run, "gambler_cork");
    n += run.nextFloorUndos || 0;
    return Math.max(0, n);
  }

  /** Call before generating the puzzle so pre-sort can apply. */
  function armFloorPresort(run, spec) {
    if (
      hasRelic(run, "ordered_vial") &&
      !(spec && (spec.isBoss || spec.isFinal))
    ) {
      run.nextFloorPresort = 1;
      consumeRelic(run, "ordered_vial");
    }
  }

  function prepareFloorCharges(run, spec) {
    let moves = movesForFloor(run, spec);
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
    run.nextFloorMoves = 0;
    run.nextFloorUndos = 0;
  }

  function emptyBonus(run) {
    return hasRelic(run, "ghost_bottle") ? 1 : 0;
  }

  function preSortedBonus(run) {
    const n = run.nextFloorPresort || 0;
    run.nextFloorPresort = 0;
    return n;
  }

  function tryLastGasp(run) {
    if (!hasRelic(run, "last_gasp")) return false;
    if (run.movesLeft > 0) return false;
    consumeRelic(run, "last_gasp");
    run.movesLeft += 2;
    return true;
  }

  function trySoftReset(run) {
    if (run.freeRestarts <= 0) return false;
    run.freeRestarts -= 1;
    consumeRelic(run, "soft_reset");
    return true;
  }

  function onFloorCleared(run, movesLeft, movesMax) {
    run.lastClearMovesLeft = movesLeft;
    run.lastClearMovesMax = movesMax;
    return {};
  }

  function onDeath(run) {
    run.deaths += 1;
    run.deathCycle += 1;
    run.floor = 0;
    run.hp = BASE_HP;
    run.maxHp = BASE_HP;
    run.alive = true;
    return { resetToStart: true };
  }

  function pickRelicOffers(run, rng, count, movesLeft, movesMax) {
    // Legacy helper — vendor is primary. Keep a simple rare inject pool.
    const ratio = movesMax > 0 ? movesLeft / movesMax : 0;
    const legendaryInjectChance =
      ratio <= 0.15 ? 0.08 : ratio <= 0.35 ? 0.035 : 0.012;
    let commonW = 6;
    let rareW = 2.5;
    if (ratio <= 0.15) {
      commonW = 3;
      rareW = 4;
    } else if (ratio <= 0.35) {
      commonW = 4;
      rareW = 3.5;
    }

    let available = POOL.filter((id) => {
      if (CATALOG[id].rarity === "legendary") return false;
      return canOwnMore(run, id);
    });

    const weight = (id) =>
      CATALOG[id].rarity === "common" ? commonW : rareW;

    const picks = [];
    available = available.slice();
    for (let n = 0; n < count && available.length; n++) {
      const total = available.reduce((s, id) => s + weight(id), 0);
      if (total <= 0) break;
      let roll = rng() * total;
      let chosen = available[0];
      for (const id of available) {
        roll -= weight(id);
        if (roll <= 0) {
          chosen = id;
          break;
        }
      }
      picks.push(CATALOG[chosen]);
      available = available.filter((id) => id !== chosen);
    }

    if (rng() < legendaryInjectChance) {
      const legends = POOL.filter(
        (id) => CATALOG[id].rarity === "legendary" && countRelic(run, id) === 0
      );
      if (legends.length) {
        const lw = legends.map((id) => ({
          id,
          w: LEGENDARY_WEIGHT[id] != null ? LEGENDARY_WEIGHT[id] : 0.2,
        }));
        const sum = lw.reduce((s, x) => s + x.w, 0);
        let roll = rng() * sum;
        let chosen = lw[0].id;
        for (const x of lw) {
          roll -= x.w;
          if (roll <= 0) {
            chosen = x.id;
            break;
          }
        }
        if (picks.length) picks[picks.length - 1] = CATALOG[chosen];
        else picks.push(CATALOG[chosen]);
      }
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
    run.wallet = 0;
    run.pinnedItem = null;
    run.nextFloorMoves = 0;
    run.nextFloorUndos = 0;
    run.nextFloorPresort = 0;
  }

  function bankLeftoverMoves(run, movesLeft) {
    const gained = Math.max(0, movesLeft | 0);
    run.wallet = (run.wallet || 0) + gained;
    return gained;
  }

  function canOwnMore(run, id) {
    const e = entry(id);
    if (!e) return false;
    const n = countRelic(run, id);
    if (n === 0) return true;
    if (!e.consumable && STACKABLE.has(id) && n < 2) return true;
    return false;
  }

  function inventoryByKind(run) {
    const relics = [];
    const items = [];
    run.relics.forEach((id) => {
      const e = entry(id);
      if (!e) return;
      if (e.kind === "item") items.push(e);
      else relics.push(e);
    });
    return { relics, items };
  }

  return {
    TOTAL_FLOORS,
    BASE_HP,
    BASE_UNDOS,
    RELICS,
    ITEMS,
    CATALOG,
    createRun,
    hasRelic,
    countRelic,
    isConsumable,
    isRelicKind,
    entry,
    consumeRelic,
    applyRelicPickup,
    armFloorPresort,
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
    bankLeftoverMoves,
    canOwnMore,
    inventoryByKind,
  };
})();
