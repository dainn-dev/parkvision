# 📐 Master UAT Script Schema (v1.0.0)
> **Status:** Active Standard | **Applicable to:** `uat_script_generator`, `templates/uat_scripts_report.md`

---

## 1. 🎯 Purpose & Design Philosophy
This schema specifies the standardized structure for User Acceptance Test (UAT) scripts.

Unlike technical Manual Test Cases that delve into specific input fields, technical status codes, and boundary conditions, **UAT Scripts are designed specifically for Clients, Product Owners (PO), and Business Users**.

### Core Philosophy:
1. **Business Language:** Plain, intuitive phrasing without deep technical jargon (e.g., avoiding HTTP status codes, database table names, regex).
2. **End-to-End User Journeys:** Validates realistic user journeys from initiation to business objective fulfillment.
3. **Value Validation:** Focuses on whether the system delivers expected business value (e.g., funds settled in account, confirmation notification received, ride completed safely).

---

## 2. 🆔 UAT Script ID Specification
UAT Script IDs MUST follow the format:
$$\text{UAT-[MODULE]-[NNN]}$$
- **`[MODULE]`**: 3–4 letter uppercase business module code (e.g., `RID` = Rider, `DRV` = Driver, `FIN` = Financial, `PAY` = Payment).
- **`[NNN]`**: 3-digit sequential number starting from `001` (e.g., `UAT-RID-001`, `UAT-FIN-005`).

---

## 3. 📋 Field Specification

| Field Name | Data Type | Mandatory | Value Constraints | Description & Instructions |
|---|:---:|:---:|---|---|
| **`uat_id`** | String | ✅ Yes | Regex: `^UAT-[A-Z0-9]{2,6}-\d{3}$` | Unique identifier for the UAT scenario. |
| **`title`** | String | ✅ Yes | 15 – 120 characters | Scenario title reflecting the user's business objective. |
| **`user_role`** | String | ✅ Yes | `Rider` \| `Driver` \| `Host` \| `Admin` \| `Fleet Manager` | User role executing the scenario. |
| **`user_story`** | String | ✅ Yes | Structure: `As a [who], I want to [do what], so that [achieve what]` | User story framework describing the business context. |
| **`pre_condition`**| String | ✅ Yes | Intuitive initial state | Business prerequisites prior to execution (e.g., "Account has a balance of $50.00"). |
| **`steps`** | String | ✅ Yes | Sequential user action steps, separated by `<br>` | Step-by-step user actions (e.g., `Step 1: Open app...<br>Step 2: Select destination change...`). |
| **`test_data`** | String | ⬜ Optional | Concrete business data | Realistic, easy-to-understand test data (street names, concrete amounts). |
| **`expected_outcome`**| String | ✅ Yes | Observable business outcome | Visible business results (UI state, email notification, accurate balance debit). |
| **`acceptance_criteria`**| String | ✅ Yes | Reference to PRD/SRS criteria | Core business acceptance criteria verified by this scenario. |
| **`risk_ref`** | String | ⬜ Optional | `RISK-[MODULE]-[NNN]` | Corresponding business risk validated by this scenario. |
| **`verdict`** | Enum | ✅ Yes | `Pass` \| `Fail` \| `Conditional Pass` \| `Not Executed` | Final UAT sign-off decision by client / business reviewer. |

---

## 4. 📝 Standard Markdown Representation in Reports

### A. Detailed Journey Block Format:
```markdown
### 📌 [UAT-RID-001]: Rider modifies destination during active ride and completes payment for new fare
- **User Role**: Rider
- **User Story**: As a rider currently in a vehicle, I want to change my drop-off destination to a new address to accommodate an unexpected change of plans.
- **Pre-conditions**: Ride is in active `In Trip` status, driver has picked up rider, drop-off location is not within proximity lock distance (>500m).
- **Risk Ref**: `RISK-RID-002` (System must not reroute trip without successful pre-authorization of fare Delta).

**📋 Business Steps:**
1. Open active live tracking screen for current ongoing trip.
2. Tap the edit pencil icon (✏️) adjacent to the "DROP OFF" destination field.
3. Search and select the new destination address (3km further than original drop-off).
4. Review confirmation modal: verify new Absolute ETA, old fare, fare increase Delta (+$5.00), and new total fare.
5. Tap "Send Request" button.

**🎯 Expected Business Outcome:**
- Application displays confirmation message "Destination updated successfully".
- Map route polyline automatically redraws towards the new destination.
- Driver application receives synchronized route update notification and automatically reroutes GPS navigation.
- Rider's credit card pre-authorizes exactly the +$5.00 Delta without any unexpected duplicate charges.

**🏁 UAT Sign-off:** [ ] Pass  [ ] Fail  [ ] Conditional Pass
- **Reviewer**: _______________________   **Date**: ____/____/2026
```

### B. UAT Summary Table Format:
```markdown
| UAT ID | Scenario Title | Role | Test Focus | Acceptance Criteria | Verdict |
|---|---|---|---|---|:---:|
| `UAT-RID-001` | Valid mid-trip destination change | Rider | Standard fare increase flow | Synchronized route & fare across rider and driver | Pass |
| `UAT-RID-002` | Card declined during destination change | Rider | Payment pre-authorization failure | Preserves original route with clear error prompt | Pass |
| `UAT-RID-003` | Driver rejects modification for safety | Driver | Driver safety override valve | Closes fare at actual distance without driver penalty | Pass |
```
