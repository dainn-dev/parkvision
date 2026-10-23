# 🔍 Requirement Logic & Reality Analyst

---

## 🧩 Skill Metadata
- **name:** requirement_logic_reality_analyst
- **version:** 1.0.0
- **category:** QA / Requirement Engineering / Business Logic & Flow Validation
- **description:** Rebuilds the flows described in requirements, then challenges them on four layers: can each step happen (feasibility), do the steps fit together (coherence), is the underlying logic sound (calculation, time, concurrency, permission, data), and does it match real-world logic and comparable market apps (realism). Produces evidence-based findings, BA/PO clarification questions, and QA challenge scenarios.
- **use when:** the user asks whether requirements or happy flows make sense, are realistic, are logically complete end to end, or how they compare with other apps.
- **do NOT use when:** the user wants a document audit (template conformance, cross-document traceability) or ordinary test-case generation. Those belong to other skills.
- **merged from:** `requirement_logic_anomaly_analysis` v1.0.0 (deep logic checks, QA scenarios) + `requirement_reality_check` v1.0.0 (flow reconstruction, prerequisite tracing, market benchmark).

> **Primary stance:** do not ask "can this be implemented or tested?" Ask **"does this make sense, and would it survive contact with real users?"**

---

## 🎯 The Four Layers

| Layer | Question | Example |
|---|---|---|
| **L1 Feasibility** | Does each step have everything it needs, produced earlier? | "Pay" exists, but nothing ever adds items to the order |
| **L2 Coherence** | Do steps fit together in order, state, actor, and data? | Refund allowed on an order that was never paid |
| **L3 Logic soundness** | Do rules, values, and timing hold up under challenge? | Reminder "30 days before expiry" for a card that expires in 10 days |
| **L4 Realism** | Does it match real-world logic and market conventions? | No confirmation before an irreversible transfer |

---

## 📥 Inputs & Paths (relative to project root)

| Item | Path | If missing |
|---|---|---|
| Requirements (PRD, BRD, SRS, stories, acceptance criteria) | `docs/requirements/` | **STOP** |
| Report template | `templates/logic_reality_report.md` | Use the built-in format below |
| Finding schema | `schemas/finding.schema.md` | If present, read it FIRST and use only its allowed values; if absent, use this file's values and say so |
| Optional context | `reports/business_rules.md`, `docs/API.md`, `docs/UI.md`, `docs/Database.md`, `docs/System_Architecture.md`, existing test cases | Continue; lower confidence where context would have helped |
| Optional benchmark evidence (screenshots, competitor flows) | `docs/benchmarks/` | Continue; evidence mode drops to Convention |
| Optional reference apps | user message or `docs/benchmarks/apps.md` | Select automatically (Phase 5) |
| Optional upstream reports (e.g. `*_Req_Gap_Report.md`) | `reports/` | Use to avoid duplicating findings |

**Output:** `reports/<Name>_Logic_Reality_Report.md`. Never overwrite; append `_v2`, `_v3`. `<Name>` = shared feature name, else the main document's filename.

---

## ⚙️ Pipeline (execute in order)

### Phase 1: Understand
From the documents only, extract: product category, actors/roles, target market/region, platform, money/data/goods involved, modules covered, and per requirement: ID, statement, trigger, preconditions, action, expected result, business rules, constraints, data, state changes, dependencies, exceptions, external systems.
Ask first: *"What is this requirement actually trying to achieve?"* If category or market is unclear, add it to the clarification list; do not guess.

### Phase 2: Reconstruct flows
List every happy flow as ordered steps. If the documents give no order, derive it from dependencies and mark `Derived – verify`. Also list the alternative, failure, cancel, and retry flows the documents define.

| # | Actor | Action | Needs (inputs / state / permission) | Produces (data / state) | Source (file + ID) |
|---|---|---|---|---|---|

### Phase 3: Flow integrity (L1 + L2)

**3.1 Prerequisite Ledger (backward trace).** For every "Needs": *who creates this, in which step?*

| Step | Needs | Produced by | Status |
|---|---|---|---|
| | | | Produced-in-flow / In-other-doc (cite) / Out-of-scope (declared) / **NOT FOUND** |

`NOT FOUND` → `FLOW_GAP`.

**3.2 Consumption (forward trace).** Is every "Produces" used or finalized later? Created-but-never-closed objects → `DEAD_END_FLOW`.

**3.3 Entry and exit.** How does the actor reach step 1 (login, navigation, trigger)? Does the flow end in a defined terminal state with user feedback and updates to related data?

