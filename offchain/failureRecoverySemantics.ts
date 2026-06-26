/**
 * SC-W5-115: Failure recovery semantics for partially observed tx results.
 *
 * A "partially observed" result occurs when the backend receives a response
 * from Stellar that is incomplete or contradictory (e.g. response received
 * but ledger inclusion unconfirmed, or error after event emission).
 * Defines recovery classifications and safe handling per partial observation type.
 */

export type PartialObservationType =
  | "response_no_ledger"   // got a Soroban response but no ledger sequence
  | "event_no_result"      // saw contract event but no function return value
  | "result_no_event"      // got return value but no event emitted
  | "ledger_no_response"   // tx in ledger but backend call timed out
  | "error_after_event";   // error response but event was already emitted

export type RecoveryAction =
  | "query_and_verify"   // re-read contract state; do not retry yet
  | "safe_to_retry"      // definitively not applied; retry allowed
  | "manual_review";     // contradictory signals; escalate to operator

export interface PartialObservation {
  outage_id: string;
  type: PartialObservationType;
}

export interface RecoverySemantics {
  action: RecoveryAction;
  rationale: string;
  idempotent: boolean; // whether retrying is safe without re-checking state
}

const SEMANTICS: Record<PartialObservationType, RecoverySemantics> = {
  response_no_ledger: {
    action: "query_and_verify",
    rationale: "Soroban response received but ledger unconfirmed; tx may or may not have landed",
    idempotent: false,
  },
  event_no_result: {
    action: "query_and_verify",
    rationale: "Contract event observed implies state was written; verify before retry",
    idempotent: false,
  },
  result_no_event: {
    action: "query_and_verify",
    rationale: "Return value without event is unexpected; query state to resolve",
    idempotent: false,
  },
  ledger_no_response: {
    action: "query_and_verify",
    rationale: "Tx confirmed in ledger; backend just missed the response — verify state, no retry",
    idempotent: false,
  },
  error_after_event: {
    action: "manual_review",
    rationale: "Contradictory: event emitted but function errored — operator must reconcile",
    idempotent: false,
  },
};

export function classifyRecovery(obs: PartialObservation): RecoverySemantics {
  return SEMANTICS[obs.type];
}

function runTests(): void {
  console.log("[SC-W5-115] Failure recovery semantics tests\n");

  const cases: Array<{ type: PartialObservationType; expectedAction: RecoveryAction }> = [
    { type: "response_no_ledger", expectedAction: "query_and_verify" },
    { type: "event_no_result",    expectedAction: "query_and_verify" },
    { type: "result_no_event",    expectedAction: "query_and_verify" },
    { type: "ledger_no_response", expectedAction: "query_and_verify" },
    { type: "error_after_event",  expectedAction: "manual_review" },
  ];

  for (const c of cases) {
    const sem = classifyRecovery({ outage_id: "OUT001", type: c.type });
    if (sem.action !== c.expectedAction)
      throw new Error(`${c.type}: expected ${c.expectedAction}, got ${sem.action}`);
    if (sem.idempotent)
      throw new Error(`${c.type}: all partial observations must be non-idempotent`);
    console.log(`  ✓ ${c.type} -> ${sem.action}`);
  }

  // Adversarial: error_after_event must not be retried without manual review
  const risky = classifyRecovery({ outage_id: "OUT002", type: "error_after_event" });
  if (risky.action === "safe_to_retry")
    throw new Error("error_after_event must never be safe_to_retry");
  console.log("  ✓ adversarial: error_after_event not safe_to_retry");

  console.log("\nAll failure recovery semantics tests passed.");
}

runTests();
