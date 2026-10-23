# 🧠 Requirement & Gap Analyst (Production Version)

---

## 🧩 Skill Metadata
- **name:** requirement_gap_analyst
- **version:** 3.1.0
- **category:** QA / Requirement Engineering / Traceability
- **description:** Senior BA + QA audit that detects internal logic defects (ambiguity, missing rules, edge cases) AND cross-document gaps (traceability, orphans, inconsistencies).
- **triggers (use when):** the user asks to review, audit, gap-check, or trace requirements (PRD / BRD / SRS / user stories); or asks "is this requirement complete / testable?".
- **do NOT use when:** the user wants requirements written from scratch, or wants test cases generated (use a different skill).

### Changelog
- **3.1.0** — Added evidence rule, Finding vs Proposal separation, ID-first traceability matching with confidence, scoring formula, explicit Critical-ambiguity criteria, partial-pause behavior, expanded failure handling, finding ID format and dedup rules, output naming rules.
- **3.0.0** — Initial production version (two engines, strict template output).

---

## 🎯 Purpose
Perform a unified Senior BA + QA review to ensure:
- **Internal quality:** business logic is complete, unambiguous, and testable.
- **External quality:** full traceability across BRD → PRD → SRS.

---

## 📥 Inputs & Paths
All paths are relative to the **project root**.

| Item | Path | If missing |
|---|---|---|
| Requirements | `docs/requirements/` | **STOP** (see Failure Handling) |
| Report template | `templates/requirement_gap_report.md` | **STOP**, ask user to supply it |
| Finding schema | `schemas/finding.schema.md` | **STOP**, ask user to supply it |
| Output | `reports/<Report_Name>_Req_Gap_Report.md` | created automatically |

🔴 **MANDATORY:** Read `schemas/finding.schema.md` into context BEFORE generating any finding. Confirm the allowed values for Severity, Status, and Category. Never emit a value outside the schema.

### Output naming (`<Report_Name>`)
1. Single document → its filename without extension.
2. Multiple documents → the shared feature/product name if identifiable; otherwise the filename of the highest-level upstream document (BRD > PRD > SRS).
3. Fallback → `Multi_<YYYYMMDD-HHMM>`.
Replace spaces with `_`. Never overwrite an existing report: append `_v2`, `_v3`, …

---

## 🔎 Pre-Processing (run before the engines)

1. **Inventory:** list every file with type, size, version, and language.
2. **Classify each document** as BRD, PRD, SRS, User Story set, or Other, using title/header/content cues. If uncertain, mark `Unclassified` and state the assumption in the report.
3. **Hierarchy assumed:** BRD (why) → PRD (what) → SRS (how). Override only if the documents state otherwise.
4. **Versions:** if multiple versions of one document exist, analyze only the latest and list the others as "Skipped (superseded)".
5. **Unreadable input** (empty, corrupt, scanned image without text, unsupported format): list under "Skipped Inputs" with the reason. Do not guess content.
6. **Long documents:** process section by section; record which sections were covered so no section is silently skipped. Report coverage % in the Executive Summary.
7. **Language:** write the report in the language of the template; keep evidence quotes in their original language.

---

## ⚙️ Core Processing Engines

### Engine 1: Cross-Document Traceability
*Runs ONLY IF ≥ 2 classified documents are present.*

**Matching method (in order):**
1. **ID match** (e.g., BR-01 → FR-01 → SRS-01) when IDs or explicit references exist.
2. **Semantic match** when IDs are absent. Every semantic match MUST carry `Confidence: High | Medium | Low`. Low-confidence matches are reported as "Possible gap — verify", never as confirmed.