**3.4 Order and state.** Draw each state machine (defined or implied). Detect: invalid, impossible, missing, duplicate, or conflicting transitions; reversible terminal states; missing cancel, fail, retry, or expiry paths. A reopened terminal state (e.g. `COMPLETED → IN_PROGRESS`) is `STATE_ISSUE` unless the documents give a business reason.

**3.5 Preconditions and postconditions.** For each action: `Precondition → Action → Postcondition`. Detect missing, impossible, or contradictory preconditions (action allowed without the required state, data, permission, or after expiry) and results that do not follow (related data or status not updated, notification not triggered, UI and backend states disagree, undefined side effects).

**3.6 Continuity.** Same actor and authentication throughout? Do amounts, currency, item lists, and identifiers stay consistent step to step?

**3.7 Negative paths.** For every decisive condition ask "what if it is false or the opposite happens?" (payment fails, times out, succeeds but booking fails, callback duplicated, user retries). Undefined or contradictory outcomes → `MISSING_PATH`.

### Phase 4: Deep logic checks (L3)
Apply each check only where the requirement contains that kind of logic. Raise a finding only when the issue can materially change system behavior.

| Check | What to challenge | Category |
|---|---|---|
| **Contradiction** | Direct (A: cancel anytime / B: no cancel after driver arrives) and indirect (expired cards rejected + recurring charge uses saved card). Compare requirements individually AND combined | `CONTRADICTION` |
| **Missing rules** | Validation, boundary, timeout, retry, rollback, duplicate handling, permission, ownership, notification, audit, concurrency; only those that change behavior | `MISSING_RULE` |
| **Ambiguity** | Phrases with ≥ 2 reasonable readings ("shortly after", "valid user", "active subscription", "retry automatically"). Give original text, interpretations, why it matters, question | `AMBIGUITY` |
| **Boundary and values** | Min/max, zero, negative, decimal, empty/null, below/at/above boundary (MIN−1, MIN, MIN+1, MAX−1, MAX, MAX+1), huge values, multiple requests that together exceed a limit | `BOUNDARY_RISK` |
| **Time and date** | Expiry, scheduling, time zones, day/month/year edges, DST, timeouts, retry intervals, past/future dates, notification already sent, missing date | `TIME_DATE_RISK` |
| **Calculation** | Inputs, formula in plain language, order of operations, zero/min/max/decimal/negative, rounding, units, currency, tax and fee ordering | `CALCULATION_RISK` |
| **Concurrency** | Double submit, cancel during payment, accept vs cancel, two admins editing, duplicate callbacks, retried API calls → duplicate transaction, lost update, wrong final state | `CONCURRENCY_RISK` |
| **Data consistency** | Trace `action → API → DB → event → notification → UI`; can any layer disagree (payment SUCCESS but UI FAILED, trip COMPLETED but payment PENDING)? Who owns the source of truth? | `DATA_INCONSISTENCY` |
| **Permission** | Who may act, who owns the resource, what scope, what happens after a role change, can another user reach it | `PERMISSION_RISK` |
| **Implausible value** | Values or rules that cannot work in practice | `IMPLAUSIBLE_VALUE` |

### Phase 5: Market and real-world benchmark (L4)

**5.1 Reference set (3–5 apps).** Same category and market where possible, plus at most one global leader. User-named apps first. State why each was chosen. Never compare across unrelated categories.

**5.2 Evidence mode (declare per finding).**

| Mode | Meaning | Max confidence |
|---|---|---|
| **Verified** | Checked via web search, official docs, or `docs/benchmarks/`; source and date recorded | High |
| **Convention** | Widely established pattern, described generically without naming a specific app's behavior | Medium |
| **Recollection** | Unverified memory of a specific app | Low; may only be phrased as a question, never as fact |

If web search is available, verify before asserting anything about a specific app. Always record the check date.

**5.3 Convention strength.** `UNIVERSAL` (almost all reference apps), `COMMON` (most), `DIFFERENTIATOR` (varies widely). **Only UNIVERSAL and COMMON can raise findings; DIFFERENTIATOR never does.**

**5.4 Deviation types → `MARKET_DEVIATION`:**
`MISSING_STANDARD_STEP` · `REVERSED_ORDER` · `UNUSUAL_RESTRICTION` · `UNUSUAL_PERMISSIVENESS` · `MISSING_SAFEGUARD` (confirmation, undo window, duplicate-submit guard, re-authentication for money movement) · `MISSING_FEEDBACK` (status, notification, receipt) · `EXPECTATION_MISMATCH`.

**5.5 Real-world plausibility** (not market-specific): physical, financial, legal, operational, and time constraints → `REAL_WORLD_MISMATCH`. Flag only with a concrete reason, never merely because something is uncommon.

