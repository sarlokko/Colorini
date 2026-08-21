(function () {
  "use strict";

  const LEVELS = window.COLORINI_LEVELS;
  const STORAGE_KEY = "colorini-progress";

  const rack = document.getElementById("rack");
  const hint = document.getElementById("hint");
  const levelLabel = document.getElementById("levelLabel");
  const btnUndo = document.getElementById("btnUndo");
  const btnRestart = document.getElementById("btnRestart");
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const winOverlay = document.getElementById("winOverlay");
  const winText = document.getElementById("winText");
  const btnReplay = document.getElementById("btnReplay");
  const btnContinue = document.getElementById("btnContinue");
  const levelName = document.getElementById("levelName");
  const btnMusic = document.getElementById("btnMusic");
  const Music = window.ColoriniMusic;

  /** @type {{ capacity: number, bottles: string[][], selected: number|null, history: string[][][], busy: boolean, levelIndex: number }} */
  const state = {
    capacity: 4,
    bottles: [],
    selected: null,
    history: [],
    busy: false,
    levelIndex: 0,
  };

  function cloneBottles(bottles) {
    return bottles.map((b) => b.slice());
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return 0;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return 0;
      return Math.min(Math.floor(n), LEVELS.length - 1);
    } catch {
      return 0;
    }
  }

  function saveProgress(index) {
    try {
      const prev = loadProgress();
      if (index > prev) localStorage.setItem(STORAGE_KEY, String(index));
    } catch {
      /* ignore */
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
    const free = spaceLeft(dst, capacity);
    const run = topRunLength(src);
    return Math.min(free, run);
  }

  function isSolved(bottles, capacity) {
    return bottles.every((b) => {
      if (!b.length) return true;
      if (b.length !== capacity) return false;
      const c = b[0];
      return b.every((x) => x === c);
    });
  }

  function setHint(text, pulse) {
    hint.textContent = text;
    if (pulse) {
      hint.classList.remove("pulse");
      void hint.offsetWidth;
      hint.classList.add("pulse");
    }
  }

  function updateChrome() {
    const level = LEVELS[state.levelIndex];
    levelLabel.textContent = `Livello ${state.levelIndex + 1}`;
    if (levelName) levelName.textContent = level.name;
    btnUndo.disabled = state.busy || state.history.length === 0;
    btnRestart.disabled = state.busy;
    btnPrev.disabled = state.busy || state.levelIndex === 0;
    btnNext.disabled = state.busy || state.levelIndex >= LEVELS.length - 1;
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

  function loadLevel(index, { keepHistory } = {}) {
    const level = LEVELS[index];
    state.levelIndex = index;
    state.capacity = level.capacity || 4;
    state.bottles = cloneBottles(level.bottles);
    state.selected = null;
    if (!keepHistory) state.history = [];
    state.busy = false;
    winOverlay.hidden = true;
    setHint("Tocca una bottiglia, poi dove versare.");
    render();
  }

  function pushHistory() {
    state.history.push(cloneBottles(state.bottles));
  }

  function undo() {
    if (state.busy || !state.history.length) return;
    state.bottles = state.history.pop();
    state.selected = null;
    setHint("Mossa annullata.", true);
    render();
  }

  function restart() {
    if (state.busy) return;
    loadLevel(state.levelIndex);
    setHint("Livello ricominciato.", true);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function colorCssVar(color) {
    return getComputedStyle(document.documentElement).getPropertyValue(`--c-${color}`).trim() || color;
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

    // Transfer one unit at a time for a cascading pour feel
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

    const amount = pourAmount(from, to, state.capacity);
    const color = topColor(state.bottles[from]);
    pushHistory();
    state.busy = true;
    state.selected = null;
    updateChrome();
    setHint("Verso…");

    // Prefers-reduced-motion: skip animation
    const reduce =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      const src = state.bottles[from];
      const dst = state.bottles[to];
      for (let i = 0; i < amount; i++) dst.push(src.pop());
    } else {
      await animatePour(from, to, amount, color);
    }

    state.busy = false;
    render();

    if (isSolved(state.bottles, state.capacity)) {
      onWin();
    } else {
      setHint("Tocca una bottiglia, poi dove versare.");
    }
  }

  function onWin() {
    saveProgress(state.levelIndex + 1);
    const level = LEVELS[state.levelIndex];
    const isLast = state.levelIndex >= LEVELS.length - 1;
    winText.textContent = isLast
      ? `Hai completato tutti i ${LEVELS.length} livelli. Bravo!`
      : `«${level.name}» risolto. Continua con il successivo.`;
    btnContinue.textContent = isLast ? "Dal primo" : "Avanti";
    winOverlay.hidden = false;

    rack.querySelectorAll(".bottle").forEach((el, i) => {
      if (state.bottles[i].length) {
        el.classList.add("celebrate");
      }
    });
    updateChrome();
  }

  function onBottleTap(index) {
    if (state.busy || !winOverlay.hidden) return;

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
    if (state.busy) return;
    const next = state.levelIndex + delta;
    if (next < 0 || next >= LEVELS.length) return;
    loadLevel(next);
  }

  btnUndo.addEventListener("click", undo);
  btnRestart.addEventListener("click", restart);
  btnPrev.addEventListener("click", () => goLevel(-1));
  btnNext.addEventListener("click", () => goLevel(1));
  btnReplay.addEventListener("click", () => {
    winOverlay.hidden = true;
    loadLevel(state.levelIndex);
  });
  btnContinue.addEventListener("click", () => {
    winOverlay.hidden = true;
    if (state.levelIndex >= LEVELS.length - 1) {
      loadLevel(0);
    } else {
      loadLevel(state.levelIndex + 1);
    }
  });

  if (btnMusic && Music) {
    syncMusicButton();
    btnMusic.addEventListener("click", async () => {
      const next = !Music.isEnabled();
      await Music.setEnabled(next);
      syncMusicButton();
    });
  }

  // Unlock audio context on first interaction if music was previously enabled
  const unlockOnce = () => {
    if (Music) Music.unlockAndMaybePlay();
    window.removeEventListener("pointerdown", unlockOnce);
  };
  window.addEventListener("pointerdown", unlockOnce);

  winOverlay.addEventListener("click", (e) => {
    if (e.target === winOverlay) {
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
      if (!winOverlay.hidden) {
        winOverlay.hidden = true;
      } else if (state.selected !== null) {
        state.selected = null;
        setHint("Selezione annullata.");
        render();
      }
    }
  });

  // Start at saved progress or level 0
  const start = loadProgress();
  loadLevel(start);
})();
