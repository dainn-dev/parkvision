# 📄 Test Scenarios Report

---

## 📄 Document Metadata
| Property | Details |
|----------|---------|
| **Date Generated** | [YYYY-MM-DD] |
| **Target Requirements** | [e.g., Requirement_Name.md] |
| **Analyzed By** | Scenario Generator Skill (v3.0.0) |
| **Total Scenarios** | [X] |

---

## 📊 1. Executive Summary

| Metric | Count |
|--------|-------|
| **Total Requirements** | [X] |
| **Total Scenarios** | [X] |
| **Positive Scenarios** | [X] |
| **Negative Scenarios** | [X] |
| **Boundary Scenarios** | [X] |
| **Security Scenarios** | [X] |
| **Integration Scenarios** | [X] |
| **Coverage Percentage** | [XX]% |

---

## 📋 2. Scenario Catalog

| Scenario ID | Requirement Ref | Scenario Name | Category | Priority |
|:---:|---|---|---|:---:|
| `SCENARIO-MODULE-001` | `FR-XXX-01` | User logs in with valid credentials | Positive | P0 |
| `SCENARIO-MODULE-002` | `FR-XXX-01` | User enters wrong password | Negative | P0 |
| `SCENARIO-MODULE-003` | `FR-XXX-01` | Password exceeds max length | Boundary | P1 |

---

## 📝 3. Detailed Scenario Definition

*(For each scenario, repeat the block below)*

### 📌 [SCENARIO-MODULE-001]: [Scenario Name]

| Attribute | Value |
|---|---|
| **Requirement** | [FR-XXX-YY] |
| **Business Rule** | [BR-XX] |
| **Category** | [Positive / Negative / Boundary / Security / Integration / Recovery / Concurrency] |
| **Priority** | [P0 / P1 / P2 / P3] |
| **Confidence** | [High / Medium / Low] |

**Objective:**
> [What this scenario validates]

**Preconditions:**
- [Required system state]

**Expected Outcome:**
- [Observable business result]

---

## 📊 4. Coverage Summary

| Requirement | Scenario Count | Coverage |
|-------------|---------------|----------|
| REQ-01 | 5 | Complete |
| REQ-02 | 2 | Partial |

---

## 🔗 5. Traceability Matrix

| Requirement | Business Rule | Risk | Scenario |
|-------------|--------------|------|----------|
| REQ-01 | BR-01 | RISK-01 | SCN-001 |

---

## 🚨 6. High-Risk Scenario Summary

| Scenario | Risk | Priority |
|----------|------|----------|
| Duplicate Payment | Critical | P0 |
| Double Refund | Critical | P0 |
| Concurrent Update | High | P1 |

---

## 💡 7. Recommendations

Identify missing scenarios including:

- Negative
- Boundary
- Security
- Performance
- Integration

Recommend generating:

- Detailed Test Cases
- UAT Scripts
- Security Tests
- Automation Candidates

---
# End of Report
