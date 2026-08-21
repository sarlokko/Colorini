(function () {
  "use strict";

  const LEVELS = window.COLORINI_LEVELS;
  const Proc = window.ColoriniProcgen;
  const Rogue = window.ColoriniRogue;
  const Music = window.ColoriniMusic;
  const Vendor = window.ColoriniVendor;

  const STORAGE_ARCHIVE = "colorini-progress";
  const STORAGE_BEST = "colorini-best-run";
  const STORAGE_MODE = "colorini-mode";

  const rack = document.getElementById("rack");
  const hint = document.getElementById("hint");
  const levelLabel = document.getElementById("levelLabel");
  const levelName = document.getElementById("levelName");
  const brandTag = document.getElementById("brandTag");
  const btnUndo = document.getElementById("btnUndo");
  const btnRestart = document.getElementById("btnRestart");
  const restartLabel = document.getElementById("restartLabel");
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const btnHint = document.getElementById("btnHint");
  const btnMode = document.getElementById("btnMode");
  const archiveNav = document.getElementById("archiveNav");
  const hud = document.getElementById("hud");
  const hudHearts = document.getElementById("hudHearts");
  const hudUndos = document.getElementById("hudUndos");
  const hudMoves = document.getElementById("hudMoves");
  const hudMovesWrap = document.getElementById("hudMovesWrap");
  const hudScore = document.getElementById("hudScore");
  const hudGocce = document.getElementById("hudGocce");
  const hudRelics = document.getElementById("hudRelics");

  const winOverlay = document.getElementById("winOverlay");
  const winKicker = document.getElementById("winKicker");
  const winTitle = document.getElementById("winTitle");
  const winText = document.getElementById("winText");
  const btnReplay = document.getElementById("btnReplay");
  const btnContinue = document.getElementById("btnContinue");

  const titleOverlay = document.getElementById("titleOverlay");
  const bestRunEl = document.getElementById("bestRun");
  const btnNewRun = document.getElementById("btnNewRun");
  const btnOpenArchive = document.getElementById("btnOpenArchive");

  const relicOverlay = document.getElementById("relicOverlay"); // legacy unused
  const vendorOverlay = document.getElementById("vendorOverlay");
  const vendorShelf = document.getElementById("vendorShelf");
  const vendorQuote = document.getElementById("vendorQuote");
  const vendorWalletAmount = document.getElementById("vendorWalletAmount");
  const btnVendorLeave = document.getElementById("btnVendorLeave");
  const relicGrid = document.getElementById("relicGrid");

  const runOverlay = document.getElementById("runOverlay");
  const runKicker = document.getElementById("runKicker");
  const runTitle = document.getElementById("runTitle");
  const runText = document.getElementById("runText");
  const btnRunAgain = document.getElementById("btnRunAgain");
  const btnRunTitle = document.getElementById("btnRunTitle");

  const btnMusic = document.getElementById("btnMusic");

  const state = {
    mode: "rogue", // 'rogue' | 'archive'
    capacity: 4,
    bottles: [],
    startBottles: [],
    selected: null,
    history: [],
    busy: false,
    levelIndex: 0,
    run: null,
    floorRng: null,
    puzzleMeta: null,
    blocked: false,
  };

  function cloneBottles(bottles) {
    return bottles.map((b) => b.slice());
  }

  function loadArchiveProgress() {
    try {
      const n = Number(localStorage.getItem(STORAGE_ARCHIVE));
      if (!Number.isFinite(n) || n < 0) return 0;
      return Math.min(Math.floor(n), LEVELS.length - 1);
    } catch {
      return 0;
    }
  }

  function saveArchiveProgress(index) {
    try {
      const prev = loadArchiveProgress();
      if (index > prev) localStorage.setItem(STORAGE_ARCHIVE, String(index));
    } catch {
      /* ignore */
    }
  }

  function loadBest() {
    try {
      const raw = localStorage.getItem(STORAGE_BEST);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveBest(run) {
    const prev = loadBest();
    const next = {
      floors: run.bestFloor || run.floorsCleared,
      score: run.score,
      won: run.won,
      deaths: run.deaths || 0,
    };
    if (
      !prev ||
      (next.won && !prev.won) ||
      (next.won === prev.won && next.floors > prev.floors) ||
      (next.won === prev.won && next.floors === prev.floors && next.score > prev.score)
    ) {
      try {
        localStorage.setItem(STORAGE_BEST, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
  }

  function topColor(bottle) {
    return bottle.length ? bottle[bottle.length - 1] : null;
  }

  function topRunLength(bottle) {
    if (!bottle.length) return 0;
    const color = topColor(bottle);
    let n = 0;
    for (let i = bottle.length - 1; i >= 0; i--) {
      if (bottle[i] !== color) break;
      n++;
    }
    return n;
  }

  function spaceLeft(bottle, capacity) {
    return capacity - bottle.length;
  }

  function canPour(from, to, capacity) {
    if (from === to) return false;
    const src = state.bottles[from];
    const dst = state.bottles[to];
    if (!src.length) return false;
    const free = spaceLeft(dst, capacity);
    if (free <= 0) return false;
    if (!dst.length) return true;
    return topColor(src) === topColor(dst);
  }

  function pourAmount(from, to, capacity) {
    const src = state.bottles[from];
    const dst = state.bottles[to];
    return Math.min(spaceLeft(dst, capacity), topRunLength(src));
  }

  function isSolved(bottles, capacity) {
    return bottles.every((b) => {
      if (!b.length) return true;
      if (b.length !== capacity) return false;
      const c = b[0];
      return b.every((x) => x === c);
    });
  }

  function findHintMove() {
    for (let i = 0; i < state.bottles.length; i++) {
      for (let j = 0; j < state.bottles.length; j++) {
        if (!canPour(i, j, state.capacity)) continue;
        // Prefer pouring into non-empty matching, or emptying toward sorting
        return [i, j];
      }
    }
    return null;
  }

  function setHint(text, pulse) {
    hint.textContent = text;
    if (pulse) {
      hint.classList.remove("pulse");
      void hint.offsetWidth;
      hint.classList.add("pulse");
    }
  }

  function anyOverlayOpen() {
    return (
      !titleOverlay.hidden ||
      !winOverlay.hidden ||
      (vendorOverlay && !vendorOverlay.hidden) ||
      !runOverlay.hidden
    );
  }

  function hideOverlays() {
    titleOverlay.hidden = true;
    winOverlay.hidden = true;
    if (vendorOverlay) vendorOverlay.hidden = true;
    runOverlay.hidden = true;
  }

  function renderHearts() {
    if (!state.run) {
      hudHearts.replaceChildren();
      return;
    }
    hudHearts.replaceChildren();
    for (let i = 0; i < state.run.maxHp; i++) {
      const s = document.createElement("span");
      s.className = "heart" + (i < state.run.hp ? " on" : " off");
      s.textContent = "♥";
      hudHearts.appendChild(s);
    }
  }

  function renderRelicHud() {
    hudRelics.replaceChildren();
    if (!state.run) return;
    const bag = Rogue.inventoryByKind(state.run);
    function addChip(entry, kind) {
      const chip = document.createElement("span");
      chip.className =
        "inv-chip kind-" +
        kind +
        " rarity-" +
        entry.rarity;
      const label = kind === "item" ? "Oggetto" : "Reliquia";
      chip.title = label + ": " + entry.name + " — " + entry.desc;
      chip.innerHTML =
        `<span class="inv-kind">${kind === "item" ? "1×" : "∞"}</span> ` +
        entry.name.split(" ")[0];
      hudRelics.appendChild(chip);
    }
    bag.relics.forEach((e) => addChip(e, "relic"));
    bag.items.forEach((e) => addChip(e, "item"));
  }

  function updateChrome() {
    const rogue = state.mode === "rogue";
    hud.hidden = !rogue || !state.run;
    archiveNav.hidden = rogue;
    btnMode.textContent = rogue ? "Archivio" : "Spedizione";
    brandTag.textContent = rogue ? "water sort · rogue" : "water sort · archivio";

    if (rogue && state.run) {
      const floor = state.run.floor + 1;
      levelLabel.textContent = `Piano ${floor}/${state.run.totalFloors}`;
      levelName.textContent = state.puzzleMeta
        ? state.puzzleMeta.name + (state.puzzleMeta.isBoss ? " ⚔" : "")
        : "Spedizione";
      hudUndos.textContent = String(state.run.undosLeft);
      if (hudMoves) {
        hudMoves.textContent = String(state.run.movesLeft);
      }
      if (hudMovesWrap) {
        hudMovesWrap.classList.remove("is-low", "is-critical");
        const ratio =
          state.run.movesMax > 0 ? state.run.movesLeft / state.run.movesMax : 1;
        if (state.run.movesLeft <= 3) hudMovesWrap.classList.add("is-critical");
        else if (ratio <= 0.3) hudMovesWrap.classList.add("is-low");
      }
      hudScore.textContent = String(state.run.score);
      if (hudGocce) hudGocce.textContent = String(state.run.wallet || 0);
      renderHearts();
      renderRelicHud();
      restartLabel.textContent =
        state.run.freeRestarts > 0 ? "Free" : "☠ Muori";
      btnHint.hidden = true;
      btnUndo.disabled =
        state.busy || state.history.length === 0 || state.run.undosLeft <= 0;
    } else {
      const level = LEVELS[state.levelIndex];
      levelLabel.textContent = `Livello ${state.levelIndex + 1}`;
      if (levelName) levelName.textContent = level ? level.name : "";
      restartLabel.textContent = "Restart";
      btnHint.hidden = true;
      btnUndo.disabled = state.busy || state.history.length === 0;
      btnPrev.disabled = state.busy || state.levelIndex === 0;
      btnNext.disabled = state.busy || state.levelIndex >= LEVELS.length - 1;
    }

    btnRestart.disabled = state.busy;
  }

  function syncMusicButton() {
    if (!btnMusic || !Music) return;
    const on = Music.isEnabled();
    btnMusic.setAttribute("aria-pressed", on ? "true" : "false");
    btnMusic.setAttribute("aria-label", on ? "Disattiva musica" : "Attiva musica");
    btnMusic.title = on ? "Musica on" : "Musica off";
    const iconOn = btnMusic.querySelector(".icon-music-on");
    const iconOff = btnMusic.querySelector(".icon-music-off");
    if (iconOn) iconOn.hidden = !on;
    if (iconOff) iconOff.hidden = on;
  }

  function renderBottle(index) {
    const bottle = state.bottles[index];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bottle";
    btn.dataset.index = String(index);
    btn.setAttribute(
      "aria-label",
      bottle.length
        ? `Bottiglia ${index + 1}, ${bottle.length} unità`
        : `Bottiglia ${index + 1}, vuota`
    );
    if (state.selected === index) btn.classList.add("selected");

    const neck = document.createElement("span");
    neck.className = "bottle-neck";
    neck.setAttribute("aria-hidden", "true");
    const glass = document.createElement("span");
    glass.className = "bottle-glass";
    const liquid = document.createElement("span");
    liquid.className = "bottle-liquid";

    bottle.forEach((color, i) => {
      const seg = document.createElement("span");
      seg.className = "segment";
      seg.dataset.color = color;
      if (i === bottle.length - 1) seg.classList.add("top-wave");
      liquid.appendChild(seg);
    });

    glass.appendChild(liquid);
    btn.appendChild(neck);
    btn.appendChild(glass);
    btn.addEventListener("click", () => onBottleTap(index));
    return btn;
  }

  function render() {
    rack.replaceChildren();
    state.bottles.forEach((_, i) => rack.appendChild(renderBottle(i)));
    updateChrome();
  }

  function loadPuzzle(bottles, capacity, meta) {
    state.capacity = capacity;
    state.bottles = cloneBottles(bottles);
    state.startBottles = cloneBottles(bottles);
    state.puzzleMeta = meta || null;
    state.selected = null;
    state.history = [];
    state.busy = false;
    hideOverlays();
    setHint("Tocca una bottiglia, poi dove versare.");
    render();
  }

  function loadArchiveLevel(index) {
    const level = LEVELS[index];
    state.mode = "archive";
    state.levelIndex = index;
    state.run = null;
    loadPuzzle(level.bottles, level.capacity || 4, { name: level.name });
    try {
      localStorage.setItem(STORAGE_MODE, "archive");
    } catch {
      /* ignore */
    }
  }

  function startFloor() {
    const run = state.run;
    const spec = Proc.floorSpec(run.floor, run.totalFloors);
    spec.floorIndex = run.floor;
    // New layout each attempt / death cycle
    const rng = Proc.mulberry32(
      (run.seed ^ (run.floor * 2654435761) ^ (run.deathCycle * 40503)) >>> 0
    );
    state.floorRng = rng;
    const extraEmpty = Rogue.emptyBonus(run);
    // Arm consumable presort before puzzle gen so it can apply
    Rogue.armFloorPresort(run, spec);
    const puzzle = Proc.generatePuzzle(rng, {
      colors: spec.colors,
      empty: Math.max(1, spec.empty + extraEmpty),
      scramble: spec.depth || spec.scramble,
      depth: spec.depth || spec.scramble,
      minOptimal: spec.minOptimal || 0,
      capacity: spec.capacity,
      style: spec.style,
      twist: spec.twist,
      preSorted: Rogue.preSortedBonus(run),
      name: spec.name,
    });

    const estimate = Proc.estimateMinMoves(puzzle.bottles, puzzle.capacity, rng);
    const opt = Math.max(1, estimate.moves);
    const slack = Proc.moveSlack(spec);
    const computed = opt + slack;
    spec.moveLimit = computed;

    Rogue.prepareFloorCharges(run, spec);

    puzzle.isBoss = spec.isBoss;
    puzzle.isFinal = spec.isFinal;
    puzzle.baseUndos = spec.baseUndos;
    puzzle.empty = Math.max(1, spec.empty + extraEmpty);
    puzzle.optimalMoves = estimate.moves;
    puzzle.exactOptimal = estimate.exact;
    puzzle.moveLimit = computed;
    state.mode = "rogue";
    loadPuzzle(puzzle.bottles, puzzle.capacity, puzzle);

    const optLabel = estimate.exact ? `ottimo ${estimate.moves}` : `~${estimate.moves}`;
    let rationNote = "";
    if (run._bossRationJustUsed) {
      rationNote = " · Razione boss consumata (+10)";
    }
    if (spec.isFinal) {
      setHint(
        `Boss · ${run.movesLeft} mosse (${optLabel}+${slack}) · 12 colori.${rationNote}`,
        true
      );
    } else if (spec.isBoss) {
      setHint(
        `Mini-boss · ${run.movesLeft} mosse (${optLabel}+${slack}).${rationNote}`,
        true
      );
    } else {
      setHint(`Piano ${run.floor + 1} · ${run.movesLeft} mosse (${optLabel}+${slack}).`, true);
    }
  }

  function beginRun() {
    state.run = Rogue.createRun(String(Date.now()));
    state.mode = "rogue";
    try {
      localStorage.setItem(STORAGE_MODE, "rogue");
    } catch {
      /* ignore */
    }
    startFloor();
  }

  function showTitle() {
    hideOverlays();
    const best = loadBest();
    if (best) {
      bestRunEl.textContent = best.won
        ? `Record: vittoria · ${best.score} pt`
        : `Record: piano ${best.floors}/${Rogue.TOTAL_FLOORS} · ${best.score} pt`;
    } else {
      bestRunEl.textContent = "Record: ancora nessuna spedizione";
    }
    titleOverlay.hidden = false;
    state.blocked = true;
  }

  function pushHistory() {
    state.history.push(cloneBottles(state.bottles));
  }

  function undo() {
    if (state.busy || !state.history.length) return;
    if (state.mode === "rogue") {
      if (!state.run || state.run.undosLeft <= 0) {
        setHint("Undo esauriti!", true);
        return;
      }
      state.run.undosLeft -= 1;
      // Undo restores the spent move
      state.run.movesLeft = Math.min(state.run.movesMax, state.run.movesLeft + 1);
    }
    state.bottles = state.history.pop();
    state.selected = null;
    setHint("Mossa annullata.", true);
    render();
  }

  function dieFromMoves() {
    if (!state.run) return;
    Rogue.onDeath(state.run);
    hideOverlays();
    setHint(
      `Mosse finite — morte #${state.run.deaths}. Piano 1, inventario tenuto.`,
      true
    );
    startFloor();
  }

  function restartPuzzle() {
    if (state.busy) return;

    if (state.mode === "rogue" && state.run) {
      if (Rogue.trySoftReset(state.run)) {
        state.bottles = cloneBottles(state.startBottles);
        state.history = [];
        state.selected = null;
        state.run.movesLeft = state.run.movesMax;
        state.run.undosLeft = state.run.undosFloorBase;
        setHint("Tappo di scorta consumato — piano rifatto.", true);
        render();
        return;
      }
      Rogue.onDeath(state.run);
      hideOverlays();
      setHint(
        `Morte #${state.run.deaths}. Torna al piano 1 — inventario conservato.`,
        true
      );
      startFloor();
      return;
    }

    loadArchiveLevel(state.levelIndex);
    setHint("Livello ricominciato.", true);
  }

  function useHint() {
    /* Hint removed — difficulty is move-budget based */
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function colorCssVar(color) {
    return (
      getComputedStyle(document.documentElement).getPropertyValue(`--c-${color}`).trim() ||
      color
    );
  }

  function paintBottleLiquid(bottleEl, contents) {
    const liquid = bottleEl.querySelector(".bottle-liquid");
    if (!liquid) return;
    liquid.replaceChildren();
    contents.forEach((color, i) => {
      const seg = document.createElement("span");
      seg.className = "segment";
      seg.dataset.color = color;
      if (i === contents.length - 1) seg.classList.add("top-wave");
      liquid.appendChild(seg);
    });
  }

  async function animatePour(fromIdx, toIdx, amount, color) {
    const fromEl = rack.querySelector(`.bottle[data-index="${fromIdx}"]`);
    const toEl = rack.querySelector(`.bottle[data-index="${toIdx}"]`);
    if (!fromEl || !toEl) return;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const pourRight = toRect.left >= fromRect.left;
    const tiltClass = pourRight ? "tilt-right" : "tilt-left";

    fromEl.classList.remove("selected");
    fromEl.classList.add("pouring-source", tiltClass);
    toEl.classList.add("pouring-target");

    await sleep(240);

    const stream = document.createElement("span");
    stream.className = "stream active";
    stream.style.background = colorCssVar(color);
    const unit =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--unit")) || 36;
    stream.style.setProperty("--stream-h", `${Math.max(52, amount * unit * 0.9)}px`);

    const toMidX = toRect.left + toRect.width / 2;
    const tipX = pourRight ? fromRect.right - 2 : fromRect.left + 2;
    const tipY = fromRect.top + fromRect.height * 0.12;
    const landY = toRect.top + 10;

    stream.style.position = "fixed";
    stream.style.left = `${tipX - 4}px`;
    stream.style.top = `${tipY}px`;
    const dx = toMidX - tipX;
    const angle = Math.atan2(landY - tipY, dx) * (180 / Math.PI) - 90;
    stream.style.transform = `rotate(${angle}deg)`;
    document.body.appendChild(stream);

    await sleep(160);

    const src = state.bottles[fromIdx];
    const dst = state.bottles[toIdx];
    for (let i = 0; i < amount; i++) {
      dst.push(src.pop());
      paintBottleLiquid(fromEl, src);
      paintBottleLiquid(toEl, dst);
      await sleep(90);
    }

    await sleep(100);
    stream.remove();

    fromEl.style.setProperty("--untilt-from", pourRight ? "72deg" : "-72deg");
    fromEl.classList.remove(tiltClass);
    fromEl.classList.add("untilt");
    await sleep(300);
    fromEl.classList.remove("pouring-source", "untilt");
    toEl.classList.remove("pouring-target");
    fromEl.style.removeProperty("--untilt-from");
  }

  async function tryPour(from, to) {
    if (!canPour(from, to, state.capacity)) {
      setHint("Non puoi versare lì.", true);
      state.selected = null;
      render();
      return;
    }

    if (state.mode === "rogue" && state.run && state.run.movesLeft <= 0) {
      if (Rogue.tryLastGasp(state.run)) {
        setHint("Ultimo sussulto consumato: +2 mosse!", true);
        updateChrome();
      } else {
        dieFromMoves();
        return;
      }
    }

    const amount = pourAmount(from, to, state.capacity);
    const color = topColor(state.bottles[from]);
    pushHistory();
    state.busy = true;
    state.selected = null;
    updateChrome();
    setHint("Verso…");

    const reduce =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      const src = state.bottles[from];
      const dst = state.bottles[to];
      for (let i = 0; i < amount; i++) dst.push(src.pop());
    } else {
      await animatePour(from, to, amount, color);
    }

    if (state.mode === "rogue" && state.run) {
      state.run.movesLeft = Math.max(0, state.run.movesLeft - 1);
    }

    state.busy = false;
    render();

    if (isSolved(state.bottles, state.capacity)) {
      onWin();
    } else if (
      state.mode === "rogue" &&
      state.run &&
      state.run.movesLeft <= 0
    ) {
      if (Rogue.tryLastGasp(state.run)) {
        setHint("Ultimo sussulto consumato: +2 mosse!", true);
        updateChrome();
      } else {
        dieFromMoves();
      }
    } else {
      const left =
        state.mode === "rogue" && state.run ? ` · ${state.run.movesLeft} mosse` : "";
      setHint("Tocca una bottiglia, poi dove versare." + left);
    }
  }

  function onWin() {
    rack.querySelectorAll(".bottle").forEach((el, i) => {
      if (state.bottles[i].length) el.classList.add("celebrate");
    });

    if (state.mode === "rogue" && state.run) {
      Rogue.onFloorCleared(
        state.run,
        state.run.movesLeft,
        state.run.movesMax
      );
      const banked = Rogue.bankLeftoverMoves(state.run, state.run.movesLeft);
      const gained = Rogue.floorScore(
        state.run.movesLeft,
        state.run.movesMax,
        state.run.floor
      );
      state.run.score += gained;
      state.run.floorsCleared += 1;
      state.run.bestFloor = Math.max(state.run.bestFloor, state.run.floor + 1);

      winKicker.textContent =
        state.puzzleMeta && state.puzzleMeta.isFinal
          ? "Boss finale"
          : state.puzzleMeta && state.puzzleMeta.isBoss
            ? "Boss sconfitto"
            : "Piano netto";
      winTitle.textContent = "Colori in ordine!";
      winText.textContent = `+${gained} pt · +${banked} gocce (ora ${state.run.wallet}).`;
      btnReplay.hidden = true;
      btnContinue.textContent =
        state.run.floor >= state.run.totalFloors - 1 ? "Vittoria" : "Bottega di Travaso";
      winOverlay.hidden = false;
      updateChrome();
      return;
    }

    saveArchiveProgress(state.levelIndex + 1);
    const level = LEVELS[state.levelIndex];
    const isLast = state.levelIndex >= LEVELS.length - 1;
    winKicker.textContent = "Completato";
    winTitle.textContent = "Colori in ordine!";
    winText.textContent = isLast
      ? `Hai completato tutti i ${LEVELS.length} livelli.`
      : `«${level.name}» risolto.`;
    btnReplay.hidden = false;
    btnContinue.textContent = isLast ? "Dal primo" : "Avanti";
    winOverlay.hidden = false;
    updateChrome();
  }

  function renderVendorShelf() {
    const run = state.run;
    if (!run || !vendorShelf || !Vendor) return;
    const rng = Proc.mulberry32(
      (run.seed ^ ((run.floor + 77) * 2246822519) ^ (run.deathCycle * 17)) >>> 0
    );
    if (vendorQuote) vendorQuote.textContent = Vendor.quote(rng);
    if (vendorWalletAmount) vendorWalletAmount.textContent = String(run.wallet || 0);

    const stock = Vendor.buildStock(run, Rogue, rng, 4);
    vendorShelf.replaceChildren();

    stock.forEach((item) => {
      const kind = item.shopOnly
        ? "buff"
        : item.kind === "relic"
          ? "relic"
          : "item";
      const kindLabel =
        kind === "relic"
          ? "Reliquia"
          : kind === "item"
            ? "Oggetto"
            : "Buff";
      const kindHint =
        kind === "relic"
          ? "resta per tutta la run"
          : kind === "item"
            ? "consumabile · una volta"
            : "solo prossimo piano";

      const card = document.createElement("div");
      card.className =
        "vendor-card kind-" +
        kind +
        " rarity-" +
        item.rarity +
        (item.pinned ? " is-pinned" : "");

      const afford = (run.wallet || 0) >= item.cost;
      const owned =
        !item.shopOnly && !Rogue.canOwnMore(run, item.id) && !item.pinned;

      card.innerHTML =
        `<div class="vendor-card-top">` +
        `<span class="kind-badge kind-${kind}" title="${kindHint}">${kindLabel}</span>` +
        `<span class="relic-rarity">${item.rarity}</span>` +
        `<button type="button" class="pin-btn" aria-label="Fissa merce" data-pin="${item.id}">${
          run.pinnedItem === item.id ? "📌" : "📍"
        }</button>` +
        `</div>` +
        `<strong>${item.name}</strong>` +
        `<span class="relic-desc">${item.desc}</span>` +
        `<span class="kind-hint">${kindHint}</span>` +
        `<div class="vendor-card-buy">` +
        `<span class="vendor-price"><span class="wallet-drop"></span>${item.cost}</span>` +
        `<button type="button" class="btn btn-primary btn-buy" data-buy="${item.id}" ${
          !afford || owned ? "disabled" : ""
        }>${owned ? "Ce l’hai" : afford ? "Compra" : "Troppo cara"}</button>` +
        `</div>`;

      vendorShelf.appendChild(card);
    });

    vendorShelf.querySelectorAll("[data-pin]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        Vendor.togglePin(run, btn.getAttribute("data-pin"));
        renderVendorShelf();
        setHint(
          run.pinnedItem
            ? "Merce fissata: Travaso la riporta la prossima volta."
            : "Fissaggio rimosso.",
          true
        );
      });
    });

    vendorShelf.querySelectorAll("[data-buy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-buy");
        const result = Vendor.buy(run, Rogue, id);
        if (!result.ok) {
          if (vendorQuote) vendorQuote.textContent = result.reason;
          return;
        }
        if (vendorQuote) {
          vendorQuote.textContent = `Affare fatto: ${result.item.name}!`;
        }
        renderVendorShelf();
        updateChrome();
      });
    });
  }

  function openVendor() {
    winOverlay.hidden = true;
    const run = state.run;
    if (!run) return;
    if (run.floor >= run.totalFloors - 1) {
      endRun(true);
      return;
    }
    renderVendorShelf();
    vendorOverlay.hidden = false;
  }

  function leaveVendor() {
    if (!state.run) return;
    vendorOverlay.hidden = true;
    state.run.floor += 1;
    startFloor();
  }

  function endRun(won) {
    const run = state.run;
    if (!run) return;
    run.won = won;
    run.alive = won;
    if (won) {
      Rogue.clearRelics(run);
    }
    saveBest(run);
    hideOverlays();
    runKicker.textContent = won ? "Vittoria" : "Spedizione";
    runTitle.textContent = won ? "Spedizione compiuta!" : "Fine";
    runText.textContent = won
      ? `${run.totalFloors} piani. ${run.score} punti, ${run.deaths} morti — reliquie consumate dal trionfo.`
      : `Miglior piano: ${run.bestFloor}/${run.totalFloors}. Punti: ${run.score}.`;
    runOverlay.hidden = false;
    updateChrome();
  }

  function onBottleTap(index) {
    if (state.busy || anyOverlayOpen()) return;

    if (state.selected === null) {
      if (!state.bottles[index].length) {
        setHint("Scegli una bottiglia con liquido.", true);
        return;
      }
      state.selected = index;
      setHint("Ora tocca dove versare.", true);
      render();
      return;
    }

    if (state.selected === index) {
      state.selected = null;
      setHint("Selezione annullata.");
      render();
      return;
    }

    tryPour(state.selected, index);
  }

  function goLevel(delta) {
    if (state.mode !== "archive" || state.busy) return;
    const next = state.levelIndex + delta;
    if (next < 0 || next >= LEVELS.length) return;
    loadArchiveLevel(next);
  }

  // —— Events ——
  btnUndo.addEventListener("click", undo);
  btnRestart.addEventListener("click", restartPuzzle);
  btnHint.addEventListener("click", useHint);
  btnPrev.addEventListener("click", () => goLevel(-1));
  btnNext.addEventListener("click", () => goLevel(1));

  btnReplay.addEventListener("click", () => {
    winOverlay.hidden = true;
    if (state.mode === "archive") loadArchiveLevel(state.levelIndex);
  });

  btnContinue.addEventListener("click", () => {
    if (state.mode === "rogue") {
      openVendor();
      return;
    }
    winOverlay.hidden = true;
    if (state.levelIndex >= LEVELS.length - 1) loadArchiveLevel(0);
    else loadArchiveLevel(state.levelIndex + 1);
  });

  if (btnVendorLeave) {
    btnVendorLeave.addEventListener("click", leaveVendor);
  }

  btnNewRun.addEventListener("click", () => {
    titleOverlay.hidden = true;
    beginRun();
  });

  btnOpenArchive.addEventListener("click", () => {
    titleOverlay.hidden = true;
    loadArchiveLevel(loadArchiveProgress());
  });

  btnMode.addEventListener("click", () => {
    if (state.busy) return;
    if (state.mode === "rogue") {
      loadArchiveLevel(loadArchiveProgress());
    } else {
      showTitle();
    }
  });

  btnRunAgain.addEventListener("click", () => {
    runOverlay.hidden = true;
    beginRun();
  });

  btnRunTitle.addEventListener("click", () => {
    runOverlay.hidden = true;
    showTitle();
  });

  if (btnMusic && Music) {
    syncMusicButton();
    btnMusic.addEventListener("click", async () => {
      await Music.setEnabled(!Music.isEnabled());
      syncMusicButton();
    });
  }

  const unlockOnce = () => {
    if (Music) Music.unlockAndMaybePlay();
    window.removeEventListener("pointerdown", unlockOnce);
  };
  window.addEventListener("pointerdown", unlockOnce);

  winOverlay.addEventListener("click", (e) => {
    if (e.target === winOverlay && state.mode === "archive") {
      winOverlay.hidden = true;
      updateChrome();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (state.busy) return;
    if (e.key === "z" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      undo();
    } else if (e.key === "Escape") {
      if (!titleOverlay.hidden) return;
      if (!runOverlay.hidden) {
        runOverlay.hidden = true;
        showTitle();
      } else if (vendorOverlay && !vendorOverlay.hidden) {
        /* must leave via button */
      } else if (!winOverlay.hidden && state.mode === "archive") {
        winOverlay.hidden = true;
      } else if (state.selected !== null) {
        state.selected = null;
        setHint("Selezione annullata.");
        render();
      }
    }
  });

  // Boot: title screen for rogue-first experience
  showTitle();
  // Keep a quiet empty rack behind the title
  state.bottles = [];
  render();
  updateChrome();
})();
