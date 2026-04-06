/**
 * Build-time: merge snippets/*.json into public/data/snippets.json for static serving
 * at /data/snippets.json (no GitHub API; CDN-friendly).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const snippetDir = path.join(root, "snippets");
const outDir = path.join(root, "public", "data");
const outFile = path.join(outDir, "snippets.json");

fs.mkdirSync(outDir, { recursive: true });

const empty = () => {
  fs.writeFileSync(
    outFile,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      snippets: [],
    })
  );
  console.log("bundle-snippets: wrote empty snippets.json (no snippets/ dir)");
};

if (!fs.existsSync(snippetDir) || !fs.statSync(snippetDir).isDirectory()) {
  empty();
  process.exit(0);
}

const files = fs.readdirSync(snippetDir).filter((f) => f.endsWith(".json"));
const snippets = [];
for (const f of files) {
  try {
    const raw = fs.readFileSync(path.join(snippetDir, f), "utf8");
    snippets.push(JSON.parse(raw));
  } catch (e) {
    console.warn(`bundle-snippets: skip ${f}:`, e?.message ?? e);
  }
}

fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      snippets,
    },
    null,
    2
  )
);
console.log(
  `bundle-snippets: wrote ${snippets.length} snippets -> public/data/snippets.json`
);
