/**
 * SC-W5-118: Roadmap-to-module traceability checker for issue hygiene.
 *
 * Validates that every SC-W5-xxx issue identifier referenced in source files
 * corresponds to a known roadmap entry, and that every module has at least
 * one associated issue. Catches orphaned references and undocumented modules.
 */

import * as fs from "fs";
import * as path from "path";

export interface RoadmapEntry {
  id: string;       // e.g. "SC-W5-118"
  module: string;   // owning module/directory
  title: string;
}

export interface TraceabilityReport {
  orphaned_refs: string[];   // issue IDs found in code but not in roadmap
  uncovered_modules: string[]; // modules with no roadmap entry
  ok: boolean;
}

const SC_ID_PATTERN = /SC-W5-\d+/g;

/** Scan a directory recursively for SC-W5-xxx references in .ts and .rs files. */
export function scanReferences(dir: string): Set<string> {
  const found = new Set<string>();
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "target" && entry.name !== "node_modules") {
      for (const id of scanReferences(full)) found.add(id);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".rs"))) {
      const src = fs.readFileSync(full, "utf8");
      for (const match of src.matchAll(SC_ID_PATTERN)) found.add(match[0]);
    }
  }
  return found;
}

export function checkTraceability(
  roadmap: RoadmapEntry[],
  repoRoot: string
): TraceabilityReport {
  const roadmapIds = new Set(roadmap.map((e) => e.id));
  const roadmapModules = new Set(roadmap.map((e) => e.module));
  const scannedIds = scanReferences(repoRoot);

  const orphaned_refs = [...scannedIds].filter((id) => !roadmapIds.has(id)).sort();

  // Determine modules from the repo root (top-level directories)
  const allModules = fs.existsSync(repoRoot)
    ? fs.readdirSync(repoRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !["target", "node_modules", ".git"].includes(e.name))
        .map((e) => e.name)
    : [];
  const uncovered_modules = allModules.filter((m) => !roadmapModules.has(m)).sort();

  return { orphaned_refs, uncovered_modules, ok: orphaned_refs.length === 0 };
}

// Minimal built-in roadmap covering the current repository
const ROADMAP: RoadmapEntry[] = [
  { id: "SC-W5-110", module: "offchain", title: "SLA->payment conformance suite" },
  { id: "SC-W5-111", module: "offchain", title: "Tx submission ambiguity" },
  { id: "SC-W5-112", module: "offchain", title: "Duplicate tx hash correlation" },
  { id: "SC-W5-113", module: "offchain", title: "Finality-state annotation" },
  { id: "SC-W5-114", module: "offchain", title: "Ambiguous outcome replay" },
  { id: "SC-W5-115", module: "offchain", title: "Failure recovery semantics" },
  { id: "SC-W5-116", module: "docs",     title: "Contract module map" },
  { id: "SC-W5-117", module: "scripts",  title: "Deterministic test runner profiles" },
  { id: "SC-W5-118", module: "tooling",  title: "Roadmap traceability checker" },
  { id: "SC-W5-119", module: "tooling",  title: "PR checklist automation" },
  { id: "SC-W5-120", module: "docs",     title: "Contributor verification guide" },
  { id: "SC-W5-121", module: "tooling",  title: "Release candidate gate" },
  { id: "SC-W5-122", module: "scripts",  title: "Pre-deploy metadata verification" },
  { id: "SC-W5-123", module: "scripts",  title: "Post-deploy smoke pipeline" },
  { id: "SC-W5-124", module: "tooling",  title: "Rollback decision matrix" },
  { id: "SC-W5-125", module: "tooling",  title: "Wave reliability scorecard" },
];

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const report = checkTraceability(ROADMAP, root);
  if (report.orphaned_refs.length)
    console.warn(`⚠ Orphaned SC refs (not in roadmap): ${report.orphaned_refs.join(", ")}`);
  if (report.uncovered_modules.length)
    console.warn(`⚠ Modules with no roadmap entry: ${report.uncovered_modules.join(", ")}`);
  if (report.ok) console.log("✅ Roadmap traceability: all scanned IDs are in the roadmap.");
  process.exit(report.ok ? 0 : 1);
}
