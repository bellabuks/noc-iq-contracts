/**
 * SC-W5-122: Pre-deploy contract metadata verification against expected manifests.
 *
 * Before deploying to any network, verifies that the WASM artifact matches
 * the expected SHA-256 manifest, the build metadata is complete, and the
 * artifact is within the size budget. Fails fast with actionable errors.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface DeployManifest {
  contract: string;
  version: string;
  sha256: string;
  size_bytes: number;
  build_timestamp?: string;
}

const WASM_PATH = path.resolve(
  "sla_calculator/target/wasm32-unknown-unknown/release/sla_calculator.wasm"
);
const MANIFEST_PATH = path.resolve("sla_calculator/manifest.sha256");
const SIZE_BUDGET = 100 * 1024;

function sha256File(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

interface VerifyResult {
  check: string;
  passed: boolean;
  detail: string;
}

export function verifyPreDeploy(): VerifyResult[] {
  const results: VerifyResult[] = [];

  // 1. WASM exists
  const wasmExists = fs.existsSync(WASM_PATH);
  results.push({
    check: "WASM artifact exists",
    passed: wasmExists,
    detail: wasmExists ? WASM_PATH : `Not found: ${WASM_PATH}`,
  });
  if (!wasmExists) return results; // can't continue without it

  const wasmSize = fs.statSync(WASM_PATH).size;

  // 2. Size budget
  results.push({
    check: `WASM size <= ${SIZE_BUDGET / 1024} KB`,
    passed: wasmSize <= SIZE_BUDGET,
    detail: `${(wasmSize / 1024).toFixed(2)} KB`,
  });

  // 3. SHA-256 matches manifest
  const actualHash = sha256File(WASM_PATH);
  if (fs.existsSync(MANIFEST_PATH)) {
    const manifestLine = fs.readFileSync(MANIFEST_PATH, "utf8").trim();
    // manifest format: "<hex>  sla_calculator.wasm"
    const expectedHash = manifestLine.split(/\s+/)[0];
    const hashMatch = actualHash === expectedHash;
    results.push({
      check: "SHA-256 matches manifest",
      passed: hashMatch,
      detail: hashMatch
        ? `✓ ${actualHash.slice(0, 16)}…`
        : `mismatch: actual=${actualHash.slice(0, 16)}… expected=${expectedHash.slice(0, 16)}…`,
    });
  } else {
    results.push({
      check: "SHA-256 manifest present",
      passed: false,
      detail: `manifest.sha256 not found — generate with: sha256sum ... > sla_calculator/manifest.sha256`,
    });
  }

  // 4. Artifact is not a zero-byte stub
  results.push({
    check: "WASM is non-empty",
    passed: wasmSize > 0,
    detail: `${wasmSize} bytes`,
  });

  return results;
}

if (require.main === module) {
  console.log("=== Pre-Deploy Metadata Verification ===\n");
  const results = verifyPreDeploy();
  for (const r of results) {
    console.log(`${r.passed ? "✅" : "❌"} ${r.check}: ${r.detail}`);
  }
  const failed = results.filter((r) => !r.passed);
  if (failed.length) {
    console.error(`\n${failed.length} check(s) failed. Deployment blocked.`);
    process.exit(1);
  }
  console.log("\nAll pre-deploy checks passed. Safe to deploy.");
}
