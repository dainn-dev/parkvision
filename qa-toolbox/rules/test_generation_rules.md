# 🧪 Test Generation Rules (Production Version)

---

## Metadata

- name: test_generation_rules
- version: 3.0.0
- category: QA / Test Design Standards
- description: Enterprise-level governance rules for generating high-quality, executable, traceable, and automation-ready manual test cases.

---

# 1. Requirement Analysis Rules

## Objective

Before generating any test case, the generator MUST fully understand the requirement.

Generating test cases without requirement analysis is prohibited.

---

## 1.1 Requirement Decomposition

Every requirement shall be decomposed into atomic functional behaviors.

**Example:**

| Requirement | Atomic Behaviors |
|-------------|-----------------|
| User can login using email and password | Enter email, Validate email format, Enter password, Validate password, Authenticate user, Navigate after login, Handle authentication failure |

Never generate test cases directly from compound requirements.

---

## 1.2 Functional Component Identification

Identify:

- Primary function
- Supporting functions
- Business validations
- System validations
- Navigation behavior
- State changes

---

## 1.3 Assumption Identification

Explicitly identify assumptions before generating test cases.

**Example:**

- User account already exists.
- User has network connectivity.
- User is using a supported application version.

Assumptions shall NOT become requirements.

---

## 1.4 Dependency Identification

Identify all dependencies.

| Category | Examples |
|----------|----------|
| Services | Authentication Service, User Profile Service, Notification Service, Backend API |
| Device | GPS, Camera, Internet Connection |
| Permissions | Device Permission |

Dependencies influence negative and integration test generation.

---

## 1.5 High Risk Analysis

Identify business risks.

| Risk Type | Examples |
|-----------|----------|
| Navigation | Incorrect navigation |
| Data | Data corruption |
| Security | Security exposure, Session inconsistency |
| Financial | Payment interruption, Duplicate transactions |

Higher business risk increases testing priority.

---

## 1.6 Regression Impact Analysis

Identify impacted modules.

**Example: Authentication Module**

| Current Module | Potential Regression Impact |
|---------------|---------------------------|
| Authentication | Login, Registration, Forgot Password, Session Management, Home Page Navigation |

Regression scope shall be included in generated test cases where applicable.

---

## 1.7 Requirement Clarity & Ambiguity Handling

Before generating test cases, the AI MUST assess the clarity and completeness of the provided requirement.
If the requirement is ambiguous, lacks critical details, or contains contradictions, the AI MUST:

1. **PAUSE** test generation immediately. Do NOT generate any test cases.
2. Output a list of **Clarification Questions** for the user to resolve the ambiguities.
3. Output a list of **Generation Blockers / Hallucination Risks** associated with proceeding with the current unclear requirements (instead of general risk analysis).
4. Wait for the user to provide clarification before resuming generation.

---

# 2. Test Design Rules

The generator shall internally apply professional QA test design techniques.

These techniques are reasoning mechanisms and MUST NOT be printed unless explicitly requested.

---

## 2.1 Happy Path

Generate the primary successful business flow.

Every requirement shall contain at least one Happy Path testcase, where applicable.

---

## 2.2 Negative Testing

Generate invalid scenarios including:

- Invalid input
- Missing required field
- Invalid format
- Unauthorized access
- Expired session
- Invalid operation
- API failure
- Permission denied

---

## 2.3 Boundary Value Analysis (BVA)

Whenever numeric or length limits exist, generate test values at boundaries:

| Input | Min | Min-1 | Min+1 | Max-1 | Max | Max+1 |
|-------|-----|-------|-------|-------|-----|-------|
| Password length (8–50) | 8 | 7 | 9 | 49 | 50 | 51 |

---

## 2.4 Equivalence Partitioning (EP)

Group equivalent input ranges. Generate one representative test for each partition.

| Input | Invalid (Below) | Valid | Invalid (Above) |
|-------|-----------------|-------|-----------------|
| Age | <18 | 18–65 | >65 |

Do NOT generate redundant cases within the same partition.

---

## 2.5 State Transition Testing

Generate cases covering:

| Transition Type | Description |
|----------------|-------------|
| Valid | Normal allowed transition |
| Invalid | Attempting disallowed transition |
| Repeated | Performing same transition twice |
| Interrupted | Transition cut off mid-process |
| Recovery | Recovering from failed transition |

**Example:** Order: Pending → Paid → Shipped → Delivered. Attempting "Cancel Delivered Order" shall become a Negative testcase.

---

## 2.6 Decision Table Testing

Apply when multiple business conditions determine one outcome.

| Premium User | Coupon Valid | Payment Success | → Outcome |
|-------------|-------------|-----------------|-----------|
| YES | YES | YES | Discount Applied |
| YES | NO | YES | Full Price |
| NO | YES | YES | Discount Applied |
| NO | NO | NO | Payment Failed |

