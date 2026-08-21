# Colorini

Puzzle **water sort** con modalità **rogue-like**, in puro HTML/CSS/JS.

## Gioca

Apri `index.html` oppure GitHub Pages.

## Modalità

### Spedizione (rogue)
- 8 piani procedurali che scalano di difficoltà
- Vite: ricominciare un piano costa ♥ (game over a 0)
- Undo limitati per piano
- Dopo ogni piano scegli una **reliquia**
- Mini-boss a metà run, boss finale all’ultimo piano

### Archivio
I livelli classici fissi, con undo illimitati e navigazione libera.

## Controlli

Undo, Restart, Hint (se hai la reliquia), musica, switch modalità.

La colonna sonora è generata in browser (Web Audio).

## GitHub Pages

In *Settings → Pages* scegli branch `main` e cartella `/ (root)`.

## Struttura

```
index.html
css/styles.css
js/levels.js
js/procgen.js
js/rogue.js
js/music.js
js/game.js
```
