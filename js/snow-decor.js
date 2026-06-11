'use strict';

window.AppSnowDecor = {
  init() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = document.getElementById('snowDecorCanvas');
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const MAX_FLAKES = 900;
    const MIN_SPAWN_RATE = 18;
    const MAX_SPAWN_RATE = 260;
    const SPEED_TO_SPAWN_RATE = 0.14;
    const POINTER_SPEED_SMOOTHING = 0.25;
    const POINTER_SPEED_DECAY = 4.6;

    const pageType = document.body.dataset.page;
    const palette =
      pageType === 'viewer'
        ? {
            core: [255, 255, 255],
            glow: [125, 211, 252],
            ring: 'rgba(186, 230, 253, 0.28)',
          }
        : {
            core: [15, 118, 110],
            glow: [6, 182, 212],
            ring: 'rgba(13, 148, 136, 0.16)',
          };

    const mouse = {
      x: 0,
      y: 0,
      active: false,
      speed: 0,
      lastX: 0,
      lastY: 0,
      lastTime: 0,
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

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function getSpawnRate(pointerSpeed) {
      return clamp(
        MIN_SPAWN_RATE + pointerSpeed * SPEED_TO_SPAWN_RATE,
        MIN_SPAWN_RATE,
        MAX_SPAWN_RATE,
      );
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
      const radius = random(1.2, 4.2);

      return {
        x: x + random(-16, 16),
        y: y + random(-12, 8),
        radius,
        vx: random(-8, 8),
        vy: random(18, 48),
        gravity: random(4, 10),
        wind: random(-10, 10),
        swayAmp: random(7, 22),
        swaySpeed: random(0.7, 1.8),
        phase: random(0, Math.PI * 2),
        sparklePhase: random(0, Math.PI * 2),
        sparkleSpeed: random(3.5, 7.5),
        age: 0,
        ttl: random(2.8, 5.6),
        opacity: random(0.26, 0.72),
      };
    }

    function spawnSnow(x, y, deltaTime, pointerSpeed) {
      spawnCarry += getSpawnRate(pointerSpeed) * deltaTime;
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

    function drawSoftFlake(flake, alpha) {
      const glow = context.createRadialGradient(
        flake.x,
        flake.y,
        0,
        flake.x,
        flake.y,
        flake.radius * 4.2,
      );

      glow.addColorStop(0, rgba(palette.core, alpha * 0.68));
      glow.addColorStop(0.38, rgba(palette.glow, alpha * 0.22));
      glow.addColorStop(1, rgba(palette.glow, 0));

      context.fillStyle = glow;
      context.beginPath();
      context.arc(flake.x, flake.y, flake.radius * 4.2, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = rgba(palette.core, alpha);
      context.beginPath();
      context.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
      context.fill();
    }

    function drawEmitter(time) {
      const pulse = 1 + Math.sin(time * 4.8) * 0.08;

      context.save();
      context.beginPath();
      context.arc(mouse.x, mouse.y, 26 * pulse, 0, Math.PI * 2);
      context.strokeStyle = palette.ring;
      context.lineWidth = 1.2;
      context.stroke();
      context.restore();
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
      const titleTop = isCompact ? 90 : 74;
      const maxTextWidth = Math.max(canvasWidth - left * 2 - (isCompact ? 0 : 150), 260);
      const titleSize = isCompact ? 38 : clamp(canvasWidth * 0.052, 48, 68);
      const subtitleSize = isCompact ? 15 : 17;
      const subtitleLineHeight = isCompact ? 24 : 27;

      context.save();
      context.textAlign = 'left';
      context.textBaseline = 'top';

      context.shadowColor = 'rgba(255, 255, 255, 0.65)';
      context.shadowBlur = 18;
      context.fillStyle = '#020617';
      context.font = `900 ${titleSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      context.fillText('Image Hash Share', left, titleTop);

      const subtitle =
        'Compress a tiny image in the browser and create a polished viewer-only URL with the image data tucked into the hash.';
      const subtitleTop = titleTop + titleSize + 16;
      const subtitleFont = `600 ${subtitleSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const subtitleLines = wrapText(subtitle, maxTextWidth, subtitleFont).slice(0, 3);

      context.shadowBlur = 10;
      context.fillStyle = 'rgba(51, 65, 85, 0.9)';
      context.font = subtitleFont;
      subtitleLines.forEach((line, index) => {
        context.fillText(line, left, subtitleTop + index * subtitleLineHeight);
      });

      context.restore();
    }

    function animate(now = 0) {
      const time = now / 1000;
      const previous = lastTime || now;
      const deltaTime = clamp((now - previous) / 1000, 0.001, 0.033);
      lastTime = now;

      context.clearRect(0, 0, canvasWidth, canvasHeight);

      if (mouse.active) {
        mouse.speed *= Math.exp(-POINTER_SPEED_DECAY * deltaTime);
        spawnSnow(mouse.x, mouse.y, deltaTime, mouse.speed);
        drawEmitter(time);
      } else {
        spawnCarry = 0;
      }

      flakes = flakes.filter((flake) => {
        flake.age += deltaTime;
        flake.vy += flake.gravity * deltaTime;
        flake.phase += flake.swaySpeed * deltaTime;
        flake.sparklePhase += flake.sparkleSpeed * deltaTime;

        const sway = Math.sin(flake.phase) * flake.swayAmp;
        flake.x += (flake.vx + flake.wind + sway) * deltaTime;
        flake.y += flake.vy * deltaTime;

        const progress = flake.age / flake.ttl;
        const birth = easeOutCubic(clamp(progress / 0.16, 0, 1));
        const death = clamp((1 - progress) / 0.28, 0, 1);
        const sparkle = 0.72 + Math.sin(flake.sparklePhase) * 0.28;
        const alpha = flake.opacity * birth * death * sparkle;

        drawSoftFlake(flake, alpha);

        return (
          progress < 1 &&
          flake.y < canvasHeight + 40 &&
          flake.x > -60 &&
          flake.x < canvasWidth + 60
        );
      });

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

      const elapsed = Math.max((event.timeStamp - mouse.lastTime) / 1000, 0.001);
      const distance = Math.hypot(x - mouse.lastX, y - mouse.lastY);
      const rawSpeed = distance / elapsed;

      mouse.x = x;
      mouse.y = y;
      mouse.active = true;
      mouse.speed += (rawSpeed - mouse.speed) * POINTER_SPEED_SMOOTHING;
      mouse.lastX = x;
      mouse.lastY = y;
      mouse.lastTime = event.timeStamp;
    }

    function clearPointer() {
      mouse.active = false;
      mouse.speed = 0;
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