Generate all meaningful decision combinations.

---

## 2.7 Role-Based Testing

Generate test cases for every applicable role:

- Guest
- Registered User
- Admin
- Operator
- Driver
- Passenger

Role isolation shall always be validated.

---

## 2.8 Error Guessing

Generate scenarios based on common production defects:

- Double click / Rapid tapping
- Network interruption / Timeout
- Expired token
- Duplicate submission
- Browser refresh / App resume
- Application killed

---

## 2.9 Error Handling

Validate system behavior when unexpected failures occur:

- 500 Internal Server Error
- 404 Resource Missing
- Network disconnected
- Service unavailable
- Gateway timeout
- Application restart
- Unexpected exception

---

## 2.10 Security Testing

Generate security-oriented test cases where applicable:

- Unauthorized access / Direct URL access
- Session hijacking / Invalid token / Token expiration
- Role escalation
- Input injection
- Sensitive data exposure
- Authentication bypass

---

## 2.11 Performance Testing

Generate lightweight performance validation cases:

- Splash loading time / Screen transition time
- Button responsiveness
- Repeated navigation
- API response time / Resource loading
- Cold launch / Warm launch

---

## 2.12 UI / UX Validation

Validate:

- Alignment, Consistency, Visibility
- Accessibility, Typography
- Button state, Image rendering
- Theme / Dark Mode
- Landscape Mode / Responsive behavior

---

## 2.13 Regression Testing

Generate regression cases whenever changes affect:

- Navigation / Authentication / Permission
- Business Rule / Shared Component / Common Service

Regression cases shall focus on previously working functionality.

---

## 2.14 Context-Aware Integration Testing (ENHANCED)

**Principle**: Shared components tested INDEPENDENTLY in each distinct business flow context.

### Examples of Context-Dependent Testing

#### 1. OTP Verification (Shared Component)

| Context | Different Aspects |
|---------|------------------|
| **Sign Up Flow** | User never logged in, OTP is registration proof |
| **Forgot Password** | User already has account, OTP is identity verification |
| **Login (2FA)** | User just entered credentials, OTP is 2nd factor |

**Test Cases MUST Differentiate:**

- TC-SU-OTP-001: "OTP field in Sign Up validates formatting"
- TC-FP-OTP-001: "OTP field in Forgot Password validates formatting"
- TC-LO-OTP-001: "OTP field in Login (2FA) validates formatting"

These are NOT duplicates despite similar validation because:
- API endpoints differ
- State management differs (user authenticated vs not)
- Error recovery flows differ
- Navigation after success differs

#### 2. Email Validation (Shared Component)

| Context | Different Aspects |
|---------|------------------|
| **Registration** | Verify email uniqueness, send verification email |
| **Profile Update** | Verify new email different from current, send change confirmation |
| **Password Reset** | Verify email exists in system, send reset link |

**Test Cases MUST Differentiate:**

- TC-REG-EMAIL-001: "Email field validation during registration"
- TC-PROF-EMAIL-001: "Email field validation during profile update"
- TC-RESET-EMAIL-001: "Email field validation during password reset"

#### 3. Payment Amount Validation (Shared Component)

| Context | Different Aspects |
|---------|------------------|
| **Single Payment** | Amount validation only |
| **Subscription** | Amount + recurring schedule validation |
| **Refund** | Amount cannot exceed original transaction |

**Test Cases MUST Differentiate:**

- TC-PAY-AMT-001: "Payment amount validation for one-time payment"
- TC-SUB-AMT-001: "Subscription amount validation with recurring schedule"
- TC-REFUND-AMT-001: "Refund amount cannot exceed original amount"

### Atomicity Rule in Context

Do NOT merge contexts:

❌ **BAD**: TC-SHARED-001: "Email validation works in Sign Up, Profile Update, and Password Reset"

✅ **GOOD**:
- TC-SU-EMAIL-001: "Email validation in Sign Up flow"
- TC-PROF-EMAIL-001: "Email validation in Profile Update flow"
- TC-RESET-EMAIL-001: "Email validation in Password Reset flow"

### Traceability in Context

Each context-specific TC should map to:
- Same base Requirement (e.g., FR-EMAIL-VALIDATION)
- Different Risk ID if risks differ by context (e.g., RISK-EMAIL-ENUMERATION vs RISK-EMAIL-EXPOSURE)
- Different Scenario/Edge Case if applicable per context

---

# 3. Requirement Coverage Rules (ISTQB & ISO/IEC/IEEE 29119 Aligned)

## Objective

No approved requirement should remain partially tested unless its limitation is explicitly documented (e.g., blocked dependency, missing requirement, or out of scope).

---

## 3.1 Minimum Coverage Criteria

To align with the coverage dimensions defined by **ISTQB** and **ISO/IEC/IEEE 29119** standards, the project evaluates completeness based on the following dimensions:

