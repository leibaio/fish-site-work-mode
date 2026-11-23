import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const site = process.argv[2] || "linuxdo";

const sites = {
  linuxdo: {
    name: "摸鱼工作模式 · linux.do",
    matches: ["https://linux.do/*", "https://www.linux.do/*"],
    description: "把 linux.do 变成工作台：左栏话题、中间阅读区、右侧运行日志，支持工作目录伪装。",
  },
  v2ex: {
    name: "摸鱼工作模式 · V2EX",
    matches: ["https://v2ex.com/*", "https://www.v2ex.com/*"],
    description: "把 V2EX 变成工作台：左栏话题、中间阅读区、右侧运行日志，支持工作目录伪装。",
  },
};

const meta = sites[site];
if (!meta) {
  throw new Error(`Unknown site: ${site}`);
}

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const repoUrl = "https://github.com/leibaio/fish-site-work-mode";
const rawUrl = "https://raw.githubusercontent.com/leibaio/fish-site-work-mode/main/dist";
const entry = path.join(root, "packages", "adapters", site, "src", "index.ts");
const outdir = path.join(root, "dist");
await mkdir(outdir, { recursive: true });

const banner = `// ==UserScript==
// @name         ${meta.name}
// @namespace    fish-site-work-mode
// @version      ${pkg.version}
// @description  ${meta.description}
// @author       leibaio
// @license      MIT
// @homepageURL  ${repoUrl}
// @supportURL   ${repoUrl}/issues
// @updateURL    ${rawUrl}/${site}-work-mode.user.js
// @downloadURL  ${rawUrl}/${site}-work-mode.user.js
${meta.matches.map((match) => `// @match        ${match}`).join("\n")}
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @noframes
// ==/UserScript==

`;

const outfile = path.join(outdir, `${site}-work-mode.user.js`);
await build({
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  charset: "utf8",
  banner: { js: banner },
  legalComments: "none",
  minify: false,
  outfile,
  logLevel: "info",
});

console.log(`built ${path.relative(root, outfile)}`);