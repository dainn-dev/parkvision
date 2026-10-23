# 🛠 Test Case Generator Skill (V2 - RBT & Multi-Mode)

---

## 🧩 Skill Metadata

- **name:** testcase_generator
- **version:** 4.0.0
- **category:** QA / Test Design
- **description:** Generate enterprise-level manual test cases from software requirements using standardized QA test design techniques. Features a FULL RBT mode with comprehensive Field-Level Validation, Implicit Edge Cases, and Automation Metadata.

---

## 🎯 Purpose

Generate a complete, executable, traceable, and review-ready manual test suite directly from software requirements while ensuring coverage, quality, and automation readiness. The skill adapts to task complexity and always executes a strict 10-engine Risk-Based Testing pipeline.

---

## 📥 Inputs

### Required
- `docs/requirements/*` (SRS, PRD, BRD, or any requirement document)
- `schemas/testcase.schema.md` — **🔴 MANDATORY: Must read and load into context before generating any test cases**

### Secondary
- `docs/designs/*` (UI Flow, Wireframes, Design descriptions)
- `templates/testcases.md` (Output format template)

### Optional (Cross-Reference Inputs)
- `reports/*_Test_Scenarios_Report.md` (from scenario_generator)
- `reports/*_Req_Gap_Report.md` (from requirement_gap_analyst)
- `reports/*_Risk_Analysis_Report.md` (from risk_analyst)
- `reports/*_Edge_Case_Report.md` (from advanced_edge_case_analyzer)
- `reports/*_Design_Audit_Report.md` (from design_auditor)

---

## 📤 Output

📄 `reports/[Requirement_Name]_Testcases.md`
📄 `reports/[Requirement_Name]_Testcases.csv` (Must be converted via script for import)

Use output template:
📄 `templates/testcases.md`

---

## ⚙️ Processing Engines

Execute the following engines **sequentially**. No engine may be skipped.

### Engine 1: Requirement Analysis & QnA
- Read all documents from `docs/requirements/*`.
- **[Global Requirement Cross-Referencing - MANDATORY]**: Do NOT read only an isolated module section. Cross-functional specifications (Email/SMS templates, Push notifications, Cron/Batch schedules, Payment/Billing policies, Shared error codes, Role matrices) often reside in global appendices or general system chapters. The generator MUST scan the ENTIRE requirement document across 5 universal cross-cutting categories:
  1. *Communication & Alerts:* `Email`, `Notification`, `Push`, `SMS`, `In-App`, `Alert`, `Template`, `Deep-link`.
  2. *Background & Scheduled Lifecycle:* `Cron`, `Worker`, `Batch`, `Job`, `Schedule`, `Queue`, `Timer`, `Sync`, `Grace Period`, `Expiration`, `Effective Date`.
  3. *Transactions & External Integrations:* `Payment`, `Gateway`, `Checkout`, `Refund`, `Invoice`, `Billing`, `Webhook`, `Third-party`.
  4. *Security & Access Control:* `Auth`, `Role`, `Permission`, `Token`, `Session`, `OTP`, `MFA`.
  5. *Global Appendices & Error Handlers:* `Appendix`, `System Limits`, `Error Codes`, `Glossary`.
  Extract all cross-cutting business rules, templates, and triggers relevant to the module under test.
- Identify functional requirements, business rules, constraints, user roles.
- Decompose compound requirements into atomic functional behaviors.
- **[Feature Size Evaluation Matrix]**: You MUST explicitly count and list the 6 Feature Size factors (Input Fields, Business Rules, User Roles, Alternative Flows, APIs, DB Changes) as defined in `test_generation_rules.md`. Apply the evaluation rubric (e.g., if 2+ factors are Major -> Major -> minimum 60 test cases) and print this matrix before generation.
- **[Checkpoint]**: Analyze Ambiguities (unclear points, omissions, contradictions). If found, **STOP** and output a list of Q&A questions. Wait for user confirmation before proceeding.

### Engine 2: Input Cross-Reference
- Incorporate gap findings from `*_Req_Gap_Report.md`.
- Use scenarios from `*_Test_Scenarios_Report.md` as primary skeleton.
- Use risk levels from `*_Risk_Analysis_Report.md` to assign Priority.
- Generate dedicated test cases for edge cases and UI defects from related reports.

