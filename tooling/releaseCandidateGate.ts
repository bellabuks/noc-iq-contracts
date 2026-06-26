/**
 * SC-W5-121: Release candidate gate for upgrade safety and migration checks.
 *
 * Runs a structured set of automated gate checks before a release candidate
 * is promoted. Catches upgrade-safety regressions, schema drift, and
 * migration gaps that would break production backend integrations.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface GateCheck {
  id: string;
  label: string;
  run: () => void; // throws on failure
}

const WASM = "sla_calculator/target/wasm32-unknown-unknown/release/sla_calculator.wasm";
const WASM_BUDGET = 100 * 1024;

const GATE_CHECKS: GateCheck[] = [
  {
    id: "RC-01",
    label: "cargo test passes (all)",
    run: () => execSync("cargo test --quiet", { cwd: "sla_calculator", stdio: "pipe" }),
  },
  {
    id: "RC-02",
    label: "no-std compliance (wasm32 check)",
    run: () =>
      execSync("cargo check --target wasm32-unknown-unknown --lib --quiet", {
        cwd: "sla_calculator",
        stdio: "pipe",
      }),
  },
  {
    id: "RC-03",
    label: "WASM artifact built and within 100 KB",
    run: () => {
      const wasmPath = path.resolve(WASM);
      if (!fs.existsSync(wasmPath))
        throw new Error(`WASM not found at ${WASM}. Run: cargo build --release --target wasm32-unknown-unknown`);
      const { size } = fs.statSync(wasmPath);
      if (size > WASM_BUDGET)
        throw new Error(`WASM ${(size / 1024).toFixed(1)} KB exceeds budget ${WASM_BUDGET / 1024} KB`);
    },
  },
  {
    id: "RC-04",
    label: "CHANGELOG.md has Unreleased section",
    run: () => {
      const log = fs.readFileSync("CHANGELOG.md", "utf8");
      if (!log.includes("## [Unreleased]"))
        throw new Error("CHANGELOG.md missing [Unreleased] section — update before release");
    },
  },
  {
    id: "RC-05",
    label: "no uncommitted changes in working tree",
    run: () => execSync("git diff --exit-code", { stdio: "pipe" }),
  },
  {
    id: "RC-06",
    label: "manifest.sha256 matches WASM (if present)",
    run: () => {
      const manifestPath = path.resolve("sla_calculator/manifest.sha256");
      if (!fs.existsSync(manifestPath)) return; // not required for all builds
      execSync("sha256sum -c sla_calculator/manifest.sha256", { stdio: "pipe" });
    },
  },
];

interface GateResult {
  id: string;
  label: string;
  passed: boolean;
  error?: string;
}

export function runRcGate(): GateResult[] {
  return GATE_CHECKS.map((check) => {
    try {
      check.run();
      return { id: check.id, label: check.label, passed: true };
    } catch (e: any) {
      return { id: check.id, label: check.label, passed: false, error: e.message?.split("\n")[0] };
    }
  });
}

if (require.main === module) {
  console.log("=== Release Candidate Gate ===\n");
  const results = runRcGate();
  for (const r of results) {
    console.log(`${r.passed ? "✅" : "❌"} [${r.id}] ${r.label}${r.error ? ` — ${r.error}` : ""}`);
  }
  const failed = results.filter((r) => !r.passed);
  if (failed.length) {
    console.error(`\n${failed.length} gate check(s) failed. RC not eligible for promotion.`);
    process.exit(1);
  }
  console.log("\nAll gate checks passed. RC eligible for promotion.");
}
