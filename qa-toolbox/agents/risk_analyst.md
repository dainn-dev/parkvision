# ⚠️ Risk Analysis Skill (Production Version)

---

## 🧩 Skill Metadata

- **name:** risk_analyst
- **version:** 3.0.0
- **description:** Analyze Software Requirements Specification (SRS) and related artifacts to identify business, technical, security, performance, operational, and compliance risks. Prioritize risks, recommend mitigations, and drive risk-based testing.
- **category:** QA / Risk Engineering / Requirement Analysis
- **author:** System

---

# 🎯 Purpose

Analyze requirements and supporting documents to:

- Identify project risks early
- Detect ambiguous or incomplete requirements
- Evaluate business impact
- Prioritize testing activities
- Recommend mitigation strategies
- Improve requirement quality
- Support risk-based testing
- Produce a comprehensive Risk Assessment Report

---

# 📥 Inputs

## Required Inputs

- `docs/requirements/*` (SRS, PRD, BRD, or any requirement document)
- `templates/risk_analysis_report.md`
- `schemas/finding.schema.md` — **🔴 MANDATORY: Must read and load into context before generating any Risk/Finding. Confirm allowed values for Risk Level, Category, and Status prior to generation.**

## Optional Inputs

- `reports/business_rules.md`
- `reports/*_Req_Gap_Report.md` (dynamic naming from requirement_gap_analyst)
- `reports/*_Coverage_Report.md` (dynamic naming)
- `reports/*_Edge_Case_Report.md` (dynamic naming)
- `docs/API.md`
- `docs/UI.md`
- `docs/Database.md`
- `docs/System_Architecture.md`
- Regulatory Documents
- Security Requirements

---

# 📤 Output

Generate:

📄 `reports/[Requirement_Name]_Risk_Analysis_Report.md`

Strictly follow:

`templates/risk_analysis_report.md`

---

# ⚙️ Core Processing Rules

---

## 1. Requirement Risk Extraction

Analyze every requirement independently.

Extract:

- Functional Behavior
- Business Rules
- Constraints
- User Roles
- State Changes
- External Dependencies
- Sensitive Data
- Failure Scenarios

One requirement may produce multiple risks.

---

## 2. Risk Classification

Every requirement shall be evaluated against:

### Business Risk

Examples:

- Revenue loss
- Financial calculation
- Billing
- Order processing

---

### Functional Risk

Examples:

- Missing validation
- Incorrect workflow
- Missing state transition

---

### Technical Risk

Examples:

- Complex implementation
- Multiple integrations
- Legacy dependency

---

### Security Risk

Examples:

- Authentication
- Authorization
- Session Management
- Sensitive Data Exposure
- OWASP Top 10

---

### Performance Risk

Examples:

- Heavy queries
- Large datasets
- High concurrency
- Timeout

---

### Data Integrity Risk

Examples:

- Duplicate records
- Data corruption
- Lost updates
- Incorrect synchronization

---

### Integration Risk

Examples:

- Third-party API
- Payment Gateway
- Notification Service
- Authentication Provider

---

### Operational Risk

Examples:

- Backup failure
- Recovery failure
- Deployment dependency

---

### Compliance Risk

Examples:

- GDPR
- PCI-DSS
- HIPAA
- Internal Compliance Rules

---

### Usability Risk

Examples:

- User confusion
- Incorrect workflow
- Accessibility issues

---

# 3. Ambiguity Detection

Detect unclear requirements.

Examples:

- Missing validation
- Missing business rules
- Missing acceptance criteria
- Undefined timeout
- Undefined retry
- Missing permission matrix
- Missing workflow
- Missing exception handling
- Missing audit logging
- Missing notification rules

Assign:

- Low
- Medium
- High
- Critical

---

# 4. Risk Scoring

Evaluate every identified risk.

## Probability

| Score | Description |
|--------|-------------|
|1|Rare|
|2|Unlikely|
|3|Possible|
|4|Likely|
|5|Almost Certain|

---

## Impact

| Score | Description |
|--------|-------------|
|1|Negligible|
|2|Minor|
|3|Moderate|
|4|Major|
|5|Critical|

---

## Detectability

| Score | Description |
|--------|-------------|
|1|Easy to Detect|
|2|Low Effort|
|3|Moderate|
|4|Difficult|
|5|Very Difficult|

---

## Risk Score Formula

```text
Risk Score = Probability × Impact
```

## Enhanced Risk Score (Optional)

```text
Enhanced Risk Score = Probability × Impact × Detectability
```

---

## Risk Level

| Score | Level |
|--------|------|
|1–5|Low|
|6–10|Medium|
|11–15|High|
|16–25|Critical|

---

# 5. Testing Priority Engine

Automatically assign testing priority.

| Risk Level | Testing Priority |
|------------|-----------------|
|Critical|P0|
|High|P1|
|Medium|P2|
|Low|P3|

Recommend:

- Smoke Test
- Functional Test
- Integration Test
- Regression Test
- Security Test
- Performance Test
- Exploratory Test

---

# 6. Requirement Complexity Analysis

Evaluate:

- Business Logic Complexity
- Validation Rules
- Workflow Complexity
- State Transitions
- External Integrations
- Database Transactions
- UI Complexity
- Permission Matrix

Classification:

- Low
- Medium
- High
- Very High

---

# 7. Dependency Risk Detection

Analyze dependencies.

## Internal

- Database
- Cache
- Queue
- Scheduler
- Background Jobs

## External

