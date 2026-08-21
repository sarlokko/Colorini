/**
 * Bottega di Travaso — shop for relics (passives) and items (consumables).
 */
window.ColoriniVendor = (function () {
  "use strict";

  const QUOTES = [
    "Reliquie restano. Oggetti… puff, una volta sola!",
    "Mosse risparmiate, gocce guadagnate!",
    "Fissa una merce: la tengo sul banco speciale.",
    "Le etichette verdi sono reliquie. Quelle arancio sono oggetti.",
    "Spendi pure, ma non restare a secco.",
    "Travaso non rimborsa i tappi aperti.",
    "Una goccia oggi vale una vittoria domani.",
  ];

  /** Instant shop buffs — not inventory, apply to next floor only. */
  const EXTRAS = {
    sip_pace: {
      id: "sip_pace",
      name: "Sorso di ritmo",
      desc: "Prossimo piano: +3 mosse.",
      rarity: "common",
      kind: "item",
      consumable: true,
      cost: 3,
      shopOnly: true,
    },
    spare_cork: {
      id: "spare_cork",
      name: "Tappo di ricambio",
      desc: "Prossimo piano: +1 undo.",
      rarity: "common",
      kind: "item",
      consumable: true,
      cost: 2,
      shopOnly: true,
    },
  };

  function allCatalog(Rogue) {
    const relics = Object.values(Rogue.RELICS).map((r) =>
      Object.assign({}, r, { shopOnly: false })
    );
    const items = Object.values(Rogue.ITEMS).map((r) =>
      Object.assign({}, r, { shopOnly: false })
    );
    const extras = Object.values(EXTRAS);
    return relics.concat(items, extras);
  }

  function quote(rng) {
    return QUOTES[Math.floor(rng() * QUOTES.length)];
  }

  function weightFor(item, ratio) {
    let w = item.rarity === "common" ? 5 : item.rarity === "rare" ? 2.5 : 0.35;
    if (item.rarity === "legendary") {
      w *= item.id === "boss_ration" ? 0.25 : 0.4;
      if (ratio > 0.4) w *= 0.5;
    }
    if (item.shopOnly) w *= 1.35;
    // Prefer showing a mix: slight boost to underrepresented kind in weighting is done in buildStock
    return w;
  }

  function buildStock(run, Rogue, rng, slots) {
    const ratio =
      run.lastClearMovesMax > 0
        ? run.lastClearMovesLeft / run.lastClearMovesMax
        : 0.3;
    const catalog = allCatalog(Rogue).filter((item) => {
      if (item.shopOnly) return true;
      return Rogue.canOwnMore(run, item.id);
    });

    const stock = [];
    const pinned = run.pinnedItem;
    if (pinned) {
      const pinItem = catalog.find((i) => i.id === pinned);
      if (pinItem) stock.push(Object.assign({}, pinItem, { pinned: true }));
    }

    // Try to keep at least one relic and one item on the shelf
    const relics = catalog.filter((i) => i.kind === "relic" && i.id !== pinned);
    const items = catalog.filter((i) => i.kind === "item" && i.id !== pinned);

    function pickFrom(pool) {
      if (!pool.length) return null;
      const total = pool.reduce((s, i) => s + weightFor(i, ratio), 0);
      let roll = rng() * total;
      let chosen = pool[0];
      for (const item of pool) {
        roll -= weightFor(item, ratio);
        if (roll <= 0) {
          chosen = item;
          break;
        }
      }
      return chosen;
    }

    if (stock.length < slots) {
      const r = pickFrom(relics);
      if (r) stock.push(Object.assign({}, r, { pinned: false }));
    }
    if (stock.length < slots) {
      const it = pickFrom(items);
      if (it) stock.push(Object.assign({}, it, { pinned: false }));
    }

    let pool = catalog.filter((i) => !stock.some((s) => s.id === i.id));
    while (stock.length < slots && pool.length) {
      const chosen = pickFrom(pool);
      if (!chosen) break;
      stock.push(Object.assign({}, chosen, { pinned: false }));
      pool = pool.filter((i) => i.id !== chosen.id);
    }
    return stock;
  }

  function buy(run, Rogue, itemId) {
    const catalog = allCatalog(Rogue);
    const item = catalog.find((i) => i.id === itemId);
    if (!item) return { ok: false, reason: "Merce introvabile." };
    if ((run.wallet || 0) < item.cost) {
      return { ok: false, reason: "Gocce insufficienti." };
    }
    if (!item.shopOnly && !Rogue.canOwnMore(run, item.id)) {
      return { ok: false, reason: "Ce l’hai già." };
    }

    run.wallet -= item.cost;

    if (item.shopOnly) {
      if (item.id === "sip_pace") run.nextFloorMoves = (run.nextFloorMoves || 0) + 3;
      if (item.id === "spare_cork") run.nextFloorUndos = (run.nextFloorUndos || 0) + 1;
    } else {
      Rogue.applyRelicPickup(run, item.id);
    }

    if (run.pinnedItem === itemId) run.pinnedItem = null;
    return { ok: true, item };
  }

  function togglePin(run, itemId) {
    if (run.pinnedItem === itemId) {
      run.pinnedItem = null;
      return { pinned: null };
    }
    run.pinnedItem = itemId;
    return { pinned: itemId };
  }

  return {
    EXTRAS,
    allCatalog,
    quote,
    buildStock,
    buy,
    togglePin,
  };
})();
