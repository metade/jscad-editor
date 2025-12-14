import { readFile, writeFile } from "node:fs/promises";
import { minify } from "html-minifier-terser";

const input = "index.html";
const output = "build/index.html";

const html = await readFile(input, "utf8");

// Prepend the base URL to preview.js and styles.css
const baseUrl = "https://metade.github.io/jscad-editor/";
const htmlWithUrls = html
  .replace('src="preview.js"', `src="${baseUrl}preview.js"`)
  .replace('href="styles.css"', `href="${baseUrl}styles.css"`);

const min = await minify(htmlWithUrls, {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeEmptyAttributes: true,
  sortAttributes: true,
  sortClassName: true,
  minifyCSS: true,
  // Important: keep JS minification conservative for ESM modules
  minifyJS: {
    module: true,
    compress: true,
    mangle: false,
  },
});

await writeFile(output, min, "utf8");
console.log(`Wrote ${output}`);
