// 3D manuscript menu — menu.html
(function () {
  'use strict';

  let currentView = 0;
  let layoutMode = 'spread';
  let navigationLockedUntil = 0;
  let suppressClickUntil = 0;
  let layoutFrame = 0;
  const totalViews = 7;
  const root = document.documentElement;
  const scene = document.querySelector('.scene');
  const book = document.getElementById('book');
  const faces = Array.from(document.querySelectorAll('.face'));
  const leaves = [
    document.getElementById('leaf1'),
    document.getElementById('leaf2'),
    document.getElementById('leaf3'),
    document.getElementById('leaf4'),
  ];

  function prefersReducedMotion() {
    return Boolean(window.DGHaptics && window.DGHaptics.isReducedMotion());
  }

  function getViewportSize() {
    const viewport = window.visualViewport;
    return {
      width: Math.round(viewport ? viewport.width : window.innerWidth),
      height: Math.round(viewport ? viewport.height : window.innerHeight),
    };
  }

  function getLayoutMode() {
    const viewport = getViewportSize();
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const portrait = viewport.height >= viewport.width;
    const shortLandscape = !portrait && viewport.height <= 560;
    const compactFoldable = coarsePointer && viewport.width <= 900;
    const portraitTablet = coarsePointer && portrait && viewport.width <= 1100;
    return viewport.width <= 800 || shortLandscape || compactFoldable || portraitTablet
      ? 'single'
      : 'spread';
  }

  function getLeafFlippedState(viewIndex) {
    return [viewIndex > 0, viewIndex > 2, viewIndex > 4, viewIndex > 6];
  }

  function normalizeViewForSpread(viewIndex) {
    if (viewIndex <= 0) return 0;
    if (viewIndex >= totalViews) return totalViews;
    return viewIndex % 2 === 0 ? viewIndex - 1 : viewIndex;
  }

  function updateLayoutMode() {
    const nextMode = getLayoutMode();
    if (nextMode !== layoutMode) {
      if (nextMode === 'spread') currentView = normalizeViewForSpread(currentView);
      layoutMode = nextMode;
    }
    root.dataset.menuLayout = layoutMode;
    root.dataset.menuView = String(currentView);
  }

  function bookShiftX() {
    if (layoutMode === 'single') return currentView % 2 === 0 ? '-25%' : '25%';
    if (currentView === 0) return '-25%';
    if (currentView === totalViews) return '25%';
    return '0%';
  }

  let parallaxX = 0;
  let parallaxY = 0;
  let parallaxViewBias = 0;
  let parallaxFrame = 0;
  let pendingParallax = null;

  function isLitePerf() {
    return root.dataset.perf === 'lite' || prefersReducedMotion();
  }

  function applyBookTransform() {
    if (isLitePerf()) {
      book.style.transform = 'translateX(' + bookShiftX() + ')';
      return;
    }
    const px = parallaxX * 10;
    const py = parallaxY * 7;
    book.style.transform =
      'translateX(' + bookShiftX() + ') translate3d(' + px.toFixed(2) + 'px, ' + py.toFixed(2) + 'px, 0)';
  }

  function setParallax(nx, ny) {
    if (isLitePerf()) {
      root.style.setProperty('--parallax-x', '0');
      root.style.setProperty('--parallax-y', '0');
      return;
    }
    parallaxX = Math.max(-1, Math.min(1, nx + parallaxViewBias));
    parallaxY = Math.max(-1, Math.min(1, ny));
    root.style.setProperty('--parallax-x', parallaxX.toFixed(3));
    root.style.setProperty('--parallax-y', parallaxY.toFixed(3));
    applyBookTransform();
  }

  function scheduleParallax(nx, ny) {
    pendingParallax = { nx, ny };
    if (parallaxFrame) return;
    parallaxFrame = requestAnimationFrame(() => {
      parallaxFrame = 0;
      if (!pendingParallax) return;
      setParallax(pendingParallax.nx, pendingParallax.ny);
      pendingParallax = null;
    });
  }

  function updateBookState() {
    updateLayoutMode();
    const flippedStates = getLeafFlippedState(currentView);

    leaves.forEach((leaf, index) => {
      const wasFlipped = leaf.classList.contains('flipped');
      const isFlipped = flippedStates[index];

      if (wasFlipped !== isFlipped) {
        leaf.classList.add('turning');
        if (isFlipped) {
          leaf.classList.add('flipped');
          leaf.style.zIndex = index + 1;
        } else {
          leaf.classList.remove('flipped');
          window.setTimeout(() => {
            if (!leaf.classList.contains('flipped')) leaf.style.zIndex = 4 - index;
          }, prefersReducedMotion() ? 80 : 600);
        }
        window.setTimeout(() => {
          leaf.classList.remove('turning');
        }, prefersReducedMotion() ? 140 : 1220);
      } else if (!wasFlipped) {
        leaf.style.zIndex = 4 - index;
      }
    });

    parallaxViewBias = ((currentView / Math.max(1, totalViews)) - 0.5) * 0.22;
    applyBookTransform();

    root.dataset.menuView = String(currentView);
    document.getElementById('nav-left').disabled = currentView <= 0;
    document.getElementById('nav-right').disabled = currentView >= totalViews;
    requestAnimationFrame(updateOverflowCues);
  }

  function updateOverflowCue(face) {
    const scrollable = face.scrollHeight > face.clientHeight + 2;
    const atEnd = !scrollable || face.scrollTop + face.clientHeight >= face.scrollHeight - 3;
    face.dataset.scrollable = String(scrollable);
    face.dataset.scrollEnd = String(atEnd);
  }

  function updateOverflowCues() {
    faces.forEach(updateOverflowCue);
  }

  function scheduleLayoutUpdate() {
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      resizeCanvas();
      updateBookState();
    });
  }

  function nextViewForDirection(direction) {
    if (layoutMode === 'single') return currentView + direction;
    if (direction > 0) {
      if (currentView === 0) return 1;
      return currentView + 2;
    }
    if (currentView === totalViews) return totalViews - 2;
    if (currentView === 1) return 0;
    return currentView - 2;
  }

  function provideTurnFeedback(direction) {
    if (window.DGHaptics) window.DGHaptics.trigger('page');
    if (!prefersReducedMotion()) {
      window.setTimeout(() => fireParticleBurst(direction > 0), 50);
    }
  }

  function navigateBook(direction) {
    const now = performance.now();
    if (now < navigationLockedUntil) return false;

    updateLayoutMode();
    const nextView = nextViewForDirection(direction);
    if (nextView < 0 || nextView > totalViews || nextView === currentView) return false;

    currentView = nextView;
    navigationLockedUntil = now + (prefersReducedMotion() ? 120 : 1100);
    updateBookState();
    provideTurnFeedback(direction);
    return true;
  }

  function jumpToView(view) {
    const target = Math.max(0, Math.min(totalViews, Number(view)));
    const nextView = layoutMode === 'spread' ? normalizeViewForSpread(target) : target;
    if (nextView !== currentView) {
      const direction = nextView > currentView ? 1 : -1;
      currentView = nextView;
      navigationLockedUntil = performance.now() + (prefersReducedMotion() ? 120 : 1100);
      updateBookState();
      provideTurnFeedback(direction);
    }
    document.getElementById('dialer').classList.remove('open');
    document.body.classList.remove('dialer-open');
  }

  function isControlTarget(target) {
    return Boolean(
      target.closest(
        '.dialer-container, .nav-hint, #menu-install-btn, #install-coach, #specials-board-btn, #street-board, a, button'
      )
    );
  }

  let gesture = null;

  scene.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || isControlTarget(event.target)) return;
    const face = event.target.closest('.face');
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      axis: null,
      face,
      startScrollTop: face ? face.scrollTop : 0,
    };
    if (scene.setPointerCapture) scene.setPointerCapture(event.pointerId);
  });

  scene.addEventListener(
    'pointermove',
    (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      const dx = gesture.lastX - gesture.startX;
      const dy = gesture.lastY - gesture.startY;

      if (!gesture.axis && Math.hypot(dx, dy) >= 10) {
        gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.35 ? 'x' : 'y';
      }
      if (gesture.axis === 'x' && event.cancelable) event.preventDefault();
    },
    { passive: false }
  );

  function finishGesture(event, cancelled) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const activeGesture = gesture;
    gesture = null;

    if (scene.releasePointerCapture && scene.hasPointerCapture(event.pointerId)) {
      scene.releasePointerCapture(event.pointerId);
    }
    if (cancelled || activeGesture.axis !== 'x') return;

    const dx = activeGesture.lastX - activeGesture.startX;
    const dy = activeGesture.lastY - activeGesture.startY;
    const viewport = getViewportSize();
    const threshold = Math.max(36, Math.min(72, viewport.width * 0.08));
    const faceScrolled =
      activeGesture.face &&
      Math.abs(activeGesture.face.scrollTop - activeGesture.startScrollTop) > 3;

    suppressClickUntil = performance.now() + 450;
    if (faceScrolled || Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy) * 1.35) {
      return;
    }
    navigateBook(dx < 0 ? 1 : -1);
  }

  scene.addEventListener('pointerup', (event) => finishGesture(event, false));
  scene.addEventListener('pointercancel', (event) => finishGesture(event, true));

  faces.forEach((face) => {
    face.addEventListener('scroll', () => updateOverflowCue(face), { passive: true });
  });

  scene.addEventListener('click', (event) => {
    if (performance.now() < suppressClickUntil || isControlTarget(event.target)) return;
    const viewport = getViewportSize();
    const edge = viewport.width * 0.18;
    if (event.clientX <= edge) navigateBook(-1);
    else if (event.clientX >= viewport.width - edge) navigateBook(1);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') navigateBook(-1);
    if (event.key === 'ArrowRight') navigateBook(1);
  });

  function toggleDialer(e) {
    const dialer = document.getElementById('dialer');
    dialer.classList.toggle('open');
    document.body.classList.toggle('dialer-open', dialer.classList.contains('open'));
    e.stopPropagation();
  }

  function syncParallaxFromPointer(event) {
    if (isLitePerf() || document.body.classList.contains('street-board-open')) return;
    if (event.pointerType === 'touch') return;
    const viewport = getViewportSize();
    const nx = (event.clientX / Math.max(1, viewport.width)) * 2 - 1;
    const ny = (event.clientY / Math.max(1, viewport.height)) * 2 - 1;
    scheduleParallax(nx * 0.55, ny * 0.45);
  }

  if (!isLitePerf()) {
    window.addEventListener('pointermove', syncParallaxFromPointer, { passive: true });
    window.addEventListener(
      'deviceorientation',
      (event) => {
        if (isLitePerf() || event.gamma == null || event.beta == null) return;
        scheduleParallax((event.gamma || 0) / 45, ((event.beta || 0) - 45) / 45);
      },
      { passive: true }
    );
  } else {
    root.style.setProperty('--parallax-x', '0');
    root.style.setProperty('--parallax-y', '0');
  }

  window.addEventListener('resize', scheduleLayoutUpdate);
  window.addEventListener('orientationchange', scheduleLayoutUpdate);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleLayoutUpdate);
  }

  const canvas = document.getElementById('smokeCanvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let canvasWidth, canvasHeight;
  let animationFrameId = null;

  function resizeCanvas() {
    const dpr = isLitePerf() ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(canvasWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvasHeight * dpr));
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  class Particle {
    constructor(x, y, type, flipLeft) {
      this.type = type;
      this.x = x;
      this.y = y + (Math.random() - 0.5) * (canvasHeight * 0.9);
      this.life = 1.0;

      const directionMultiplier = flipLeft ? -1 : 1;

      if (type === 'smoke') {
        this.size = Math.random() * 20 + 20;
        this.vx = (Math.random() * 3 + 1) * directionMultiplier;
        this.vy = Math.random() * -2 - 1;
        this.decay = Math.random() * 0.01 + 0.005;
        const shade = Math.floor(Math.random() * 30 + 10);
        this.color = `${shade}, ${shade}, ${shade}`;
      } else {
        this.size = Math.random() * 4 + 1;
        this.vx = (Math.random() * 8 + 2) * directionMultiplier;
        this.vy = Math.random() * -4 - 2;
        this.decay = Math.random() * 0.02 + 0.01;
        this.color = Math.random() > 0.4 ? '255, 100, 0' : '255, 200, 50';
      }
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.life -= this.decay;
      if (this.type === 'smoke') this.size += 0.8;
      if (this.type === 'ember') {
        this.vy += 0.08;
        this.vx *= 0.92;
      }
    }

    draw(drawCtx) {
      if (this.life <= 0) return;
      drawCtx.save();
      drawCtx.beginPath();

      if (this.type === 'smoke') {
        drawCtx.globalAlpha = Math.max(0, this.life * 0.5);
        const gradient = drawCtx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
        gradient.addColorStop(0, `rgba(${this.color}, 0.6)`);
        gradient.addColorStop(1, `rgba(${this.color}, 0)`);
        drawCtx.fillStyle = gradient;
        drawCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      } else {
        drawCtx.globalAlpha = Math.max(0, this.life);
        drawCtx.fillStyle = `rgba(${this.color}, ${this.life})`;
        drawCtx.shadowBlur = 15;
        drawCtx.shadowColor = `rgba(${this.color}, 1)`;
        drawCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      }

      drawCtx.fill();
      drawCtx.restore();
    }
  }

  function fireParticleBurst(flipLeft) {
    const bookRect = document.getElementById('book').getBoundingClientRect();
    const spineX = bookRect.left + bookRect.width / 2;
    const spineY = bookRect.top + bookRect.height / 2;
    const lite = isLitePerf();
    const smokeCount = lite ? 12 : 40;
    const emberCount = lite ? 10 : 30;

    for (let i = 0; i < smokeCount; i++) particles.push(new Particle(spineX, spineY, 'smoke', flipLeft));
    for (let i = 0; i < emberCount; i++) particles.push(new Particle(spineX, spineY, 'ember', flipLeft));

    // Extra sparks from the cover logo when it's on-screen (additive; spine burst unchanged)
    const seal = document.getElementById('cover-seal');
    if (seal && !lite) {
      const rect = seal.getBoundingClientRect();
      const onScreen =
        rect.width >= 8 &&
        rect.height >= 8 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth;
      if (onScreen) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        for (let i = 0; i < 16; i++) {
          const p = new Particle(cx, cy, 'smoke', flipLeft);
          p.y = cy + (Math.random() - 0.5) * 36;
          p.vy = Math.random() * -3 - 1.2;
          particles.push(p);
        }
        for (let i = 0; i < 22; i++) {
          const p = new Particle(cx, cy, 'ember', flipLeft);
          p.y = cy + (Math.random() - 0.5) * 28;
          p.vy = Math.random() * -5 - 2;
          particles.push(p);
        }
        seal.classList.remove('is-singeing');
        void seal.offsetWidth;
        seal.classList.add('is-singeing');
        setTimeout(function () {
          seal.classList.remove('is-singeing');
        }, 800);
      }
    }

    if (!animationFrameId) renderParticles();
  }

  function renderParticles() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    let active = false;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update();
      p.draw(ctx);
      if (p.life <= 0) {
        particles.splice(i, 1);
      } else {
        active = true;
      }
    }

    if (active) {
      animationFrameId = requestAnimationFrame(renderParticles);
    } else {
      animationFrameId = null;
    }
  }

  window.navigateBook = navigateBook;
  window.jumpToView = jumpToView;
  window.toggleDialer = toggleDialer;
  window.DGMenu = {
    getCurrentView: () => currentView,
    getLayoutMode: () => layoutMode,
    navigate: navigateBook,
    refreshLayout: scheduleLayoutUpdate,
  };

  updateBookState();
  requestAnimationFrame(() => book.classList.add('is-ready'));
})();
