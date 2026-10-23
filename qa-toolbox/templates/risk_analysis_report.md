# 📄 Risk Analysis Report

---

## 📄 Document Metadata
| Property | Details |
|----------|---------|
| **Date Generated** | [YYYY-MM-DD] |
| **Target Requirements** | [e.g., Requirement_Name.md] |
| **Analyzed By** | Risk Analyst Skill (v3.0.0) |
| **Total Risks Identified** | [X] |
| **Overall Project Risk** | [🟢 Low / 🟡 Medium / 🟠 High / 🔴 Critical] |

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

> **Schema Reference:** `schemas/finding.schema.md`

## 2. 📊 Risk Register

| Risk ID | Requirement Ref | Category | Probability (1-5) | Impact (1-5) | Risk Score | Severity Level | Priority |
|---|---|---|:---:|:---:|:---:|:---:|:---:|
| `RISK-MODULE-001` | `FR-XXX-01` | Security | 5 | 5 | 25 | 🔴 Critical | P0 |
| `RISK-MODULE-002` | `FR-XXX-05` | Financial / Business | 4 | 5 | 20 | 🔴 Critical | P0 |
| `RISK-MODULE-003` | `FR-XXX-09` | Performance | 3 | 3 | 9 | 🟡 Medium | P2 |

---

## 3. 🚨 Detailed Risk Assessment

For each identified risk include:

### Risk ID
`RISK-MODULE-001`

### Requirement
`FR-XXX-01 Login`

### Category

Security

### Description

Authentication requirement lacks brute-force protection.

### Root Cause

Retry limit is not defined.

### Probability

5

### Impact

5

### Risk Score

25

### Risk Level

Critical

### Testing Priority

P0

### Recommended Mitigation

- Add retry limit
- Add CAPTCHA
- Add account lockout
- Add audit logging

---

## 4. 🔐 Security Risk Summary

| Finding | Severity |
|----------|----------|
|Missing Rate Limit|Critical|
|No Session Timeout|High|
|Weak Password Policy|High|
|Missing CSRF Protection|Medium|

---

## 5. ⚡ Performance Risk Summary

| Requirement | Risk |
|-------------|------|
|Search|Missing pagination|
|Upload|Large file handling|
|Dashboard|Heavy SQL query|

---

## 6. 🧪 Testing Recommendation

Recommend:

- Smoke Test
- Functional Test
- Boundary Test
- Negative Test
- Integration Test
- Security Test
- Performance Test
- Regression Test

Prioritize execution according to risk level.

---

## 7. 📈 Final Risk Summary

Include:

- Highest Risk Module
- Highest Business Risk
- Highest Security Risk
- Highest Technical Risk
- Immediate Action Items
- Suggested Test Execution Order

---

## 8. 🔗 Risk Traceability Matrix

| Requirement | Risk | Priority | Recommended Tests | Mitigation |
|--------------|------|----------|-------------------|------------|
|REQ-01|Brute-force Attack|P0|Security, Negative|Rate Limit + CAPTCHA|
|REQ-05|Duplicate Payment|P0|Integration, Regression|Idempotency|
|REQ-09|Slow Search|P2|Performance|Pagination|

---

## 9. 🧠 Confidence Assessment

Evaluate confidence for each identified risk.

| Confidence | Criteria |
|------------|----------|
|High|Explicitly defined in SRS or business rules|
|Medium|Supported by partial evidence|
|Low|Inference based on missing information|

Low confidence findings must:

- Clearly state assumptions
- Explain why the risk cannot be fully verified
- Recommend additional information required

---

## 10. 📋 Final Recommendations

Prioritize remediation in the following order:

1. Critical Security Risks
2. Critical Business Risks
3. High Technical Risks
4. High Performance Risks
5. Medium Risks
6. Low Risks

Recommend generating:

- Security Test Cases
- Performance Test Cases
- Boundary Test Cases
- Negative Test Cases
- Regression Suite
- Exploratory Testing Checklist

---
# End of Report
