# 🧪 UAT Script Generator Skill (Production Version)

---

## 🧩 Skill Metadata

- **name:** uat_script_generator
- **version:** 3.0.0
- **description:** Generate comprehensive business-oriented User Acceptance Test (UAT) scripts from SRS, Business Rules, Test Scenarios, and UI specifications to validate business processes, user journeys, and acceptance criteria before production release.
- **category:** QA / UAT / Business Validation
- **author:** System

---

# 🎯 Purpose

Generate executable **User Acceptance Test (UAT)** scripts that validate business requirements from an end-user perspective.

The generated scripts should help business users determine whether the system is ready for production.

Focus on:

- Business Processes
- End-to-End Workflows
- User Journeys
- Acceptance Criteria
- Business Rules
- Role-based Operations
- Business Outcomes

Unlike QA Test Cases, UAT Scripts should:

- Be easy for business users to execute.
- Avoid technical implementation details.
- Validate business value instead of technical behavior.

---

# 📥 Inputs

## Required Inputs

- `docs/requirements/*` (SRS, PRD, BRD, or any requirement document)
- `templates/uat_scripts_report.md`
- `schemas/uat_script.schema.md` — **🔴 MANDATORY: Must read and load into context before generating any UAT Scripts. Confirm allowed values for Status, Priority, and Pass/Fail Criteria prior to generation.**

## Optional Inputs

- `reports/business_rules.md`
- `reports/*_Test_Scenarios_Report.md` (dynamic naming)
- `reports/*_Risk_Analysis_Report.md` (dynamic naming)
- `reports/*_Coverage_Report.md` (dynamic naming)
- `docs/UI.md`
- `docs/User_Guide.md`

---

# 📤 Output

Generate:

📄 `reports/[Requirement_Name]_UAT_Scripts_Report.md`

Strictly follow:

`templates/uat_scripts_report.md`

---

# ⚙️ Core Processing Rules

---

## 1. Business Flow Extraction

Extract and identify:

- Business Processes
- User Journeys
- Business Goals
- Acceptance Criteria
- User Roles
- Decision Points
- Workflow Steps
- Business Outcomes

Assign Business Flow IDs:

```text
BF-XX
```

---

# 2. UAT Scope Identification

Generate UAT scripts only for business validation.

Focus on:

- Core Business Flows
- End-to-End Processes
- Revenue-impacting Operations
- Customer Journeys
- Approval Workflows
- Business Rules
- Role-based Operations
- Business Reports
- Notifications
- Data Visibility

Exclude:

- API Testing
- Database Validation
- Technical Error Codes
- UI Cosmetic Checks
- Source Code Validation
- Internal Logging
- Performance Benchmarks

---

# 3. UAT Script Generation Rules

Each business process must generate at least one UAT script.

Each script shall include:

- Objective
- Preconditions
- Test Data
- Business Actions
- Expected Business Outcome
- Acceptance Criteria

Scripts should simulate real user behavior.

---

# 4. Role-based UAT Generation

Generate scripts for applicable roles:

- Customer
- Guest
- Staff
- Manager
- Administrator
- Finance
- Support
- Auditor

Only include roles defined in the SRS.

---

# 5. End-to-End Workflow Coverage

Ensure every critical workflow has complete coverage.

Examples:

- User Registration
- Login
- Product Purchase
- Payment
- Refund
- Order Approval
- Report Generation
- Account Management

Each workflow should validate the entire business process from start to finish.

---

# 6. Business Acceptance Validation

Verify:

- Business Rules
- Approval Logic
- Workflow Completion
- Notifications
- Generated Reports
- User Permissions
- Data Visibility
- Business Calculations
- Financial Accuracy

---

# 7. Priority Assignment

| Business Flow | Priority |
|---------------|----------|
|Financial Transactions|P0|
|Payment|P0|
|Authentication|P0|
|Order Processing|P1|
|Approval Workflow|P1|
|Inventory Management|P1|
|Reporting|P2|
|Administration|P2|
|Settings|P3|

---

# 8. Risk-based UAT Enhancement

