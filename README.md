# Image Hash Share

Image Hash Share is a browser-only tool for cropping and compressing an image, then creating a viewer URL that stores the image data in the URL hash. Images stay in the browser and are never uploaded.

## Project structure

- `index.html` - image upload, crop, compression, preview, copy, and download UI.
- `viewer.html` - viewer-only page that decodes and displays a shared image.
- `script.js` - shared bootstrap that initializes the current page.
- `js/config.js` - resolves the application URL and updates page metadata at runtime.
- `js/utils.js` - shared image, Canvas, Base64URL, Blob, metadata, and DOM helpers.
- `js/cropper.js` - crop canvas rendering and drag behavior.
- `js/generator.js` - upload handling, crop output, WebP compression, fallback handling, and URL generation.
- `js/viewer.js` - MIME-aware hash decoding and image rendering.
- `js/snow-decor.js` - lightweight canvas decoration used by both pages.
- `robots.txt` and `sitemap.xml` - crawler rules and sitemap metadata.

## Run locally

No package installation or build step is required. Serve the repository with any static web server:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8000/>.

The pages can also be opened directly from the filesystem. The Tailwind Play CDN used by the UI still needs network access to load the styles.

## How it works

1. Choose an image or drag it into the upload area.
2. Move or resize the crop on the original preview.
3. Set the maximum width, maximum height, and quality.
4. Select `Compress`. The app draws the crop with Canvas 2D, tries WebP candidates across the resolution ladder `1920 → 1600 → 1280 → 1024 → 800 → 640 → 480`, and lowers quality in `0.05` steps when needed.
5. A compressed candidate is accepted only when it is strictly smaller than both the source file and `300 KB`. The image is never upscaled.
6. If no smaller WebP candidate is available and the original file is already below `300 KB`, the original file is kept. Its MIME type is preserved for the download and viewer URL.
7. `Copy URL` creates a link in this form:

   ```text
   <app-url>/viewer.html#img=<encoded-data>&type=<output-mime-type>
   ```

8. `viewer.html` reconstructs the image Blob from the hash and displays it.

## Limitations

Image bytes embedded in a URL are practical mainly for small images or thumbnails. Long hashes may exceed limits imposed by browsers, messaging apps, or other sharing tools.

The app does not use a backend or `localStorage`. The URL hash is the only place where the generated image data is stored.

`robots.txt` and `sitemap.xml` currently use the `${APP_DOMAIN}` placeholder. Replace it with the deployed site URL when publishing the static site.
