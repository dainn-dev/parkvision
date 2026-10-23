# 📋 Test Cases Output Template

---

## 📄 Document Metadata
| Property | Details |
|----------|---------|
| **Date Generated** | [YYYY-MM-DD] |
| **Target Requirements** | [e.g., Requirement_Name.md] |
| **Test Suite** | [e.g., testcases.md] |
| **Total Test Cases** | [X] |
| **Analyzed By** | Test Case Generator Skill (v3.0.0) |

---

## 🛠️ Applied Test Design Techniques

The following techniques MUST be listed. For each, describe what was specifically validated:

- **Happy Path:** [What was validated]
- **Negative Testing:** [What was validated]
- **Boundary Value Analysis (BVA):** [What was validated]
- **Equivalence Partitioning:** [What was validated or "N/A - no equivalence classes"]
- **State Transition Testing:** [What was validated or "N/A - no state transitions"]
- **Decision Table Testing:** [What was validated or "N/A - no decision tables"]
- **Role-Based Testing:** [What was validated or "N/A - single role only"]
- **Error Guessing:** [What was validated]
- **Error Handling:** [What was validated - API errors, network failures, etc.]
- **Security Testing:** [What was validated - injection, authorization, etc.]
- **Performance Testing:** [What was validated or "N/A - out of scope"]
- **UI/UX Validation:** [What was validated]
- **Regression Testing:** [What was validated or "N/A - new feature"]
- **Context-Aware Integration Testing:** [What was validated or "N/A - standalone feature"]

> **Rule**: If the `advanced_edge_case_analyzer` agent was executed in the workflow, the `Advanced Edge Cases` bullet MUST be populated with specific findings. Do NOT omit this line.

## 📐 Applied Generation Rules

> This section summarizes ALL rules from `rules/test_generation_rules.md`. Each row references a specific rule section and explicitly states if it was applied (`✅ Applied`) or not (`❌ Not Applied`). If not applied, a reason MUST be provided.

