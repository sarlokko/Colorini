/**
 * Bottega di Travaso — shop that sells relics for leftover moves (gocce).
 */
window.ColoriniVendor = (function () {
  "use strict";

  const QUOTES = [
    "Mosse risparmiate, gocce guadagnate!",
    "Niente è gratis… tranne i consigli cattivi.",
    "Fissa una merce se ti piace: la tengo da parte.",
    "Il tappo giusto salva una spedizione intera.",
    "Spendi pure, ma non restare a secco.",
    "Oggi il banco balla: guarda bene le etichette!",
    "Una goccia oggi vale una vittoria domani.",
    "Travaso raccomanda: non versare soldi a caso.",
  ];

  /** Shop-only one-floor buffs */
  const EXTRAS = {
    sip_pace: {
      id: "sip_pace",
      name: "Sorso di ritmo",
      desc: "Prossimo piano: +3 mosse (una volta).",
      rarity: "common",
      consumable: true,
      cost: 3,
      shopOnly: true,
    },
    spare_cork: {
      id: "spare_cork",
      name: "Tappo di ricambio",
      desc: "Prossimo piano: +1 undo (una volta).",
      rarity: "common",
      consumable: true,
      cost: 2,
      shopOnly: true,
    },
  };

  function allCatalog(Rogue) {
    const items = Object.values(Rogue.RELICS).map((r) =>
      Object.assign({}, r, { shopOnly: false })
    );
    return items.concat(Object.values(EXTRAS));
  }

  function quote(rng) {
    return QUOTES[Math.floor(rng() * QUOTES.length)];
  }

  function weightFor(item, ratio) {
    let w = 1;
    if (item.rarity === "common") w = 5;
    else if (item.rarity === "rare") w = 2.5;
    else w = 0.35;
    if (item.rarity === "legendary") {
      // Still rare on the shelf
      w *= item.id === "boss_ration" ? 0.25 : 0.4;
      if (ratio > 0.4) w *= 0.5;
    }
    if (item.shopOnly) w *= 1.4;
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

    let pool = catalog.filter((i) => i.id !== pinned);
    while (stock.length < slots && pool.length) {
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

    // Bought pinned item → clear pin
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
