'use strict';

function normalizeAppDomain(domain) {
  return String(domain || '')
    .trim()
    .replace(/\/+$/g, '');
}

function getDefaultAppDomain() {
  const { origin, pathname, protocol, href } = window.location;

  if (protocol === 'file:') {
    return String(href || '').replace(/\/(?:index|viewer)\.html(?:[?#].*)?$/i, '');
  }

  const directoryPath = String(pathname || '')
    .replace(/\/(?:index|viewer)\.html$/i, '')
    .replace(/\/+$/g, '');

  return `${origin}${directoryPath}`;
}

window.AppConfig = {
  APP_DOMAIN: getDefaultAppDomain(),

  getShareBaseUrl() {
    return `${normalizeAppDomain(this.APP_DOMAIN)}/`;
  },

  getViewerUrl() {
    return `${this.getShareBaseUrl()}viewer.html`;
  },

  applyDomainToDocument() {
    const canonical = document.querySelector('link[rel="canonical"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const structuredData = document.getElementById('appStructuredData');
    const pageType = document.body?.dataset.page;
    const pageUrl = pageType === 'viewer' ? this.getViewerUrl() : this.getShareBaseUrl();

    if (canonical) canonical.href = pageUrl;
    if (ogUrl) ogUrl.content = pageUrl;

    if (structuredData) {
      const data = JSON.parse(structuredData.textContent || '{}');
      data.url = this.getShareBaseUrl();
      structuredData.textContent = JSON.stringify(data, null, 2);
    }
  },
};
