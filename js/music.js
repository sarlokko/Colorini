/**
 * Soft looping BGM via Web Audio — no audio files needed.
 * Starts muted until the player taps the music button (or enables it).
 */
window.ColoriniMusic = (function () {
  "use strict";

  const STORAGE_KEY = "colorini-music";
  const TEMPO = 92;
  const BEAT = 60 / TEMPO;

  /** C major pentatonic + warm extensions (Hz) */
  const SCALE = {
    C4: 261.63,
    D4: 293.66,
    E4: 329.63,
    G4: 392.0,
    A4: 440.0,
    C5: 523.25,
    D5: 587.33,
    E5: 659.25,
    G5: 783.99,
  };

  // Melody pattern: note key or null (rest), duration in beats
  const MELODY = [
    ["E4", 1], ["G4", 1], ["A4", 1], ["G4", 1],
    ["E4", 1], ["D4", 1], ["C4", 2],
    ["D4", 1], ["E4", 1], ["G4", 1.5], ["A4", 0.5],
    ["G4", 2], [null, 1],
    ["A4", 1], ["C5", 1], ["D5", 1], ["C5", 1],
    ["A4", 1], ["G4", 1], ["E4", 2],
    ["G4", 1], ["A4", 1], ["E4", 1.5], ["D4", 0.5],
    ["C4", 2], [null, 1],
  ];

  const BASS = [
    ["C4", 2], ["G4", 2], ["A4", 2], ["E4", 2],
    ["C4", 2], ["G4", 2], ["D4", 2], ["C4", 2],
  ];

  let ctx = null;
  let master = null;
  let playing = false;
  let wanted = false;
  let timer = null;
  let step = 0;
  let bassStep = 0;
  let nextNoteTime = 0;

  function loadWanted() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function saveWanted(on) {
    try {
      localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, start, dur, type, gainVal, filterFreq) {
    if (!ctx || !master || !freq) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.value = freq;
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainVal, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function scheduleAhead() {
    if (!ctx || !playing) return;
    const horizon = ctx.currentTime + 0.18;
    while (nextNoteTime < horizon) {
      const [note, beats] = MELODY[step % MELODY.length];
      const dur = beats * BEAT * 0.88;
      if (note) {
        tone(SCALE[note], nextNoteTime, dur, "triangle", 0.22, 2400);
        tone(SCALE[note] * 2, nextNoteTime, dur * 0.7, "sine", 0.07, 3400);
      }
      // soft bass every other melody step alignment via separate counter
      if (step % 2 === 0) {
        const [bNote, bBeats] = BASS[bassStep % BASS.length];
        tone(SCALE[bNote] / 2, nextNoteTime, bBeats * BEAT * 0.9, "sine", 0.16, 700);
        bassStep++;
      }
      nextNoteTime += beats * BEAT;
      step++;
    }
  }

  function tick() {
    scheduleAhead();
    timer = window.setTimeout(tick, 40);
  }

  async function start() {
    const audio = ensureCtx();
    if (!audio) return false;
    if (audio.state === "suspended") {
      try {
        await audio.resume();
      } catch {
        return false;
      }
    }
    if (playing) return true;
    playing = true;
    step = 0;
    bassStep = 0;
    nextNoteTime = audio.currentTime + 0.05;
    tick();
    return true;
  }

  function stop() {
    playing = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  async function setEnabled(on) {
    wanted = on;
    saveWanted(on);
    if (on) return start();
    stop();
    return true;
  }

  function isEnabled() {
    return wanted;
  }

  function isPlaying() {
    return playing;
  }

  // Restore preference but don't autoplay until gesture
  wanted = loadWanted();

  return {
    setEnabled,
    isEnabled,
    isPlaying,
    start,
    stop,
    unlockAndMaybePlay: async function () {
      if (!wanted) return;
      await start();
    },
  };
})();
