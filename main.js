/* OtterCare - enhanced with emotion system */
const STATE_KEY = 'otter_state_v1';

const DEFAULT = {
  hunger: 60,
  happy: 70,
  clean: 80,
  energy: 80,
  coins: 0,
  hat: false,
  lastTick: Date.now(),
  stats: {
    gamesPlayed: 0,
    fishCaught: 0,
    itemsBought: 0
  }
};

let state = {...DEFAULT};
let currentMood = 'neutral'; // neutral, happy, sad, sleepy

function $(id){return document.getElementById(id)}

// Emotion expressions (SVG path morphing)
const EXPRESSIONS = {
  neutral: {
    mouth: 'M 54 70 Q 60 73 66 70',
    leftBrow: 'M 45 45 Q 50 43 55 45',
    rightBrow: 'M 65 45 Q 70 43 75 45'
  },
  happy: {
    mouth: 'M 54 70 Q 60 76 66 70',
    leftBrow: 'M 45 47 Q 50 45 55 47',
    rightBrow: 'M 65 47 Q 70 45 75 47'
  },
  sad: {
    mouth: 'M 54 73 Q 60 70 66 73',
    leftBrow: 'M 45 43 Q 50 40 55 43',
    rightBrow: 'M 65 43 Q 70 40 75 43'
  },
  sleepy: {
    mouth: 'M 54 71 Q 60 72 66 71',
    leftBrow: 'M 45 46 Q 50 44 55 46',
    rightBrow: 'M 65 46 Q 70 44 75 46'
  }
};

function setExpression(mood){
  const exp = EXPRESSIONS[mood] || EXPRESSIONS.neutral;
  $('mouth').setAttribute('d', exp.mouth);
  $('leftBrow').setAttribute('d', exp.leftBrow);
  $('rightBrow').setAttribute('d', exp.rightBrow);
  
  const svg = $('otterSvg');
  // Remove all mood classes
  svg.classList.remove('happy', 'sad', 'sleepy');
  if(mood !== 'neutral') svg.classList.add(mood);
  currentMood = mood;
}

function updateMood(){
  // Determine mood based on stats
  const avg = (state.hunger + state.happy + state.clean + state.energy) / 4;
  
  if(state.energy < 30){
    setExpression('sleepy');
  } else if(state.happy > 75 && state.hunger > 50){
    setExpression('happy');
  } else if(state.happy < 30 || state.hunger < 20){
    setExpression('sad');
  } else {
    setExpression('neutral');
  }
}

function loadState(){
  try{
    let s = localStorage.getItem(STATE_KEY);
    if(s){
      let parsed = JSON.parse(s);
      state = {...DEFAULT, ...parsed};
    }
  }catch(e){console.error('load error', e)}
}

