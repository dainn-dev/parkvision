# 🎭 Test Scenario Generator Skill (Production Version)

---

## 🧩 Skill Metadata

- **name:** scenario_generator
- **version:** 3.0.0
- **description:** Generate comprehensive test scenarios from SRS, Business Rules, Risk Analysis, and Edge Case Analysis to achieve complete functional, non-functional, and business coverage before detailed test case creation.
- **category:** QA / Test Design / Scenario Engineering
- **author:** System

---

# 🎯 Purpose

Analyze requirements and generate high-quality test scenarios covering:

- Functional Flows
- Business Rules
- Validation Rules
- Negative Flows
- Boundary Conditions
- Security Risks
- Integration Risks
- Exception Handling
- Concurrency Scenarios
- State Transition Scenarios
- Performance Risks
- Recovery Scenarios

The generated scenarios serve as the primary foundation for:

- Test Case Generation
- UAT Script Generation
- Coverage Analysis
- Regression Planning

---

# 📥 Inputs

## Required Inputs

- `docs/requirements/*` (SRS, PRD, BRD, or any requirement document)
- Template: `templates/test_scenarios_report.md`

## Optional Inputs

- `reports/business_rules.md`
- `reports/*_Req_Gap_Report.md` (dynamic naming from requirement_gap_analyst)
- `reports/*_Risk_Analysis_Report.md` (dynamic naming)
- `reports/*_Edge_Case_Report.md` (dynamic naming)
- `docs/API.md`
- `docs/UI.md`
- `docs/Database.md`

---

# 📤 Output

Generate:

📄 `reports/[Requirement_Name]_Test_Scenarios_Report.md`

Strictly follow:

`templates/test_scenarios_report.md`

---

# ⚙️ Core Processing Rules

---

## 1. Requirement Extraction Engine

Extract and normalize:

### Functional Requirements

- User Actions
- System Actions
- Business Flows

### Business Rules

- Constraints
- Validation Rules
- Calculation Logic

### System Behaviors

- Success Conditions
- Failure Conditions
- Exception Handling

### User Roles

- Guest
- User
- Admin
- Manager
- Custom Roles

Assign normalized IDs:

```text
REQ-XX
```

---

## 2. Scenario Generation Strategy

Generate scenarios from:

### Requirement Perspective

- What should work?
- What should fail?
- What should be restricted?

### Risk Perspective

- What can break?
- What can be abused?
- What can be bypassed?

### User Perspective

- Expected behavior
- Unexpected behavior
- Misuse behavior

### System Perspective

- Normal operation
- Failure handling
- Recovery behavior

---

# 3. Scenario Classification

Every requirement must be evaluated against all categories below.

---

## 3.1 Functional Scenarios

Generate:

### Happy Path

Normal successful flow.

### Alternate Flow

Alternative valid path.

### Exception Flow

System handles unexpected conditions.

---

## 3.2 Validation Scenarios

Generate:

- Required Fields
- Length Validation
- Format Validation
- Business Validation
- Data Constraints

---

## 3.3 Boundary Scenarios

Generate:

- Minimum Value
- Maximum Value
- Min Length
- Max Length
- Zero
- Null
- Empty Collection
- Maximum Collection

---

## 3.4 Negative Scenarios

Generate:

- Invalid Input
- Invalid State
- Unauthorized Action
- Duplicate Data
- Invalid Workflow

---

## 3.5 Security Scenarios

Generate:

### Authentication

- Login
- Session
- Token Expiration

### Authorization

- Role Validation
- Permission Validation
- Access Control

### Security Abuse

- Direct URL Access
- API Bypass
- Session Hijack Attempt
- Privilege Escalation

---

## 3.6 Integration Scenarios

Generate:

- API Failure
- Timeout
- Retry
- Partial Failure
- Third-party Service Failure
- Invalid Response
- Delayed Response

---

## 3.7 Performance Scenarios

Generate:

- Large Dataset
- Bulk Processing
- High Volume Input
- Pagination
- Concurrent Requests

---

## 3.8 Recovery Scenarios

Generate:

- Network Recovery
- Session Recovery
- Retry Flow
- Resume Interrupted Process

---

## 3.9 State Transition Scenarios

Generate:

- Valid State Change
- Invalid State Change
- Duplicate Transition
- Rollback Scenario

---

## 3.10 Concurrency Scenarios

Generate:

- Double Click
- Simultaneous Update
- Duplicate Request
- Concurrent Login
- Multi-device Actions

---

## 3.11 Edge Case Scenarios

Leverage findings from:

