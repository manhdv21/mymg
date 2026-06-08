# Image Hash Share

A small frontend-only experiment for turning a tiny image into a shareable URL hash.

The app lets you upload an image, resize and compress it in the browser, encode the compressed bytes as Base64URL, and generate a viewer-only URL. Opening that URL renders the image from the hash data.

## Files

- `index.html` - generator page with upload, compression, metadata, URL length warnings, and copy controls.
- `viewer.html` - viewer-only page that decodes the URL hash and renders just the image.
- `script.js` - shared vanilla JavaScript for compression, Base64URL encoding, decoding, and UI behavior.

## Run

Open `index.html` directly in a browser:

```text
file:///Users/manhdo/Documents/mymg/index.html
```

No build step, backend, package install, or local server is required.

## How It Works

1. Select an image on `index.html`.
2. The browser reads the file locally and shows basic metadata.
3. A canvas resizes the image using the selected max width, max height, and quality.
4. The canvas output is converted to a compressed `Blob`.
5. The blob is encoded into a Base64URL string.
6. The generated URL points to the GitHub Pages viewer with hash data:

```text
https://manhdv21.github.io/mymg/viewer.html#img=<encoded-data>&type=image/webp
```

7. `viewer.html` decodes the hash, creates a `Blob`, and renders the image with `URL.createObjectURL`.

## Limitations

Embedding image bytes directly in a URL is only practical for tiny images or thumbnails.

Generated URLs can become too long for browsers, messaging apps, email clients, and social platforms. The app warns when the URL is over 2,000 characters and shows a stronger warning over 8,000 characters.

Images are never uploaded to a server and are not stored in `localStorage`.

## Notes

The pages use vanilla HTML and JavaScript. Styling uses Tailwind utility classes loaded from the Tailwind CDN, so the visual styling requires network access when opening the files directly.
