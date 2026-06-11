'use strict';

window.AppCropper = function createCropper(options) {
  const { canvas, empty, meta, getFile, getSourceImage } = options;
  const context = canvas ? canvas.getContext('2d') : null;

  const state = {
    cropRect: null,
    cropDrag: null,
    imageOnCanvas: null,
  };

  function formatCrop(rect) {
    if (!rect) return '--';
    return `${Math.round(rect.w)} x ${Math.round(rect.h)} at ${Math.round(rect.x)}, ${Math.round(rect.y)}`;
  }

  function updateMeta() {
    const file = getFile();
    const image = getSourceImage();

    if (!file || !image) {
      window.AppUtils.setMeta(meta, ['--', '--', '--', '--']);
      return;
    }

    window.AppUtils.setMeta(meta, [
      window.AppUtils.formatBytes(file.size),
      `${image.naturalWidth} x ${image.naturalHeight}`,
      file.type || 'Unknown',
      formatCrop(state.cropRect),
    ]);
  }

  function show() {
    if (!canvas || !empty) return;
    canvas.classList.remove('hidden');
    empty.classList.add('hidden');
  }

  function hide() {
    if (!canvas || !empty) return;
    canvas.classList.add('hidden');
    empty.classList.remove('hidden');
    if (context) context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function getDisplaySize(image) {
    const frame = canvas.parentElement;
    const maxWidth = Math.max(240, frame.clientWidth - 24);
    const maxHeight = 420;
    const ratio = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);

    return {
      width: Math.max(1, Math.round(image.naturalWidth * ratio)),
      height: Math.max(1, Math.round(image.naturalHeight * ratio)),
    };
  }

  function resetToFullImage() {
    const image = getSourceImage();
    if (!image) return;

    state.cropRect = {
      x: 0,
      y: 0,
      w: image.naturalWidth,
      h: image.naturalHeight,
    };
  }

  function draw() {
    const image = getSourceImage();
    if (!image || !context) return;

    const displaySize = getDisplaySize(image);
    canvas.width = displaySize.width;
    canvas.height = displaySize.height;
    canvas.style.width = `${displaySize.width}px`;
    canvas.style.height = `${displaySize.height}px`;

    const scaleX = displaySize.width / image.naturalWidth;
    const scaleY = displaySize.height / image.naturalHeight;
    state.imageOnCanvas = { scaleX, scaleY };

    context.clearRect(0, 0, displaySize.width, displaySize.height);
    context.drawImage(image, 0, 0, displaySize.width, displaySize.height);

    if (!state.cropRect) return;

    const crop = {
      x: state.cropRect.x * scaleX,
      y: state.cropRect.y * scaleY,
      w: state.cropRect.w * scaleX,
      h: state.cropRect.h * scaleY,
    };

    context.save();
    context.fillStyle = 'rgba(15, 23, 42, 0.52)';
    context.fillRect(0, 0, displaySize.width, displaySize.height);
    context.clearRect(crop.x, crop.y, crop.w, crop.h);
    context.drawImage(
      image,
      state.cropRect.x,
      state.cropRect.y,
      state.cropRect.w,
      state.cropRect.h,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
    );

    context.strokeStyle = '#f59e0b';
    context.lineWidth = 2;
    context.strokeRect(crop.x + 1, crop.y + 1, Math.max(0, crop.w - 2), Math.max(0, crop.h - 2));

    const handles = [
      [crop.x, crop.y],
      [crop.x + crop.w / 2, crop.y],
      [crop.x + crop.w, crop.y],
      [crop.x + crop.w, crop.y + crop.h / 2],
      [crop.x + crop.w, crop.y + crop.h],
      [crop.x + crop.w / 2, crop.y + crop.h],
      [crop.x, crop.y + crop.h],
      [crop.x, crop.y + crop.h / 2],
    ];

    context.fillStyle = '#f59e0b';
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1;
    handles.forEach(([handleX, handleY]) => {
      context.beginPath();
      context.rect(handleX - 4, handleY - 4, 8, 8);
      context.fill();
      context.stroke();
    });

    context.restore();
  }

  function pointFromEvent(event) {
    const bounds = canvas.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width);
    const y = Math.min(Math.max(event.clientY - bounds.top, 0), bounds.height);

    return {
      x: x / state.imageOnCanvas.scaleX,
      y: y / state.imageOnCanvas.scaleY,
    };
  }

  function isInsideCanvas(event) {
    const bounds = canvas.getBoundingClientRect();
    return (
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom
    );
  }

  function getHit(point) {
    if (!state.cropRect || !state.imageOnCanvas) return null;

    const rect = state.cropRect;
    const tolerance = Math.max(8 / state.imageOnCanvas.scaleX, 8 / state.imageOnCanvas.scaleY);
    const nearLeft = Math.abs(point.x - rect.x) <= tolerance;
    const nearRight = Math.abs(point.x - (rect.x + rect.w)) <= tolerance;
    const nearTop = Math.abs(point.y - rect.y) <= tolerance;
    const nearBottom = Math.abs(point.y - (rect.y + rect.h)) <= tolerance;
    const withinX = point.x >= rect.x - tolerance && point.x <= rect.x + rect.w + tolerance;
    const withinY = point.y >= rect.y - tolerance && point.y <= rect.y + rect.h + tolerance;

    if (withinX && withinY && (nearLeft || nearRight || nearTop || nearBottom)) {
      return {
        type: 'resize',
        edges: { left: nearLeft, right: nearRight, top: nearTop, bottom: nearBottom },
      };
    }

    if (
      point.x >= rect.x &&
      point.x <= rect.x + rect.w &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.h
    ) {
      return { type: 'move' };
    }

    return null;
  }

  function cursorForHit(hit) {
    if (!hit) return 'default';
    if (hit.type === 'move') return 'move';

    const { left, right, top, bottom } = hit.edges;
    if ((left && top) || (right && bottom)) return 'nwse-resize';
    if ((right && top) || (left && bottom)) return 'nesw-resize';
    if (left || right) return 'ew-resize';
    if (top || bottom) return 'ns-resize';
    return 'default';
  }

  function clampRect(rect) {
    const image = getSourceImage();
    const minSize = 2;
    const x = Math.min(Math.max(0, rect.x), image.naturalWidth - minSize);
    const y = Math.min(Math.max(0, rect.y), image.naturalHeight - minSize);
    const w = Math.min(Math.max(minSize, rect.w), image.naturalWidth - x);
    const h = Math.min(Math.max(minSize, rect.h), image.naturalHeight - y);

    return { x, y, w, h };
  }

  function applyDrag(point) {
    const drag = state.cropDrag;
    const original = drag.original;

    if (drag.hit.type === 'move') {
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;
      return clampRect({
        x: Math.min(Math.max(0, original.x + dx), getSourceImage().naturalWidth - original.w),
        y: Math.min(Math.max(0, original.y + dy), getSourceImage().naturalHeight - original.h),
        w: original.w,
        h: original.h,
      });
    }

    const minSize = 2;
    let left = original.x;
    let top = original.y;
    let right = original.x + original.w;
    let bottom = original.y + original.h;
    const { edges } = drag.hit;

    if (edges.left) left = Math.min(Math.max(0, point.x), right - minSize);
    if (edges.right)
      right = Math.max(Math.min(getSourceImage().naturalWidth, point.x), left + minSize);
    if (edges.top) top = Math.min(Math.max(0, point.y), bottom - minSize);
    if (edges.bottom)
      bottom = Math.max(Math.min(getSourceImage().naturalHeight, point.y), top + minSize);

    return clampRect({ x: left, y: top, w: right - left, h: bottom - top });
  }

  function startDrag(event) {
    if (!getSourceImage() || !state.imageOnCanvas || !isInsideCanvas(event)) return;
    event.preventDefault();

    const start = pointFromEvent(event);
    const hit = getHit(start);
    if (!hit) return;

    state.cropDrag = {
      start,
      hit,
      original: { ...state.cropRect },
    };
    canvas.style.cursor = cursorForHit(hit);

    if (typeof event.pointerId === 'number') {
      canvas.setPointerCapture(event.pointerId);
    }
  }

  function moveDrag(event) {
    if (!getSourceImage()) return;
    const point = pointFromEvent(event);

    if (!state.cropDrag) {
      canvas.style.cursor = cursorForHit(getHit(point));
      return;
    }

    event.preventDefault();
    state.cropRect = applyDrag(point);
    draw();
    updateMeta();
  }

  function finishDrag(event) {
    if (!state.cropDrag) return;
    event.preventDefault();
    state.cropRect = applyDrag(pointFromEvent(event));
    state.cropDrag = null;
    canvas.style.cursor = cursorForHit(getHit(pointFromEvent(event)));
    draw();
    updateMeta();
  }

  function bindEvents() {
    canvas.addEventListener('pointerdown', startDrag);
    canvas.addEventListener('pointermove', moveDrag);
    canvas.addEventListener('pointerup', finishDrag);
    canvas.addEventListener('pointercancel', finishDrag);
    canvas.addEventListener('mousedown', startDrag);
    window.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', finishDrag);
    window.addEventListener('resize', draw);
  }

  return {
    bindEvents,
    draw,
    getCropRect: () => state.cropRect,
    hide,
    resetToFullImage,
    show,
    updateMeta,
  };
};
