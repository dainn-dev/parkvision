# 🧨 Advanced Edge Case Analyzer Skill (Production Version)

---

## 🧩 Skill Metadata

- **name:** advanced_edge_case_analyzer
- **version:** 3.0.0
- **description:** Analyze Software Requirements Specification (SRS) to discover high-risk edge cases, boundary conditions, concurrency issues, state interruptions, distributed system failures, and hidden business logic defects. Assess risk, recommend mitigation strategies, and map findings to testing activities.
- **category:** QA / Risk Engineering / Edge Case Analysis
- **author:** System

---

# 🎯 Purpose

Unlike normal Test Scenario generation, this skill focuses on discovering **rare but high-impact failures** that frequently escape functional testing.

Primary objectives:

- Discover hidden edge cases
- Identify concurrency issues
- Analyze state transition failures
- Detect distributed system risks
- Evaluate boundary conditions
- Reveal business logic weaknesses
- Prioritize testing based on risk
- Recommend mitigation strategies

---

# 📥 Inputs

## Required Inputs

- `docs/requirements/*` (SRS, PRD, BRD, or any requirement document)
- `templates/edge_case_report.md`
- `schemas/finding.schema.md` — **🔴 MANDATORY: Must read and load into context before generating any Edge Case Findings. Confirm allowed values for Severity, Likelihood, and Impact prior to generation.**

## Optional Inputs

- `reports/business_rules.md`
- `reports/*_Risk_Analysis_Report.md` (dynamic naming)
- `docs/API.md`
- `docs/UI.md`
- `docs/Database.md`
- `docs/System_Architecture.md`

---

# 📤 Output

Generate:

📄 `reports/[Requirement_Name]_Edge_Case_Report.md`

Strictly follow:

`templates/edge_case_report.md`

---

# ⚙️ Core Processing Rules

---

## 1. Requirement Analysis

Analyze every requirement independently.

Extract:

- Business Logic
- Validation Rules
- Constraints
- State Changes
- External Dependencies
- User Actions
- Background Processes

One requirement may produce multiple Edge Cases.

---

# 2. Edge Case Discovery Categories

Every requirement shall be analyzed against all categories below.

---

## 2.1 State Interruption

Examples:

- Browser closed during payment
- App crashes while saving
- Network disconnected during API request
- Token expires during transaction
- Session expires during checkout
- Device reboot during upload

---

## 2.2 Concurrency / Race Condition

Examples:

- Double-click Submit
- Two users editing the same record
- Multiple payment requests
- Parallel API requests
- Out-of-order request arrival
- Simultaneous stock deduction

---

## 2.3 Data Extremes

Examples:

- Maximum integer
- Minimum integer
- Empty value
- Null value
- Maximum string length
- Unicode
- Emoji
- RTL characters
- Special characters
- SQL Injection payload
- XSS payload
- File exactly at upload limit
- File exceeding upload limit
- Empty collection
- Collection with 100,000 records

---

## 2.4 Time Boundary

Examples:

- 23:59:59
- 00:00:00
- Leap Year
- Leap Second
- Daylight Saving Time
- Timezone conversion
- Session timeout
- Token expiration
- Long-running request
- Retry timeout

---

## 2.5 Logic Stress

Examples:

- Skip workflow steps
- Negative total amount
- Refund exceeds payment
- Duplicate coupon
- Invalid discount combinations
- Invalid state transitions

---

## 2.6 State Transition

Detect invalid transitions.

Examples:

- Draft → Completed
- Cancelled → Paid
- Deleted → Active
- Approved → Draft
- Closed → Reopened

Check:

- Missing validation
- Invalid transition
- Duplicate transition
- Rollback failure

---

## 2.7 Sequence Breaking

Attempt to break workflow order.

Examples:

- API Step 3 before Step 1
- Browser Back
- Browser Refresh
- Browser Forward
- Open multiple tabs
- Refresh during transaction

---

## 2.8 Resource Exhaustion

Evaluate:

- Memory full
- Disk full
- CPU overload
- Connection pool exhausted
- Thread pool exhausted
- Queue overflow

---

## 2.9 Cache Consistency

Examples:

- Stale cache
- Cache race
- Cache invalidation
- Distributed cache inconsistency
- Missing cache refresh

---

## 2.10 Distributed System Failures

Applicable for microservices.

Examples:

- Lost event
- Duplicate event
- Delayed event
- Event replay
- Event ordering
- Partial failure
- Saga rollback failure

---

## 2.11 Offline / Network Recovery

Examples:

- Offline → Online
- Weak Network
- Packet Loss
- Retry after reconnect
- Airplane Mode
- Switching WiFi to Mobile Data

---

## 2.12 Multi-device Conflict

Examples:

- Edit on Web and Mobile simultaneously
- Logout on another device
- Shared account update conflict
- Session synchronization issues

---

## 2.13 Session Management

Examples:

