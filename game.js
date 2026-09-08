'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - light blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    hsOnLinesCleared(cleared);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    hsOnNoLinesCleared();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = '#22222e';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  hsOnGameOver();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  comboCount = 0;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ==== FEATURE HIGH SCORES START ====

const HS_SCORES_KEY = 'tetris.highscores';
const HS_STATS_KEY = 'tetris.stats';
const HS_MAX_ENTRIES = 5;

const hsListEl = document.getElementById('hs-list');
const hsBestComboEl = document.getElementById('hs-best-combo');
const hsMaxLinesEl = document.getElementById('hs-max-lines');
const hsResetBtnEl = document.getElementById('hs-reset-btn');
const hsGameoverEl = document.getElementById('hs-gameover');
const hsGameoverListEl = document.getElementById('hs-gameover-list');
const hsNameInputEl = document.getElementById('hs-name-input');
const hsSaveBtnEl = document.getElementById('hs-save-btn');

let comboCount = 0;
let bestCombo = 0;

function hsLoadScores() {
  try {
    const raw = localStorage.getItem(HS_SCORES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function hsLoadStats() {
  try {
    const raw = localStorage.getItem(HS_STATS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { bestCombo: parsed.bestCombo || 0, maxLines: parsed.maxLines || 0 };
  } catch (e) {
    return { bestCombo: 0, maxLines: 0 };
  }
}

function hsSaveScore(name, scoreValue) {
  const scores = hsLoadScores();
  const cleanName = (name || '').trim().toUpperCase().slice(0, 10) || 'AAA';
  const entry = { name: cleanName, score: scoreValue, date: new Date().toISOString() };
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  scores.length = Math.min(scores.length, HS_MAX_ENTRIES);
  try {
    localStorage.setItem(HS_SCORES_KEY, JSON.stringify(scores));
  } catch (e) {
    // storage unavailable/full: keep going, just don't persist
  }
  return scores.includes(entry);
}

function hsRenderList(targetEl, scores, highlightEntry) {
  targetEl.innerHTML = '';
  if (!scores.length) {
    const li = document.createElement('li');
    li.className = 'hs-empty';
    li.textContent = 'Sin récords todavía';
    targetEl.appendChild(li);
    return;
  }
  scores.forEach(entry => {
    const li = document.createElement('li');
    if (highlightEntry && entry.name === highlightEntry.name && entry.score === highlightEntry.score) {
      li.classList.add('hs-highlight');
    }
    const nameSpan = document.createElement('span');
    nameSpan.textContent = entry.name;
    const scoreSpan = document.createElement('span');
    scoreSpan.textContent = entry.score.toLocaleString();
    li.appendChild(nameSpan);
    li.appendChild(scoreSpan);
    targetEl.appendChild(li);
  });
}

function hsRenderPanel() {
  hsRenderList(hsListEl, hsLoadScores(), null);
  const stats = hsLoadStats();
  hsBestComboEl.textContent = stats.bestCombo;
  hsMaxLinesEl.textContent = stats.maxLines;
}

function hsResetScores() {
  localStorage.removeItem(HS_SCORES_KEY);
  hsRenderPanel();
}

function hsOnLinesCleared(cleared) {
  comboCount++;
  if (comboCount > bestCombo) bestCombo = comboCount;
}

function hsOnNoLinesCleared() {
  comboCount = 0;
}

function hsOnGameOver() {
  overlay.dataset.mode = 'gameover';
  const scores = hsLoadScores();
  hsRenderList(hsGameoverListEl, scores, null);
  const qualifies = scores.length < HS_MAX_ENTRIES || score > scores[scores.length - 1].score;
  hsGameoverEl.hidden = !qualifies;
  hsNameInputEl.hidden = false;
  hsSaveBtnEl.hidden = false;
  hsNameInputEl.value = '';
}

hsSaveBtnEl.addEventListener('click', () => {
  const nameValue = hsNameInputEl.value;
  const saved = hsSaveScore(nameValue, score);
  if (saved) {
    const stats = hsLoadStats();
    let statsChanged = false;
    if (bestCombo > stats.bestCombo) { stats.bestCombo = bestCombo; statsChanged = true; }
    if (lines > stats.maxLines) { stats.maxLines = lines; statsChanged = true; }
    if (statsChanged) {
      try {
        localStorage.setItem(HS_STATS_KEY, JSON.stringify(stats));
      } catch (e) {
        // storage unavailable/full: keep going, just don't persist
      }
    }
    const cleanName = (nameValue || '').trim().toUpperCase().slice(0, 10) || 'AAA';
    hsRenderList(hsGameoverListEl, hsLoadScores(), { name: cleanName, score });
    hsRenderPanel();
    hsNameInputEl.hidden = true;
    hsSaveBtnEl.hidden = true;
  }
});

hsResetBtnEl.addEventListener('click', hsResetScores);

hsRenderPanel();

// ==== FEATURE HIGH SCORES END ====

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

init();
