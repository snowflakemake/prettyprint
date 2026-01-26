#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");

const projectRoot = path.resolve(__dirname, "..");
const pkgPath = path.join(projectRoot, "package.json");
const srcRoot = path.join(projectRoot, "src");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const dependencies = new Set(Object.keys(pkg.dependencies || {}));

const builtins = new Set(
  Module.builtinModules.map((name) => (name.startsWith("node:") ? name.slice(5) : name))
);
builtins.add("vscode");

const importRegexes = [
  /\bimport\s+(?:[^'"]+from\s+)?["']([^"']+)["']/g,
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
];

function getAllTsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsFiles(full));
    } else if (entry.isFile() && full.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

function extractModules(code) {
  const modules = new Set();
  for (const regex of importRegexes) {
    let match;
    while ((match = regex.exec(code)) !== null) {
      modules.add(match[1]);
    }
  }
  return modules;
}

function isExternal(name) {
  if (!name) return false;
  if (name.startsWith(".") || name.startsWith("/")) return false;
  const cleaned = name.startsWith("node:") ? name.slice(5) : name;
  const [base] = cleaned.split("/");
  if (builtins.has(base)) return false;
  return true;
}

const missing = new Set();
const files = fs.existsSync(srcRoot) ? getAllTsFiles(srcRoot) : [];
for (const file of files) {
  const code = fs.readFileSync(file, "utf8");
  for (const mod of extractModules(code)) {
    if (!isExternal(mod)) continue;
    const base = mod.startsWith("@") ? mod.split("/").slice(0, 2).join("/") : mod.split("/")[0];
    if (!dependencies.has(base)) {
      missing.add(base);
    }
  }
}

if (missing.size > 0) {
  console.error("Missing runtime dependencies in package.json:");
  for (const name of [...missing].sort()) {
    console.error(`- ${name}`);
  }
  process.exit(1);
} else {
  console.log("Runtime dependency check passed.");
}
