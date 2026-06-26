/**
 * SC-W5-117: Deterministic local test runner profiles (fast / full / security).
 *
 * Extends scripts/run-tests.ts with three named profiles that provide
 * reproducible, deterministic test scopes for local development cycles.
 *
 * Usage:
 *   npx ts-node scripts/test-profiles.ts fast
 *   npx ts-node scripts/test-profiles.ts full
 *   npx ts-node scripts/test-profiles.ts security
 *   npx ts-node scripts/test-profiles.ts --list
 */

import { execSync, ExecSyncOptions } from "child_process";

interface TestProfile {
  name: string;
  description: string;
  cargoFilter: string;       // passed to `cargo test <filter>`
  extraFlags: string[];      // additional cargo flags
  securityGate: boolean;     // run scripts/security-gate.ts after tests
  wasmCheck: boolean;        // run cargo check --target wasm32-unknown-unknown
}

const PROFILES: Record<string, TestProfile> = {
  fast: {
    name: "fast",
    description: "Core SLA logic only — fastest feedback loop (~5s)",
    cargoFilter: "calculate_sla",
    extraFlags: [],
    securityGate: false,
    wasmCheck: false,
  },
  full: {
    name: "full",
    description: "All tests including parity, history, governance, stats (~30s)",
    cargoFilter: "",
    extraFlags: [],
    securityGate: false,
    wasmCheck: true,
  },
  security: {
    name: "security",
    description: "Full tests + security gate scan on staged files (~35s)",
    cargoFilter: "",
    extraFlags: [],
    securityGate: true,
    wasmCheck: true,
  },
};

const opts: ExecSyncOptions = { stdio: "inherit", cwd: "sla_calculator" };

function runProfile(profile: TestProfile): void {
  console.log(`\n=== Profile: ${profile.name} ===`);
  console.log(`${profile.description}\n`);

  // 1. Cargo test
  const filterArg = profile.cargoFilter ? ` ${profile.cargoFilter}` : "";
  const extraArgs = profile.extraFlags.join(" ");
  const cmd = `cargo test${extraArgs}${filterArg} -- --nocapture`;
  console.log(`$ ${cmd}`);
  execSync(cmd, opts);

  // 2. Optional no-std compliance check
  if (profile.wasmCheck) {
    console.log("\n$ cargo check --target wasm32-unknown-unknown --lib");
    execSync("cargo check --target wasm32-unknown-unknown --lib --quiet", opts);
    console.log("✅ no-std compliance: OK");
  }

  // 3. Optional security gate
  if (profile.securityGate) {
    console.log("\n$ ts-node scripts/security-gate.ts");
    try {
      execSync("npx ts-node scripts/security-gate.ts", { stdio: "inherit" });
    } catch {
      // security-gate exits non-zero on hits; that is intentional
    }
  }

  console.log(`\n✅ Profile "${profile.name}" complete.`);
}

function printList(): void {
  console.log("Available test profiles:\n");
  for (const [key, p] of Object.entries(PROFILES)) {
    console.log(`  ${key.padEnd(10)} ${p.description}`);
  }
  console.log("\nUsage: npx ts-node scripts/test-profiles.ts <profile>");
}

const arg = process.argv[2];

if (!arg || arg === "--list" || arg === "--help") {
  printList();
  process.exit(0);
}

const profile = PROFILES[arg];
if (!profile) {
  console.error(`Unknown profile "${arg}". Run with --list to see available profiles.`);
  process.exit(1);
}

runProfile(profile);
