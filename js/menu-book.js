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

    for (let i = 0; i < 40; i++) particles.push(new Particle(spineX, spineY, 'smoke', flipLeft));
    for (let i = 0; i < 30; i++) particles.push(new Particle(spineX, spineY, 'ember', flipLeft));

    // Extra sparks from the cover logo when it's on-screen (additive; spine burst unchanged)
    const seal = document.getElementById('cover-seal');
    if (seal) {
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

  updateBookState(false);
})();