- Concurrent login
- Session timeout
- Token refresh race
- Refresh Token expired
- Logout during transaction

---

# 3. Severity Assessment

Every Edge Case must have a severity.

| Severity | Criteria |
|----------|----------|
|🔴 Critical|Financial loss, security breach, data corruption, irreversible failure|
|🟠 High|Major business interruption, system crash|
|🟡 Medium|Incorrect behavior with recovery possible|
|🟢 Low|Minor issue or cosmetic problem|

---

# 4. Risk Scoring

Calculate:

```
Risk Score = Impact × Likelihood × Detectability
```

| Score | Level |
|--------|------|
|40–75|Critical|
|20–39|High|
|10–19|Medium|
|1–9|Low|

---

# 5. Root Cause Classification

Assign one or more root causes.

Categories:

- Business Logic
- Validation
- Concurrency
- State Management
- Database
- API Design
- Infrastructure
- Security
- Performance
- UI
- Network

---

# 6. Technical Recommendations

Each Edge Case MUST include mitigation recommendations.

Possible recommendations:

- Idempotency Key
- Optimistic Locking
- Pessimistic Locking
- Database Transaction
- Rollback
- Retry Mechanism
- Debounce
- Throttle
- Queue Processing
- Circuit Breaker
- Timeout
- Rate Limiting
- Cache Invalidation
- Audit Logging

Recommendations must explain **why** they reduce the identified risk.

---

# 7. Automation Candidate

Determine automation feasibility.

| Level | Description |
|--------|-------------|
|Easy|Can be automated via API/UI|
|Medium|Requires environment setup|
|Hard|Requires multiple users/devices|
|Manual Only|Manual testing recommended|

---

# 8. Confidence Assessment

Every Edge Case must include confidence.

| Confidence | Criteria |
|------------|----------|
|High|Explicitly supported by requirements|
|Medium|Strong inference|
|Low|Assumption due to missing information|

Low-confidence findings must clearly explain:

- Assumptions made
- Missing information
- Additional clarification required

---

# 9. Mapping Rules

Each Edge Case must be linked to:

Requirement

↓

Business Rule

↓

Risk

↓

Test Scenario

↓

Test Case

↓

Mitigation

---

# 10. Duplicate Handling

Merge Edge Cases sharing the same:

- Root Cause
- Failure Mechanism
- Risk

Do NOT generate duplicate findings.

---

# 11. Exclusions

Do NOT include basic negative test cases such as:

- Required field validation
- Invalid password
- Invalid email
- Empty mandatory fields
- Incorrect format validation

These belong to Test Scenario or Test Case generation.

Focus only on **true Edge Cases**.

---

# 🔁 Failure Handling Rules

If SRS cannot be parsed:

- Stop analysis
- Generate error report

If insufficient information exists:

- Continue analysis
- Mark finding with Low Confidence

---

# 📄 Output Format

---

## 1. Executive Summary

Include:

- Total Requirements
- Total Edge Cases
- Critical
- High
- Medium
- Low
- Average Risk Score

---

## 2. Edge Case Summary

| Category | Count |
|----------|------:|
|Concurrency|X|
|State Transition|X|
|Boundary|X|
|Time|X|
|Cache|X|
|Distributed|X|
|Network|X|

---

## 3. Detailed Edge Case Report

For each finding include:

### Edge Case ID

EDGE-001

### Requirement

REQ-01

### Category

Concurrency

### Description

Two users submit payment simultaneously.

### Root Cause

Missing concurrency control.

### Severity

Critical

### Risk Score

60

### Confidence

High

### Automation

Medium

### Recommended Test Scenario

Verify simultaneous payment submission.

### Recommended Test Case

Execute concurrent payment requests from multiple sessions.

### Recommended Mitigation

- Add Idempotency Key
- Database Locking
- Transaction Management

---

## 4. Top Highest Risk Edge Cases

| Rank | Edge Case | Risk |
|------|-----------|------|
|1|Duplicate Payment|Critical|
|2|Double Refund|Critical|
|3|Concurrent Update|High|

---

## 5. Traceability Matrix

| Requirement | Edge Case | Risk | Test Scenario | Test Case | Mitigation |
|-------------|-----------|------|---------------|-----------|------------|

---

## 6. Automation Recommendation

| Edge Case | Automation |
|-----------|------------|
|Duplicate Submit|Easy|
|Concurrent Update|Medium|
|Multi-device Login|Hard|

---

## 7. Final Recommendations

Prioritize testing in the following order:

1. Financial Transactions
2. Authentication & Authorization
3. Data Integrity
4. Concurrency
5. State Transition
6. Distributed Systems
7. Performance
8. Network Recovery
9. UI Edge Cases

Recommend generating:

- Concurrency Test Cases
- Boundary Test Cases
- Chaos Testing
- Reliability Testing
- Stress Testing
- Security Testing
- Integration Testing
- Recovery Testing

---