| # | Rule | Section | Status | Description / Reason if Not Applied |
|---|------|---------|--------|--------------------------------------|
| 1 | **Requirement Decomposition** | §1.1 | ✅ Applied | [Description] |
| 2 | **Functional Component ID** | §1.2 | ✅ Applied | [Description] |
| 3 | **Assumption Identification** | §1.3 | ✅ Applied | [Description] |
| 4 | **Dependency Identification** | §1.4 | ✅ Applied | [Description] |
| 5 | **High Risk Analysis** | §1.5 | ✅ Applied | [Description] |
| 6 | **Regression Impact Analysis** | §1.6 | ❌ Not Applied | [Reason] |
| 7 | **Requirement Clarity & Ambiguity Handling** | §1.7 | ✅ Applied | [Description] |
| 8 | **Happy Path** | §2.1 | ✅ Applied | [Description] |
| 9 | **Negative Testing** | §2.2 | ✅ Applied | [Description] |
| 10| **Boundary Value Analysis (BVA)** | §2.3 | ✅ Applied | [Description] |
| 11| **Equivalence Partitioning** | §2.4 | ❌ Not Applied | [Reason] |
| 12| **State Transition Testing** | §2.5 | ✅ Applied | [Description] |
| 13| **Decision Table Testing** | §2.6 | ❌ Not Applied | [Reason] |
| 14| **Role-Based Testing** | §2.7 | ❌ Not Applied | [Reason] |
| 15| **Error Guessing** | §2.8 | ✅ Applied | [Description] |
| 16| **Error Handling** | §2.9 | ✅ Applied | [Description] |
| 17| **Security Testing** | §2.10 | ✅ Applied | [Description] |
| 18| **Performance Testing** | §2.11 | ❌ Not Applied | [Reason] |
| 19| **UI / UX Validation** | §2.12 | ✅ Applied | [Description] |
| 20| **Regression Testing** | §2.13 | ❌ Not Applied | [Reason] |
| 21| **Context-Aware Integration** | §2.14 | ✅ Applied | [Description] |
| 22| **Minimum Coverage Criteria** | §3.1 | ✅ Applied | [Description] |
| 23| **Requirement Traceability** | §3.2 | ✅ Applied | [Description] |
| 24| **Multiple Requirement Rule** | §3.3 | ✅ Applied | [Description] |
| 25| **Missing Requirement Handling** | §3.4 | ❌ Not Applied | [Reason] |
| 26| **Cross-Artifact Traceability** | §3.5 | ✅ Applied | [Description] |
| 27| **Coverage Distribution Rules** | §4 | ✅ Applied | [Description] |
| 28| **Priority Assignment** | §5.1 | ✅ Applied | [Description] |
| 29| **Priority Consistency Rule** | §5.2 | ✅ Applied | [Description] |
| 30| **Severity Classification** | §6.1 | ✅ Applied | [Description] |
| 31| **Automation Candidate** | §7.1 | ✅ Applied | [Description] |
| 32| **Automation Ratio** | §7.2 | ✅ Applied | [Description] |
| 33| **Automation Validation** | §7.3 | ✅ Applied | [Description] |
| 34| **Duplicate Definition** | §8.1 | ✅ Applied | [Description] |
| 35| **Merge Rule** | §8.2 | ✅ Applied | [Description] |
| 36| **Duplicate Self Audit** | §8.3 | ✅ Applied | [Description] |
| 37| **Allowed Atomicity** | §9.1 | ✅ Applied | [Description] |
| 38| **Not Allowed Atomicity** | §9.2 | ✅ Applied | [Description] |
| 39| **Action Rule** | §9.3 | ✅ Applied | [Description] |
| 40| **Test Data Examples** | §10.1 | ✅ Applied | [Description] |
| 41| **Boundary Data** | §10.2 | ✅ Applied | [Description] |
| 42| **Expected Result Standards** | §11 | ✅ Applied | [Description] |
| 43| **Output Structure** | §12.1 | ✅ Applied | [Description] |
| 44| **TC_ID Convention** | §12.2 | ✅ Applied | [Description] |
| 45| **Test Step Rules** | §12.3 | ✅ Applied | [Description] |
| 46| **Step Writing Standard** | §12.4 | ✅ Applied | [Description] |
| 47| **HTML Line Break Rule** | §12.5a | ✅ Applied | [Description] |
| 48| **Artifact Synchronization Rule** | §12.5b | ✅ Applied | [Description] |
| 49| **Applied Rules Listing Standard** | §12.6 | ✅ Applied | [Description] |
| 50| **Review Criteria** | §13.1 | ✅ Applied | [Description] |
| 51| **Review Principle** | §13.2 | ✅ Applied | [Description] |
| 52| **Pre-Output Coverage Validation** | §14.1 | ✅ Applied | [Description] |
| 53| **Pre-Output Distribution Validation** | §14.2 | ✅ Applied | [Description] |
| 54| **Pre-Output Automation Validation** | §14.3 | ✅ Applied | [Description] |
| 55| **Pre-Output Duplicate Validation** | §14.4 | ✅ Applied | [Description] |
| 56| **Pre-Output Quality Validation** | §14.5 | ✅ Applied | [Description] |
| 57| **Pre-Output Format Validation** | §14.6 | ✅ Applied | [Description] |
| 58| **Audit Sequence** | §15.1 | ✅ Applied | [Description] |
| 59| **Failure Handling** | §15.2 | ❌ Not Applied | [Reason] |
| 60| **Quality Gates** | §16 | ✅ Applied | [Description] |
| 61| **AI Regeneration Rules** | §17 | ❌ Not Applied | [Reason] |
| 62| **Generation Order** | §18.1 | ✅ Applied | [Description] |
| 63| **Mandatory Principles** | §18.2 | ✅ Applied | [Description] |
| 64| **Token Limit / Handling** | §18.3 | ❌ Not Applied | [Reason] |
| 65| **CSV & Excel Formatting Rules** | §19 | ✅ Applied | [Description] |