`reports/*_Edge_Case_Report.md`

Generate scenarios for:

- Race Conditions
- State Interruptions
- Data Extremes
- Time Boundaries
- Distributed Failures

---

# 4. Coverage Rules

Every requirement should generate:

| Scenario Type | Minimum Required |
|---------------|------------------|
|Positive|1|
|Negative|1|
|Boundary|1 (if applicable)|
|Exception|1|
|Security|1 (if applicable)|
|Integration|1 (if applicable)|

---

# 5. Risk-Based Prioritization

Use:

`reports/*_Risk_Analysis_Report.md`

when available.

---

### Priority Matrix

| Risk Level | Priority |
|------------|----------|
|Critical|P0|
|High|P1|
|Medium|P2|
|Low|P3|

---

### Default Priority

| Scenario Type | Priority |
|---------------|----------|
|Payment|P0|
|Authentication|P0|
|Financial Calculation|P0|
|Core Business Flow|P0|
|CRUD Operations|P1|
|Validation|P1|
|Reporting|P2|
|Administration|P2|
|Cosmetic UI|P3|

---

# 6. Duplicate Detection

Merge duplicate scenarios when:

- Same business objective
- Same expected outcome
- Same validation coverage

Do not generate redundant scenarios.

---

# 7. Traceability Rules

Every scenario must link to:

```text
Requirement
↓
Business Rule
↓
Risk
↓
Scenario
```

---

# 8. Quality Validation Rules

Every generated scenario must:

### Be Atomic

One objective per scenario.

### Be Testable

Expected behavior must be measurable.

### Be Traceable

Linked to requirement.

### Be Actionable

Can be converted into test cases.

---

# 9. Gap Detection

Identify:

- Untested requirements
- Missing negative scenarios
- Missing boundary scenarios
- Missing security scenarios
- Missing integration scenarios

Generate recommendations.

---

# 🔁 Failure Handling Rules

---

### Missing SRS

- Stop generation
- Return error report

---

### Missing Business Rules

- Continue generation
- Mark confidence as Medium

---

### Ambiguous Requirement

- **PAUSE** generation immediately. Do NOT generate any scenarios.
- Output a list of **Clarification Questions** targeting the specific ambiguous points.
- Output a list of **Generation Blockers / Hallucination Risks** that would occur if proceeding without clarification.
- Wait for the user to provide answers before resuming generation.
- Only resume after clarification is received. If user explicitly accepts risk → generate scenarios, flag assumption, and lower confidence level.

---

# 📄 Output Format

---

## 1. Executive Summary

Include:

- Total Requirements
- Total Scenarios
- Positive Scenarios
- Negative Scenarios
- Boundary Scenarios
- Security Scenarios
- Integration Scenarios
- Coverage Percentage

---

## 2. Scenario Catalog

| Scenario ID | Requirement | Scenario Name | Category | Priority |
|-------------|-------------|---------------|----------|----------|
|SCN-001|REQ-01|Login with valid credentials|Positive|P0|
|SCN-002|REQ-01|Login with invalid password|Negative|P0|
|SCN-003|REQ-01|Password at max length|Boundary|P1|

---

## 3. Detailed Scenario Definition

### Scenario ID

SCN-001

### Requirement

REQ-01

### Business Rule

BR-01

### Scenario Name

Login with valid credentials

### Category

Positive

### Objective

Verify successful user login.

### Preconditions

- User account exists
- Account is active

### Expected Outcome

- User successfully authenticated
- Dashboard displayed

### Priority

P0

---

## 4. Traceability Matrix

| Requirement | Business Rule | Risk | Scenario |
|-------------|--------------|------|----------|
|REQ-01|BR-01|RISK-01|SCN-001|

---

## 5. Coverage Summary

| Requirement | Scenario Count | Coverage |
|-------------|---------------|----------|
|REQ-01|8|Complete|
|REQ-02|3|Partial|

---

## 6. Gap Analysis

Identify:

- Missing coverage
- Missing negative scenarios
- Missing boundary scenarios
- Missing security scenarios

Provide recommendations.

---

## 7. High-Risk Scenario Summary

| Scenario | Risk | Priority |
|-----------|------|----------|
|Duplicate Payment|Critical|P0|
|Double Refund|Critical|P0|
|Concurrent Update|High|P1|

---

## 8. Final Recommendations

Recommend generating:

- Detailed Test Cases
- UAT Scripts
- Security Tests
- Performance Tests
- Regression Suite
- Automation Candidates

Prioritize execution according to risk and business impact.

---