function saveState(){
  state.lastTick = Date.now();
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function setBar(el, value){
  value = Math.max(0, Math.min(100, value));
  el.style.width = value + '%';
  
  // Color coding based on value
  el.classList.remove('low', 'critical');
  if(value < 30) el.classList.add('low');
  if(value < 15) el.classList.add('critical');
}

function updateUI(){
  setBar($('hungerBar'), state.hunger);
  setBar($('happyBar'), state.happy);
  setBar($('cleanBar'), state.clean);
  setBar($('energyBar'), state.energy);
  $('coins').textContent = state.coins;

  // Update mood based on stats
  updateMood();
  
  // Update stats page
  updateStats();

  // equipment
  const otterSvg = $('otterSvg');
  if(state.hat){
    if(!document.querySelector('.hat')){
      const hat = document.createElement('div');
      hat.classList.add('hat');
      hat.textContent = '🎩';
      document.querySelector('.otter-wrapper').appendChild(hat);
    }
  }else{
    const existing = document.querySelector('.hat');
    if(existing) existing.remove();
  }
}

function updateStats(){
  if(!state.stats) state.stats = {gamesPlayed:0, fishCaught:0, itemsBought:0};
  if($('statCoins')) $('statCoins').textContent = state.coins;
  if($('statGames')) $('statGames').textContent = state.stats.gamesPlayed;
  if($('statFish')) $('statFish').textContent = state.stats.fishCaught;
  if($('statItems')) $('statItems').textContent = state.stats.itemsBought;
}

// slow decay over time
function tick(){
  // decrease hunger/happy/clean slowly
  state.hunger = Math.max(0, state.hunger - 0.5);
  state.happy = Math.max(0, state.happy - 0.25);
  state.clean = Math.max(0, state.clean - 0.15);
  state.energy = Math.max(0, state.energy - 0.4);

  // consequences
  if(state.hunger < 20) state.happy = Math.max(0, state.happy - 0.5);
  if(state.clean < 20) state.happy = Math.max(0, state.happy - 0.3);

  updateUI();
  saveState();
}

// actions
function feed(){
  state.hunger = Math.min(100, state.hunger + 20);
  state.happy = Math.min(100, state.happy + 6);
  state.coins = Math.max(0, state.coins - 5);
  doOtterAction('feed');
  playSound('feed');
  updateUI(); saveState();
}

function bathe(){
  state.clean = Math.min(100, state.clean + 25);
  state.happy = Math.min(100, state.happy + 4);
  doOtterAction('bathe');
  playSound('splash');
  updateUI(); saveState();
}

function sleep(){
  const svg = $('otterSvg');
  svg.classList.add('rest');
  setExpression('sleepy');
  state.energy = Math.min(100, state.energy + 40);
  state.happy = Math.min(100, state.happy + 3);
  updateUI(); saveState();
  setTimeout(()=>{
    svg.classList.remove('rest');
    updateMood(); // restore normal mood after sleep
  }, 4000);
}

function play(){
  // open minigame
  playSound('happy');
  $('overlay').classList.remove('hidden');
  startMiniGame();
}

function doOtterAction(anim){
  const svg = $('otterSvg');
  if(anim==='feed'){
    svg.classList.add('hop', 'eating', 'feeding');
    setTimeout(()=>svg.classList.remove('hop', 'eating', 'feeding'), 1500);
  }
  if(anim==='bathe'){
    svg.classList.add('bathing');
    setTimeout(()=>svg.classList.remove('bathing'), 1600);
  }
}

// mini game: click fish
let miniRunning = false;
let miniScore = 0;
let miniTimer = null;
function startMiniGame(){
  if(miniRunning) return;
  miniRunning = true;
  miniScore = 0;
  $('miniScore').textContent = 0;
  const area = $('fishArea');
  area.innerHTML='';
  
  // Track game played
  if(!state.stats) state.stats = {gamesPlayed:0, fishCaught:0, itemsBought:0};
  state.stats.gamesPlayed++;

  // spawn fish
  function spawnFish(){
    const f = document.createElement('div');
    f.classList.add('fish');
    f.textContent = '🐟';
    f.style.left = Math.random()*80 + '%';
    f.style.top = Math.random()*80 + '%';
    f.addEventListener('click', ()=>{
      miniScore += 1;
      $('miniScore').textContent = miniScore;
      f.remove();
      state.coins += 2; // reward
      state.happy = Math.min(100, state.happy + 4);
      state.stats.fishCaught++;
      playSound('happy');
      updateUI(); saveState();
    });
    area.appendChild(f);
  }

  // spawn a few every second
  const interval = setInterval(()=>{
    spawnFish();
    // remove older fishes to keep area clean
    if(area.children.length > 7) area.removeChild(area.firstElementChild);
  }, 800);

  // end after 10s
  miniTimer = setTimeout(()=>{
    clearInterval(interval);
    miniRunning = false;
    $('overlay').classList.add('hidden');
    updateStats();
    alert('Fine mini gioco! Hai ottenuto ' + miniScore + ' punti.');
  }, 10000);
}

function closeMini(){
  if(miniTimer) clearTimeout(miniTimer);
  miniRunning=false;
  $('overlay').classList.add('hidden');
}

function resetState(){
  if(!confirm('Sei sicuro di voler iniziare una nuova lontra? I dati attuali verranno persi.')) return;
  state = {...DEFAULT};
  saveState();
  updateUI();
}

// shop
function buyItem(e){
  const btn = e.target;
  const price = parseInt(btn.getAttribute('data-price'));
  const item = btn.getAttribute('data-item');
  if(state.coins < price){
    alert('Monete insufficienti');
    return;
  }
  state.coins -= price;
  if(item==='hat') state.hat = true;
  if(!state.stats) state.stats = {gamesPlayed:0, fishCaught:0, itemsBought:0};
  state.stats.itemsBought++;
  updateUI(); saveState();
}

window.addEventListener('DOMContentLoaded', ()=>{
  loadState();
  updateUI();

  $('feedBtn').addEventListener('click', feed);
  $('bathBtn').addEventListener('click', bathe);
  $('sleepBtn').addEventListener('click', sleep);
  $('playBtn').addEventListener('click', play);
  $('resetBtn').addEventListener('click', resetState);
  $('closeMini').addEventListener('click', closeMini);
  document.querySelectorAll('.buy').forEach(b=>b.addEventListener('click', buyItem));

  // tick every 5 seconds
  setInterval(tick, 5000);
  
  // blink occasionally
  setInterval(()=>{
    const svg = $('otterSvg');
    svg.classList.add('blink');
    setTimeout(()=>svg.classList.remove('blink'), 180);
  }, 4000 + Math.random()*2000);

  // Initial mood set
  updateMood();

  // Page navigation
  setupNavigation();
});

// Page navigation system
function setupNavigation(){
  const navButtons = document.querySelectorAll('.nav-btn');
  const pages = {
    home: $('mainInfo'),
    shop: $('shopPage'),
    stats: $('statsPage')
  };

  navButtons.forEach(btn => {
    btn.addEventListener('click', ()=>{
      const targetPage = btn.dataset.page;
      
      // Update active button
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Show/hide pages
      Object.keys(pages).forEach(key => {
        if(pages[key]){
          if(key === targetPage){
            pages[key].classList.remove('hidden');
            if(key === 'shop') pages[key].classList.add('active');
          } else {
            pages[key].classList.add('hidden');
            if(key === 'shop') pages[key].classList.remove('active');
          }
        }
      });
    });
  });
}

// save periodically
setInterval(saveState, 4000);

// Simple sound effects using Web Audio API
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type){
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  
  if(type === 'feed'){
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);
  } else if(type === 'happy'){
    osc.frequency.setValueAtTime(500, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.15);
  } else if(type === 'splash'){
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
  }
  
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.2);
}
