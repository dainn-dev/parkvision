# 📐 Master Test Case Schema (14-Column Specification)
> **Status:** Active Standard | **Applicable to:** `testcase_generator`, `coverage_analyst`, `scripts/md_to_csv.py`, `templates/testcases.md`

---

## 1. 🎯 Purpose & Core Standards
This schema defines the standardized data structure for the 14-column Test Case table across the entire repository. The Test Case table must satisfy three primary objectives simultaneously:
1. **Human-Readable:** Easily readable, reviewable, and executable manually by QA/QC, Developers, and Product Owners.
2. **Import-Ready:** Seamlessly convertible to CSV via `scripts/md_to_csv.py` and directly importable into Jira / Xray / Zephyr / TestRail without parsing errors.
3. **Traceable:** Every test case maps directly back to FR ID, Risk ID, and Edge Case ID.

---

## 2. 📋 Mandatory 14-Column Specification

> ⚠️ **Immutable Rule:** The sequence and header names of the 14 columns in English **MUST NEVER BE MODIFIED, REORDERED, OR TRANSLATED**.

| # | Column Header | Data Type | Mandatory | Constraints & Allowed Values | Content Writing Standard |
|:---:|---|:---:|:---:|---|---|
| **1** | **`Test Case ID`** | String | ✅ Yes | Regex: `^[A-Z0-9]{2,8}-(TC\|[A-Z0-9]{2,6})-\d{3}$`<br>Example: `RID-TC-001`, `MOD-DEST-001` | Unique identifier within the test suite. No duplicates allowed. |
| **2** | **`Module`** | String | ✅ Yes | High-level module name (e.g., `Ride In Progress`, `Authentication`, `Host Financial`) | Accurately reflects the module/subsystem defined in the FRS/SRS. |
| **3** | **`Function`** | String | ✅ Yes | Specific feature name (e.g., `In-Trip Modifications`, `Driver Payout`) | Identifies the specific sub-feature under test. |
| **4** | **`FR ID`** | String | ✅ Yes | Functional Requirement ID (e.g., `FR-RID-7.1`, `FR-ACS-FIN-2.3`) | Direct traceability to the item in the requirement documentation. |
| **5** | **`Test Case Description`** | String | ✅ Yes | Written in English, starting with `Verify that...` or `Verify [component/behavior]...` | Concise description of the test objective. |
| **6** | **`Pre-Requisite`** | String | ✅ Yes | Initial state conditions. Multiple conditions separated by `<br>`. | Initial state of system, account, and test data prior to test execution. **CRITICAL RESTRICTION: STRICTLY FORBIDDEN to number actions as `Step 1:`, `Step 2:` in this column** (`Step X:` formatting is STRICTLY RESERVED for `Steps Description`). |
| **7** | **`Steps Description`** | String | ✅ Yes | Written in English. Each step starts with an **Action Verb** (`Navigate`, `Click`, `Enter`, `Select`, `Upload`, `Verify`). Separated by `<br>`. | Format: `Step 1: ...<br>Step 2: ...<br>Step 3: ...`. Literal newlines `\n` inside table cells are strictly prohibited. |
| **8** | **`Test Data`** | String | ⬜ Optional | Concrete input parameters (strings, numbers, BVA boundaries, state values). Fields separated by `<br>`. | Specific parameterized data. If no specific test data is required, leave empty or write `N/A`. |
| **9** | **`Expected Result`** | String | ✅ Yes | Written in English. **Must be an Observable Outcome** from user/system perspective in plain prose. Strictly **NO** numbered items (`1. 2. 3.`). | Do not include action steps here. Preserve source-defined UI labels and error messages in quotes. Multiple observations separated by `<br>` or contiguous sentences. |
| **10**| **`Priority`** | Enum | ✅ Yes | `Critical` \| `High` \| `Medium` \| `Low` | Execution priority ranking within the test cycle. |
| **11**| **`Severity`** | Enum | ✅ Yes | `Blocker` \| `Critical` \| `Major` \| `Minor` \| `Trivial` | Impact severity if this test case fails. |
| **12**| **`Type`** | Enum | ✅ Yes | `Functional` \| `Negative` \| `Boundary` \| `UI` \| `Security` \| `Performance` \| `Integration` \| `Regression` | Testing type/technique classification. |
| **13**| **`Automation Candidate`**| Enum | ✅ Yes | `Yes` \| `No` | Binary feasibility evaluation for automated script conversion (standard binary measure for automation metrics). |
| **14**| **`Remarks`** | String | ⬜ Optional | Additional notes, risk mapping (`RISK-RID-001`), or required assumptions `[Assumption]: ...`. | Mandatory `[Assumption]: ...` tag if expected result is not 100% verified by official documentation. |

