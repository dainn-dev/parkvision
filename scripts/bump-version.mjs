#!/usr/bin/env node
/**
 * Bump one ParkVision client independently.
 *
 *   node scripts/bump-version.mjs edge patch|minor|major|x.y.z
 *   node scripts/bump-version.mjs mobile patch|minor|major|x.y.z
 *
 * Edge updates its package metadata and Rust crate version. Mobile updates
 * its package metadata, Android versionName, and always increments versionCode
 * by one. The two apps never share a version.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function nextVersion(current, change) {
  const match = SEMVER.exec(current);
  if (!match) throw new Error(`current version must be x.y.z, got ${current}`);
  if (SEMVER.test(change)) return change;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (change === "major") return `${major + 1}.0.0`;
  if (change === "minor") return `${major}.${minor + 1}.0`;
  if (change === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error("change must be patch, minor, major, or x.y.z");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceOnce(path, pattern, replacement) {
  const text = readFileSync(path, "utf8");
  if (!pattern.test(text)) throw new Error(`pattern not found in ${path}`);
  writeFileSync(path, text.replace(pattern, replacement));
}

function bumpPackage(directory, version) {
  const packagePath = join(directory, "package.json");
  const pkg = readJson(packagePath);
  pkg.version = version;
  writeJson(packagePath, pkg);

  const lockPath = join(directory, "package-lock.json");
  const lock = readJson(lockPath);
  lock.version = version;
  if (lock.packages?.[""]) lock.packages[""].version = version;
  writeJson(lockPath, lock);
}

function bumpEdge(version) {
  const directory = join(ROOT, "edge-client");
  bumpPackage(directory, version);
  const tauriConfigPath = join(directory, "src-tauri/tauri.conf.json");
  const tauriConfig = readJson(tauriConfigPath);
  tauriConfig.version = version;
  writeJson(tauriConfigPath, tauriConfig);
  replaceOnce(join(directory, "src-tauri/Cargo.toml"), /^version = "[^"]+"/m, `version = "${version}"`);
  replaceOnce(
    join(directory, "src-tauri/Cargo.lock"),
    /(name = "parkvision-edge"\r?\nversion = )"[^"]+"/,
    `$1"${version}"`,
  );
}

function bumpMobile(version) {
  const directory = join(ROOT, "mobile");
  bumpPackage(directory, version);
  const gradle = join(directory, "android/app/build.gradle");
  const text = readFileSync(gradle, "utf8");
  const code = text.match(/versionCode (\d+)/);
  if (!code) throw new Error("versionCode not found");
  writeFileSync(
    gradle,
    text
      .replace(/versionCode \d+/, `versionCode ${Number(code[1]) + 1}`)
      .replace(/versionName "[^"]+"/, `versionName "${version}"`),
  );
}

const [app, change] = process.argv.slice(2);
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!["edge", "mobile"].includes(app) || !change) {
    console.error("usage: node scripts/bump-version.mjs edge|mobile patch|minor|major|x.y.z");
    process.exit(2);
  }
  const packagePath = join(ROOT, app === "edge" ? "edge-client" : "mobile", "package.json");
  const version = nextVersion(readJson(packagePath).version, change);
  if (app === "edge") bumpEdge(version);
  else bumpMobile(version);
  console.log(`${app} ${version}`);
}
