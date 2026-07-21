'use strict';

const MIN_OUTPUT_DIMENSION = 16;
const DEFAULT_OUTPUT_DIMENSION = 1920;
const FALLBACK_CANVAS_DIMENSION = 1920;
const CANVAS_DIMENSION_CEILING = 32767;
const CANVAS_AREA_CEILING = 268_435_456;
const MAX_OUTPUT_BYTES = 300 * 1024;
const MIN_OUTPUT_QUALITY = 0.1;
const QUALITY_STEP = 0.05;
const RESOLUTION_LADDER = Object.freeze([1920, 1600, 1280, 1024, 800, 640, 480]);
const PREFERRED_OUTPUT_TYPE = 'image/webp';
const OUTPUT_TYPE_EXTENSIONS = Object.freeze({
  'image/avif': 'avif',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
});
const COPY_SUCCESS_MESSAGE = 'URL copied to the clipboard.';
const COPY_SUCCESS_NOTIFICATION_TIMEOUT = 5000;

class CompressionLimitError extends Error {
  constructor() {
    super('The source image is already 300 KB or larger, and no smaller encoded output was found.');
    this.name = 'CompressionLimitError';
  }
}

function isOutputSizeAllowed(bytes) {
  return Number.isFinite(bytes) && bytes < MAX_OUTPUT_BYTES;
}

function getTargetBytes(originalBytes) {
  return Math.min(Number(originalBytes), MAX_OUTPUT_BYTES);
}

function isCandidateWithinBudget(candidateBytes, originalBytes) {
  const bytes = Number(candidateBytes);
  const targetBytes = getTargetBytes(originalBytes);
  return Number.isFinite(bytes) && Number.isFinite(targetBytes) && bytes < targetBytes;
}

function getInitialCompressionQuality(settings) {
  const quality = Number(settings?.quality);
  if (!Number.isFinite(quality)) return 0.9;
  return Math.min(1, Math.max(0.1, quality));
}

function buildQualityCandidates(startQuality) {
  const start = getInitialCompressionQuality({ quality: startQuality });
  const qualities = [];

  for (let quality = start; quality >= MIN_OUTPUT_QUALITY; quality -= QUALITY_STEP) {
    qualities.push(Number(quality.toFixed(2)));
  }

  if (qualities.at(-1) !== MIN_OUTPUT_QUALITY) qualities.push(MIN_OUTPUT_QUALITY);
  return qualities;
}

function formatCompressionQuality(quality, requestedQuality) {
  const usedQuality = Number(quality);
  if (!Number.isFinite(usedQuality)) return '--';

  const usedLabel = usedQuality.toFixed(2);
  const requested = Number(requestedQuality);
  return Number.isFinite(requested) && usedQuality < requested
    ? `${usedLabel} (auto-adjusted)`
    : usedLabel;
}

function getDownloadFilename(originalName, outputType) {
  const normalizedType = String(outputType || '').toLowerCase();
  const extension = OUTPUT_TYPE_EXTENSIONS[normalizedType] || 'img';
  const name = String(originalName || '').trim();
  const baseName = name.replace(/\.[^./\\]*$/, '');
  const safeBaseName = (baseName || 'compressed-image')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .trim() || 'compressed-image';

  return `${safeBaseName}.${extension}`;
}

function canRenderCanvasSize(axis, dimension) {
  try {
    const canvas = document.createElement('canvas');
    const width = axis === 'width' ? dimension : 1;
    const height = axis === 'height' ? dimension : 1;

    canvas.width = width;
    canvas.height = height;

    if (canvas.width !== width || canvas.height !== height) return false;

    const context = canvas.getContext('2d');
    if (!context) return false;

    context.fillStyle = '#000';
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data[3] > 0;
  } catch {
    return false;
  }
}

function detectCanvasAxisLimit(axis) {
  if (!canRenderCanvasSize(axis, 1)) return FALLBACK_CANVAS_DIMENSION;
  if (canRenderCanvasSize(axis, CANVAS_DIMENSION_CEILING)) return CANVAS_DIMENSION_CEILING;

  let lower = 1;
  let upper = CANVAS_DIMENSION_CEILING;

  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (canRenderCanvasSize(axis, middle)) {
      lower = middle;
    } else {
      upper = middle;
    }
  }

  return Math.max(MIN_OUTPUT_DIMENSION, lower);
}