> **Rule**: ALL rules must be listed exactly as above using `✅ Applied` or `❌ Not Applied`. Do NOT omit any rule.

## 🧨 Edge Case Summary

> This section maps edge cases from the Edge Case Report into the test suite. Each row traces an edge case finding back to its source and the test case(s) that cover it.

| Edge Case ID | Source | Description | Mapped Test Case(s) |
|-------------|--------|-------------|---------------------|
| [EDGE-001] | [Edge Case Report] | [e.g., Concurrent OTP API spam] | [e.g., REG-AUTH3-005] |
| [EDGE-002] | [Edge Case Report] | [e.g., Lockout timer BVA] | [e.g., REG-AUTH1-011] |

> **Rule**: If no Edge Case Report exists for this requirement, write "N/A — Edge Case Analyzer was not executed in this workflow run."

## 🔥 Risk Summary

> This section maps risks from the Risk Analysis Report into the test suite. Each row traces a risk finding to the test case(s) that verify its mitigation.

| Risk ID | Requirement | Risk Description | Level | Mapped Test Case(s) |
|---------|------------|------------------|-------|---------------------|
| [RISK-001] | [FR-XXX] | [e.g., Brute-force login attacks] | [🟠 High] | [e.g., REG-AUTH1-008, REG-AUTH1-010] |
| [RISK-002] | [FR-XXX] | [e.g., Session hijacking] | [🟠 High] | [e.g., REG-AUTH1-018, REG-AUTH1-020] |

> **Rule**: If no Risk Analysis Report exists for this requirement, write "N/A — Risk Analyst was not executed in this workflow run."

## ✅ Self-Review Audit

> The generator MUST perform a self-review audit before finalizing the report. List all checks and their status.

```
<audit_summary>
- [✓/✗] Requirement Understanding Audit: [Passed/Failed]
- [✓/✗] Requirement Traceability Audit: [Passed/Failed]
  - All test cases have FR ID mapping
  - Cross-artifact traceability (Risk/Edge Case) complete where applicable
- [✓/✗] Distribution Validation Audit: [Passed/Failed]
- [✓/✗] Duplicate Validation Audit: [Passed/Failed]
- [✓/✗] Quality Validation Audit: [Passed/Failed]
- [✓/✗] Automation Validation Audit: [Passed/Failed]
- [✓/✗] Output Format Audit: [Passed/Failed]
</audit_summary>
```

---


This template defines the standard output structure for generated manual test cases.

The generated test suite shall be:

- Executable
- Traceable
- Excel-ready
- Peer-review ready
- Automation planning ready

This template defines **output format only**. All generation logic and validation rules are governed by `rules/test_generation_rules.md`.

---

# Output Rules

- Generate ONE test case per row.
- Follow the exact column order.
- Do not add, remove, or reorder columns.
- **CSV Stability Warning**: Do not modify column names or insert secondary tables (such as Metadata) inside the main test case table block. Doing so breaks the CSV export parser script.
- **Plain-Text Math & Currency Rule (Anti-LaTeX)**: Do NOT use LaTeX math syntax (`$...$`, `$$...$$`, `\Delta`, `\$`, `\times`, `\le`). Always write equations and numbers in clean plain text: `Fare Delta (Delta) = $38.50 - $30.00 = +$8.50` (see `schemas/testcase.schema.md` §3.4).
- Use HTML `<br>` tags for multiple test steps so it renders correctly in Markdown, but ensure the descriptions are as detailed and literal as if they were written for Excel.
- Every test case must reference exactly one primary Functional Requirement (FR ID).
- Leave Remarks empty unless required by generation rules.
- **CRITICAL DETAIL LEVEL**: The test cases must be EXTREMELY specific. Use exact wording for UI elements (e.g., "Top navigation bar titled 'Subscription' with back arrow"), specify exact visual states (e.g., "active blue background state", "light-blue pill badge"), and specify exact dynamic behaviors (e.g., "Prices dynamically recalculate and update across Basic and Premium cards in real-time"). Vague steps or expected results are NOT allowed.