| Coverage Dimension | Objective & Target | Standard Criteria |
|--------------------|---------------------|-------------------|
| **✅ Requirement Coverage** | All requirements/acceptance criteria have corresponding test cases (100% traceability). | Traceability Matrix (Requirement ID ➔ Test Case ID) |
| **✅ Functional Coverage** | All functions and primary/secondary business flows are fully tested. | Happy Path, Alternative Flows |
| **✅ Risk Coverage** | High-risk areas are prioritized, mitigation is verified, and fully tested. | Risk Register ➔ Mitigation validation |
| **✅ Scenario Coverage** | Complete coverage of Happy Path, Alternative Flow, and Exception Flow. | Use Case/Scenario matrix |
| **✅ Input Coverage** | Verification of data inputs: valid, invalid, boundary values, and equivalence classes. | Equivalence Partitioning + BVA |
| **✅ Business Rule Coverage** | Every business rule, constraint, and conditional validation is verified. | Decision Table / Logic mapping |
| **✅ Non-functional Coverage** | Performance, Security, Accessibility, Usability, Compatibility (if inside scope). | Security & Performance checks |
| **✅ Regression Coverage** | A suitable regression test suite exists to protect existing features from side-effects. | Regression Test Suite (Automated or Manual) |

Coverage is considered complete when all applicable coverage dimensions for the requirement have been sufficiently verified based on its scope, complexity, and risk.

---

## 3.2 Requirement Traceability

Every testcase MUST map to at least one Requirement ID.

| Requirement | Test Cases |
|-------------|-----------|
| FR-SIG-1.2 | TC-001, TC-002, TC-003 |

Every requirement shall be traceable through generated testcases.

---

## 3.3 Multiple Requirement Rule

A testcase should validate ONE primary requirement.

Avoid mapping multiple unrelated requirements into a single testcase.

Only tightly coupled requirements may be referenced together.

---

## 3.4 Missing Requirement Handling

If a requirement cannot generate any executable testcase due to insufficient information:

- Generate no speculative testcase.
- Record the issue as: **INSUFFICIENT REQUIREMENT**
- Recommend clarification.

---

## 3.5 Cross-Artifact Traceability (Conditional)

Test cases SHOULD trace back to all applicable artifacts:

**IF Risk Analysis Report Exists:**
- Every identified risk MUST have at least one corresponding test case

**IF Edge Case Report Exists:**  
- Every identified edge case MUST have at least one corresponding test case

**IF No Reports Exist:**
- Test case traceability limited to Functional Requirements only
- Document limitation in output remarks

---

# 4.0 Test Type Classification (UPDATED)

## Objective

Maintain balanced testing across different testing perspectives.

Do not allow Functional Testing to dominate the entire suite. Note: These distribution percentages are internal Project Policies and not mandated by ISTQB/ISO standards.

---

Each test case has:
- **Primary Type**: The main testing dimension
- **Secondary Tags**: Additional testing dimensions (optional)

### Primary Type = Required (Choose ONE)
- Functional (primary business flow)
- Negative (invalid input/error scenarios)
- Boundary (boundary value analysis/extreme limits)
- UI (visual/interaction validation)
- Security (authorization/authentication/data protection)
- Performance (speed/responsiveness)
- Integration (cross-module/third-party API flow)
- Regression (verify existing functionality after changes)

### Secondary Tags = Optional
- [Tag] Security (if security is secondary concern)
- [Tag] Mobile Lifecycle (if app restart relevant)
- [Tag] API (if backend validation relevant)
- [Tag] Integration (if multi-feature workflow relevant)

### Required Distribution Calculation

**Only count PRIMARY TYPE** in distribution percentages:

Total Test Cases = 100
├─ Functional (Primary): ≥40%
├─ Negative (Primary): ≥15%
├─ Edge (Primary): ≥10%
├─ UI (Primary): ≥10%
├─ Performance (Primary): ≥10%
├─ Regression (Primary): ≥10%
└─ Security (Primary): ≥5%
TOTAL = 100%

Secondary tags don't affect distribution calculation.

### Example Reclassification:

TC-H-15: "Login with SQL injection payload"
- **Primary Type**: Negative (invalid input)
- **Secondary Tags**: [Tag] Security, [Tag] API

This counts ONLY in "Negative ≥15%" requirement.

---

## Validation Rule

Before output:

1. Calculate percentage for every category.
2. If any category is below required threshold → Generate additional testcase(s).
3. Recalculate.
4. Repeat until all thresholds are satisfied.

---

## Feature Size Classification Rubric

Classify feature based on COMBINATION of:

| Factor | Small | Medium | Major |
|--------|-------|--------|-------|
| Input Fields | <5 | 5-15 | >15 |
| Business Rules | <3 | 3-8 | >8 |
| User Roles Involved | 1 | 2-3 | 4+ |
| Alternative Flows | 0-1 | 2-3 | 4+ |
| API Integrations | 1 | 2-3 | 4+ |
| Database Changes | None | 1-2 tables | 3+ tables |

