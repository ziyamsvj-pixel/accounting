#!/usr/bin/env node
/**
 * Governance Check
 * 1) هر تغییر کد باید با به‌روزرسانی CHANGELOG_AI_HUMAN.md همراه باشد.
 * 2) توضیحات Pull Request باید بخش‌های الزامی را داشته باشد.
 */
import { execSync } from "node:child_process";

const CHANGELOG = "CHANGELOG_AI_HUMAN.md";
const REQUIRED_SECTIONS = ["What changed", "Why", "Risk"];
const CODE_DIRS = ["src/", "scripts/", "public/"];

const baseSha = process.env.BASE_SHA;
const headSha = process.env.HEAD_SHA;
const prBody = process.env.PR_BODY || "";

const errors = [];

let files = [];
if (baseSha && headSha) {
  try {
    files = execSync(`git diff --name-only ${baseSha} ${headSha}`, {
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch (err) {
    console.warn(`Could not compute diff: ${err.message}`);
  }
}

const touchedCode = files.some((f) => CODE_DIRS.some((d) => f.startsWith(d)));
const touchedChangelog = files.includes(CHANGELOG);

if (touchedCode && !touchedChangelog) {
  errors.push(`Code changed but ${CHANGELOG} was not updated.`);
}

const missing = REQUIRED_SECTIONS.filter(
  (s) => !prBody.toLowerCase().includes(s.toLowerCase()),
);
if (missing.length > 0) {
  errors.push(`PR description is missing: ${missing.join(", ")}.`);
}

if (errors.length > 0) {
  console.error("Governance check failed:");
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

console.log("Governance check passed.");
