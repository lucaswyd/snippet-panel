const fs = require("fs");
const path = require("path");

const src = path.join(
  __dirname,
  "..",
  "assets",
  "fonts",
  "SFPRODISPLAYMEDIUM.OTF"
);
const dir = path.join(__dirname, "..", "public", "fonts");
const dest = path.join(dir, "SFPRODISPLAYMEDIUM.OTF");

if (fs.existsSync(src)) {
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, dest);
} else {
  console.warn(
    "sync-public-font: SFPRODISPLAYMEDIUM.OTF missing in assets/fonts — UI falls back to system fonts"
  );
}