**Classification Rules:**
- If 2+ factors are "Small" → Feature = Small
- If 2+ factors are "Major" → Feature = Major
- Otherwise → Medium

**Examples:**
- "Login" = Small (1 field, 1 rule, 1 role, 1 flow, 1 API)
- "Payment checkout" = Major (15+ fields, 8+ rules, 3 roles, 5+ flows, 3 APIs)
- "User profile update" = Medium (8 fields, 4 rules, 2 roles, 2 flows, 1 API)

## Feature Size Requirements (Mandatory Minimums)

The following test case counts are **MANDATORY MINIMUMS**. They are intended to ensure sufficient coverage scale based on feature complexity. The generator MUST NEVER produce fewer test cases than the specified minimum for the given feature size.

| Feature Size | Mandatory Minimum | Typical Planning Range |
|--------------|-------------------|------------------------|
| Small Feature | ≥ 15 test cases   | 15–40 test cases       |
| Medium Feature | ≥ 40 test cases   | 40–60 test cases       |
| Major Feature | ≥ 60 test cases   | 60–120 test cases      |
| Enterprise Feature | Generate until complete | Generate until complete applicable coverage is achieved |

### Generation Rules

- **Enforced Minimums**: The AI generator MUST strictly adhere to the following minimums based on feature size:
  - **If Feature Size = Small** → Generate minimum 15 test cases.
  - **If Feature Size = Medium** → Generate minimum 40 test cases.
  - **If Feature Size = Major** → Generate minimum 60 test cases (aiming for 60-120).
  - **If Feature Size = Enterprise** → Generate until complete applicable coverage is achieved.
- If the initial generation yields fewer test cases than the minimum for the feature size, the AI MUST iterate and generate additional edge cases, negative cases, security cases, and performance cases until the minimum is met.
- Test generation SHALL NOT stop simply because the suggested typical planning range has been reached.
- The generator SHALL continue producing additional test cases whenever required to achieve complete applicable coverage.
- Coverage completeness SHALL always take precedence over test case count, meaning you must exceed the minimum if necessary.
- The final number of test cases shall be determined by:
  - Requirement scope
  - Feature complexity
  - Business risk
  - Number of business rules
  - Input variations
  - Alternative and exception flows
  - Applicable non-functional requirements
  - Regression impact

**NOTE**

The mandatory minimums above are strict quality gates. A feature cannot be considered adequately tested if it falls below these minimums.
---

# 5. Test Priority Rules

Priority reflects business importance rather than implementation complexity.

---

## Priority Assignment

| Priority | Assign When Failure Impacts |
|----------|---------------------------|
| **Critical** | Complete showstopper, Core business blocker, Critical user journey broken with no workaround, Immediate release blocker |
| **High** | Core business flow, Authentication, Payment, Booking, Navigation, Security, Data integrity, Session |
| **Medium** | Secondary business functions, Reporting, Filtering, Sorting, Search, Notification, Profile, Settings |
| **Low** | UI cosmetics, Animations, Branding, Visual consistency, Optional interactions, Non-critical usability improvements |

---

## Priority Consistency Rule

Testcases verifying the same business function shall generally have consistent priority.

Avoid arbitrary priority assignment.

---

# 6. Severity Rules

Severity reflects impact of failure.

---

## Severity Classification

| Severity | Failure Causes |
|----------|---------------|
| **Blocker** | System crash, Fatal uncaught exception, Complete blockage of test execution or release, No workaround available |
| **Critical** | Data corruption/loss, Security breach, Direct financial loss, Complete business interruption with partial workaround |
| **Major** | Primary feature unusable, Incorrect business logic, Navigation blocked, Validation failure, Incorrect core workflow |
| **Minor** | Secondary feature issue, Alignment, Text formatting, Visual inconsistency, Minor usability inconvenience |
| **Trivial** | Minor cosmetic defect, Typo, Negligible visual inconsistency with zero functional impact |

Severity shall NOT be determined by testcase complexity.

---

# 7. Automation & UAT Governance Rules

Automation and User Acceptance Testing readiness shall be evaluated during testcase generation.

---

## 7.1 Automation Candidate

| Classification | Criteria |
|---------------|----------|
| **YES** (Automate) | Stable, Repeatable, Deterministic, Environment independent, High execution frequency, Suitable for regression |
| **NO** (Manual) | Requires visual judgement, Human perception, Exploratory thinking, Complex hardware interaction, Random behaviour, Subjective usability review |

---

## 7.2 Automation Ratio Enforcement (UPDATED)

- **Target**: At least 80% of HIGH priority TCs must be automation candidate
- **Calculation**: (Automation_Candidate_Yes / Total_High_Priority) × 100
- **Validation**: 
  - If ratio ≥ 80% → PASS
  - If ratio < 80% → REGENERATE
  
