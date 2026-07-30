// 3D manuscript menu — menu.html
(function () {
  'use strict';

  let currentView = 0;
  const totalViews = 7;
  const leaves = [
    document.getElementById('leaf1'),
    document.getElementById('leaf2'),
    document.getElementById('leaf3'),
    document.getElementById('leaf4'),
  ];

  function getLeafFlippedState(viewIndex) {
    return [viewIndex > 0, viewIndex > 2, viewIndex > 4, viewIndex > 6];
  }

  function updateBookState(emitParticles) {
    if (emitParticles === undefined) emitParticles = true;
    const isMobile = window.innerWidth <= 800;
    const book = document.getElementById('book');

    const flippedStates = getLeafFlippedState(currentView);
    let stateChanged = false;

    leaves.forEach((leaf, index) => {
      const wasFlipped = leaf.classList.contains('flipped');
      const isFlipped = flippedStates[index];

      if (wasFlipped !== isFlipped) {
        stateChanged = true;
        if (isFlipped) {
          leaf.classList.add('flipped');
          leaf.style.zIndex = index + 1;
        } else {
          leaf.classList.remove('flipped');
          setTimeout(() => {
            leaf.style.zIndex = 4 - index;
          }, 600);
        }
      } else if (!wasFlipped && !isFlipped) {
        leaf.style.zIndex = 4 - index;
      }
    });

    let transformStr = '';
    if (isMobile) {
      transformStr = currentView % 2 === 0 ? 'translateX(-25%)' : 'translateX(25%)';
    } else {
      if (currentView === 0) transformStr = 'translateX(-25%)';
      else if (currentView === totalViews) transformStr = 'translateX(25%)';
      else transformStr = 'translateX(0%)';
    }
    book.style.transform = transformStr;

    if (stateChanged && emitParticles) {
      const flipLeft = currentView % 2 !== 0;
      setTimeout(() => fireParticleBurst(flipLeft), 50);
    }

    document.getElementById('nav-left').style.opacity = currentView > 0 ? '1' : '0';
    document.getElementById('nav-left').style.pointerEvents = currentView > 0 ? 'auto' : 'none';
    document.getElementById('nav-right').style.opacity = currentView < totalViews ? '1' : '0';
    document.getElementById('nav-right').style.pointerEvents = currentView < totalViews ? 'auto' : 'none';
  }

  window.addEventListener('resize', () => {
    updateBookState(false);
  });

  function navigateBook(direction) {
    let nextView = currentView + direction;
    if (window.innerWidth > 800) {
      if (direction > 0 && currentView % 2 !== 0 && currentView < 6) nextView++;
      if (direction < 0 && currentView % 2 === 0 && currentView > 0) nextView--;
    }

    if (nextView >= 0 && nextView <= totalViews) {
      currentView = nextView;
      updateBookState(true);
    }
  }

  function jumpToView(view) {
    currentView = view;
    updateBookState(true);
    document.getElementById('dialer').classList.remove('open');
  }

  let touchStartX = 0;
  let touchStartY = 0;

  document.addEventListener(
    'touchstart',
    (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    },
    { passive: true }
  );

  document.addEventListener(
    'touchend',
    (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;

      if (Math.abs(touchEndX - touchStartX) > Math.abs(touchEndY - touchStartY)) {
        if (touchEndX < touchStartX - 50) navigateBook(1);
        if (touchEndX > touchStartX + 50) navigateBook(-1);
      }
    },
    { passive: true }
  );

  document.addEventListener('click', (e) => {
    if (
      e.target.closest('.dialer-container') ||
      e.target.closest('.nav-hint') ||
      e.target.closest('#menu-install-btn') ||
      e.target.closest('#install-coach')
    ) {
      return;
    }

    const clickX = e.clientX;
    const width = window.innerWidth;
    if (clickX < width * 0.2) navigateBook(-1);
    else if (clickX > width * 0.8) navigateBook(1);
  });

  function toggleDialer(e) {
    document.getElementById('dialer').classList.toggle('open');
    e.stopPropagation();
  }

  const canvas = document.getElementById('smokeCanvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let canvasWidth, canvasHeight;
  let animationFrameId = null;

  function resizeCanvas() {
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  class Particle {
    constructor(x, y, type, flipLeft, fromSeal) {
      this.type = type;
      this.x = x + (fromSeal ? (Math.random() - 0.5) * 28 : 0);
      // Spine burst scatters along the binding; seal burst clusters at the logo.
      this.y = fromSeal
        ? y + (Math.random() - 0.5) * 24
        : y + (Math.random() - 0.5) * (canvasHeight * 0.9);
      this.life = 1.0;
      this.fromSeal = !!fromSeal;

      const directionMultiplier = flipLeft ? -1 : 1;

      if (type === 'smoke') {
        this.size = fromSeal ? Math.random() * 14 + 12 : Math.random() * 20 + 20;
        this.vx = fromSeal
          ? (Math.random() - 0.5) * 1.8 + directionMultiplier * 0.6
          : (Math.random() * 3 + 1) * directionMultiplier;
        this.vy = fromSeal ? Math.random() * -2.8 - 1.6 : Math.random() * -2 - 1;
        this.decay = fromSeal ? Math.random() * 0.014 + 0.008 : Math.random() * 0.01 + 0.005;
        const shade = Math.floor(Math.random() * 30 + 10);
        this.color = `${shade}, ${shade}, ${shade}`;
      } else {
        // ember / singe sparks
        this.size = fromSeal ? Math.random() * 3.5 + 1.2 : Math.random() * 4 + 1;
        this.vx = fromSeal
          ? (Math.random() - 0.5) * 3.5 + directionMultiplier * 0.8
          : (Math.random() * 8 + 2) * directionMultiplier;
        this.vy = fromSeal ? Math.random() * -5.5 - 2.5 : Math.random() * -4 - 2;
        this.decay = fromSeal ? Math.random() * 0.025 + 0.012 : Math.random() * 0.02 + 0.01;
        this.color = Math.random() > 0.35 ? '255, 90, 10' : '255, 200, 50';
      }
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.life -= this.decay;
      if (this.type === 'smoke') this.size += this.fromSeal ? 0.55 : 0.8;
      if (this.type === 'ember') {
        this.vy += this.fromSeal ? 0.05 : 0.08;
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

  function fireSealSinge(flipLeft) {
    const seal = document.getElementById('cover-seal');
    if (!seal) return;

    const rect = seal.getBoundingClientRect();
    // Skip if the seal is flipped away / off-screen (tiny or out of viewport)
    if (rect.width < 8 || rect.height < 8) return;
    if (rect.bottom < 0 || rect.top > windowHeight || rect.right < 0 || rect.left > windowWidth) {
      return;
    }

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * 0.35; // rise from the upper half of the logo

    for (let i = 0; i < 22; i++) particles.push(new Particle(cx, cy, 'smoke', flipLeft, true));
    for (let i = 0; i < 28; i++) particles.push(new Particle(cx, cy, 'ember', flipLeft, true));

    seal.classList.remove('is-singeing');
    // Retrigger CSS animation
    void seal.offsetWidth;
    seal.classList.add('is-singeing');
    window.setTimeout(function () {
      seal.classList.remove('is-singeing');
    }, 800);
  }

  function fireParticleBurst(flipLeft) {
    const bookRect = document.getElementById('book').getBoundingClientRect();
    const spineX = bookRect.left + bookRect.width / 2;
    const spineY = bookRect.top + bookRect.height / 2;

    for (let i = 0; i < 40; i++) particles.push(new Particle(spineX, spineY, 'smoke', flipLeft, false));
    for (let i = 0; i < 30; i++) particles.push(new Particle(spineX, spineY, 'ember', flipLeft, false));

    fireSealSinge(flipLeft);

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

  updateBookState(false);
})();