If `reports/*_Risk_Analysis_Report.md` is available:

Generate additional UAT scripts for:

- Critical Business Risks
- High-risk Financial Operations
- High-risk Approval Workflows
- High-impact Customer Journeys

Mark these scripts as:

```text
[RISK-DRIVEN]
```

---

# 9. Traceability Rules

Each UAT Script must map to:

Requirement

↓

Business Rule

↓

Business Flow

↓

Acceptance Criteria

↓

Test Scenario

↓

UAT Script

---

# 10. Script Quality Rules

Each script must be:

- Business-oriented
- Easy to understand
- Independent
- Repeatable
- Traceable
- Realistic
- Technology independent

Avoid technical terminology whenever possible.

---

# 11. Duplicate Detection

Merge scripts that validate the same business objective.

Avoid duplicate business flows.

---

# 🔁 Failure Handling Rules

### If SRS cannot be parsed

- Stop generation
- Produce error report

---

### If Business Rules are missing

Continue generation.

Clearly identify assumptions.

---

### If Acceptance Criteria are missing

Generate proposed acceptance criteria.

Mark confidence as **Medium**.

---

# 📄 Output Format

---

## 1. 📌 Executive Summary

Include:

- Total Business Flows
- Total UAT Scripts
- Critical Flows
- High Priority Scripts
- Business Coverage Percentage

---

## 2. 📊 UAT Script List

| UAT ID | Business Flow | Requirement | Priority | Status |
|---------|---------------|-------------|----------|--------|
|UAT-001|Customer Login|REQ-01|P0|Ready|
|UAT-002|Checkout|REQ-08|P0|Ready|

---

## 3. 📋 Detailed UAT Script

### UAT ID

UAT-001

### Business Flow

Customer Login

### Requirement

REQ-01

### Objective

Verify that an active customer can successfully log into the application.

### User Role

Customer

### Preconditions

- Customer account exists
- Account is active

### Test Data

| Field | Value |
|--------|-------|
|Username|customer01|
|Password|Password123|

### Business Steps

| Step | Action |
|------|--------|
|1|Open Login page|
|2|Enter Username|
|3|Enter Password|
|4|Click Login|

### Expected Business Outcome

- User is authenticated
- Dashboard is displayed
- Customer profile is available

### Acceptance Criteria

- Login succeeds
- Dashboard loads successfully
- User can continue normal operations

### Execution Status

- Pass
- Fail
- Blocked

### Tester Comments

______________________________

---

## 4. 📈 Business Flow Coverage

| Business Flow | UAT Coverage | Status |
|---------------|--------------|--------|
|Login|Complete|Ready|
|Checkout|Complete|Ready|
|Refund|Partial|Review Required|

---

## 5. 🔗 Traceability Matrix

| Requirement | Business Rule | Scenario | UAT Script |
|-------------|---------------|----------|------------|
|REQ-01|BR-01|SCN-001|UAT-001|
|REQ-08|BR-10|SCN-025|UAT-008|

---

## 6. 🚨 High-Risk UAT Scripts

| UAT ID | Business Risk | Priority |
|---------|---------------|----------|
|UAT-008|Duplicate Payment|P0|
|UAT-010|Refund Validation|P0|
|UAT-012|Approval Workflow|P1|

---

## 7. 🧠 Assumptions & Clarifications

Document:

- Missing business rules
- Assumed user behavior
- Undefined acceptance criteria
- Clarification requests

---

## 8. 📋 Go-Live Readiness Assessment

Summarize:

- Business Flows Ready for UAT
- Missing Business Validation
- Outstanding Risks
- Recommended Go-Live Decision

Possible outcomes:

- ✅ Ready for UAT
- ⚠ Ready with Minor Risks
- ❌ Not Ready

---

## 9. 📌 Final Recommendations

Recommend:

- Execute P0 UAT Scripts first.
- Validate all revenue-impacting workflows.
- Execute end-to-end scenarios before role-specific scenarios.
- Resolve all failed critical UAT scripts before Go-Live.
- Review uncovered business flows and generate additional UAT scripts if necessary.

---