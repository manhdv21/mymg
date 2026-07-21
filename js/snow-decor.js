'use strict';

window.AppSnowDecor = {
  init() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = document.getElementById('snowDecorCanvas');
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const MAX_FLAKES = 3200;
    const SPAWN_RATE = 480;

    const pageType = document.body.dataset.page;
    const palette =
      pageType === 'viewer'
        ? {
            core: [255, 255, 255],
            glow: [125, 211, 252],
            coreAlpha: 0.9,
            glowAlpha: 0.01,
          }
        : {
            core: [15, 118, 110],
            glow: [6, 182, 212],
            coreAlpha: 0.05,
            glowAlpha: 0.01,
          };

    const mouse = {
      x: 0,
      y: 0,
      active: false,
    };
    let flakes = [];
    let frame = 0;
    let lastTime = 0;
    let spawnCarry = 0;
    let canvasWidth = 1;
    let canvasHeight = 1;

    function random(min, max) {
      return Math.random() * (max - min) + min;
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(rect.width, 1);
      const height = Math.max(rect.height, 1);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      canvasWidth = width;
      canvasHeight = height;
    }

    function createFlake(x, y) {
      const radius = random(3.2, 6.4);

      return {
        x: x + random(-16, 16),
        y: y + random(-8, 4),
        radius,
        vx: random(-12, 12),
        vy: random(120, 210),
      };
    }

    function spawnSnow(x, y, deltaTime) {
      spawnCarry += SPAWN_RATE * deltaTime;
      const count = Math.floor(spawnCarry);
      spawnCarry -= count;

      for (let index = 0; index < count; index += 1) {
        flakes.push(createFlake(x, y));
      }

      if (flakes.length > MAX_FLAKES) {
        flakes.splice(0, flakes.length - MAX_FLAKES);
      }
    }

    function rgba(color, alpha) {
      return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
    }

    function drawFlakes() {
      flakes.forEach((flake) => {
        const glowRadius = flake.radius * 2.1;
        const gradient = context.createRadialGradient(
          flake.x,
          flake.y,
          0,
          flake.x,
          flake.y,
          glowRadius,
        );

        gradient.addColorStop(0, rgba(palette.glow, palette.glowAlpha));
        gradient.addColorStop(0.55, rgba(palette.glow, palette.glowAlpha * 0.45));
        gradient.addColorStop(1, rgba(palette.glow, 0));

        context.fillStyle = gradient;
        context.beginPath();
        context.arc(flake.x, flake.y, glowRadius, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = rgba(palette.core, palette.coreAlpha);
        context.beginPath();
        context.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
        context.fill();
      });
    }

    function wrapText(text, maxWidth, font) {
      context.font = font;
      const words = text.split(' ');
      const lines = [];
      let line = '';

      words.forEach((word) => {
        const nextLine = line ? `${line} ${word}` : word;
        if (context.measureText(nextLine).width <= maxWidth || !line) {
          line = nextLine;
          return;
        }

        lines.push(line);
        line = word;
      });

      if (line) lines.push(line);
      return lines;
    }

    function drawGeneratorBannerText() {
      if (pageType !== 'generator') return;

      const isCompact = canvasWidth < 680;
      const left = isCompact ? 22 : 36;
      const titleTop = isCompact ? 45 : 30;
      const maxTextWidth = Math.max(canvasWidth - left * 2 - (isCompact ? 0 : 150), 260);
      const titleSize = isCompact ? 32 : clamp(canvasWidth * 0.052, 48, 52);
      const subtitleSize = isCompact ? 15 : 17;
      const subtitleLineHeight = isCompact ? 24 : 27;

      context.save();
      context.textAlign = 'left';
      context.textBaseline = 'top';

      context.fillStyle = '#020617';
      context.font = `700 ${titleSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      context.fillText('Image Hash Share', left, titleTop);

      const subtitle =
        'Compress a tiny image in the browser';
      const subtitleTop = titleTop + titleSize + 16;
      const subtitleFont = `600 ${subtitleSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const subtitleLines = wrapText(subtitle, maxTextWidth, subtitleFont).slice(0, 3);

      context.fillStyle = 'rgba(51, 65, 85, 0.9)';
      context.font = subtitleFont;
      subtitleLines.forEach((line, index) => {
        context.fillText(line, left, subtitleTop + index * subtitleLineHeight);
      });

      context.restore();
    }

    function animate(now = 0) {
      const previous = lastTime || now;
      const deltaTime = clamp((now - previous) / 1000, 0.001, 0.033);
      lastTime = now;

      context.clearRect(0, 0, canvasWidth, canvasHeight);

      if (mouse.active) {
        spawnSnow(mouse.x, mouse.y, deltaTime);
      } else {
        spawnCarry = 0;
      }

      flakes = flakes.filter((flake) => {
        flake.x += flake.vx * deltaTime;
        flake.y += flake.vy * deltaTime;

        return (
          flake.y < canvasHeight + flake.radius &&
          flake.x > -flake.radius &&
          flake.x < canvasWidth + flake.radius
        );
      });

      drawFlakes();
      drawGeneratorBannerText();

      frame = requestAnimationFrame(animate);
    }

    function setPointer(event) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const isInside = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;

      if (!isInside) {
        clearPointer();
        return;
      }

      mouse.x = x;
      mouse.y = y;
      mouse.active = true;
    }

    function clearPointer() {
      mouse.active = false;
    }

    resize();
    frame = requestAnimationFrame(animate);

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', setPointer, { passive: true });
    window.addEventListener('pointerleave', clearPointer);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && frame) cancelAnimationFrame(frame);
      if (!document.hidden) {
        lastTime = 0;
        frame = requestAnimationFrame(animate);
      }
    });
  },
};