**5.6 Wording rule.** *"Differs from common market practice; confirm it is intentional."* Never "is wrong". Always include a possible valid reason and end with a question. Severity follows impact of the deviation, not how many apps differ.

### Phase 6: Challenge questions and QA scenarios
- For every meaningful finding write **one specific question** for BA/PO.
  - ❌ "Is this correct?"
  - ✅ "If the rider cancels after the driver arrives, does the driver become available immediately or stay tied to the cancelled trip?"
- Generate **challenge scenarios** that prove or disprove the suspicion. Prioritize: boundaries, invalid transitions, contradictory conditions, concurrent actions, failures, retries, expiry, duplicates, partial success, data inconsistency. Skip happy-path cases unless needed to explain the issue.

### Phase 7: Consolidate
Merge duplicates (same root cause across layers → one finding, list "Also affects"). Drop speculative findings with no evidence and no clear consequence. Order by severity, then by position in the flow (earlier steps block later ones). Respect upstream reports to avoid repeating known findings.

---

## 🧠 Heuristics (use throughout)
1. **Why?** If no reasonable business explanation exists, investigate.
2. **Who creates it?** Every input must come from somewhere.
3. **What if the opposite happens?** Success↔failure, active↔inactive, before↔after, allowed↔denied, exists↔absent.
4. **What happens next?** Action → result → next state → related data → notification → user expectation.
5. **Can this state actually exist?**
6. **Can these two rules both be true?**
7. **What happens twice?** Double tap, duplicate request or callback, retry loop.
8. **What happens at the boundary?**
9. **Would a normal user of a comparable app expect this?**

---

## 🧾 Finding Rules (apply to ALL findings)

1. **Evidence required:** file + section/ID + short quote (≤ 15 words) or "absent from <scope>". No evidence → no finding.
2. **Never invent requirements or expected behavior.** State what is missing or odd and ask. Suggested content goes in a line labeled `Proposed – needs BA/PO confirmation`.
3. **Status:**
   - `Confirmed`: the documents themselves create the problem.
   - `Potential`: depends on something undocumented (e.g. the step may live in another module).
   - `Needs clarification`: documents are insufficient; mark `INSUFFICIENT_INFORMATION` and state exactly what is needed.
4. **Scope awareness:** if documents cover only part of the product, a missing upstream/downstream step is `Potential`, unless the documents claim end-to-end coverage.
5. **Confidence:** High / Medium / Low. For Low, state the assumption, the missing information, why it was flagged, and the clarification needed. Benchmark findings are capped by evidence mode.
6. **ID format:** `LR-001`, `LR-002`, … per report.
7. **Quality over quantity.** Do not flag every unspecified detail, uncommon behavior, or meaningless edge case.

---

## 🏷 Finding Categories

| Category | Layer | Meaning |
|---|---|---|
| `FLOW_GAP` | L1 | A step lacks something it needs, or an expected step is missing |
| `DEAD_END_FLOW` | L1 | Flow or object never reaches a defined end |
| `FLOW_ORDER_ISSUE` | L2 | Steps in an impossible or unreasonable order |
| `STATE_ISSUE` | L2 | Invalid, missing, or reversible-terminal state transition |
| `CONTINUITY_ISSUE` | L2 | Actor, data, or amounts inconsistent across steps |
| `MISSING_PATH` | L2 | Failure, opposite, cancel, retry, or partial-success path undefined |
| `CONTRADICTION` | L2/L3 | Rules conflict, directly or in combination |
| `MISSING_RULE` | L3 | Rule needed to complete the behavior is absent |
| `AMBIGUITY` | L3 | Multiple reasonable interpretations |
| `BOUNDARY_RISK` | L3 | Limit or edge value behaves unexpectedly |
| `TIME_DATE_RISK` | L3 | Time or date logic fails at some edge |
| `CALCULATION_RISK` | L3 | Formula, rounding, unit, or ordering problem |
| `CONCURRENCY_RISK` | L3 | Simultaneous actions produce a wrong state |
| `DATA_INCONSISTENCY` | L3 | Layers or systems can disagree |
| `PERMISSION_RISK` | L3 | Authorization, ownership, or role problem |
| `IMPLAUSIBLE_VALUE` | L3/L4 | Value or rule cannot work in practice |
| `MARKET_DEVIATION` | L4 | Differs from UNIVERSAL/COMMON market practice (with sub-type) |
| `REAL_WORLD_MISMATCH` | L4 | Conflicts with physical, financial, legal, or operational reality |

If `schemas/finding.schema.md` exists, map these onto its allowed Category values and emit nothing outside the schema.

---

## 🚦 Severity

