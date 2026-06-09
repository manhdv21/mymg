# Image Hash Share

A small frontend-only experiment for turning a tiny image into a shareable URL hash.

The app lets you upload, drag and drop, or paste an image, crop it with a mouse drag, resize and compress it in the browser, encode the compressed bytes as Base64URL, and generate a viewer-only URL. Opening that URL renders the image from the hash data.

## Files

- `index.html` - generator page with upload, drag and drop, clipboard paste, crop, compression, metadata, URL length warnings, and copy controls.
- `viewer.html` - viewer-only page that decodes the URL hash and renders just the image.
- `script.js` - tiny bootstrap file that starts the generator or viewer page.
- `js/config.js` - shared constants such as the GitHub Pages viewer base URL.
- `js/utils.js` - shared helpers for image loading, Base64URL, blobs, metadata, and DOM display.
- `js/cropper.js` - crop canvas drawing and border/handle drag behavior.
- `js/generator.js` - upload, drag/drop, paste, compression, and final URL generation.
- `js/viewer.js` - hash decode and viewer-only image rendering.
- `robots.txt` - search crawler rules that index the main app and avoid indexing hash viewer URLs.
- `sitemap.xml` - sitemap entry for the public GitHub Pages app URL.

## Run

Open `index.html` directly in a browser:

```text
mymg/index.html
```

No build step, backend, package install, or local server is required.

## How It Works

1. Select an image on `index.html`, drag and drop one into the upload area, or paste one from the clipboard with `Ctrl+V` / `Cmd+V`.
2. The browser reads the file locally and shows basic metadata.
3. Drag a border or corner on the original preview canvas to resize the crop. Drag inside the crop to move it.
4. A canvas resizes the selected crop using the selected max width, max height, and quality.
5. The canvas output is converted to a compressed `Blob`.
6. The blob is encoded into a Base64URL string.
7. The generated URL points to the GitHub Pages viewer with hash data:

```text
https://manhdv21.github.io/mymg/viewer.html#img=<encoded-data>&type=image/webp
```

8. `viewer.html` decodes the hash, creates a `Blob`, and renders the image with `URL.createObjectURL`.

## Limitations

Embedding image bytes directly in a URL is only practical for tiny images or thumbnails.

Generated URLs can become too long for browsers, messaging apps, email clients, and social platforms. The app warns when the URL is over 2,000 characters and shows a stronger warning over 8,000 characters.

Images are never uploaded to a server and are not stored in `localStorage`.

Drag-and-drop is handled on the page so dropped image files are loaded into the cropper instead of being opened by the browser as a new local file URL.

## Notes

The pages use vanilla HTML and JavaScript. Styling uses Tailwind utility classes loaded from the Tailwind CDN, so the visual styling requires network access when opening the files directly.