### Regeneration Strategy (if ratio < 80%):

1. Identify non-automation HIGH priority cases
2. For each: Can it be made automation-ready? (e.g., split into 2 cases?)
3. If YES → Regenerate as automation-ready
4. If NO → Reclass to MEDIUM priority (accept ~10-15% overhead)
5. Recalculate ratio
6. Repeat until ratio ≥ 80%

### Example:
- Start: 10 High priority cases, 7 auto (70%)
- Action: Regenerate TC-H-04 as "TC-H-04 (auto)" + "TC-H-04-Manual (UI perception)"
- Result: 11 High priority cases, 8 auto (73%)
- Still <80% → Continue regenerating
- Final: 10 High priority cases, 8 auto + 2 medium (80% ✓)

---

## 7.3 UAT Script Governance Rule

The `UAT Script` column flags test scenarios that are highly relevant for business acceptance testing.

- **Rule**: `UAT Script = Yes` when Priority = High OR Priority = Medium.
- **Rule**: `UAT Script = No` when Priority = Low.

*Note: The UAT_Script flag provides traceability for the separate `generate-uat-script` skill, which filters these cases for final customer validation.*

---

## 7.4 Validation

Before output:

1. Calculate Automation Coverage % for High Priority cases.
2. If Automation % for High Priority < 80% -> Generate or adjust testcase classification until requirement is met.
3. Validate that ALL High and Medium priority cases have `UAT Script = Yes`.

---

# 8. Duplicate Prevention Rules

Duplicate testcases are prohibited.

---

## Duplicate Definition

Two testcases are duplicates when they validate:

- Same requirement
- Same business behaviour
- Same expected outcome

using only different wording or data.

**Crucial Context Exception**:
If the *same* business behavior (e.g., Password complexity validation) occurs in *different* functional flows or contexts (e.g., Create Account vs. Forgot Password), they **SHALL NOT** be considered duplicates. You MUST generate separate test cases for each distinct context to ensure integration and state management are correct in both flows.

---

## Merge Rule

- Merge duplicate scenarios into a single optimized testcase.
- Never generate duplicate navigation validation.
- Never generate duplicate transition validation.
- Never generate duplicate UI rendering validation.
- Never generate duplicate state validation.

---

## Self Audit

Before output:

1. Compare every testcase against every other testcase.
2. Remove duplicates.
3. Regenerate unique scenarios if necessary.

---

# 9. Test Case Atomicity Rules

Each testcase shall validate ONE business objective.

---

## Allowed

| ✅ Atomic Test Cases |
|---------------------|
| Login with valid account |
| Password length validation |
| Forgot password navigation |

---

## Not Allowed

| ❌ Compound Test Cases |
|----------------------|
| Login + Logout + Remember Me + Session timeout in one testcase |

---

## Action Rule

- Each Step shall perform one action.
- Each Expected Result shall validate one outcome.
- Avoid compound validations.

---

# 10. Test Data Rules

Test data shall be realistic and executable.

---

## Good vs Bad Examples

| Field | ✅ Good | ❌ Bad |
|-------|--------|--------|
| Email | test.user@example.com | Valid Email |
| Password | Test@12345 | Correct Password |
| Phone | 0912345678 | Sample User |
| Vehicle | Toyota Camry | Random Data |
| Coupon | WELCOME10 | Test / ABC |

---

## Boundary Data

Whenever limits exist, generate:

- Minimum, Maximum
- Below Minimum, Above Maximum
- Invalid Format, Null, Whitespace
- Special Character, Unicode
- Duplicate, Expired

---

# 11. Expected Result Standards

Expected Result shall always describe observable system behaviour.

---

## Good vs Bad Examples

| ✅ Acceptable | ❌ Unacceptable |
|--------------|----------------|
| User is redirected to the Sign In screen | Works correctly |
| Error message "Invalid Email Address" is displayed below the Email field | Displays properly |
| Login button becomes disabled | Successful |
| Splash screen disappears after configured timeout | Pass |
| Session token is invalidated | Correct behaviour |
| Database record is created | As expected |
| API returns HTTP 401 | No issue |

Expected Result shall be: Observable, Measurable, Verifiable, Deterministic, Unambiguous.

---

# 12. Output Format Rules

## Objective

Generate test cases in a standardized structure suitable for:

- Manual execution
- Excel import
- Test Management Tools
- Automation planning
- Peer review

---

## Output Structure

Each testcase SHALL contain:

