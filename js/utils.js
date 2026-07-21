'use strict';

const MESSAGE_VARIANTS = Object.freeze({
  error: ['border-red-200', 'bg-red-50', 'text-red-800'],
  success: ['border-emerald-200', 'bg-emerald-50', 'text-emerald-800'],
  warning: ['border-amber-200', 'bg-amber-50', 'text-amber-800'],
});
const MESSAGE_VARIANT_CLASSES = [...new Set(Object.values(MESSAGE_VARIANTS).flat())];
const messageTimers = new WeakMap();

window.AppUtils = {
  formatBytes(bytes) {
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
  },

  setMessage(element, text, { autoHideMs = 0, variant = 'error' } = {}) {
    if (!element) return;

    const previousTimer = messageTimers.get(element);
    if (previousTimer !== undefined) {
      window.clearTimeout(previousTimer);
      messageTimers.delete(element);
    }

    element.classList.remove(...MESSAGE_VARIANT_CLASSES);
    element.classList.add(...(MESSAGE_VARIANTS[variant] || MESSAGE_VARIANTS.error));
    element.textContent = text;
    element.classList.toggle('hidden', !text);

    if (!text || !Number.isFinite(autoHideMs) || autoHideMs <= 0 || typeof window.setTimeout !== 'function') {
      return;
    }

    const timer = window.setTimeout(() => {
      element.textContent = '';
      element.classList.add('hidden');
      messageTimers.delete(element);
    }, autoHideMs);
    messageTimers.set(element, timer);
  },

  setMeta(list, values) {
    if (!list) return;
    const fields = list.querySelectorAll('dd');
    values.forEach((value, index) => {
      if (fields[index]) fields[index].textContent = value;
    });
  },

  showImage(img, empty, url) {
    if (!img || !empty) return;
    img.src = url;
    img.classList.remove('hidden');
    empty.classList.add('hidden');
  },

  hideImage(img, empty) {
    if (!img || !empty) return;
    img.removeAttribute('src');
    img.classList.add('hidden');
    empty.classList.remove('hidden');
  },

  loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The selected file could not be read as an image.'));
      image.src = url;
    });
  },

  calculateTargetSize(width, height, maxWidth, maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio)),
    };
  },

  canvasToBlob(canvas, type, quality) {
    const requestedType = String(type || '').toLowerCase();

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('The browser could not create a compressed image.'));
            return;
          }

          const actualType = String(blob.type || '').toLowerCase();
          if (requestedType && actualType !== requestedType) {
            reject(new Error(`${requestedType} is not supported by this browser.`));
            return;
          }

          resolve(blob);
        },
        type,
        quality,
      );
    });
  },

  canvasToWebpBlob(canvas, quality) {
    return this.canvasToBlob(canvas, 'image/webp', quality);
  },

  blobToBase64Url(blob) {
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
  },

  base64UrlToBytes(encoded) {
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
  },

  buildShareUrl(encoded, type) {
    return this.buildViewerUrl(encoded, type);
  },

  buildViewerUrl(encoded, type) {
    const viewerUrl = new URL('viewer.html', window.location.href);
    viewerUrl.search = '';
    viewerUrl.hash = `img=${encoded}&type=${type}`;

    return viewerUrl.href;
  },
};