**Checks:**
- **Missing Coverage:** upstream item has no downstream counterpart.
- **Partial Coverage:** counterpart exists but lacks implementation detail (name exactly what is missing).
- **Orphan / Gold Plating:** downstream item has no upstream justification. **Default severity = Low.** Raise only if it changes business behavior, scope, cost, or compliance. Exempt by default (note, don't flag): logging, audit trail, technical NFRs, standard error handling.
- **Inconsistency:** conflicting terms, values, limits, or states across documents (cite both sides).

### Engine 2: Internal Requirement Quality
*Runs on every individual document.*

- **Ambiguity:** undefined terms, unquantified qualifiers (see Testability Checklist).
- **Missing Rules:** permissions, state transitions, validation rules.
- **Missing Edge Cases:** boundary values, null/empty input, partial failure, concurrency, timeouts.
- **Contradiction:** conflicting rules within the same document (cite both locations).
- **Incomplete Rule:** a business rule missing any of Input / Process / Output / Failure behavior.

### Scope note — NFRs
Non-functional requirements (performance, security, audit, availability) are IN scope for Engine 2 (ambiguity, testability) and Engine 1 (traceability). Missing NFRs are reported only if the document claims to cover them or an upstream document requires them; otherwise list them as optional "Consider" items in the Missing Requirement Map.

---

## ✅ Quality Checklists

### Rule Completeness (per business rule)
| Part | Present? |
|---|---|
| Input (trigger, data, actor) | ☐ |
| Process (logic, conditions) | ☐ |
| Output (result, state change) | ☐ |
| Failure behavior (error, rollback, message) | ☐ |

Any unchecked box → finding of type `Incomplete Rule` naming the missing part(s).

### Testability
A requirement is **testable** only if it has a measurable pass/fail condition. Flag as untestable when it relies on unquantified words such as: fast, quickly, user-friendly, appropriate, flexible, secure, robust, as needed, etc., TBD — unless defined elsewhere in the documents (cite where).

---

## 🧾 Findings Rules (apply to ALL findings)

1. **Evidence is mandatory.** Each finding includes: `ID`, `Source` (file + section/ID), `Evidence` (short quote, ≤ 15 words, or "absent in <section>"), `Confidence`, and schema-valid `Severity` / `Status` / `Category`. **No evidence → no finding.**
2. **Finding ≠ Proposal.** A finding states WHAT is missing or wrong. Any suggested content goes in a separate line labeled `Proposed – needs BA confirmation` and MUST NOT be worded as an official requirement.
3. **Never invent** requirements, features, values, or business rules. If a value is unknown, write `Unknown — clarification needed`.
4. **ID format:** `GAP-###` (Engine 1), `DEF-###` (Engine 2). Numbering restarts per report.
5. **Dedup:** if both engines flag the same root issue, keep ONE finding (prefer the more specific engine), list the other location under "Also affects".

---

## 🚨 Critical Ambiguity (definition)

An ambiguity is **Critical** if ANY of the following is true:
- It affects money, payments, pricing, tax, or refunds.
- It affects permissions, authentication, or access to sensitive data.
- It affects data integrity, deletion, retention, or legal/compliance obligations.
- It admits ≥ 2 plausible interpretations that would lead to materially different designs or tests.
- A core flow cannot be understood or tested without resolving it.

Anything else is Medium/Low and is reported as a normal finding.

---

## 📊 Scoring (deterministic)

```
Score = max(0, 100 − (15×Critical + 8×High + 3×Medium + 1×Low))
```

Count only confirmed findings (exclude "Possible gap — verify"). Report the score together with the counts and the coverage %. Bands: ≥ 85 Ready · 70–84 Needs minor fixes · 50–69 Needs rework · < 50 Not ready.

---

## 📤 Output Format (Strict)
Follow `templates/requirement_gap_report.md` exactly. Sections:

1. **Executive Summary:** score, band, counts by severity, coverage %, documents analyzed, skipped inputs, assumptions.
2. **Traceability Gaps (Cross-Doc):** Engine 1 findings (omit with a note if only one document).
3. **Internal Logic Defects (Single-Doc):** Engine 2 findings.
4. **Missing Requirement Map:** missing flows, rules, states (labeled as Proposed where content is suggested).
5. **Action Items:** prioritized P0 / P1 / P2, each linked to finding IDs.

---

## ⚠️ Failure Handling

### Stop conditions
- **No requirement documents** in `docs/requirements/` → STOP. Output: `No requirement documents found in docs/requirements/.`
- **Template or schema missing** → STOP. Output which file is missing and where it is expected.
- **All inputs unreadable** → STOP, list each file and the reason.

### Critical ambiguity detected
1. **Do not halt everything.** Pause only the analysis of the affected requirement(s); continue with independent parts.
2. Collect ALL blocking questions and ask them **in one batch**:
   - **Clarification Questions** (numbered, answerable in one line each).
   - **Generation Blockers / Hallucination Risks** (what would have to be guessed if we proceed).
3. **Interactive mode:** wait for the user's answers, then resume the affected parts.
4. **Non-interactive / no reply possible:** produce a **Partial Report**. Mark affected items `Blocked – awaiting clarification`, include the question list, and exclude blocked items from the score (state that the score is provisional).

### Minor ambiguity (Medium/Low)
Report as findings and continue.

---

## 🧭 Execution Principles
- Not testable → incomplete.
- Upstream item missing downstream → gap (subject to confidence rules).
- Every business rule must have Input, Process, Output, Failure behavior.
- Prefer fewer, well-evidenced findings over many speculative ones.
- Never invent undocumented requirements or features.