| Column | Description |
|--------|-------------|
| Test Case ID | Unique identifier: MODULE-FUNCTION-### |
| Module | High-level business module |
| Function | Specific feature or function under test |
| FR ID | Functional Requirement identifier mapped to the test case |
| Test Case Description | Business scenario description |
| Pre-Requisite | Required system state |
| Steps Description | Step-by-step actions (one per step) |
| Test Data | Specific input values |
| Expected Result | Observable outcome |
| Priority | High / Medium / Low |
| Severity | Critical / Major / Minor |
| Type | Functional / Negative / Edge / UI / Regression / Security / Performance |
| Automation Candidate | Yes / No |
| Remarks | ASSUMPTION_BASED / KNOWN_LIMITATION / OUT_OF_SCOPE / DEPENDENCY_REQUIRED / (empty) |

---

## TC_ID Convention

| Format | Examples |
|--------|----------|
| `[MODULE]-[FEATURE]-[NUMBER]` | SIG-WELCOME-001, AUTH-LOGIN-015, PROFILE-UPDATE-008 |

Numbers shall be sequential. Never reuse an existing TC_ID.

---

## Pre-Requisite Standards

Pre-Requisites represent the initial system state, account status, and test data preconditions that MUST exist BEFORE test execution begins.

- Write as declarative condition statements (e.g., `User is logged into application.<br>User has no active subscription.`).
- Multiple preconditions shall be separated by `<br>`.
- **CRITICAL RESTRICTION:** STRICTLY FORBIDDEN to number actions as `Step 1:`, `Step 2:` in the `Pre-Requisite` column. The `Step X:` format is STRICTLY RESERVED for `Steps Description`. Pre-Requisites describe initial state preconditions (State/Precondition), NOT user action steps.

---

## Test Step Rules

Each step SHALL contain exactly ONE user action.

| ✅ Good | ❌ Bad |
|--------|--------|
| Step 1: Launch application | Launch app and login |
| Step 2: Tap "Get Started" | |
| Step 3: Enter email address | |

---

## Step Writing Standard

Every step shall start with an action verb:

Launch, Navigate, Tap, Click, Select, Enter, Verify, Open, Close, Refresh, Swipe, Choose

---

## HTML Line Break Rule

When output is intended for Excel, multiple steps inside one cell SHALL use `<br>` instead of semicolons.

**Example:**
```
Step 1: Launch App<br>Step 2: Tap Get Started<br>Step 3: Verify Sign In screen
```

---

## Remarks Rules

Only use Remarks when necessary.

| Allowed Values |
|----------------|
| ASSUMPTION_BASED |
| KNOWN_LIMITATION |
| OUT_OF_SCOPE |
| DEPENDENCY_REQUIRED |
| (empty) |

---

## 12.5 Artifact Synchronization Rule

Any modification (addition, update, deletion) to the Testcases file MUST trigger immediate synchronization of dependent artifacts:

1. **CSV Export**: The `scripts/md_to_csv.py` script MUST be re-run to keep the CSV file in sync.
2. **Coverage Report**: The `Coverage Report` (Requirement, Scenario, Edge Case, and Risk Coverage Matrices) MUST be updated immediately to reflect the new test case counts and mappings.

---

# 13. Review Governance Rules

Before output, perform an internal QA review.

The generated suite shall satisfy all quality standards.

---

## Review Criteria

Verify:

- Business correctness
- Requirement coverage
- Requirement traceability
- Test data quality
- Expected Result quality
- Automation suitability
- Coverage distribution
- Priority consistency
- Severity consistency
- Duplicate detection
- Atomicity
- Output format

---

## Review Principle

- Never skip review.
- Never output raw draft testcases.
- Only reviewed testcases may be returned.

---

# 14. Pre-Output Validation Checklist

The generator MUST validate the complete suite before producing output.

---

## Coverage Validation

- ✓ Every requirement has testcases
- ✓ All applicable coverage dimensions (Functional, Risk, Scenario, Input, Business Rule, Non-functional, Regression) are satisfied based on the requirement's scope, complexity, and risk.

---

## Distribution Validation

- ✓ Functional ≥ 40%
- ✓ Negative ≥ 15%
- ✓ Edge ≥ 10%
- ✓ UI ≥ 10%
- ✓ Performance ≥ 10%
- ✓ Security ≥ 5%
- ✓ Regression ≥ 10%

---

## Automation Validation

- ✓ High Priority Automation Ratio ≥ 80%

---

## Duplicate Validation

- ✓ No duplicate scenarios
- ✓ No duplicate navigation validation
- ✓ No duplicate state validation
- ✓ No duplicated Expected Result

---

## Quality Validation

- ✓ Testcases are atomic
- ✓ Test data is realistic
- ✓ Expected Result is measurable
- ✓ No vague wording
- ✓ Traceability complete

---

## Output Validation

- ✓ Correct column order
- ✓ TC_ID unique
- ✓ Markdown table valid
- ✓ Steps formatted correctly
- ✓ Remarks valid

---

# 15. Self Audit Engine

Before returning the final output, perform a complete self-audit.

---

## Audit Sequence