- Third-party API
- Payment Gateway
- Authentication Provider
- Notification Service
- Cloud Storage

Detect:

- Single Point of Failure
- Circular Dependency
- Missing Fallback
- Tight Coupling

---

# 8. Security Risk Analysis

Evaluate:

## Authentication

- Login
- MFA
- Password Policy
- Session Timeout

---

## Authorization

- RBAC
- Permission Checks
- IDOR

---

## Input Validation

- SQL Injection
- XSS
- SSRF
- CSRF
- Command Injection

---

## Data Protection

- Encryption
- Sensitive Data Exposure
- Audit Logging

---

## File Upload

- File Type
- File Size
- Malware Scan

---

## API Security

- Authentication
- Authorization
- Rate Limiting
- API Abuse
- Replay Attack

Map findings to:

- OWASP Top 10

---

# 9. Performance Risk Analysis

Evaluate:

- Heavy SQL
- Missing Pagination
- Bulk Operations
- High Concurrency
- Long-running Requests
- Memory Usage
- Queue Saturation
- Resource Exhaustion

---

# 10. Business Impact Analysis

Evaluate impact on:

- Revenue
- Financial Transactions
- Customer Satisfaction
- Business Continuity
- Reporting
- Compliance
- Operational Efficiency

---

# 11. Testability Assessment

Determine whether requirements are testable.

Evaluate:

- Acceptance Criteria
- Preconditions
- Postconditions
- Validation Rules
- Expected Results
- Error Handling

Classification:

- Easily Testable
- Moderately Testable
- Poorly Testable

---

# 12. Root Cause Classification

Every risk shall include one or more root causes.

Categories:

- Business Logic
- Validation
- Security
- Performance
- Infrastructure
- API Design
- Database
- UI
- State Management
- Integration

---

# 13. Mitigation Recommendation

Each identified risk must include:

- Root Cause
- Recommended Solution
- Preventive Action
- Testing Recommendation

Examples:

- Retry Mechanism
- Transaction Management
- Rate Limiting
- Optimistic Locking
- Input Validation
- Audit Logging
- Monitoring
- Alerting

Recommendations should explain **why** they reduce the identified risk.

---

# 14. Confidence Assessment

Each identified risk must include:

| Confidence | Criteria |
|------------|----------|
|High|Explicitly supported by SRS|
|Medium|Supported by partial evidence|
|Low|Inference based on missing information|

Low confidence findings must clearly explain:

- Assumptions made
- Missing information
- Clarification required

---

# 15. Traceability Rules

Every identified risk shall map to:

Requirement

↓

Business Rule

↓

Risk

↓

Risk Level

↓

Recommended Test Scenario

↓

Recommended Test Case

↓

Mitigation

---

# 🚨 Automatic Risk Detection Rules

Detect:

- Missing Validation
- Missing Boundary Conditions
- Missing Error Handling
- Missing Permissions
- Missing Workflow
- Missing Retry Logic
- Missing Timeout
- Missing Rollback
- Missing Audit Logging
- Missing Monitoring
- Missing Notifications

---

# 📊 Risk Matrix

| Probability ↓ / Impact → |1|2|3|4|5|
|--------------------------|--|--|--|--|--|
|5|Medium|High|Critical|Critical|Critical|
|4|Medium|Medium|High|Critical|Critical|
|3|Low|Medium|Medium|High|Critical|
|2|Low|Low|Medium|Medium|High|
|1|Low|Low|Low|Medium|Medium|

---

# 🔁 Failure Handling Rules

### If SRS cannot be parsed

- Stop analysis
- Generate error report

---

### If Business Rules are unavailable

- Continue analysis
- Reduce confidence

---

### If requirement cannot be analyzed

- Mark as UNKNOWN RISK
- Explain reason
- Recommend clarification

---

# 📄 Output Format

---

## 1. 📌 Executive Summary

Include:

- Total Requirements
- Total Risks
- Critical Risks
- High Risks
- Medium Risks
- Low Risks
- Average Risk Score
- Overall Project Risk

---

## 2. 📊 Risk Register

| Risk ID | Requirement | Category | Score | Level | Priority | Confidence |
|----------|-------------|----------|-------|--------|----------|------------|
|RISK-001|REQ-01|Security|25|Critical|P0|High|

---

## 3. 🚨 Detailed Risk Assessment

Include:

- Risk ID
- Requirement
- Category
- Description
- Root Cause
- Business Impact
- Probability
- Impact
- Detectability (Optional)
- Risk Score
- Priority
- Confidence
- Recommended Test Scenario
- Recommended Mitigation

---

## 4. 🔐 Security Risk Summary

Summarize all security-related findings.

---

## 5. ⚡ Performance Risk Summary

Summarize performance risks.

---

## 6. 📈 Business Impact Summary

Summarize risks affecting:

- Revenue
- Customer Experience
- Compliance
- Financial Transactions

---

## 7. 🔗 Traceability Matrix

| Requirement | Risk | Test Scenario | Mitigation |
|-------------|------|---------------|------------|

---

## 8. 🧠 Assumptions & Clarifications

List:

- Missing requirements
- Undefined business rules
- Assumptions made
- Clarifications needed

---

## 9. 📋 Final Recommendations

Prioritize mitigation in the following order:

1. Critical Security Risks
2. Financial Risks
3. Data Integrity Risks
4. High Business Risks
5. Performance Risks
6. Operational Risks

Recommend generating:

- Risk-based Test Scenarios
- Security Test Cases
- Performance Test Cases
- UAT Scripts
- Regression Test Suite

---