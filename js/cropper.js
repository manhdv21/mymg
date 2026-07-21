'use strict';

const CROP_MIN_SIZE = 2;
const CROP_HANDLE_SIZE = 4;
const CROP_HANDLE_PADDING = 8;
const CROP_MAX_DISPLAY_HEIGHT = 560;

function clampCropValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

window.AppCropper = function createCropper(options = {}) {
  const { canvas, empty, meta, getFile = () => null, getSourceImage = () => null } = options;
  const context = canvas?.getContext('2d') || null;

  const state = {
    cropRect: null,
    cropDrag: null,
    imageOnCanvas: null,
    eventsBound: false,
  };

  function getImageSize() {
    const image = getSourceImage();
    if (!image) return null;

    const width = Number(image.naturalWidth || image.width);
    const height = Number(image.naturalHeight || image.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }

    return { width, height };
  }

  function formatCrop(rect) {
    if (!rect) return '--';
    return `${Math.round(rect.w)} x ${Math.round(rect.h)} at ${Math.round(rect.x)}, ${Math.round(rect.y)}`;
  }

  function updateMeta() {
    const file = getFile();
    const imageSize = getImageSize();

    if (!file || !imageSize) {
      window.AppUtils.setMeta(meta, ['--', '--', '--', '--']);
      return;
    }

    window.AppUtils.setMeta(meta, [
      window.AppUtils.formatBytes(file.size),
      `${imageSize.width} x ${imageSize.height}`,
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
    canvas.style.cursor = 'default';
    state.cropRect = null;
    state.cropDrag = null;
    state.imageOnCanvas = null;
    if (context) context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function getDisplaySize(imageSize) {
    const frame = canvas?.parentElement;
    const availableWidth = frame?.clientWidth > 0 ? frame.clientWidth - 24 : 240;
    const maxWidth = Math.max(1, availableWidth);
    const frameHeight = frame?.clientHeight > 0 ? frame.clientHeight - 24 : 0;
    const viewportHeight = Number(window.visualViewport?.height || window.innerHeight);
    const viewportMaxHeight = Number.isFinite(viewportHeight)
      ? Math.max(160, Math.min(CROP_MAX_DISPLAY_HEIGHT, viewportHeight - 140))
      : CROP_MAX_DISPLAY_HEIGHT;
    const maxHeight = frameHeight > 0 ? frameHeight : viewportMaxHeight;
    const ratio = Math.min(
      maxWidth / imageSize.width,
      maxHeight / imageSize.height,
      1,
    );

    return {
      width: Math.max(1, Math.round(imageSize.width * ratio)),
      height: Math.max(1, Math.round(imageSize.height * ratio)),
    };
  }

  function resetToFullImage() {
    const imageSize = getImageSize();
    state.cropDrag = null;

    if (!imageSize) {
      state.cropRect = null;
      return;
    }

    state.cropRect = {
      x: 0,
      y: 0,
      w: imageSize.width,
      h: imageSize.height,
    };
  }

  function drawCropOverlay(image, cropRect, scaleX, scaleY, displaySize) {
    const crop = {
      x: cropRect.x * scaleX,
      y: cropRect.y * scaleY,
      w: cropRect.w * scaleX,
      h: cropRect.h * scaleY,
    };

    context.save();
    context.fillStyle = 'rgba(15, 23, 42, 0.52)';
    context.fillRect(0, 0, displaySize.width, displaySize.height);
    context.clearRect(crop.x, crop.y, crop.w, crop.h);
    context.drawImage(
      image,
      cropRect.x,
      cropRect.y,
      cropRect.w,
      cropRect.h,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
    );

    context.strokeStyle = '#f59e0b';
    context.lineWidth = 2;
    context.strokeRect(
      crop.x + 1,
      crop.y + 1,
      Math.max(0, crop.w - 2),
      Math.max(0, crop.h - 2),
    );

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
      context.rect(
        handleX - CROP_HANDLE_SIZE,
        handleY - CROP_HANDLE_SIZE,
        CROP_HANDLE_SIZE * 2,
        CROP_HANDLE_SIZE * 2,
      );
      context.fill();
      context.stroke();
    });

    context.restore();
  }

  function draw() {
    const image = getSourceImage();
    const imageSize = getImageSize();
    if (!image || !imageSize || !context || !canvas) return;

    const displaySize = getDisplaySize(imageSize);
    if (canvas.width !== displaySize.width) canvas.width = displaySize.width;
    if (canvas.height !== displaySize.height) canvas.height = displaySize.height;
    canvas.style.width = `${displaySize.width}px`;
    canvas.style.height = `${displaySize.height}px`;

    const scaleX = displaySize.width / imageSize.width;
    const scaleY = displaySize.height / imageSize.height;
    state.imageOnCanvas = {
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
      displayWidth: displaySize.width,
      displayHeight: displaySize.height,
    };

    context.clearRect(0, 0, displaySize.width, displaySize.height);
    context.drawImage(image, 0, 0, displaySize.width, displaySize.height);

    if (state.cropRect) {
      drawCropOverlay(image, state.cropRect, scaleX, scaleY, displaySize);
    }
  }

  function getEventDisplaySize() {
    if (!state.imageOnCanvas || !canvas) return null;

    const bounds = canvas.getBoundingClientRect();
    return {
      width: bounds.width || state.imageOnCanvas.displayWidth,
      height: bounds.height || state.imageOnCanvas.displayHeight,
    };
  }

  function pointFromEvent(event) {
    const displaySize = getEventDisplaySize();
    if (!displaySize) return null;

    const bounds = canvas.getBoundingClientRect();
    const x = clampCropValue(event.clientX - bounds.left, 0, displaySize.width);
    const y = clampCropValue(event.clientY - bounds.top, 0, displaySize.height);

    return {
      x: (x / displaySize.width) * state.imageOnCanvas.imageWidth,
      y: (y / displaySize.height) * state.imageOnCanvas.imageHeight,
    };
  }

  function isInsideCanvas(event) {
    if (!canvas) return false;
    const bounds = canvas.getBoundingClientRect();
    return (
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom
    );
  }

  function getHit(point) {
    if (!point || !state.cropRect || !state.imageOnCanvas) return null;

    const rect = state.cropRect;
    const displaySize = getEventDisplaySize();
    const scaleX = displaySize.width / state.imageOnCanvas.imageWidth;
    const scaleY = displaySize.height / state.imageOnCanvas.imageHeight;
    const tolerance = Math.max(CROP_HANDLE_PADDING / scaleX, CROP_HANDLE_PADDING / scaleY);
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
    const imageSize = getImageSize();
    if (!imageSize) return null;

    const xValue = Number.isFinite(rect.x) ? rect.x : 0;
    const yValue = Number.isFinite(rect.y) ? rect.y : 0;
    const widthValue = Number.isFinite(rect.w) ? rect.w : CROP_MIN_SIZE;
    const heightValue = Number.isFinite(rect.h) ? rect.h : CROP_MIN_SIZE;
    const x = clampCropValue(xValue, 0, Math.max(0, imageSize.width - CROP_MIN_SIZE));
    const y = clampCropValue(yValue, 0, Math.max(0, imageSize.height - CROP_MIN_SIZE));
    const w = Math.min(
      Math.max(CROP_MIN_SIZE, widthValue),
      imageSize.width - x,
    );
    const h = Math.min(
      Math.max(CROP_MIN_SIZE, heightValue),
      imageSize.height - y,
    );

    return { x, y, w, h };
  }

  function applyDrag(point) {
    const drag = state.cropDrag;
    const imageSize = getImageSize();
    if (!drag || !point || !imageSize) return state.cropRect;

    const original = drag.original;
    if (drag.hit.type === 'move') {
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;
      return clampRect({
        x: clampCropValue(original.x + dx, 0, imageSize.width - original.w),
        y: clampCropValue(original.y + dy, 0, imageSize.height - original.h),
        w: original.w,
        h: original.h,
      });
    }

    let left = original.x;
    let top = original.y;
    let right = original.x + original.w;
    let bottom = original.y + original.h;
    const { edges } = drag.hit;

    if (edges.left) left = clampCropValue(point.x, 0, right - CROP_MIN_SIZE);
    if (edges.right) right = clampCropValue(point.x, left + CROP_MIN_SIZE, imageSize.width);
    if (edges.top) top = clampCropValue(point.y, 0, bottom - CROP_MIN_SIZE);
    if (edges.bottom) bottom = clampCropValue(point.y, top + CROP_MIN_SIZE, imageSize.height);

    return clampRect({ x: left, y: top, w: right - left, h: bottom - top });
  }

  function startDrag(event) {
    if (
      !canvas ||
      !getImageSize() ||
      !state.imageOnCanvas ||
      !state.cropRect ||
      !isInsideCanvas(event) ||
      (typeof event.button === 'number' && event.button !== 0)
    ) {
      return;
    }

    event.preventDefault();
    const start = pointFromEvent(event);
    const hit = getHit(start);
    if (!start || !hit) return;

    state.cropDrag = {
      start,
      hit,
      original: { ...state.cropRect },
    };
    canvas.style.cursor = cursorForHit(hit);

    if (typeof event.pointerId === 'number' && canvas.setPointerCapture) {
      canvas.setPointerCapture(event.pointerId);
    }
  }

  function moveDrag(event) {
    if (!getImageSize() || !state.imageOnCanvas) return;
    const point = pointFromEvent(event);
    if (!point) return;

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
    const point = pointFromEvent(event);
    if (point) state.cropRect = applyDrag(point);
    state.cropDrag = null;
    canvas.style.cursor = cursorForHit(getHit(point));
    draw();
    updateMeta();
  }

  function resetCursor() {
    if (!state.cropDrag && canvas) canvas.style.cursor = 'default';
  }

  function bindEvents() {
    if (!canvas || state.eventsBound) return;

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', startDrag);
    canvas.addEventListener('pointermove', moveDrag);
    canvas.addEventListener('pointerup', finishDrag);
    canvas.addEventListener('pointercancel', finishDrag);
    canvas.addEventListener('lostpointercapture', finishDrag);
    canvas.addEventListener('pointerleave', resetCursor);
    window.addEventListener('resize', draw);
    state.eventsBound = true;
  }

  function unbindEvents() {
    if (!canvas || !state.eventsBound) return;

    canvas.removeEventListener('pointerdown', startDrag);
    canvas.removeEventListener('pointermove', moveDrag);
    canvas.removeEventListener('pointerup', finishDrag);
    canvas.removeEventListener('pointercancel', finishDrag);
    canvas.removeEventListener('lostpointercapture', finishDrag);
    canvas.removeEventListener('pointerleave', resetCursor);
    window.removeEventListener('resize', draw);
    state.eventsBound = false;
  }

  return {
    bindEvents,
    draw,
    getCropRect: () => (state.cropRect ? { ...state.cropRect } : null),
    hide,
    resetToFullImage,
    show,
    unbindEvents,
    updateMeta,
  };
};
