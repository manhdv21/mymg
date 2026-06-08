'use strict';

const pageType = document.body.dataset.page;
const SHARE_BASE_URL = 'https://manhdv21.github.io/mymg/';

const state = {
  file: null,
  originalObjectUrl: '',
  compressedObjectUrl: '',
  decodedObjectUrl: '',
};

const els = {
  fileInput: document.getElementById('fileInput'),
  originalPreview: document.getElementById('originalPreview'),
  originalEmpty: document.getElementById('originalEmpty'),
  originalMeta: document.getElementById('originalMeta'),
  maxWidth: document.getElementById('maxWidth'),
  maxHeight: document.getElementById('maxHeight'),
  outputType: document.getElementById('outputType'),
  quality: document.getElementById('quality'),
  qualityValue: document.getElementById('qualityValue'),
  compressButton: document.getElementById('compressButton'),
  compressedPreview: document.getElementById('compressedPreview'),
  compressedEmpty: document.getElementById('compressedEmpty'),
  compressedMeta: document.getElementById('compressedMeta'),
  shareUrl: document.getElementById('shareUrl'),
  copyButton: document.getElementById('copyButton'),
  clearButton: document.getElementById('clearButton'),
  urlLength: document.getElementById('urlLength'),
  lengthWarning: document.getElementById('lengthWarning'),
  decodedPreview: document.getElementById('decodedPreview'),
  decodedEmpty: document.getElementById('decodedEmpty'),
  decodedMeta: document.getElementById('decodedMeta'),
  message: document.getElementById('message'),
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '--';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function setMessage(text) {
  if (!els.message) return;
  els.message.textContent = text;
  els.message.classList.toggle('hidden', !text);
}

function setMeta(list, values) {
  if (!list) return;
  const fields = list.querySelectorAll('dd');
  values.forEach((value, index) => {
    if (fields[index]) fields[index].textContent = value;
  });
}

function revokeObjectUrl(key) {
  if (state[key]) {
    URL.revokeObjectURL(state[key]);
    state[key] = '';
  }
}

function showImage(img, empty, url) {
  img.src = url;
  img.classList.remove('hidden');
  empty.classList.add('hidden');
}

function hideImage(img, empty) {
  if (!img || !empty) return;
  img.removeAttribute('src');
  img.classList.add('hidden');
  empty.classList.remove('hidden');
}

function readImageDimensions(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight, image });
    image.onerror = () => reject(new Error('The selected file could not be read as an image.'));
    image.src = url;
  });
}

function calculateTargetSize(width, height, maxWidth, maxHeight) {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('The browser could not create a compressed image.'));
      },
      type,
      quality,
    );
  });
}

function blobToBase64Url(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const commaIndex = dataUrl.indexOf(',');
      const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
      resolve(base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''));
    };
    reader.onerror = () => reject(new Error('The compressed image could not be encoded.'));
    reader.readAsDataURL(blob);
  });
}

