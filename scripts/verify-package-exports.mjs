import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(process.cwd());

const packageDirs = [
  "packages/engine",
  "packages/lunchtable-tcg-cards",
  "packages/lunchtable-tcg-guilds",
  "packages/lunchtable-tcg-match",
  "packages/lunchtable-tcg-story",
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function collectExportTargets(value, output = new Set()) {
  if (typeof value === "string") {
    output.add(value);
    return output;
  }

  if (!value || typeof value !== "object") {
    return output;
  }

  for (const nestedValue of Object.values(value)) {
    collectExportTargets(nestedValue, output);
  }

  return output;
}

const missing = [];

for (const packageDir of packageDirs) {
  console.log(`\n[exports-check] Building ${packageDir}`);
  run("bun", ["run", "--cwd", packageDir, "clean"]);
  run("bun", ["run", "--cwd", packageDir, "build"]);

  const packageJsonPath = join(repoRoot, packageDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const exportsField = packageJson.exports ?? {};
  const targets = [...collectExportTargets(exportsField)];

  for (const target of targets) {
    if (typeof target !== "string") continue;
    if (!target.startsWith("./")) continue;

    const absoluteTarget = join(repoRoot, packageDir, target.slice(2));
    if (!existsSync(absoluteTarget)) {
      missing.push(`${packageDir}/${target}`);
    }
  }
}

if (missing.length > 0) {
  console.error("\n[exports-check] Missing export targets:");
  for (const entry of missing) {
    console.error(`  - ${entry}`);
  }
  process.exit(1);
}

console.log("\n[exports-check] All package export targets exist.");