---

## 3. 🛡️ Markdown Table Formatting Rules

### 1. Line Break Rule (HTML Line Break `<br>`):
- Strictly **DO NOT use literal newlines** (`\n` or Enter) inside any markdown table cell, as it breaks table row structure when exported to CSV.
- All intra-cell line breaks MUST use `<br>`.

### 2. Pipe Character Escaping (`\|`):
- If cell content contains a pipe character `|`, it must be escaped as `\|` so that the `md_to_csv.py` parser does not interpret it as a column delimiter.

### 3. Language Governance Standard:
- Column headers and all cell contents (Description, Steps, Expected Result, Pre-requisite) MUST be written in **English**.
- UI labels, error messages, status names, and notification text explicitly defined in source FRS documents: **PRESERVE EXACTLY** (e.g., `Click the "Hủy chuyến" button`, system displays `"Bạn có chắc chắn muốn hủy chuyến?"`).

### 4. Plain-Text Math & Currency Rule (Anti-LaTeX):
- **STRICTLY PROHIBITED:** Mathematical LaTeX syntax (`$...$`, `$$...$$`, `\Delta`, `\$`, `\times`, `\le`, `\ge`, `\text{...}`) in any cell of the Test Case table. This causes severe rendering and parsing failures when exported to CSV or opened in Google Sheets / Microsoft Excel.
- **Mandatory Plain-Text Equivalents:**
  - **Greek letters:** Convert to plain words in parentheses, e.g., use `(Delta)` or `Delta` instead of `$\Delta$`.
  - **Currency symbols:** Write directly as `$38.50` (or `VND 50,000`), NEVER escape with backslash `\$38.50`.
  - **Arithmetic operators:** Use standard keyboard characters: `=`, `+`, `-`, `*`, `<=`, `>=`, `!=`, `~`.
  - **Formulas & Expressions:** Write as clear, plain natural text:
    - ❌ FORBIDDEN: `Fare Delta $\Delta$ calculates exactly as: $\$38.50 - \$30.00 = +\$8.50$.`
    - ✅ STANDARD: `Fare Delta (Delta) = $38.50 - $30.00 = +$8.50`
    - ❌ FORBIDDEN: `Fare Delta $\Delta \le \$0$`
    - ✅ STANDARD: `Fare Delta (Delta) <= $0`
    - ❌ FORBIDDEN: `$\text{New Total} = \text{Base} + \text{Distance}$`
    - ✅ STANDARD: `New Total = Base + Distance`
    - ❌ FORBIDDEN: `Extreme fare increase ($\Delta > \$40$ or $\Delta > 100\%$)`
    - ✅ STANDARD: `Extreme fare increase (Delta > $40 or Delta > 100%)`

---

## 4. 📝 Standard Table Concrete Example

```markdown
| Test Case ID | Module | Function | FR ID | Test Case Description | Pre-Requisite | Steps Description | Test Data | Expected Result | Priority | Severity | Type | Automation Candidate | Remarks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RID-TC-001 | Ride In Progress | In-Trip Modifications | FR-RID-7.1 | Verify edit pencil icon is displayed adjacent to DROP OFF destination when trip is In Trip | Trip is in active `In Trip` status after driver confirmed pickup.<br>Modification count = 0. | Step 1: Open live tracking view for active trip.<br>Step 2: Inspect Route Detail card DROP OFF destination row. | Status: `In Trip`<br>Mod Count: 0 | An active edit pencil icon (✏️) is displayed adjacent to the final DROP OFF destination row.<br>The pencil icon is tappable. | High | Major | UI | Yes | |
| RID-TC-002 | Ride In Progress | In-Trip Modifications | FR-RID-7.4 | Verify destination change is rejected when payment pre-authorization fails | Rider requested destination change with fare increase Delta > $0.<br>Card on file is expired or declined. | Step 1: Select new destination with Delta = +$5.00.<br>Step 2: Tap "Send Request" button.<br>Step 3: Observe system handling during Stripe pre-auth failure. | Delta: `+$5.00`<br>Card: `Declined` | System keeps the original destination intact without rerouting.<br>The system displays error message: "We couldn't validate your payment method. Your trip will continue to the original destination." | Critical | Blocker | Negative | Yes | [Assumption]: Retry limit is 1 before auto-rollback |
```
