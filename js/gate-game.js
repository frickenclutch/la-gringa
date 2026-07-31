// Patio skillet game — gate entrance (index.html)
(function () {
  'use strict';

  let actx = null;
  function initAudio() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function playSfx(type) {
    if (!actx) return;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.connect(gain);
    gain.connect(actx.destination);
    const now = actx.currentTime;

    if (type === 'catch') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'bad') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'win') {
      [440, 554.37, 659.25, 880].forEach((freq, i) => {
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = 'square';
        o.connect(g);
        g.connect(actx.destination);
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.1, now + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.3);
        o.start(now + i * 0.1);
        o.stop(now + i * 0.1 + 0.3);
      });
    }
  }

  let RECIPES = null;
  const JUNK = ['Soggy Fries', 'Old Lettuce', 'Ketchup', 'Burnt Toast', 'Empty Can'];

  const EMOJI_MAP = {
    'Tortilla Chips': '🫓',
    'Queso Blanco': '🥣',
    'Jalapeño Bacon': '🥓',
    Chorizo: '🥩',
    'Cheddar Jack': '🧀',
    'Fried Eggs': '🍳',
    'Ancho Chipotle': '🌶️',
    'Jerk Chicken': '🍗',
    Rice: '🍚',
    'Black Beans': '🫘',
    Jalapeños: '🫑',
    'Pineapple Salsa': '🍍',
    'Soggy Fries': '🍟',
    'Old Lettuce': '🥬',
    Ketchup: '🍅',
    'Burnt Toast': '🍞',
    'Empty Can': '🥫',
  };

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // Polyfill: CanvasRenderingContext2D.roundRect is missing on Safari/iOS < 16
  if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      let radius = typeof r === 'number' ? r : Array.isArray(r) ? r[0] || 0 : 0;
      radius = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2);
      this.moveTo(x + radius, y);
      this.arcTo(x + w, y, x + w, y + h, radius);
      this.arcTo(x + w, y + h, x, y + h, radius);
      this.arcTo(x, y + h, x, y, radius);
      this.arcTo(x, y, x + w, y, radius);
      this.closePath();
      return this;
    };
  }

  let activeRecipe = null;
  let collected = [];
  let items = [];
  let isPlaying = false;
  let animId = null;
  let lastSpawn = 0;
  let player = { x: 0, y: 0, width: 140, height: 30 };
  let viewportWidth = window.innerWidth;
  let viewportHeight = window.innerHeight;

  function resize() {
    const viewport = window.visualViewport;
    viewportWidth = Math.round(viewport ? viewport.width : window.innerWidth);
    viewportHeight = Math.round(viewport ? viewport.height : window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewportWidth * dpr);
    canvas.height = Math.round(viewportHeight * dpr);
    canvas.style.width = viewportWidth + 'px';
    canvas.style.height = viewportHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    player.x = Math.min(Math.max(player.x || viewportWidth / 2, 70), viewportWidth - 70);
    player.y = viewportHeight - viewportHeight * 0.15 - 10;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  canvas.addEventListener('pointermove', (event) => {
    if (!isPlaying) return;
    player.x = Math.min(Math.max(event.clientX, player.width / 2), viewportWidth - player.width / 2);
    if (event.pointerType === 'touch' && event.cancelable) event.preventDefault();
  });

  async function loadRecipes() {
    if (RECIPES) return RECIPES;
    const res = await fetch('/data/recipes.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('recipes load failed');
    RECIPES = await res.json();
    return RECIPES;
  }

  async function claimReward(recipeId) {
    const el = document.getElementById('success-promo');
    el.innerText = '…';
    try {
      const res = await fetch('/api/reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: recipeId }),
      });
      if (!res.ok) throw new Error('reward ' + res.status);
      const data = await res.json();
      el.innerText = data.code || 'Ask the patio';
    } catch {
      // Local file:// or static preview without the worker
      el.innerText = 'Show this win at the counter';
    }
  }

  function startGame(recipeKey) {
    initAudio();
    loadRecipes()
      .then((recipes) => {
        activeRecipe = recipes[recipeKey];
        if (!activeRecipe) return;
        collected = [];
        items = [];
        isPlaying = true;

        document.getElementById('ui-welcome').classList.add('hidden');
        document.getElementById('ui-success').classList.add('hidden');
        document.getElementById('ui-hud').classList.remove('hidden');
        document.getElementById('ui-hud').classList.add('flex');
        document.getElementById('game-container').classList.remove('hidden');

        document.getElementById('hud-title').innerText = activeRecipe.title;
        updateHud();

        if (animId) cancelAnimationFrame(animId);
        animId = requestAnimationFrame(loop);
      })
      .catch(() => {
        alert('Could not load recipes. Try refreshing.');
      });
  }

  function quitGame() {
    isPlaying = false;
    document.getElementById('ui-hud').classList.add('hidden');
    document.getElementById('ui-hud').classList.remove('flex');
    document.getElementById('game-container').classList.add('hidden');
    showWelcome();
  }

  function showWelcome() {
    document.getElementById('ui-welcome').classList.remove('hidden');
    document.getElementById('ui-success').classList.add('hidden');
  }

  function winGame() {
    isPlaying = false;
    playSfx('win');
    if (window.DGHaptics) window.DGHaptics.trigger('win');
    document.getElementById('ui-hud').classList.add('hidden');
    document.getElementById('game-container').classList.add('hidden');

    document.getElementById('success-emoji').innerText = activeRecipe.emoji;
    document.getElementById('success-dish').innerText = activeRecipe.title;
    claimReward(activeRecipe.id || Object.keys(RECIPES).find((k) => RECIPES[k] === activeRecipe));

    document.getElementById('ui-success').classList.remove('hidden');
  }

  function updateHud() {
    const cont = document.getElementById('hud-checklist');
    cont.innerHTML = '';
    activeRecipe.reqs.forEach((req) => {
      const has = collected.includes(req);
      const el = document.createElement('span');
      el.className = `px-2 py-1 rounded border transition-all ${
        has ? 'bg-amber-500 text-black border-amber-300' : 'bg-slate-800 border-slate-600 opacity-70'
      }`;
      el.innerText = has ? `✓ ${req}` : `○ ${req}`;
      cont.appendChild(el);
    });

    if (collected.length === activeRecipe.reqs.length) {
      setTimeout(winGame, 500);
    }
  }

  function loop(timestamp) {
    if (!isPlaying) return;

    ctx.clearRect(0, 0, viewportWidth, viewportHeight);

    if (timestamp - lastSpawn > 900) {
      spawnItem();
      lastSpawn = timestamp;
    }

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.y += it.speed;
      it.rot += it.rotSpeed;

      if (it.y + 20 >= player.y && it.y - 20 <= player.y + player.height) {
        if (it.x >= player.x - player.width / 2 && it.x <= player.x + player.width / 2) {
          handleCatch(it);
          items.splice(i, 1);
          continue;
        }
      }

      if (it.y > viewportHeight) {
        items.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.translate(it.x, it.y);

      if (it.needed) {
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245, 159, 0, 0.2)';
        ctx.fill();
      }

      ctx.rotate(it.rot);

      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = it.needed ? '#f59f00' : '#475569';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.emoji, 0, 2);
      ctx.restore();

      ctx.fillStyle = it.needed ? '#fde047' : '#cbd5e1';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 4;
      ctx.fillText(it.name, it.x, it.y + 40);
      ctx.shadowBlur = 0;
    }

    drawSkillet();
    animId = requestAnimationFrame(loop);
  }

  function spawnItem() {
    const isGood = Math.random() < 0.7;
    let name = '';
    let needed = false;

    if (isGood) {
      const missing = activeRecipe.reqs.filter((r) => !collected.includes(r));
      if (missing.length > 0) {
        name = missing[Math.floor(Math.random() * missing.length)];
        needed = true;
      } else {
        name = activeRecipe.reqs[Math.floor(Math.random() * activeRecipe.reqs.length)];
      }
    } else {
      name = JUNK[Math.floor(Math.random() * JUNK.length)];
    }

    const spawnX = viewportWidth * 0.2 + Math.random() * (viewportWidth * 0.6);

    items.push({
      x: spawnX,
      y: -50,
      name: name,
      needed: needed,
      emoji: EMOJI_MAP[name] || '❓',
      speed: 3 + Math.random() * 2,
      rot: Math.random() * Math.PI,
      rotSpeed: (Math.random() - 0.5) * 0.1,
    });
  }

  function handleCatch(it) {
    if (it.needed && !collected.includes(it.name)) {
      collected.push(it.name);
      playSfx('catch');
      if (window.DGHaptics) window.DGHaptics.trigger('success');
      updateHud();
    } else if (!it.needed && !activeRecipe.reqs.includes(it.name)) {
      playSfx('bad');
      if (window.DGHaptics) window.DGHaptics.trigger('warning');
    } else {
      playSfx('catch');
      if (window.DGHaptics) window.DGHaptics.trigger('light');
    }
  }

  function drawSkillet() {
    const px = player.x;
    const py = player.y;
    const pw = player.width;
    const ph = player.height;

    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.roundRect(px + pw / 2 - 10, py + 8, 80, 14, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.arc(px + pw / 2 + 55, py + 15, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.ellipse(px, py + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.ellipse(px, py + ph / 2, pw / 2 - 6, ph / 2 - 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#52525b';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DG SIZZLE', px, py + ph / 2);
  }

  // Replace document.write spindles with DOM nodes
  const spindleHost = document.getElementById('railing-spindles');
  if (spindleHost) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 15; i++) {
      const d = document.createElement('div');
      d.className =
        'w-1.5 md:w-2.5 h-full bg-gradient-to-r from-[#27272a] to-[#09090b] shadow-[2px_0_5px_rgba(0,0,0,0.5)]';
      frag.appendChild(d);
    }
    spindleHost.appendChild(frag);
  }

  window.startGame = startGame;
  window.quitGame = quitGame;
  window.showWelcome = showWelcome;

  // Warm the recipe cache
  loadRecipes().catch(function () {});
})();
