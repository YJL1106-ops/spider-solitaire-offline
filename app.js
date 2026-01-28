/* Spider Solitaire - pure front-end
   Features: 1/2/4 suit, drag stack moves (same-suit descending), deal from stock, auto-flip, auto-complete K..A, undo.
*/

const SUITS = [
  { id: 'spades', symbol: '♠', color: 'black' },
  { id: 'hearts', symbol: '♥', color: 'red' },
  { id: 'clubs', symbol: '♣', color: 'black' },
  { id: 'diamonds', symbol: '♦', color: 'red' },
];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

const elTableau = document.getElementById('tableau');
const elFoundation = document.getElementById('foundation');
const elStockPile = document.getElementById('stockPile');
const elMoves = document.getElementById('moves');
const elTime = document.getElementById('time');
const elCompleted = document.getElementById('completed');
const elStock = document.getElementById('stock');
const elUndo = document.getElementById('undo');
const elNewGame = document.getElementById('newGame');
const elDeal = document.getElementById('deal');
const elDifficulty = document.getElementById('difficulty');
const elDragLayer = document.getElementById('dragLayer');

const rulesDialog = document.getElementById('rulesDialog');
const winDialog = document.getElementById('winDialog');

const closeRules = document.getElementById('closeRules');
const helpBtn = document.getElementById('help');
const playAgainBtn = document.getElementById('playAgain');
const closeWinBtn = document.getElementById('closeWin');
const winTime = document.getElementById('winTime');
const winMoves = document.getElementById('winMoves');

/** @typedef {{suit:string, rank:number, faceUp:boolean, id:string}} Card */

const state = {
  difficulty: 1,
  tableau: /** @type {Card[][]} */ (Array.from({length:10}, () => [])),
  stock: /** @type {Card[]} */ ([]),
  completed: 0,
  moves: 0,
  startTs: 0,
  timer: /** @type {number|null} */ (null),
  undoStack: /** @type {any[]} */ ([]),
  dragging: null,
};

function uid(){
  return Math.random().toString(16).slice(2) + '-' + Date.now().toString(16);
}