| Step | Audit |
|------|-------|
| 1 | Requirement Coverage Audit |
| 2 | Coverage Distribution Audit |
| 3 | Duplicate Detection Audit |
| 4 | Priority Audit |
| 5 | Severity Audit |
| 6 | Automation Audit |
| 7 | Expected Result Audit |
| 8 | Output Format Audit |
| 9 | Final Approval |

---

## Failure Handling

If ANY audit fails:

1. DO NOT produce output.
2. Identify failed area.
3. Regenerate affected testcase(s).
4. Recalculate statistics.
5. Repeat validation.
6. Only return output after ALL audits pass.

**CRITICAL RULE**: Do not output lengthy internal audit reasoning. Perform the Self-Audit internally. If requested, output a brief `<audit_summary>` listing the Passed/Failed status of the checks before printing the final Markdown table.

---

# 16. Quality Gates

The following Quality Gates are mandatory.

| Gate | Check | Requirement |
|------|-------|-------------|
| Gate 1 | Requirement Understanding | PASS required |
| Gate 2 | Requirement Traceability | PASS required |
| Gate 3 | Coverage Distribution | PASS required |
| Gate 4 | Duplicate Detection | PASS required |
| Gate 5 | Expected Result Quality | PASS required |
| Gate 6 | Automation Governance | PASS required |
| Gate 7 | Output Format | PASS required |

If any Quality Gate fails, generation SHALL restart from the affected stage.

---

# 17. AI Regeneration Rules

The generator SHALL automatically regenerate output when:

- Applicable coverage dimensions are incomplete based on scope/risk.
- Duplicate testcases are detected.
- Automation ratio is below target.
- Requirement mapping is missing.
- Expected Result is ambiguous.
- Test data is unrealistic.
- Output format is invalid.
- Applicable regression coverage is missing.

The regenerated output shall replace the previous version.

---

# 18. Execution Principles

The generator SHALL:

1. Think before generating.
2. Generate before validating.
3. Validate before reviewing.
4. Review before approving.
5. Approve before output.

---

## Generation Order

| Step | Phase |
|------|-------|
| 1 | Requirement Analysis |
| 2 | Requirement Decomposition |
| 3 | Test Design |
| 4 | Test Case Generation |
| 5 | Requirement Traceability |
| 6 | Coverage Validation |
| 7 | Quality Validation |
| 8 | Self Audit |
| 9 | Final Approval |
| 10 | Output |

---

## Mandatory Principles

- Never hallucinate requirements.
- Never invent undocumented functionality.
- Never skip validation.
- Never skip self-audit.
- Never output duplicate testcases.
- Never output partially covered requirements unless explicitly documented.
- Never use vague wording.
- Always maintain end-to-end traceability.
- Always generate deterministic and review-ready test cases.

---

## Token Limit / Large Suite Handling

If the generated test suite is too large to fit in a single AI response (e.g., > 60 test cases), automatically pause at a safe boundary and output:
**"Part 1 completed. Type CONTINUE to generate the next batch."**
Ensure no test case is cut off in the middle of the table.

---

# 19. CSV & Excel Integration Standards

## Objective
Ensure the generated Markdown table can be cleanly converted to a standard CSV file without column shifting or import errors in spreadsheet software or test case managers (like Jira Xray or TestRail).

## Formatting Rules
- **No unquoted commas inside cells**: If an input cell or expected result contains commas, do not use commas directly if possible. Alternatively, ensure the converter script quotes the fields.
- **Enforce HTML `<br>` for line breaks**: Do not use semicolons `;` or real newlines inside table cells for step separation. Use exact `<br>` tag strings to allow clean conversion.
- **Escape double quotes**: If a test step or text string contains a double quote (`"`), it must be escaped as `""` inside the markdown cell to prevent CSV parsing issues.
- **Strict Column Count Alignment**: The generated table must strictly maintain the 14-column layout. Adding or removing columns on specific rows is prohibited.
- **Plain-Text Math & Currency Formatting (Strictly Prohibit LaTeX)**:
  - Do NOT use LaTeX math syntax (e.g., `$...$`, `$$...$$`, `\Delta`, `\$`, `\times`, `\le`, `\ge`, `\text{...}`) anywhere in the test case table (Description, Pre-Requisite, Steps, Test Data, Expected Result, Remarks). LaTeX syntax completely breaks and renders unreadable symbols when exported to CSV or copied into Google Sheets and Microsoft Excel.
  - Greek & Math symbols: Convert to plain parenthesized English words: use `(Delta)` instead of `$\Delta$`.
  - Currency: Write plain dollar signs like `$38.50` (or `VND 50,000`), NEVER escape with backslash `\$38.50`.
  - Arithmetic operators: Use standard keyboard symbols: `=`, `+`, `-`, `*`, `<=`, `>=`, `!=`, `~`.
  - Equations: Format as clean, readable plain-text arithmetic:
    - ❌ Prohibited: `Fare Delta $\Delta$ calculates exactly as: $\$38.50 - \$30.00 = +\$8.50$.`
    - ✅ Required: `Fare Delta (Delta) = $38.50 - $30.00 = +$8.50`
    - ❌ Prohibited: `Fare Delta $\Delta \le \$0$`
    - ✅ Required: `Fare Delta (Delta) <= $0`
    - ❌ Prohibited: `$\text{New Total} = \text{Base} + \text{Distance}$`
    - ✅ Required: `New Total = Base + Distance`
    - ❌ Prohibited: `Extreme fare increase ($\Delta > \$40$ or $\Delta > 100\%$)`
    - ✅ Required: `Extreme fare increase (Delta > $40 or Delta > 100%)`

