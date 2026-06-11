'use strict';

(async function bootstrap() {
  window.AppSnowDecor?.init();

  await window.AppConfig.loadEnv();
  window.AppConfig.applyDomainToDocument();

  const pageType = document.body.dataset.page;

  if (pageType === 'generator') {
    window.AppGenerator.init();
  } else if (pageType === 'viewer') {
    window.AppViewer.init();
  }
})();