function detectBrowserCanvasLimits() {
  const maxWidth = detectCanvasAxisLimit('width');
  const maxHeight = detectCanvasAxisLimit('height');
  const maxDimension = Math.min(maxWidth, maxHeight);

  return {
    maxWidth,
    maxHeight,
    maxArea: Math.min(CANVAS_AREA_CEILING, maxDimension * maxDimension),
  };
}

function configureDimensionInput(input, maxDimension) {
  if (!input) return;

  input.min = String(MIN_OUTPUT_DIMENSION);
  input.max = String(maxDimension);

  const value = Number(input.value);
  if (!Number.isFinite(value) || value < MIN_OUTPUT_DIMENSION) {
    input.value = String(Math.min(DEFAULT_OUTPUT_DIMENSION, maxDimension));
  } else if (value > maxDimension) {
    input.value = String(maxDimension);
  }
}

function buildResolutionCandidates(cropRect, maxWidth, maxHeight) {
  const cropWidthValue = Number(cropRect?.w);
  const cropHeightValue = Number(cropRect?.h);
  const cropWidth = Number.isFinite(cropWidthValue) ? Math.max(1, cropWidthValue) : 1;
  const cropHeight = Number.isFinite(cropHeightValue) ? Math.max(1, cropHeightValue) : 1;
  const cropLongEdge = Math.max(cropWidth, cropHeight);
  const maxWidthValue = Number(maxWidth);
  const maxHeightValue = Number(maxHeight);
  const widthLimit = Number.isFinite(maxWidthValue) ? Math.max(1, maxWidthValue) : cropWidth;
  const heightLimit = Number.isFinite(maxHeightValue) ? Math.max(1, maxHeightValue) : cropHeight;
  const seen = new Set();
  const candidates = [];

  RESOLUTION_LADDER.forEach((milestone) => {
    const scale = Math.min(
      1,
      milestone / cropLongEdge,
      widthLimit / cropWidth,
      heightLimit / cropHeight,
    );
    const width = Math.max(1, Math.round(cropWidth * scale));
    const height = Math.max(1, Math.round(cropHeight * scale));
    const key = `${width}x${height}`;

    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ width, height, longEdge: Math.max(width, height) });
  });

  return candidates;
}

async function findCompressedCandidate({
  resolutions = [],
  qualities = [],
  originalBytes,
  encodeCandidate,
  isCurrent = () => true,
} = {}) {
  for (const dimensions of resolutions) {
    for (const quality of qualities) {
      let encoded;

      try {
        encoded = await encodeCandidate(dimensions, quality);
      } catch {
        if (!isCurrent()) return null;
        continue;
      }

      if (!isCurrent()) return null;

      const blob = encoded?.blob;
      if (!blob || !isCandidateWithinBudget(blob.size, originalBytes)) continue;

      return {
        ...encoded,
        ...dimensions,
        quality,
        isOriginalFallback: false,
      };
    }
  }

  return null;
}

function buildOriginalFileMetadata(file, sourceImage) {
  return {
    blob: file,
    outputType: String(file?.type || PREFERRED_OUTPUT_TYPE).toLowerCase(),
    width: Number(sourceImage?.naturalWidth || sourceImage?.width || 0),
    height: Number(sourceImage?.naturalHeight || sourceImage?.height || 0),
    quality: null,
    isOriginalFallback: true,
  };
}

