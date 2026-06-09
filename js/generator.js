'use strict';

window.AppGenerator = {
  init() {
    const els = {
      fileInput: document.getElementById('fileInput'),
      dropZone: document.getElementById('dropZone'),
      pasteButton: document.getElementById('pasteButton'),
      cropCanvas: document.getElementById('cropCanvas'),
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
      message: document.getElementById('message'),
    };

    const state = {
      file: null,
      originalObjectUrl: '',
      compressedObjectUrl: '',
      sourceImage: null,
    };

    const cropper = window.AppCropper({
      canvas: els.cropCanvas,
      empty: els.originalEmpty,
      meta: els.originalMeta,
      getFile: () => state.file,
      getSourceImage: () => state.sourceImage,
    });

    function revokeObjectUrl(key) {
      if (state[key]) {
        URL.revokeObjectURL(state[key]);
        state[key] = '';
      }
    }

    function setMessage(text) {
      window.AppUtils.setMessage(els.message, text);
    }

    function updateLengthWarning(url) {
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

    function updateShareUrl(url) {
      els.shareUrl.value = url;
      els.copyButton.disabled = !url;
      updateLengthWarning(url);
    }

    function resetCompressedOutput() {
      revokeObjectUrl('compressedObjectUrl');
      window.AppUtils.hideImage(els.compressedPreview, els.compressedEmpty);
      window.AppUtils.setMeta(els.compressedMeta, ['--', '--', '--']);
    }

    function resetUploadOnly() {
      revokeObjectUrl('originalObjectUrl');
      state.file = null;
      state.sourceImage = null;
      els.compressButton.disabled = true;
      els.fileInput.value = '';
      cropper.hide();
      cropper.updateMeta();
    }

    async function loadSourceFile(file) {
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
        state.sourceImage = await window.AppUtils.loadImageFromUrl(state.originalObjectUrl);
        cropper.resetToFullImage();
        cropper.show();
        cropper.draw();
        cropper.updateMeta();
        els.compressButton.disabled = false;
      } catch (error) {
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

    async function handlePaste(event) {
      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));

      if (!imageItem) return;
      event.preventDefault();
      await loadSourceFile(imageItem.getAsFile());
    }

    async function requestClipboardImage() {
      setMessage('Press Ctrl+V or Cmd+V to paste an image from your clipboard.');

      if (!navigator.clipboard?.read) return;

      try {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          const imageType = item.types.find((type) => type.startsWith('image/'));
          if (!imageType) continue;

          const blob = await item.getType(imageType);
          const file = new File([blob], 'clipboard-image', { type: blob.type || imageType });
          await loadSourceFile(file);
          return;
        }

        setMessage('The clipboard does not contain an image.');
      } catch {
        setMessage('Clipboard read was blocked. Click the page, then press Ctrl+V or Cmd+V.');
      }
    }

    async function compressAndEncode() {
      if (!state.file || !state.sourceImage || !cropper.getCropRect()) return;
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
        const cropRect = cropper.getCropRect();
        const target = window.AppUtils.calculateTargetSize(
          cropRect.w,
          cropRect.h,
          maxWidth,
          maxHeight,
        );
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.width = target.width;
        canvas.height = target.height;
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

        const requestedType = els.outputType.value;
        const blob = await window.AppUtils.canvasToBlob(canvas, requestedType, quality);
        const encoded = await window.AppUtils.blobToBase64Url(blob);
        const viewerUrl = window.AppUtils.buildViewerUrl(encoded, blob.type || requestedType);

        revokeObjectUrl('compressedObjectUrl');
        state.compressedObjectUrl = URL.createObjectURL(blob);
        window.AppUtils.showImage(els.compressedPreview, els.compressedEmpty, state.compressedObjectUrl);

        const ratio =
          state.file.size > 0
            ? `${((blob.size / state.file.size) * 100).toFixed(1)}% of original`
            : '--';
        window.AppUtils.setMeta(els.compressedMeta, [
          window.AppUtils.formatBytes(blob.size),
          ratio,
          blob.type || requestedType,
        ]);
        updateShareUrl(viewerUrl);
      } catch (error) {
        setMessage(error.message || 'Compression failed.');
      }
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

    els.fileInput.addEventListener('change', handleFileSelection);
    window.addEventListener('dragover', preventBrowserFileOpen, true);
    window.addEventListener('drop', preventBrowserFileOpen, true);
    els.dropZone.addEventListener('dragover', handleDragOver);
    els.dropZone.addEventListener('dragleave', handleDragLeave);
    els.dropZone.addEventListener('drop', handleDrop);
    els.pasteButton.addEventListener('click', requestClipboardImage);
    els.compressButton.addEventListener('click', compressAndEncode);
    els.copyButton.addEventListener('click', copyUrl);
    els.clearButton.addEventListener('click', clearAll);
    els.quality.addEventListener('input', () => {
      els.qualityValue.textContent = Number(els.quality.value).toFixed(2);
    });
    window.addEventListener('paste', handlePaste);
    cropper.bindEvents();
  },
};
