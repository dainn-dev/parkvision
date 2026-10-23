# 🎨 Design Auditor Skill (Production Version)

---

## 🧩 Skill Metadata
- **name:** design_auditor_skill
- **version:** 3.0.0
- **category:** QA / UX Validation / Design Audit
- **description:** Audit UI/UX design documents against SRS to detect missing states, missing components, flow mismatches, and accessibility/responsiveness gaps.

---

## 🎯 Purpose
Perform deep audit of Design artifacts (UI, UX, Wireframes) against functional requirements (SRS) to:
- Detect UI components missing from Design (but required by SRS).
- Identify missing error states, empty states, or edge case UI flows.
- Flag logical flow mismatches between UX navigation and Business Logic.

---

## 📥 Inputs

### Required
- `docs/requirements/*` (Primary: SRS)
- `docs/designs/*` (Primary: Design descriptions, Wireframe logic, Flow docs)

### Minimum Requirement
- If `docs/designs/` is empty → SKIP execution (Log: "No design documents found. Skipping Design Audit.")

---

## 📤 Output

Generate:
📄 `reports/[Requirement_Name]_Design_Audit_Report.md`

Use template:
📄 `templates/design_audit.md`

---

## ⚙️ Core Processing Engine

---

## 1. Requirement vs Design Extraction Engine

### Tasks:
- Load all functional UI requirements from `docs/requirements/`
- Load all design elements, screens, and components from `docs/designs/`
- Build a mapping tree: [Requirement] <---> [Design Screen/Component]

---

## 2. Component Completeness Engine (Missing UI)

### Validation Rules:
- Every data input required by SRS MUST have a corresponding UI field.
- Every action (Submit, Cancel, Delete) MUST have a corresponding UI trigger (Button, Link, Icon).

Detect:
#### ❌ Missing Field
- SRS requires a field (e.g., "Phone Number"), but Design omits it.
#### ❌ Missing Trigger
- SRS requires an action, but Design lacks the button/link.

---

## 3. State & Edge Case Engine (Missing States)

### Validation Rules:
- Happy path UI is NOT enough.

Detect:
#### ❌ Missing Error State
- UI missing validation error messages for inputs.
#### ❌ Missing Empty State
- UI missing "No data found" or empty list views.
#### ❌ Missing Loading State
- UI missing progress indicators for async operations.

---

## 4. Flow Consistency Engine (Flow Mismatch)

### Validation Rules:
- Ensure the user journey defined in Design matches the Business Logic.

Detect:
#### ❌ Navigation Mismatch
- Clicking X in Design goes to Y, but SRS says it should go to Z.
#### ❌ Dead End
- A screen with no exit or back navigation.

---

## 🚨 Failure Handling Rules

### If `docs/designs/` is empty:
- Output: "No design documents found to audit."
- STOP EXECUTION of this skill.

---

## 📊 Output Format (Strict Markdown Contract)

---

## 1. 📌 Executive Summary

- Design Documents Audited: X
- SRS Requirements Mapped: Y
- Missing UI Components: [Count]
- Missing UI States: [Count]
- Flow Mismatches: [Count]

---

## 2. 🎨 Design Audit Findings

Each issue MUST follow this structure:

---

### 🧾 Issue: DA-001

- **Type:** Missing Component / Missing State / Flow Mismatch
- **Severity:** 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low
- **Screen/Module:** [Name of the screen in Design]

---

**📌 SRS Requirement:**
> [Exact quote from SRS]

**📌 Design Observation:**
> [Describe what is actually in the Design / What is missing]

---

**📖 Issue Description:**
Clear explanation of the UI/UX mismatch.

---

**💡 Recommendation:**
- Exact UI element or state that needs to be added to the Design.

---

## ⚠️ RULES (STRICT)

- ❌ NO HALLUCINATION: Do not invent design screens that aren't provided.
- ✔ ONLY evaluate based on the provided text descriptions of the designs.
- ✔ Focus strictly on the intersection of UI/UX and Functional Logic.

---

## 5. Accessibility & Responsiveness Engine

### Validation Rules:
- Designs should support accessible interaction for users with disabilities.
- Responsive layouts should be considered for multi-device usage.

Detect:
#### ❌ Missing Accessibility
- UI missing alt-text for images or icons.
- UI missing keyboard navigation support.
- UI missing sufficient color contrast (WCAG 2.1 AA).
- UI missing focus indicators for interactive elements.
- UI missing screen reader labels for non-text content.

#### ❌ Missing Responsiveness
- UI missing mobile viewport adaptation.
- UI missing tablet layout considerations.
- UI missing breakpoint handling for critical screens.

#### ❌ Missing Internationalization
- UI missing RTL (Right-to-Left) layout support (if applicable).
- UI missing text truncation handling for longer translations.
- UI missing dynamic text sizing for multi-language content.