function base64UrlToBytes(encoded) {
  if (!/^[A-Za-z0-9_-]*$/.test(encoded)) {
    throw new Error('The image hash contains characters that are not valid Base64URL data.');
  }

  const padding = '='.repeat((4 - (encoded.length % 4)) % 4);
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function updateLengthWarning(url) {
  if (!els.urlLength || !els.lengthWarning) return;

  const length = url.length;
  els.urlLength.textContent = `${length.toLocaleString()} characters`;
  els.lengthWarning.classList.toggle('hidden', length <= 2000);
  els.lengthWarning.classList.toggle('bg-red-50', length > 8000);
  els.lengthWarning.classList.toggle('text-red-800', length > 8000);
  els.lengthWarning.classList.toggle('bg-amber-50', length <= 8000);
  els.lengthWarning.classList.toggle('text-amber-800', length <= 8000);

  if (length > 8000) {
    els.lengthWarning.textContent =
      'Strong warning: this URL is over 8,000 characters and is likely to fail in many browsers or sharing tools.';
  } else if (length > 2000) {
    els.lengthWarning.textContent =
      'Warning: this URL is over 2,000 characters and may be too long for some places.';
  } else {
    els.lengthWarning.textContent = '';
  }
}

function buildViewerUrl(encoded, type) {
  return `${SHARE_BASE_URL}viewer.html#img=${encoded}&type=${type}`;
}

function updateShareUrl(url) {
  if (!els.shareUrl || !els.copyButton) return;
  els.shareUrl.value = url;
  els.copyButton.disabled = !url;
  updateLengthWarning(url);
}

async function handleFileSelection(event) {
  const [file] = event.target.files;
  resetCompressedOutput();
  updateShareUrl('');
  setMessage('');

  if (!file) return;
  if (!file.type.startsWith('image/')) {
    setMessage('Please choose an image file.');
    resetUploadOnly();
    return;
  }

  revokeObjectUrl('originalObjectUrl');
  state.file = file;
  state.originalObjectUrl = URL.createObjectURL(file);

  try {
    const { width, height } = await readImageDimensions(state.originalObjectUrl);
    showImage(els.originalPreview, els.originalEmpty, state.originalObjectUrl);
    setMeta(els.originalMeta, [
      formatBytes(file.size),
      `${width} x ${height}`,
      file.type || 'Unknown',
    ]);
    els.compressButton.disabled = false;
  } catch (error) {
    setMessage(error.message);
    resetUploadOnly();
  }
}

async function compressAndEncode() {
  if (!state.file || !state.originalObjectUrl) return;
  setMessage('');

  const maxWidth = Number(els.maxWidth.value);
  const maxHeight = Number(els.maxHeight.value);
  const quality = Number(els.quality.value);

  if (
    !Number.isFinite(maxWidth) ||
    !Number.isFinite(maxHeight) ||
    maxWidth < 16 ||
    maxHeight < 16
  ) {
    setMessage('Max width and height must be at least 16 pixels.');
    return;
  }

  try {
    const { image } = await readImageDimensions(state.originalObjectUrl);
    const target = calculateTargetSize(
      image.naturalWidth,
      image.naturalHeight,
      maxWidth,
      maxHeight,
    );
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = target.width;
    canvas.height = target.height;
    context.drawImage(image, 0, 0, target.width, target.height);

    const requestedType = els.outputType.value;
    const blob = await canvasToBlob(canvas, requestedType, quality);
    const encoded = await blobToBase64Url(blob);
    const viewerUrl = buildViewerUrl(encoded, blob.type || requestedType);

    if (!viewerUrl) {
      throw new Error('The viewer URL could not be generated.');
    }

    revokeObjectUrl('compressedObjectUrl');
    state.compressedObjectUrl = URL.createObjectURL(blob);
    showImage(els.compressedPreview, els.compressedEmpty, state.compressedObjectUrl);

    const ratio =
      state.file.size > 0
        ? `${((blob.size / state.file.size) * 100).toFixed(1)}% of original`
        : '--';
    setMeta(els.compressedMeta, [formatBytes(blob.size), ratio, blob.type || requestedType]);
    updateShareUrl(viewerUrl);
  } catch (error) {
    setMessage(error.message || 'Compression failed.');
  }
}

function decodeHash() {
  setMessage('');

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!hash) {
    resetDecodedOutput();
    return;
  }

  try {
    const params = new URLSearchParams(hash);
    const encoded = params.get('img');
    const type = params.get('type') || 'image/webp';

    if (!encoded) {
      resetDecodedOutput();
      return;
    }

    const bytes = base64UrlToBytes(encoded);
    const blob = new Blob([bytes], { type });

    revokeObjectUrl('decodedObjectUrl');
    state.decodedObjectUrl = URL.createObjectURL(blob);
    showImage(els.decodedPreview, els.decodedEmpty, state.decodedObjectUrl);
    setMeta(els.decodedMeta, [formatBytes(blob.size), type]);
  } catch (error) {
    resetDecodedOutput();
    setMessage(`Could not decode the URL hash. ${error.message}`);
  }
}

function resetUploadOnly() {
  revokeObjectUrl('originalObjectUrl');
  state.file = null;
  els.compressButton.disabled = true;
  els.fileInput.value = '';
  hideImage(els.originalPreview, els.originalEmpty);
  setMeta(els.originalMeta, ['--', '--', '--']);
}

function resetCompressedOutput() {
  revokeObjectUrl('compressedObjectUrl');
  hideImage(els.compressedPreview, els.compressedEmpty);
  setMeta(els.compressedMeta, ['--', '--', '--']);
}

function resetDecodedOutput() {
  revokeObjectUrl('decodedObjectUrl');
  hideImage(els.decodedPreview, els.decodedEmpty);
  setMeta(els.decodedMeta, ['--', '--']);
}

function clearAll() {
  setMessage('');
  resetUploadOnly();
  resetCompressedOutput();
  updateShareUrl('');
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

async function copyUrl() {
  if (!els.shareUrl.value) return;

  try {
    await navigator.clipboard.writeText(els.shareUrl.value);
    setMessage('URL copied to the clipboard.');
  } catch {
    els.shareUrl.focus();
    els.shareUrl.select();
    setMessage('Clipboard access was blocked. The URL is selected so you can copy it manually.');
  }
}

function initGenerator() {
  els.fileInput.addEventListener('change', handleFileSelection);
  els.compressButton.addEventListener('click', compressAndEncode);
  els.copyButton.addEventListener('click', copyUrl);
  els.clearButton.addEventListener('click', clearAll);
  els.quality.addEventListener('input', () => {
    els.qualityValue.textContent = Number(els.quality.value).toFixed(2);
  });
}

function initViewer() {
  window.addEventListener('hashchange', decodeHash);
  decodeHash();
}

if (pageType === 'generator') {
  initGenerator();
} else if (pageType === 'viewer') {
  initViewer();
}