### Engine 3: Test Design, Field-Level Validation, and NFRs
- Apply core design techniques: Happy Path, Negative Testing, BVA, Equivalence Partitioning, Decision Table, State Transition.
- **[Mandatory 5-Pillar Coverage Gate]**: For any module with workflows, state transitions, transactions, or asynchronous lifecycles, enforce all 5 pillars:
  1. *Pillar 1: UI & Interactive Form Flow* (Screen layouts, component states, field validations BVA/EP, empty/loading/disabled/active states).
  2. *Pillar 2: Full Permutation Matrix* (100% permutations across all user roles, state combinations, plan/tier options, and selection variants. Sample-only testing is strictly prohibited).
  3. *Pillar 3: Time-based & Event-driven Lifecycle (T0 vs T1)* (T0: Action/Schedule phase - immediate feedback, pending status, audit trail; T1: Execution/Maturity phase - scheduled date arrival, batch execution, state activation, granting new permissions, revoking previous privileges).
  4. *Pillar 4: System, Network & Third-Party Exceptions* (Gateway/API errors, authentication/OTP failures, network interruption, timeout, retry/dunning policies, fallback mechanisms).
  5. *Pillar 5: Dedicated Communication Loop* (Push notification, in-app notification center, transactional email/SMS, deep-link navigation back to the exact relevant screen).
- **[Dedicated Communication TCs]**: Emails and Notifications MUST NOT be trailing sentences in Expected Results. Every trigger event MUST have dedicated `*-NOT-*` test cases.

### Field-Level Validation Checklist (CRITICAL)
Scan all input fields on the form/UI and generate specific validation TCs for each type:

**Text Fields:**
- Min/max length boundaries
- Whitespace-only input
- Special characters: `<>&"'!@#$%^*()`
- XSS injection: `<script>alert('xss')</script>`
- SQL injection: `' OR '1'='1`
- Unicode/Emoji: 你好, مرحبا, 😀
- Leading/trailing spaces: `  test  `
- Case sensitivity: uppercase vs lowercase

**Email Fields:**
- Valid format: test@example.com
- Missing @: testemail.com
- Missing domain: test@
- Multiple @: test@@example.com
- Max length: 254 characters
- Special characters: test+tag@example.com
- International: user@例え.jp

**Phone/Number Fields:**
- Numbers only validation
- Prefix format: +1, 0, etc.
- Min/max length
- Invalid area code
- Leading zeros
- Spaces/hyphens: (123) 456-7890
- Country code format