---

# Test Case Table

| Test Case ID | Module | Function | FR ID | Test Case Description | Pre-Requisite | Steps Description | Test Data | Expected Result | Priority | Severity | Type | Automation Candidate | Remarks |
|--------------|--------|----------|-------|-----------------------|---------------|-------------------|-----------|-----------------|----------|----------|------|----------------------|---------|
| SIG-WELCOME-001 | Splash & Welcome | Splash Screen | FR-SIG-1.1 | Verify branded splash screen is displayed when the application launches. | Application is installed.<br>User has not launched the application. | Step 1: Launch the application.<br>Step 2: Observe the splash screen. | Device: Android 15 | The Rider logo and tagline are displayed immediately after the application launches. | High | Minor | Functional | Yes | |

---

# Column Definitions

| Column | Description |
|----------|-------------|
| **Test Case ID** | Unique identifier following the convention: MODULE-FUNCTION-### |
| **Module** | High-level business module under test. |
| **Function** | Specific feature or function being validated. |
| **FR ID** | Functional Requirement identifier mapped to the test case. |
| **Test Case Description** | Clear business scenario being validated. Must be highly descriptive. |
| **Pre-Requisite** | Required system state before executing the test. |
| **Steps Description** | Step-by-step execution instructions. One action per step using HTML `<br>` line breaks. Must mention exact interaction targets. |
| **Test Data** | Specific input values used during execution. |
| **Expected Result** | Observable and measurable application behavior after execution. Must describe exact UI/UX state mutations, copy, and layout changes. |
| **Priority** | Critical / High / Medium / Low |
| **Severity** | Blocker / Critical / Major / Minor / Trivial |
| **Type** | Functional / Negative / Boundary / UI / Security / Performance / Integration / Regression |
| **Automation Candidate** | Yes / No |
| **Remarks** | Optional notes, risk/edge case mappings (`RISK-RID-001`), or mandatory assumption tag `[Assumption]: ...` (or empty) |

---

# Formatting Standards

## Test Case ID

Format

```
MODULE-FUNCTION-###
```

Examples

```
SUB-ENT-001

AUTH-LOGIN-001

PROFILE-UPDATE-005

BOOKING-CANCEL-012
```

Test Case IDs shall be unique.

---

## Steps Description

Rules

- One action per step.
- Every step begins with **Step X:**
- Multiple steps use HTML `<br>`.
- Be extremely explicit about what to click, tap, or inspect.

Example

```
Step 1: Launch the application.<br>
Step 2: Wait until the Splash screen is displayed.<br>
Step 3: Verify the Rider logo is visible.
```

---

## Test Data

Always use realistic data. Specify exact plans, strings, or values.

Examples

```
Email:
test.user@example.com

Password:
Test@12345

Phone:
0912345678

Coupon:
WELCOME10

Vehicle:
Toyota Camry
```

Avoid

```
Valid Email

Correct Password

Sample Data

ABC

123
```

---

## Expected Result

Expected Result SHALL describe observable system behavior, including precise UI details, copy, and transitions.

### Good Examples

```
Navigates to Subscriptions Overview; recommended plan is highlighted & scrolled into view.

Top navigation bar titled "Subscription" with back arrow. Hero shows 3D piggy-bank icon, bold primary headline, and exact subheadline. Status row shows (ⓘ) "You are currently on the Free plan".

Selected toggle renders with an active blue background state; inactive Monthly displays standard neutral grey background state. Annual displays embedded badge "Save 20%".

Prices dynamically recalculate and update across Basic and Premium cards in real-time without executing full screen reloads. Monthly toggle restores base prices.

Displays plan name "Basic Plan", light-blue pill badge "Value" anchored right. Active price format is bold blue "$9.99 /mo". CTA button explicitly reads "View more & Get Basic Now".
```

### Bad Examples

```
Works correctly.

Success.

Pass.

Expected behavior.

No issue.
```

---

# Priority

Allowed values

```
Critical
High
Medium
Low
```

---

