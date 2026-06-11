'use strict';

function normalizeAppDomain(domain) {
  return String(domain || '')
    .trim()
    .replace(/\/+$/g, '');
}

function parseEnv(text) {
  return String(text || '')
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return env;

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex < 0) return env;

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      env[key] = value;
      return env;
    }, {});
}

function getDefaultAppDomain() {
  const { origin, pathname, protocol } = window.location;
  const directoryPath = pathname.replace(/\/(?:index|viewer)\.html$/i, '').replace(/\/+$/g, '');

  if (protocol === 'file:') {
    return window.location.href.replace(/\/(?:index|viewer)\.html(?:[?#].*)?$/i, '');
  }

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
    const appUrl = document.getElementById('appStructuredData');
    const viewerUrlExample = document.getElementById('viewerUrlExample');
    const pageType = document.body.dataset.page;
    const pageUrl = pageType === 'viewer' ? this.getViewerUrl() : this.getShareBaseUrl();

    if (canonical) canonical.href = pageUrl;
    if (ogUrl) ogUrl.content = pageUrl;
    if (viewerUrlExample) viewerUrlExample.textContent = `${this.getViewerUrl()}#img=...`;

    if (appUrl) {
      const data = JSON.parse(appUrl.textContent);
      data.url = this.getShareBaseUrl();
      appUrl.textContent = JSON.stringify(data, null, 8);
    }
  },

  async loadEnv() {
    if (!window.fetch) return;

    try {
      const response = await fetch('.env', { cache: 'no-store' });
      if (!response.ok) return;

      const env = parseEnv(await response.text());
      if (env.APP_DOMAIN) {
        this.APP_DOMAIN = normalizeAppDomain(env.APP_DOMAIN);
      }
    } catch {
      // Opening the app from file:// cannot fetch .env, so keep the fallback value.
    }
  },
};
