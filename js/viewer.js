'use strict';

window.AppViewer = {
  init() {
    const els = {
      decodedPreview: document.getElementById('decodedPreview'),
      decodedEmpty: document.getElementById('decodedEmpty'),
      message: document.getElementById('message'),
    };
    const state = { decodedObjectUrl: '' };

    function resetDecodedOutput() {
      if (state.decodedObjectUrl) URL.revokeObjectURL(state.decodedObjectUrl);
      state.decodedObjectUrl = '';
      window.AppUtils.hideImage(els.decodedPreview, els.decodedEmpty);
    }

    function decodeHash() {
      window.AppUtils.setMessage(els.message, '');

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

        const bytes = window.AppUtils.base64UrlToBytes(encoded);
        const blob = new Blob([bytes], { type });

        resetDecodedOutput();
        state.decodedObjectUrl = URL.createObjectURL(blob);
        window.AppUtils.showImage(els.decodedPreview, els.decodedEmpty, state.decodedObjectUrl);
      } catch (error) {
        resetDecodedOutput();
        window.AppUtils.setMessage(els.message, `Could not decode the URL hash. ${error.message}`);
      }
    }

    window.addEventListener('hashchange', decodeHash);
    decodeHash();
  },
};