**Date/Time Fields:**
- Format validation: MM/DD/YYYY vs DD/MM/YYYY
- Invalid dates: 02/30/2024 (Feb 30 doesn't exist)
- Leap years: 02/29/2024 (valid) vs 02/29/2023 (invalid)
- Past/future constraints
- Timezone handling
- Min/max date boundaries

**OTP/MFA Fields:**
- Timeout: OTP expired after X minutes
- Retry limit exceeded
- Auto-focus when field active
- Paste support: allow pasting full OTP
- Resend button state (disabled after resend)

**Rich Text Fields:**
- HTML sanitization: `<script>`, `<iframe>`, `<img onerror=>`
- Character counter
- Copy/paste formatting
- Line break handling
- Markdown support (if applicable)

**Multi-Select/Range:**
- Min/max selections
- Duplicate handling
- Reorder validation
- Boundary values (0, 1, max, max+1)

### Deep Scenarios & NFRs (Mandatory Checklist)
- **Mobile Lifecycle:** Backgrounding, Force Stop (Kill App), Restart App, Session Logout.
- **API & Backend:** Payload structure (missing fields, wrong data type, Boundary NULL/999), Mock HTTP 500, Mock API Timeout.
- **Hardware & Permission (CRITICAL):** GPS Off, Location Permission Revoked during runtime, Fake GPS (Mock Location apps), Approximate Location (Android 12+), Poor GPS Accuracy.
- **Race Condition & Network:** Mid-action network disconnection, Rapid double submission.

### Engine 3 Add-On: Accessibility & Localization (ENHANCED)

**WCAG 2.1 AA Compliance Testing**
For all features, generate test cases for:

**1. Color Contrast**
- Text: 4.5:1 ratio minimum
- Large text: 3:1 minimum
- Graphics/UI components: 3:1 minimum
Example TC: "Verify login button text has 4.5:1 color contrast ratio against button background"

**2. Text Sizing & Readability**
- Default font size: ≥12px
- Line height: ≥1.5× font size
- Letter spacing: ≥0.12× font size
Example TC: "Verify password field label uses ≥12px font with 1.5× line height"

**3. Keyboard Navigation**
- All interactive elements reachable via Tab key
- Focus visible (outline ≥2px)
- Tab order logical (left-to-right, top-to-bottom)
Example TC: "Tab through entire login form, verify all fields accessible and focus visible"

**4. Screen Reader**
- Form labels linked via `<label>` or `aria-label`
- Error messages announced
- Dynamic changes announced (`aria-live`)
Example TC: "Use NVDA to read login form, verify all fields and validation messages announced correctly"

**5. Touch Target Size (Mobile)**
- Minimum 48×48 dp (device-independent pixels)
- Sufficient spacing between targets
Example TC: "Verify all mobile buttons ≥48×48 dp with min 8px spacing"

**Localization Testing**

**Character Sets:**
- Vietnamese with diacritics (à, á, ả, ã, ạ, ă, ằ, ắ, ẳ, ẵ, ặ, ...)
- Emoji (👍, ❌, 📱, etc.)
- RTL languages (Arabic, Hebrew) if applicable
- Chinese/Japanese characters if applicable

**Examples:**
- TC: "Enter Vietnamese email: user_đặc_biệt@example.com, verify accepted"
- TC: "Enter Emoji in comment: '😀 Great app!' verify stored and displayed correctly"
- TC: "Enter Arabic text 'مرحبا' in text field, verify RTL rendering and search functionality"

**Accessibility Regression Testing**
Always include regression test when modifying accessible features:
- TC: "After updating login button color to new branding, verify new color maintains 4.5:1 contrast with background"

### Engine 4: Test Case Generation (Atomic Granularity)

#### 🔴 STEP 0 — Schema Pre-Load (MANDATORY BEFORE GENERATION)
Before writing any test case row, AI MUST execute:
1. Read `schemas/testcase.schema.md` — confirm Enum allowed values for the 4 critical columns:

   | Column | Allowed Values (per schema) |
   |---|---|
   | **Priority** | `Critical` \| `High` \| `Medium` \| `Low` |
   | **Severity** | `Blocker` \| `Critical` \| `Major` \| `Minor` \| `Trivial` |
   | **Type** | `Functional` \| `Negative` \| `Boundary` \| `UI` \| `Security` \| `Performance` \| `Integration` \| `Regression` |
   | **Automation Candidate** | `Yes` \| `No` (strictly 2 binary values — NO `Partial`) |

2. Verify mandatory formatting rules from schema:
   - **Steps Description**: Must start with `Step 1:`, `Step 2:`, ... (do not use `1.`, `2.`, ...)
   - **Pre-Requisite**: MUST consist only of declarative state precondition statements, strictly **NO `Step 1:`, `Step 2:` prefixes**. The `Step X:` prefix is STRICTLY RESERVED for the `Steps Description` column.
   - **Anti-LaTeX**: Strictly forbidden to use `$...$`, `\Delta`, `\$` in any cell.

3. If any value is not in the schema → **AUTOMATICALLY MAP** to the closest valid schema value:
   - `UI / UX`, `State Transition`, `Decision Table`, `Concurrency` → `Functional`
   - `Resilience`, `Race Condition` → `Integration`
   - `Partial` (Automation) → `No`

#### Once Schema Pre-Load is complete, proceed with:
- Generate test cases following the exact output structure defined in `templates/testcases.md`.
- **Atomic Rule (CRITICAL):** Each test case validates ONE single behavior or UI element. 
  - **UI Elements:** MUST NOT group multiple UI elements (e.g., Banner, Map, Icon, Arrow, Button) into one testcase. You MUST create 1 separate TC for EACH UI element or state change.
  - **Business Logic:** MUST NOT combine UI, Security, and Logic validations into a single TC.
- Each step performs ONE user action.
- **Concrete Test Data:** Use realistic, executable test data (e.g., `Enter email: test_01@domain.com` - Absolutely do not use "Enter valid data").

### Engine 5: Requirement Traceability
- Every test case MUST map to at least one Requirement ID (FR ID).
- Build traceability links: Requirement → Scenario → Test Case.

### Engine 6: Coverage Enforcement
- Validate coverage distribution against thresholds in `rules/test_generation_rules.md`.
- Ensure minimum test case counts based on feature size.

### Engine 7: Quality Validation
- Verify test data is realistic and expected results are specific/deterministic.
- Verify test steps use action verbs (Launch, Navigate, Tap, Enter, Verify).
- Verify no duplicate test cases exist.

### Engine 8: AI Self Review & Quality Gate
- Run the Self Audit Engine defined in `rules/test_generation_rules.md` Section 15.
- **Score 11 Quality Criteria (STRICT ENFORCEMENT):** 
  1. Unique TC ID. 
  2. 1-to-1 Step-Expected Matching. 
  3. Concrete Test Data. 
  4. Field Validation Coverage. 
  5. Automation Metadata Ready.
  6. **Atomic Granularity Check:** Are any UI actions or validations grouped together? (e.g. testing 2 buttons in 1 case). If YES → FAIL.
  7. **NFR Coverage Check:** Does the suite contain explicit Security, Performance, and UI/UX test cases? If NO → FAIL.
  8. **Deep Tech Check:** Does the suite contain at least 1 case for API Error (e.g. HTTP 500/Timeout) and 1 case for Mobile Lifecycle (Kill/Background)? If NO → FAIL.
  9. **Strict Black-Box Vocabulary Check:** Are there any internal backend/implementation terms (`webhook`, `event payload`, `evt_*`, `POST /api/`, `HTTP 200`, `database`, `table`, `column`, `SQL query`, internal variable names, etc.) in manual functional test cases? If YES → FAIL and rewrite strictly to user-facing observable actions.
  10. **5-Pillar Coverage Check:** Does the suite cover all 5 pillars (UI Flow, Permutation Matrix, T0 vs T1 Lifecycle, Exception Handling, Communication Loop) where applicable? If NO → FAIL.
  11. **Communication First-Class Check:** Are all transactional notifications, messages, and emails tested with dedicated `*-NOT-*` test cases including deep-link and dynamic placeholders? If NO → FAIL.
- Output a brief `<audit_summary>` block. If ANY check fails → regenerate affected test cases.

### Engine 9: Output Formatting
- Format output strictly following `templates/testcases.md`.
- Use HTML `<br>` tags for multi-step cells.
- Ensure TC_IDs are unique and sequential.

### Engine 10: Post-Generation CSV Sync (Strict Rule)
- **ABSOLUTELY DO NOT** generate sample/demo testcases. Must output 100% of the complete TC suite.
- Do **not** attempt to generate CSV text directly in the output.
- After the markdown table is successfully saved, **MANDATORY** to execute the conversion script:
  `python scripts/md_to_csv.py reports/[Requirement_Name]_Testcases.md reports/[Requirement_Name]_Testcases.csv`

---

## 📜 Invoke Rules

- `rules/global_rules.md`
- `rules/test_generation_rules.md`
- System `AGENTS.md` rules (`no_sample_testcases`, `csv_sync_workflow`, `nfr_testcase_coverage`, `atomic_granularity_breakdown`, `implicit_edge_cases_coverage`, `directory_organization`).

---

## 🛑 Anti-Patterns (STRICTLY PROHIBITED)

- ❌ Generating generic test data / placeholders (must use concrete, realistic data).
- ❌ Generating only Happy Path, omitting Negative/Boundary/Edge cases.
- ❌ Grouping validation of multiple fields into a single test case → each field must have its own atomic TC.
- ❌ Grouping multiple UI elements (e.g., Banner, Map, Icon) into 1 test case → each UI component or interaction must have an independent atomic TC.
- ❌ Using backend/whitebox terminology (`webhook`, `event bus`, `POST /api/`, `HTTP 200`, `database`, `table`, `SQL query`) in manual functional test cases.
- ❌ Skipping the effective timestamp T1 (Effective Date / Scheduled Execution arrival) for scheduled or deferred transactions/states.
- ❌ Grouping email/notification verification as a secondary phrase in Expected Result instead of creating dedicated test cases (`*-NOT-*`).
- ❌ Skipping API validation (HTTP 500, Timeout, Payload Boundary).
- ❌ Skipping Mobile Lifecycle (Kill App, Backgrounding).

---

## 🔁 Failure Handling

### If requirement documents are missing:
- **STOP** execution. Output: "No requirement documents found in docs/requirements/."

### If requirement is ambiguous:
- **PAUSE** test generation immediately. Do NOT generate any test cases.
- Do NOT re-execute Engine 1.
- Output the Ambiguity Report exactly in the following format:

```text
🔴 Test Generation Paused - Requirement Ambiguities Detected

### Ambiguity Analysis
Q&A Questions (Please Answer)

**Q1: [Specific ambiguous point]**
- Context: [Where in requirement]
- Impact: [How it affects test generation]
- Suggested Options:
  - Option A: [Interpretation 1]
  - Option B: [Interpretation 2]

**Q2: [Next ambiguity]**
...

### Generation Blockers
- [Blocker 1]: [Why it blocks generation]
- [Blocker 2]: [Why it blocks generation]

### Next Steps
- User Action: Provide clarification for Q1-Qn above
- AI Action: Resume from Engine 2 with clarifications
- Output: Complete test case suite

Please provide answers to proceed.
```
- Wait for the user to provide answers before resuming generation at Engine 2.

### Never invent undocumented features.

---

## ⚙️ Execution Principle

- **FULL RBT Mode:** Execute ALL 10 Engines sequentially. Must pause at designated Human Checkpoints (e.g., after Engine 1/2) for user review and confirmation before proceeding to Test Case Generation. No partial execution is allowed for the final generation steps.