| Level | Could cause |
|---|---|
| 🔴 **Critical** | Financial loss, data corruption, security/privacy exposure, a core flow that cannot complete, impossible system state |
| 🟠 **High** | Wrong business outcome, major functional failure, serious workflow inconsistency |
| 🟡 **Medium** | Meaningful missing rule/path, notable market deviation, likely confusion or edge-case defect |
| 🟢 **Low** | Minor ambiguity, terminology or UX concern, limited-impact clarification |

No overall quality score; report counts only.

---

## 📤 Report Format (`reports/<Name>_Logic_Reality_Report.md`)

1. **Executive Summary:** product category and market (as understood), documents analyzed, requirements analyzed vs total, flows reconstructed, reference apps and evidence modes, counts by severity and by status (Confirmed / Potential / Needs clarification), coverage limits.
2. **Flow Reconstruction:** table per flow (Phase 2), marking `Derived – verify`.
3. **Prerequisite Ledger:** table (3.1), `NOT FOUND` rows highlighted.
4. **State Transition Analysis:** each state machine as `Current state → Action → Resulting state`, with suspicious transitions flagged.
5. **Findings Register:**

| ID | Category | Layer | Flow step / REQ | Severity | Status | Confidence | Summary |
|---|---|---|---|---|---|---|---|

6. **Finding Details** (one block per finding):
   - **Title**
   - **Evidence:** source and short quote
   - **What looks wrong:** the concrete logical reason
   - **Expected logic:** what would logically hold, without inventing business rules
   - **Market / real-world reference:** apps or convention, strength, evidence mode, source and date if Verified (benchmark findings only)
   - **Possible valid reason:** why the team may have done this on purpose
   - **Consequence if implemented as written**
   - **Example scenario**
   - **Clarification question**
   - **QA challenge:** scenario to test
   - **Proposed – needs confirmation** (optional)
7. **Contradiction Report:**

| ID | Requirement A | Requirement B | Conflict | Impact |
|---|---|---|---|---|

8. **Market Benchmark Table:**

| Flow step | REQ | Common practice | Reference apps | Strength | Evidence mode | Deviation | Question |
|---|---|---|---|---|---|---|---|

9. **QA Challenge Scenarios:**

| ID | Scenario | Why it matters | Needs clarification from BA/PO |
|---|---|---|---|

10. **Clarification Questions:** all questions grouped by flow step, deduplicated, numbered.
11. **Assumptions & Limitations:** what was derived, what could not be verified, what lives outside the documents, which context files were missing.
12. **Final Grouping:** Confirmed Anomalies · Potential Anomalies · Ambiguities · Flows/Requirements With No Significant Issue (challenged, nothing meaningful found).

---

## ⚠️ Failure Handling

- **No requirement documents** → STOP. Output: `No requirement documents found in docs/requirements/.`
- **Requirement cannot be parsed** → mark that requirement `UNKNOWN` with the reason and continue with the rest.
- **Flow cannot be reconstructed** → mark `INSUFFICIENT_INFORMATION`, state exactly what is needed, continue with analyzable flows.
- **Business rules unavailable** → continue with lower confidence and explicit assumptions.
- **Product category or market unclear** → ask once, in one batch. If no answer is possible, run L1–L3 plus `REAL_WORLD_MISMATCH`, skip market benchmarking, and say why.
- **Web search unavailable** → Convention mode only; never state a specific app's behavior as fact.
- **Conflicting requirements** → do not choose which is correct; show both sides with evidence and ask.
- **Unreadable or unsupported files** → list under Skipped Inputs with the reason.
- **Long documents** → process section by section; report coverage so nothing is skipped silently.
- **Non-interactive run** → never wait for answers; finish with all questions listed and affected findings marked `Needs clarification`.

---

## 🚫 Anti-Patterns

The agent must NOT:
- Invent requirements, business rules, or expected behavior.
- Treat market practice as a requirement.
- State what a specific app does without verification.
- Flag DIFFERENTIATOR or merely uncommon behavior.
- Treat every missing detail as a defect.
- Treat a missing step as confirmed when it may live in another module.
- Pick a winner between contradicting requirements, or silently rewrite a requirement.
- Hide uncertainty.
- Produce many low-value findings to look thorough.

---

## ✅ Success Criteria

The skill works when it reliably:
1. Finds steps that cannot happen because something they need is never created (e.g. payment with no way to add items).
2. Finds flows or objects that never reach a defined end.
3. Finds impossible orders, states, and contradictory combinations.
4. Finds rules that break at boundaries, times, calculations, concurrency, or permissions.
5. Finds behavior real users of comparable apps would find surprising, with sourced, appropriately hedged evidence.
6. Separates confirmed defects from questions the team must answer.
7. Gives BA/PO specific questions and QA high-value challenge scenarios before development starts.