window.AppGenerator = {
  isOutputSizeAllowed,
  getTargetBytes,
  isCandidateWithinBudget,
  getInitialCompressionQuality,
  buildQualityCandidates,
  buildResolutionCandidates,
  findCompressedCandidate,
  buildOriginalFileMetadata,
  getPreferredOutputType: () => PREFERRED_OUTPUT_TYPE,
  CompressionLimitError,
  formatCompressionQuality,
  getDownloadFilename,

  init() {
    const els = {
      fileInput: document.getElementById('fileInput'),
      dropZone: document.getElementById('dropZone'),
      cropCanvas: document.getElementById('cropCanvas'),
      originalEmpty: document.getElementById('originalEmpty'),
      originalMeta: document.getElementById('originalMeta'),
      maxWidth: document.getElementById('maxWidth'),
      maxHeight: document.getElementById('maxHeight'),
      quality: document.getElementById('quality'),
      qualityValue: document.getElementById('qualityValue'),
      compressButton: document.getElementById('compressButton'),
      copyButton: document.getElementById('copyButton'),
      downloadButton: document.getElementById('downloadButton'),
      compressedPreview: document.getElementById('compressedPreview'),
      compressedEmpty: document.getElementById('compressedEmpty'),
      compressedMeta: document.getElementById('compressedMeta'),
      clearButton: document.getElementById('clearButton'),
      message: document.getElementById('message'),
    };

    if (!els.fileInput || !els.cropCanvas) return;

    const canvasLimits = detectBrowserCanvasLimits();
    configureDimensionInput(els.maxWidth, canvasLimits.maxWidth);
    configureDimensionInput(els.maxHeight, canvasLimits.maxHeight);

    const state = {
      file: null,
      originalObjectUrl: '',
      compressedObjectUrl: '',
      sourceImage: null,
      loadVersion: 0,
      isCompressing: false,
      compressedShareUrl: '',
      compressedOutputType: '',
      compressedDimensions: '',
      isOriginalFallback: false,
      compressedDownloadName: '',
    };

    const cropper = window.AppCropper({
      canvas: els.cropCanvas,
      empty: els.originalEmpty,
      meta: els.originalMeta,
      getFile: () => state.file,
      getSourceImage: () => state.sourceImage,
    });

    function revokeObjectUrl(key) {
      if (!state[key]) return;
      URL.revokeObjectURL(state[key]);
      state[key] = '';
    }

    function setMessage(text, options) {
      window.AppUtils.setMessage(els.message, text, options);
    }

    function resetCompressedOutput() {
      revokeObjectUrl('compressedObjectUrl');
      window.AppViewer?.reset();
      state.compressedShareUrl = '';
      state.compressedOutputType = '';
      state.compressedDimensions = '';
      state.isOriginalFallback = false;
      state.compressedDownloadName = '';
      window.AppUtils.hideImage(els.compressedPreview, els.compressedEmpty);
      window.AppUtils.setMeta(els.compressedMeta, ['--', '--', '--']);
      setActionButtonState();
    }

    function setActionButtonState() {
      const hasCompressedOutput = Boolean(state.compressedObjectUrl && state.compressedShareUrl);
      els.copyButton.disabled = state.isCompressing || !hasCompressedOutput;
      els.downloadButton.disabled = state.isCompressing || !state.compressedObjectUrl;
    }

    function setCompressButtonState() {
      els.compressButton.disabled = state.isCompressing || !state.file || !state.sourceImage;
      els.compressButton.setAttribute('aria-busy', String(state.isCompressing));
      setActionButtonState();
    }

    function resetUploadOnly() {
      revokeObjectUrl('originalObjectUrl');
      state.file = null;
      state.sourceImage = null;
      cropper.hide();
      cropper.updateMeta();
      setCompressButtonState();
      els.fileInput.value = '';
    }

    async function loadSourceFile(file) {
      const loadVersion = ++state.loadVersion;
      resetCompressedOutput();
      setMessage('');

      if (!file) {
        resetUploadOnly();
        return;
      }

      if (!file.type.startsWith('image/')) {
        setMessage('Please choose an image file.');
        resetUploadOnly();
        return;
      }

      revokeObjectUrl('originalObjectUrl');
      state.file = file;
      state.originalObjectUrl = URL.createObjectURL(file);
      state.sourceImage = null;
      cropper.hide();
      cropper.updateMeta();
      setCompressButtonState();

      try {
        const sourceImage = await window.AppUtils.loadImageFromUrl(state.originalObjectUrl);
        if (loadVersion !== state.loadVersion) return;

        state.sourceImage = sourceImage;
        cropper.resetToFullImage();
        cropper.show();
        cropper.draw();
        cropper.updateMeta();
        setCompressButtonState();
      } catch (error) {
        if (loadVersion !== state.loadVersion) return;
        setMessage(error.message);
        resetUploadOnly();
      }
    }

    async function handleFileSelection(event) {
      const [file] = event.target.files;
      await loadSourceFile(file);
    }

    function setDropZoneActive(isActive) {
      els.dropZone.classList.toggle('border-emerald-600', isActive);
      els.dropZone.classList.toggle('bg-emerald-100', isActive);
      els.dropZone.classList.toggle('shadow-lg', isActive);
      els.dropZone.classList.toggle('shadow-emerald-900/10', isActive);
    }

    function getDroppedImageFile(event) {
      const files = Array.from(event.dataTransfer?.files || []);
      const fileFromFiles = files.find((file) => file.type.startsWith('image/'));
      if (fileFromFiles) return fileFromFiles;

      const items = Array.from(event.dataTransfer?.items || []);
      const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
      return imageItem?.getAsFile() || null;
    }

    function isDraggingFiles(event) {
      return Array.from(event.dataTransfer?.types || []).includes('Files');
    }

    function preventBrowserFileOpen(event) {
      if (!isDraggingFiles(event)) return;
      event.preventDefault();
    }

    function handleDragOver(event) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setDropZoneActive(true);
    }

    function handleDragLeave(event) {
      if (!els.dropZone.contains(event.relatedTarget)) {
        setDropZoneActive(false);
      }
    }

    async function handleDrop(event) {
      event.preventDefault();
      setDropZoneActive(false);
      const file = getDroppedImageFile(event);

      if (!file) {
        setMessage('Please drop an image file.');
        return;
      }

      await loadSourceFile(file);
    }

    function readCompressionSettings() {
      const maxWidth = Number(els.maxWidth.value);
      const maxHeight = Number(els.maxHeight.value);
      const quality = Number(els.quality.value);

      if (
        !Number.isInteger(maxWidth) ||
        !Number.isInteger(maxHeight) ||
        maxWidth < MIN_OUTPUT_DIMENSION ||
        maxHeight < MIN_OUTPUT_DIMENSION
      ) {
        throw new Error('Max width and height must be at least 16 pixels.');
      }

      if (maxWidth > canvasLimits.maxWidth || maxHeight > canvasLimits.maxHeight) {
        throw new Error(
          `This browser supports canvas dimensions up to ${Math.min(canvasLimits.maxWidth, canvasLimits.maxHeight).toLocaleString()} pixels.`,
        );
      }

      if (!Number.isFinite(quality) || quality < 0.1 || quality > 1) {
        throw new Error('Quality must be between 0.1 and 1.');
      }

      return { maxWidth, maxHeight, quality };
    }

    function createOutputCanvas(width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      if (canvas.width !== width || canvas.height !== height) {
        throw new Error('The requested image dimensions are too large for this browser.');
      }

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('The browser could not create a 2D canvas.');
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      return { canvas, context };
    }

    async function renderCropToBlob(cropRect, target, quality) {
      const { canvas, context } = createOutputCanvas(target.width, target.height);
      context.drawImage(
        state.sourceImage,
        cropRect.x,
        cropRect.y,
        cropRect.w,
        cropRect.h,
        0,
        0,
        target.width,
        target.height,
      );

      const blob = await window.AppUtils.canvasToWebpBlob(canvas, quality);
      return {
        blob,
        outputType: PREFERRED_OUTPUT_TYPE,
      };
    }

    async function createCompressedOutput(cropRect, settings, operationVersion) {
      const resolutions = window.AppGenerator.buildResolutionCandidates(
        cropRect,
        settings.maxWidth,
        settings.maxHeight,
      );

      const candidate = await window.AppGenerator.findCompressedCandidate({
        resolutions,
        qualities: window.AppGenerator.buildQualityCandidates(settings.quality),
        originalBytes: state.file.size,
        encodeCandidate: (dimensions, quality) => renderCropToBlob(cropRect, dimensions, quality),
        isCurrent: () => operationVersion === state.loadVersion,
      });

      if (operationVersion !== state.loadVersion) return null;

      if (candidate) {
        const encoded = await window.AppUtils.blobToBase64Url(candidate.blob);
        if (operationVersion !== state.loadVersion) return null;

        return {
          ...candidate,
          shareUrl: window.AppUtils.buildViewerUrl(encoded, candidate.outputType),
        };
      }

      if (state.file.size < MAX_OUTPUT_BYTES) {
        const encoded = await window.AppUtils.blobToBase64Url(state.file);
        const original = window.AppGenerator.buildOriginalFileMetadata(
          state.file,
          state.sourceImage,
        );

        return {
          ...original,
          shareUrl: window.AppUtils.buildViewerUrl(encoded, original.outputType),
        };
      }

      throw new CompressionLimitError();
    }

    async function compressAndEncode() {
      if (state.isCompressing || !state.file || !state.sourceImage) return;

      const cropRect = cropper.getCropRect();
      if (!cropRect) return;

      state.isCompressing = true;
      setCompressButtonState();
      resetCompressedOutput();
      setMessage('');

      try {
        const settings = readCompressionSettings();
        const operationVersion = state.loadVersion;
        const compressedOutput = await createCompressedOutput(cropRect, settings, operationVersion);
        if (!compressedOutput) return;

        const { blob, outputType, width, height, quality, isOriginalFallback, shareUrl } = compressedOutput;
        const objectUrl = URL.createObjectURL(blob);

        revokeObjectUrl('compressedObjectUrl');
        state.compressedObjectUrl = objectUrl;
        state.compressedShareUrl = shareUrl;
        state.compressedOutputType = outputType;
        state.compressedDimensions = `${width} x ${height}`;
        state.isOriginalFallback = isOriginalFallback;
        state.compressedDownloadName = getDownloadFilename(state.file.name, outputType);
        window.AppUtils.showImage(els.compressedPreview, els.compressedEmpty, objectUrl);

        const ratio =
          state.file.size > 0
            ? `${((blob.size / state.file.size) * 100).toFixed(1)}% of original`
            : '--';
        window.AppUtils.setMeta(els.compressedMeta, [
          window.AppUtils.formatBytes(blob.size),
          ratio,
          state.compressedDimensions,
          // outputType,
          // isOriginalFallback ? 'Original file' : formatCompressionQuality(quality, settings.quality),
        ]);
        setActionButtonState();
        setMessage(
          isOriginalFallback
            ? 'Original file kept: no smaller encoded output was available.'
            : `Compressed image ready as ${outputType}. Choose Copy URL or Download.`,
          {
            autoHideMs: COPY_SUCCESS_NOTIFICATION_TIMEOUT,
            variant: isOriginalFallback ? 'warning' : 'success',
          },
        );
      } catch (error) {
        setMessage(error.message || 'Compression failed.');
      } finally {
        state.isCompressing = false;
        setCompressButtonState();
      }
    }

    function clearAll() {
      state.loadVersion += 1;
      setMessage('');
      resetUploadOnly();
      resetCompressedOutput();
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    async function copyUrl() {
      const url = state.compressedShareUrl;
      if (!url) return;

      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable.');
        await navigator.clipboard.writeText(url);
        setMessage(COPY_SUCCESS_MESSAGE, {
          autoHideMs: COPY_SUCCESS_NOTIFICATION_TIMEOUT,
          variant: 'success',
        });
      } catch {
        const fallback = document.createElement('textarea');
        fallback.value = url;
        fallback.setAttribute('readonly', '');
        fallback.style.position = 'fixed';
        fallback.style.left = '-9999px';
        fallback.style.opacity = '0';
        document.body.appendChild(fallback);
        fallback.focus();
        fallback.select();

        try {
          if (!document.execCommand('copy')) throw new Error('Copy command failed.');
          setMessage(COPY_SUCCESS_MESSAGE, {
            autoHideMs: COPY_SUCCESS_NOTIFICATION_TIMEOUT,
            variant: 'success',
          });
        } catch {
          setMessage('Clipboard access was blocked. Please try again.');
        } finally {
          fallback.remove();
        }
      }
    }

    function downloadCompressedImage() {
      if (!state.compressedObjectUrl || !state.compressedDownloadName) return;

      const link = document.createElement('a');
      link.href = state.compressedObjectUrl;
      link.download = state.compressedDownloadName;
      link.setAttribute('aria-hidden', 'true');
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setMessage(`Downloaded ${state.compressedDownloadName}.`, {
        autoHideMs: COPY_SUCCESS_NOTIFICATION_TIMEOUT,
        variant: 'success',
      });
    }

    function updateQualityLabel() {
      const quality = Number(els.quality.value);
      els.qualityValue.textContent = Number.isFinite(quality) ? quality.toFixed(2) : '--';
    }

    els.fileInput.addEventListener('change', handleFileSelection);
    window.addEventListener('dragover', preventBrowserFileOpen, true);
    window.addEventListener('drop', preventBrowserFileOpen, true);
    els.dropZone.addEventListener('dragover', handleDragOver);
    els.dropZone.addEventListener('dragleave', handleDragLeave);
    els.dropZone.addEventListener('drop', handleDrop);
    els.compressButton.addEventListener('click', compressAndEncode);
    els.copyButton.addEventListener('click', copyUrl);
    els.downloadButton.addEventListener('click', downloadCompressedImage);
    els.clearButton.addEventListener('click', clearAll);
    els.quality.addEventListener('input', updateQualityLabel);
    window.addEventListener('beforeunload', () => {
      revokeObjectUrl('originalObjectUrl');
      revokeObjectUrl('compressedObjectUrl');
    });

    updateQualityLabel();
    cropper.bindEvents();
    setCompressButtonState();
  },
};