---

# 20. Enterprise Quality Gates: 5-Pillar Coverage & Black-Box Manual Standards

## 20.1 The 5-Pillar Functional Coverage Gate
For any module involving workflows, state transitions, transactions, or asynchronous/scheduled lifecycles, the test suite MUST satisfy all 5 functional pillars:
1. **Pillar 1: UI & Interactive Form Flow:** Screen layouts, component states, input boundary validations (BVA/EP), empty states, loading skeletons, disabled/enabled states.
2. **Pillar 2: Full Permutation Matrix:** 100% permutations across all user roles, state combinations, plan/option configurations, and selection pairs. Sample-only testing is strictly prohibited.
3. **Pillar 3: Time-based & Event-driven Lifecycle (T0 vs T1):** 
   - **T0 (Action/Schedule Phase):** Immediate user action, pending status indicators, schedule tag displays, zero unexpected immediate charge for deferred actions, audit trail generation.
   - **T1 (Execution/Maturity Phase):** Batch/Cron worker execution on the exact scheduled date, state transition execution, updating active status badges, unlocking new rights/privileges, revoking previous privileges.
4. **Pillar 4: System, Network & Third-Party Exceptions:** Third-party gateway errors, authentication/OTP failures, insufficient funds/quota, connection drops, timeout handling, retry/dunning policies, fallback recovery.
5. **Pillar 5: Dedicated Communication Loop:** Push notifications, In-App notification center, transactional emails, SMS alerts, and deep-link routing.

## 20.2 Global Requirement Cross-Referencing Requirement
- AI generators are strictly forbidden from reading only an isolated requirement chapter or module section.
- Prior to scenario generation, the generator MUST scan the entire requirement document across 5 universal cross-cutting categories:
  1. *Communication & Alerts:* `Email`, `Notification`, `Push`, `SMS`, `In-App`, `Alert`, `Template`, `Deep-link`.
  2. *Background & Scheduled Lifecycle:* `Cron`, `Worker`, `Batch`, `Job`, `Schedule`, `Queue`, `Timer`, `Sync`, `Grace Period`, `Expiration`, `Effective Date`.
  3. *Transactions & External Integrations:* `Payment`, `Gateway`, `Checkout`, `Refund`, `Invoice`, `Billing`, `Webhook`, `Third-party`.
  4. *Security & Access Control:* `Auth`, `Role`, `Permission`, `Token`, `Session`, `OTP`, `MFA`.
  5. *Global Appendices & Error Handlers:* `Appendix`, `System Limits`, `Error Codes`, `Glossary`.
- Any email template, notification, or batch schedule relevant to the module MUST be extracted and transformed into dedicated test cases.

## 20.3 Strict Black-Box Manual QA Vocabulary Blacklist
In manual functional test cases, steps and expected results must only contain actions observable and executable by a manual QA tester holding a physical device:
- **Forbidden backend terms:** `webhook`, `event listener`, `event bus`, `event payload`, `trigger event`, `evt_*`, `internal queue`, `message broker`, `POST /api/`, `GET /api/`, `payload`, `HTTP 200`, `200 OK`, `status code 4xx/5xx`, `json response`, `REST endpoint`, `cURL`, `database`, `table`, `column`, `row`, `SQL query`, `SELECT`, `UPDATE WHERE`, `foreign key`, `primary key`, `schema migration`, `cache key`, internal variable/class/method names.
- **Mandatory black-box terms:** `Mobile app screen`, `Payment/Auth webview`, `Push notification banner`, `In-app notification center`, `Email inbox`, `Transaction receipt`, `Profile/Settings view`, `Status badge`.

## 20.4 Communication & Lifecycle First-Class Citizen Standard
- Never bury email or push notifications as secondary assertions inside button-click test cases.
- Every transactional/state event MUST have dedicated test cases (`*-NOT-*`) validating email subject, sender name, dynamic placeholders (`{{user_name}}`, `{{item_name}}`, `{{amount}}`, `{{effective_date}}`, `{{reference_id}}`), OS notification states (Foreground, Background, Killed), and deep-link navigation.

---

# End of Test Generation Rules
