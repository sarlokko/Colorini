/**
 * Bottega di Travaso — shop for relics (passives) and items (consumables).
 */
window.ColoriniVendor = (function () {
  "use strict";

  /** Greeting when the shop opens (mildly useful). */
  const GREETINGS = [
    "Reliquie restano. Oggetti… puff, una volta sola!",
    "Mosse risparmiate, gocce guadagnate!",
    "Fissa una merce: la tengo sul banco speciale.",
    "Tocca la mia faccia per… ehm… saggezza gratuita.",
    "Spendi pure, ma non restare a secco.",
  ];

  /** Click Travaso for proudly useless tips. */
  const ADVICE = [
    "Consiglio ufficiale: versa sempre verso il basso. L’alto è già del cielo.",
    "Se la bottiglia è piena, non metterci altro. Fidati. È scienza.",
    "Il mio colore preferito? Quello che ti manca. Sempre.",
    "Non parlare alle bottiglie. Non rispondono. Io sì, ma a caso.",
    "Undo è un amico. Undo abusato è un cugino che resta a dormire.",
    "Le gocce non nuotano: tu le spendi. Poi piangi. Poi ricompri.",
    "A 0 mosse: respira. Poi muori con stile. Travaso applaude.",
    "Il boss non ti odia. Ti trova solo… cromaticamente confuso.",
    "Mai comprare due tappi uguali. A meno che non siano diversi.",
    "La strategia migliore? Quella che funziona. La seconda? Chiedere a me.",
    "Oggi i pianeti dicono: compra qualcosa. I pianeti mentono spesso.",
    "Se versi il rosso sul blu… ottieni un problema. E un bel «ops».",
    "Il mio baffo contiene saggezza. E briciole di merenda.",
    "Conta fino a tre prima di versare. Poi versa comunque.",
    "Le reliquie non fanno colazione. Gli oggetti sì: una volta sola.",
    "Non fissare il banco troppo a lungo: si imbarazza.",
    "Ho visto bottiglie più brave di te. Spoiler: eri tu, ieri.",
    "Goccia dopo goccia si fa… un portafoglio vuoto. Evviva il commercio!",
    "Se non sai cosa comprare, compra quello che luccica di meno. O di più.",
    "Travaso garantisce: questo consiglio non ti servirà a niente.",
    "Mai versare a stomaco vuoto. Le bottiglie lo sentono.",
    "Il segreto del water sort? L’acqua. E i colori. E… ok, basta.",
    "Se perdi, digli che è stata colpa del vento. Non c’è vento? Inventalo.",
    "Pinna una merce solo se ti piace. Oppure se vuoi far arrabbiare il destino.",
    "Io non giudico. Ok, un po’ sì. Ma con affetto commerciale.",
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

  function pickLine(pool, rng, avoid) {
    if (!pool.length) return "";
    let line = pool[Math.floor(rng() * pool.length)];
    if (pool.length > 1 && avoid && line === avoid) {
      line = pool[Math.floor(rng() * pool.length)];
      if (line === avoid) {
        const alt = pool.filter((q) => q !== avoid);
        line = alt[Math.floor(rng() * alt.length)] || line;
      }
    }
    return line;
  }

  function quote(rng) {
    return pickLine(GREETINGS, rng);
  }

  function advice(rng, avoid) {
    return pickLine(ADVICE, rng, avoid);
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
    GREETINGS,
    ADVICE,
    allCatalog,
    quote,
    advice,
    buildStock,
    buy,
    togglePin,
  };
})();