function makeDeck(difficulty){
  const suits = difficulty === 1
    ? [SUITS[0], SUITS[0], SUITS[0], SUITS[0], SUITS[0], SUITS[0], SUITS[0], SUITS[0]]
    : difficulty === 2
      ? [SUITS[0], SUITS[0], SUITS[0], SUITS[0], SUITS[1], SUITS[1], SUITS[1], SUITS[1]]
      : [SUITS[0], SUITS[0], SUITS[1], SUITS[1], SUITS[2], SUITS[2], SUITS[3], SUITS[3]];

  /** @type {Card[]} */
  const deck = [];
  for (const s of suits){
    for (let r=1; r<=13; r++){
      deck.push({ suit: s.id, rank: r, faceUp: false, id: uid() });
    }
  }
  // shuffle
  for (let i=deck.length-1; i>0; i--){
    const j = Math.floor(Math.random() * (i+1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function rankLabel(rank){
  return RANKS[rank-1];
}

function suitMeta(suitId){
  return SUITS.find(s=>s.id===suitId) || SUITS[0];
}

function deepCloneGame(){
  // fast enough for this scale
  return {
    difficulty: state.difficulty,
    tableau: state.tableau.map(p => p.map(c => ({...c}))),
    stock: state.stock.map(c => ({...c})),
    completed: state.completed,
    moves: state.moves,
    startTs: state.startTs,
  };
}

function restoreGame(snapshot){
  state.difficulty = snapshot.difficulty;
  state.tableau = snapshot.tableau.map(p => p.map(c => ({...c})));
  state.stock = snapshot.stock.map(c => ({...c}))
  state.completed = snapshot.completed;
  state.moves = snapshot.moves;
  state.startTs = snapshot.startTs;
  elDifficulty.value = String(state.difficulty);
  render();
  updateHud();
}

function pushUndo(){
  state.undoStack.push(deepCloneGame());
  elUndo.disabled = state.undoStack.length === 0;
}

function incMove(){
  state.moves++;
  elMoves.textContent = String(state.moves);
}

function startTimer(){
  if (state.timer) window.clearInterval(state.timer);
  state.startTs = Date.now();
  state.timer = window.setInterval(updateTime, 250);
  updateTime();
}

function stopTimer(){
  if (state.timer){ window.clearInterval(state.timer); state.timer = null; }
}

function updateTime(){
  const ms = Math.max(0, Date.now() - state.startTs);
  const s = Math.floor(ms/1000);
  const mm = String(Math.floor(s/60)).padStart(2,'0');
  const ss = String(s%60).padStart(2,'0');
  elTime.textContent = `${mm}:${ss}`;
}

function updateHud(){
  elMoves.textContent = String(state.moves);
  elCompleted.textContent = String(state.completed);
  elStock.textContent = String(Math.floor(state.stock.length / 10));
  elUndo.disabled = state.undoStack.length === 0;

  // stock pile visual
  elStockPile.innerHTML = '';
  const layers = Math.min(4, Math.floor(state.stock.length/10));
  for (let i=0; i<layers; i++){
    const d = document.createElement('div');
    d.className = 'card face-down';
    d.style.top = `${i*2}px`;
    d.style.left = `${i*2}px`;
    elStockPile.appendChild(d);
  }
}

function newGame(){
  state.difficulty = Number(elDifficulty.value) || 1;
  state.tableau = Array.from({length:10}, () => []);
  state.stock = [];
  state.completed = 0;
  state.moves = 0;
  state.undoStack = [];

  const deck = makeDeck(state.difficulty);

  // deal tableau: first 4 columns get 6 cards, remaining 6 get 5 cards
  for (let col=0; col<10; col++){
    const count = col < 4 ? 6 : 5;
    for (let i=0; i<count; i++){
      const card = deck.pop();
      state.tableau[col].push(card);
    }
    // flip top card
    const top = state.tableau[col][state.tableau[col].length-1];
    top.faceUp = true;
  }

  // remaining = 50 cards => stock (5 deals)
  state.stock = deck;

  render();
  updateHud();
  startTimer();
}

function render(){
  elTableau.innerHTML = '';
  elFoundation.innerHTML = '';

  // foundation slots
  for (let i=0; i<8; i++){
    const slot = document.createElement('div');
    slot.className = 'foundation-slot';
    if (i < state.completed){
      const stamp = document.createElement('div');
      stamp.style.position = 'absolute';
      stamp.style.inset = '0';
      stamp.style.display = 'flex';
      stamp.style.alignItems = 'center';
      stamp.style.justifyContent = 'center';
      stamp.style.fontWeight = '800';
      stamp.style.color = 'rgba(255,255,255,.85)';
      stamp.style.letterSpacing = '2px';
      stamp.style.fontSize = '22px';
      stamp.textContent = '完成';
      slot.appendChild(stamp);
    }
    elFoundation.appendChild(slot);
  }

  // tableau piles
  for (let col=0; col<10; col++){
    const pileEl = document.createElement('div');
    pileEl.className = 'pile tableau-pile';
    pileEl.dataset.col = String(col);
    pileEl.addEventListener('pointerdown', onPilePointerDown);
    pileEl.addEventListener('pointerenter', onPileEnter);
    pileEl.addEventListener('pointerleave', onPileLeave);

    const pile = state.tableau[col];
    for (let i=0; i<pile.length; i++){
      const card = pile[i];
      const cEl = cardElement(card);
      const gapBase = cssVar('--stackGapDyn') || cssVar('--stackGap');
      const gapTight = cssVar('--stackGapTight');
      const gap = (pile.length > 16) ? gapTight : gapBase;
      cEl.style.top = `${i * gap}px`;
      cEl.dataset.index = String(i);
      cEl.dataset.col = String(col);
      pileEl.appendChild(cEl);
    }

    // auto height for long piles (ensure cards are not clipped when stacks get tall)
    // pile height is constrained to the available tableau area (no scrolling)
    const h = cssVar('--h');
    const height = h + 14; // base; actual card positions use dynamic gaps
    pileEl.style.height = `${Math.max(h, height)}px`;
    elTableau.appendChild(pileEl);
  }

  updateHud();
  // after DOM updates, compute a stack gap that fits the tallest pile into the visible area
  requestAnimationFrame(fitLayoutNoScroll);
}

function fitLayoutNoScroll(){
  const tableauEl = document.getElementById('tableau');
  if (!tableauEl) return;

  // compute how much vertical space the stacks can use (from tableau top to viewport bottom)
  const rect = tableauEl.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const available = Math.max(160, Math.floor(viewportH - rect.top - 18));

  const baseW = cssVar('--w') || 80;
  const baseGap = cssVar('--stackGap') || 20;
  const minGap = 10;

  const maxLen = Math.max(1, ...state.tableau.map(p => p.length));

  // First choose a gap that would fit with the current card height.
  let wDyn = baseW;
  let hDyn = Math.floor(wDyn * 1.38);
  let gap = (maxLen <= 1) ? baseGap : Math.floor((available - hDyn) / (maxLen - 1));

  // If gap would be too small, keep a minimum gap and instead shrink the cards.
  if (gap < minGap){
    gap = minGap;
    const hMax = Math.max(72, available - (maxLen - 1) * gap);
    wDyn = Math.max(46, Math.floor(hMax / 1.38));
    hDyn = Math.floor(wDyn * 1.38);
  }

  gap = Math.max(minGap, Math.min(baseGap, gap));

  document.documentElement.style.setProperty('--wDyn', `${wDyn}px`);
  document.documentElement.style.setProperty('--stackGapDyn', `${gap}px`);

  // reserve fixed height for each pile within the available tableau area
  document.querySelectorAll('.tableau-pile').forEach(el => {
    el.style.height = `${available}px`;
  });
}

function cssVar(name){
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!v) return 0;
  return Number(v.replace('px','')) || 0;
}

function cardElement(card){
  const meta = suitMeta(card.suit);
  const el = document.createElement('div');
  el.className = `card ${meta.color}`;
  el.dataset.id = card.id;
  if (!card.faceUp) el.classList.add('face-down');

  const corner = document.createElement('div');
  corner.className = 'corner';
  const rank = document.createElement('div');
  rank.className = 'rank';
  rank.textContent = rankLabel(card.rank);
  const suit = document.createElement('div');
  suit.className = 'suit';
  suit.textContent = meta.symbol;
  corner.appendChild(rank);
  corner.appendChild(suit);

  const center = document.createElement('div');
  center.className = 'center';
  center.textContent = meta.symbol;

  const corner2 = corner.cloneNode(true);
  corner2.style.transform = 'rotate(180deg)';

  el.appendChild(corner);
  el.appendChild(center);
  el.appendChild(corner2);

  return el;
}

function topCard(col){
  const pile = state.tableau[col];
  return pile[pile.length-1] || null;
}

function canStackOn(movingCard, targetTop){
  if (!targetTop) return true; // empty pile
  return targetTop.faceUp && targetTop.rank === movingCard.rank + 1;
}

function movableRun(col, startIndex){
  const pile = state.tableau[col];
  if (startIndex < 0 || startIndex >= pile.length) return null;
  if (!pile[startIndex].faceUp) return null;

  // from startIndex to end must be same suit and descending by 1
  for (let i=startIndex; i<pile.length-1; i++){
    const a = pile[i];
    const b = pile[i+1];
    if (!b.faceUp) return null;
    if (a.suit !== b.suit) return null;
    if (a.rank !== b.rank + 1) return null;
  }
  return pile.slice(startIndex);
}

function maybeFlip(col){
  const pile = state.tableau[col];
  const top = pile[pile.length-1];
  if (top && !top.faceUp){
    top.faceUp = true;
    return true;
  }
  return false;
}

function checkComplete(col){
  // if top 13 cards are same suit and K..A descending, remove them
  const pile = state.tableau[col];
  if (pile.length < 13) return false;
  const seq = pile.slice(pile.length-13);
  if (!seq.every(c=>c.faceUp)) return false;
  const suit = seq[0].suit;
  for (let i=0; i<13; i++){
    const c = seq[i];
    if (c.suit !== suit) return false;
    // should be K(13) down to A(1)
    if (c.rank !== 13 - i) return false;
  }
  // remove
  pile.splice(pile.length-13, 13);
  state.completed += 1;
  maybeFlip(col);
  return true;
}

function isDealAllowed(){
  if (state.stock.length < 10) return false;
  // classic: all tableau piles must be non-empty
  for (let col=0; col<10; col++){
    if (state.tableau[col].length === 0) return false;
  }
  return true;
}

function dealFromStock(){
  if (!isDealAllowed()) return;
  pushUndo();
  for (let col=0; col<10; col++){
    const card = state.stock.pop();
    card.faceUp = true;
    state.tableau[col].push(card);
  }
  incMove();
  // after deal, check completes
  for (let col=0; col<10; col++) checkComplete(col);
  render();
  updateHud();
  checkWin();
}

function checkWin(){
  if (state.completed >= 8){
    stopTimer();
    winTime.textContent = elTime.textContent;
    winMoves.textContent = String(state.moves);
    winDialog.showModal();
  }
}

// Drag logic
function onPilePointerDown(e){
  /** @type {HTMLElement} */
  const target = e.target;
  const cardEl = target.closest('.card');
  const pileEl = target.closest('.pile');
  if (!pileEl) return;
  const col = Number(pileEl.dataset.col);

  if (!cardEl){
    // click empty area => no-op
    return;
  }

  const index = Number(cardEl.dataset.index);
  const pile = state.tableau[col];
  const card = pile[index];
  if (!card || !card.faceUp) return;

  const run = movableRun(col, index);
  if (!run) return;

  // start dragging
  e.preventDefault();
  const rect = cardEl.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;

  state.dragging = {
    fromCol: col,
    fromIndex: index,
    runIds: run.map(c=>c.id),
    offsetX,
    offsetY,
    startX: e.clientX,
    startY: e.clientY,
    overCol: null,
    dragEl: null,
  };

  // create drag stack element
  const stack = document.createElement('div');
  stack.className = 'drag-stack';
  for (let i=0; i<run.length; i++){
    const cEl = cardElement(run[i]);
    cEl.style.position = 'absolute';
    const gap = cssVar('--stackGap');
    cEl.style.top = `${i * gap}px`;
    cEl.style.left = '0px';
    cEl.classList.add('grabbing');
    stack.appendChild(cEl);
  }
  elDragLayer.appendChild(stack);
  state.dragging.dragEl = stack;
  positionDrag(e.clientX, e.clientY);

  // capture pointer
  pileEl.setPointerCapture(e.pointerId);
  pileEl.addEventListener('pointermove', onPointerMove);
  pileEl.addEventListener('pointerup', onPointerUp);
  pileEl.addEventListener('pointercancel', onPointerUp);
}

function positionDrag(x,y){
  const d = state.dragging;
  if (!d || !d.dragEl) return;
  d.dragEl.style.left = `${x - d.offsetX}px`;
  d.dragEl.style.top = `${y - d.offsetY}px`;
}

function onPointerMove(e){
  positionDrag(e.clientX, e.clientY);

  const over = document.elementFromPoint(e.clientX, e.clientY);
  const pileEl = over?.closest?.('.pile');
  clearPileHighlights();
  if (pileEl && pileEl.classList.contains('tableau-pile')){
    const col = Number(pileEl.dataset.col);
    state.dragging.overCol = col;

    const movingCard = state.tableau[state.dragging.fromCol][state.dragging.fromIndex];
    const targetTop = topCard(col);
    const ok = canStackOn(movingCard, targetTop);
    pileEl.classList.add(ok ? 'drop-ok' : 'drop-bad');
  } else {
    state.dragging.overCol = null;
  }
}

function clearPileHighlights(){
  document.querySelectorAll('.pile.drop-ok,.pile.drop-bad').forEach(el=>{
    el.classList.remove('drop-ok','drop-bad');
  });
}

function onPointerUp(e){
  /** @type {HTMLElement} */
  const pileEl = e.currentTarget;
  pileEl.releasePointerCapture(e.pointerId);
  pileEl.removeEventListener('pointermove', onPointerMove);
  pileEl.removeEventListener('pointerup', onPointerUp);
  pileEl.removeEventListener('pointercancel', onPointerUp);

  const d = state.dragging;
  if (!d) return;

  clearPileHighlights();

  const toCol = d.overCol;
  const fromCol = d.fromCol;
  const fromIndex = d.fromIndex;

  // cleanup drag element
  if (d.dragEl){
    d.dragEl.remove();
  }

  state.dragging = null;

  if (toCol == null) {
    render();
    return;
  }

  if (toCol === fromCol) {
    render();
    return;
  }

  const run = movableRun(fromCol, fromIndex);
  if (!run){
    render();
    return;
  }

  const movingCard = run[0];
  const targetTop = topCard(toCol);
  if (!canStackOn(movingCard, targetTop)){
    render();
    return;
  }

  pushUndo();

  // move cards
  state.tableau[fromCol].splice(fromIndex, run.length);
  state.tableau[toCol].push(...run);

  let flipped = maybeFlip(fromCol);
  const completed1 = checkComplete(toCol);

  incMove();

  render();
  updateHud();

  // if flip or complete happened, keep
  if (flipped || completed1){
    // already in state
  }

  checkWin();
}

function onPileEnter(){/* handled by elementFromPoint */}
function onPileLeave(){/* handled by elementFromPoint */}

// Undo
function undo(){
  const snap = state.undoStack.pop();
  if (!snap) return;
  restoreGame(snap);
  elUndo.disabled = state.undoStack.length === 0;
}

// Dialogs
helpBtn.addEventListener('click', ()=> rulesDialog.showModal());
closeRules.addEventListener('click', ()=> rulesDialog.close());
playAgainBtn.addEventListener('click', ()=>{ winDialog.close(); newGame(); });
closeWinBtn.addEventListener('click', ()=> winDialog.close());

// Controls
elNewGame.addEventListener('click', ()=> newGame());
elDeal.addEventListener('click', ()=> dealFromStock());
elStockPile.addEventListener('click', ()=> dealFromStock());
elUndo.addEventListener('click', ()=> undo());
elDifficulty.addEventListener('change', ()=> newGame());

// Keyboard shortcuts
window.addEventListener('resize', ()=>{
  // keep everything visible without scroll when the window size changes
  fitLayoutNoScroll();
});

window.addEventListener('keydown', (e)=>{
  if (e.key === 'Escape'){
    if (rulesDialog.open) rulesDialog.close();
    if (winDialog.open) winDialog.close();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){
    e.preventDefault();
    undo();
  }
});

// Init
newGame();

// Deal button enablement + hint
function updateDealButton(){
  const allowed = isDealAllowed();
  elDeal.disabled = !allowed;
  elStockPile.style.opacity = allowed ? '1' : '.5';
  elStockPile.title = allowed ? '点击发牌' : '每列至少要有 1 张牌才可发牌';
}
setInterval(updateDealButton, 400);