# Severity

Allowed values

```
Blocker
Critical
Major
Minor
Trivial
```

---

# Test Type

Allowed values

```
Functional
Negative
Boundary
UI
Security
Performance
Integration
Regression
```

---

# Automation Candidate

Allowed values

```
Yes

No
```

Automation suitability shall follow the rules defined in:

```
rules/test_generation_rules.md
```

---

# Example Output

| Test Case ID | Module | Function | FR ID | Test Case Description | Pre-Requisite | Steps Description | Test Data | Expected Result | Priority | Severity | Type | Automation Candidate | Remarks |
|--------------|--------|----------|-------|-----------------------|---------------|-------------------|-----------|-----------------|----------|----------|------|----------------------|---------|
| SUB-ENT-001 | Subscriptions | Entry Points | FR-SUB-1.1 | Verify entry navigation from Post-trip recommendation card | User finishes a trip triggering usage rule. | Step 1: Click post-trip card.<br>Step 2: Check screen state. | Plan: Basic | Navigates to Subscriptions Overview; recommended plan is highlighted & scrolled into view. | High | Minor | Functional | Yes | |
| SUB-ENT-002 | Subscriptions | Entry Points | FR-SUB-1.1 | Verify entry navigation from Account Screen | User is on Account profile dashboard. | Step 1: Tap Subscriptions row option.<br>Step 2: Observe view redirect. | N/A | Opens Subscriptions Overview screen with standard vertical stacked layout. | High | Minor | Functional | Yes | |
| SUB-ENT-004 | Subscriptions | Entry Points | FR-SUB-1.2 | Verify navigation behavior with pre-selected Premium plan | Post-trip rule triggers a Premium plan recommendation. | Step 1: Click the Premium post-trip recommendation card.<br>Step 2: Check layout view focus. | Plan: Premium | Overview screen opens with Premium card highlighted and automatically centered in viewport. | High | Minor | Functional | Yes | |
| SUB-OVR-001 | Subscriptions | Overview | FR-SUB-2.1 | Verify screen typography layout and 3D piggy-bank asset rendering | User navigates to Subscriptions Overview screen. | Step 1: Inspect top nav bar and headline formatting text strings.<br>Step 2: Verify status row copy. | Status: Free plan user | Top navigation bar titled "Subscription" with back arrow. Hero shows 3D piggy-bank icon, bold primary headline, and exact subheadline. Status row shows (ⓘ) "You are currently on the Free plan". | High | Minor | UI | Yes | |
| SUB-OVR-002 | Subscriptions | Overview | FR-SUB-2.2 | Verify Billing Cycle Switch Monthly to Annual toggle state mutations | User is on Subscriptions Overview screen. | Step 1: Tap the "Annual" toggle selection item.<br>Step 2: Observe toggle background coloration states. | N/A | Selected toggle renders with an active blue background state; inactive Monthly displays standard neutral grey background state. Annual displays embedded badge "Save 20%". | High | Minor | UI | Yes | |
| SUB-OVR-003 | Subscriptions | Overview | FR-SUB-2.2 | Verify Dynamic Price Update Logic across product cards | User is on Subscriptions Overview screen. | Step 1: Tap "Annual" toggle container segment.<br>Step 2: Observe Basic and Premium price figures.<br>Step 3: Tap "Monthly" toggle segment. | N/A | Prices dynamically recalculate and update across Basic and Premium cards in real-time without executing full screen reloads. Monthly toggle restores base prices. | High | Minor | Functional | Yes | |
| SUB-OVR-004 | Subscriptions | Overview | FR-SUB-2.3 | Verify Basic Plan Card component layouts and copy elements | User is on Subscriptions Overview screen. | Step 1: Inspect header, pricing font, and CTA button text copy string on Basic card. | N/A | Displays plan name "Basic Plan", light-blue pill badge "Value" anchored right. Active price format is bold blue "$9.99 /mo". CTA button explicitly reads "View more & Get Basic Now". | High | Minor | UI | Yes | |

---

# End of Template