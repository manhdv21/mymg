'use strict';

(function bootstrap() {
  window.AppConfig.applyDomainToDocument();
  window.AppSnowDecor?.init();

  const pageType = document.body?.dataset.page;
  if (pageType === 'generator') {
    window.AppGenerator.init();
  } else if (pageType === 'viewer') {
    window.AppViewer.init();
  }
})();
