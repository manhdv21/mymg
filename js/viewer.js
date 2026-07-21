'use strict';

const MAX_VIEWER_URL_LENGTH = 2000;
const DEFAULT_IMAGE_TYPE = 'image/webp';
let activeViewer = null;

function parseImageHash(hash) {
  const rawHash = String(hash || '');
  const normalizedHash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
  if (!normalizedHash) return null;

  const params = new URLSearchParams(normalizedHash);
  const encoded = params.get('img');
  if (!encoded) return null;

  return {
    encoded,
    type: params.get('type') || DEFAULT_IMAGE_TYPE,
  };
}

function getPageType(configuredPageType, hash) {
  const pageType = String(configuredPageType || '');
  return pageType === 'generator' && parseImageHash(hash) ? 'viewer' : pageType;
}

function resolveElement(elementOrId) {
  if (!elementOrId) return null;
  if (typeof elementOrId !== 'string') return elementOrId;
  return document.getElementById(elementOrId);
}

function createViewer({
  previewId = 'decodedPreview',
  emptyId = 'decodedEmpty',
  messageId = 'message',
} = {}) {
  const els = {
    decodedPreview: resolveElement(previewId),
    decodedEmpty: resolveElement(emptyId),
    message: resolveElement(messageId),
  };

  const state = { decodedObjectUrl: '' };

  function resetDecodedOutput() {
    if (state.decodedObjectUrl) URL.revokeObjectURL(state.decodedObjectUrl);
    state.decodedObjectUrl = '';
    window.AppUtils.hideImage(els.decodedPreview, els.decodedEmpty);
  }

  function getDecodeFailureMessage(detail = '') {
    const urlLength = window.location.href.length;
    const limit = MAX_VIEWER_URL_LENGTH.toLocaleString();
    const sizeMessage =
      urlLength > MAX_VIEWER_URL_LENGTH
        ? `This URL is ${urlLength.toLocaleString()} characters long, above the ${limit}-character maximum supported for browser compatibility.`
        : `This URL is ${urlLength.toLocaleString()} characters long and within the ${limit}-character browser-compatibility limit. The image data may be corrupted or use an unsupported format.`;

    return `${detail ? `${detail} ` : ''}${sizeMessage}`;
  }

  function handleImageDecodeError(event) {
    if (event?.target?.src && event.target.src !== state.decodedObjectUrl) return;

    resetDecodedOutput();
    window.AppUtils.setMessage(els.message, getDecodeFailureMessage('The browser could not decode this image.'));
  }

  function decodeHash() {
    window.AppUtils.setMessage(els.message, '');

    const imageData = parseImageHash(window.location.hash);
    if (!imageData) {
      resetDecodedOutput();
      return;
    }

    try {
      const bytes = window.AppUtils.base64UrlToBytes(imageData.encoded);
      const blob = new Blob([bytes], { type: imageData.type });

      resetDecodedOutput();
      state.decodedObjectUrl = URL.createObjectURL(blob);
      window.AppUtils.showImage(els.decodedPreview, els.decodedEmpty, state.decodedObjectUrl);
    } catch (error) {
      resetDecodedOutput();
      window.AppUtils.setMessage(
        els.message,
        getDecodeFailureMessage(`Could not decode the URL hash. ${error.message}`),
      );
    }
  }

  function destroy() {
    window.removeEventListener('hashchange', decodeHash);
    els.decodedPreview?.removeEventListener('error', handleImageDecodeError);
    resetDecodedOutput();
  }

  if (!els.decodedPreview || !els.decodedEmpty) {
    return {
      refresh() { },
      reset() { },
      destroy() { },
    };
  }

  els.decodedPreview.addEventListener('error', handleImageDecodeError);
  window.addEventListener('hashchange', decodeHash);

  return {
    refresh: decodeHash,
    reset: resetDecodedOutput,
    destroy,
  };
}

window.AppViewer = {
  parseImageHash,
  getPageType,

  init(options) {
    activeViewer?.destroy();
    activeViewer = createViewer(options);
    activeViewer.refresh();
    return activeViewer;
  },

  reset() {
    activeViewer?.reset();
  },
};
