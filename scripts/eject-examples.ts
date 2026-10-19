import { copyFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { manifest } from "./eject/manifest";

const cleanSelf = process.argv.includes("--clean-self");
const log = (msg: string) => console.log(`  ${msg}`);

console.log("Ejecting canonical examples…");

for (const path of manifest.remove) {
  rmSync(path, { recursive: true, force: true });
  log(`removed ${path}`);
}

for (const [real, pristine] of Object.entries(manifest.restore)) {
  copyFileSync(pristine, real);
  log(`restored ${real}`);
}

for (const { file, key } of manifest.jsonKeyRemovals) {
  const json = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  delete json[key];
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  log(`dropped "${key}" from ${file}`);
}

if (cleanSelf) {
  // Drop the eject:examples script from package.json (parse + rewrite; reformats to 2-space).
  const pkgPath = "package.json";
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  delete pkg.scripts?.["eject:examples"];
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  log('removed "eject:examples" from package.json');

  for (const path of manifest.selfCleanup) {
    rmSync(path, { recursive: true, force: true });
    log(`removed ${path}`);
  }
}

console.log(
  "Done. Run `pnpm check`. When you add your first table: `pnpm db:gen` → `pnpm db:reset` → `pnpm db:types`.",
);
