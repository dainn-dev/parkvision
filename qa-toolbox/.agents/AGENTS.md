# 🏛️ Production-Grade QA Test Engineering Governance Framework (v1.0 Final)
# ==============================================================================
# Pipeline: LEVEL -1 ➔ LEVEL 0 ➔ LEVEL 1 ➔ LEVEL 2 ➔ LEVEL 3 ➔ LEVEL 4
# ==============================================================================


# ==============================================================================
# 🚪 LEVEL -1 — INPUT & DOCUMENT INTEGRITY (FAIL-FAST GATEWAY)
# ==============================================================================

# 🛑 Input Integrity & Pre-condition Validation Rule
<RULE[input_document_integrity]>
Trước khi thực hiện bất kỳ phân tích, đánh giá Gap hay sinh Test Cases nào, AI BẮT BUỘC phải thực hiện kiểm tra tính toàn vẹn của đầu vào (Input Integrity Check). 

### 1. Phân luồng kiểm tra (Automated vs Manual Integrity):
- **IF Filesystem Access = AVAILABLE:** AI tự động quét kiểm tra file thực tế trên workspace.
- **IF Filesystem Access = NOT AVAILABLE (Web / Paste Mode):** AI BẮT BUỘC kích hoạt **Manual Integrity Gate** và yêu cầu USER xác nhận checklist:
  - [ ] File Requirement là phiên bản active/mới nhất.
  - [ ] File không thuộc thư mục nháp/backup/archive/deprecated.
  - [ ] Nội dung đầy đủ, không bị cắt cụt (truncated).
  - [ ] Tài liệu có chứa các mã Requirement ID rõ ràng.

### 2. Tiêu chí kiểm tra Artifact dự án (Conditional Check):
- **IF yêu cầu đầu ra cần file template hoặc CSV conversion:** Kiểm tra sự tồn tại của `templates/testcases.md` và `scripts/md_to_csv.py`.
- **IF không yêu cầu artifact dự án (Ví dụ: Trả lời Markdown thuần):** Đánh dấu `Artifact Readiness: N/A` kèm lý do.

### 3. 🔴 MANDATORY Schema Pre-Load (CRITICAL — KHÔNG ĐƯỢC BỎ QUA):
Trước khi bất kỳ agent nào sinh Test Case, AI BẮT BUỘC phải **đọc và nạp toàn bộ nội dung** các file schema sau:

| File Schema | Áp dụng khi | Hành động bắt buộc |
|---|---|---|
| `schemas/testcase.schema.md` | Luôn luôn — khi sinh Test Case | Đọc toàn bộ file. Nạp vào context. Xác nhận 14 cột, allowed values của Priority/Severity/Type/Automation Candidate trước khi generate. |
| `schemas/coverage.schema.md` | Khi chạy Coverage Analysis | Đọc toàn bộ file. Nạp vào context trước khi tính coverage. |
| `schemas/finding.schema.md` | Khi sinh Gap Report, Risk Report, Edge Case Report | Đọc toàn bộ file. Nạp vào context. |
| `schemas/uat_script.schema.md` | Khi sinh UAT Script | Đọc toàn bộ file. Nạp vào context. |

**Quy trình bắt buộc:**
1. Dùng `view_file` hoặc `read_file` để đọc file schema tương ứng.
2. Xác nhận các Enum values hợp lệ (không tự suy diễn).
3. Chỉ được phép dùng các giá trị đã được định nghĩa trong schema — **TUYỆT ĐỐI KHÔNG ĐƯỢC DÙNG GIÁ TRỊ NGOÀI SCHEMA**.
4. Nếu file schema không tồn tại → DỪNG LẠI và báo cáo cho USER.

**Hành động khi Fail Gate:** DỪNG LẠI NGAY LẬP TỨC ➔ Liệt kê chi tiết lỗi đầu vào ➔ Chờ chỉ định từ USER.
</RULE[input_document_integrity]>


# ==============================================================================
# 🌐 LEVEL 0 — GOVERNANCE, AUDITABILITY & ANTI-HALLUCINATION
# ==============================================================================

# 🌐 QA Deliverables Language Standard Rule (CRITICAL)

<RULE[qa_deliverables_language_standard]>

AI BẮT BUỘC tuân thủ phân định ngôn ngữ theo nguyên tắc:

## 1. Communication & QA Reports — Vietnamese

Giao tiếp trực tiếp với USER và toàn bộ QA Analysis Reports
MUST sử dụng Tiếng Việt, bao gồm nhưng không giới hạn:

- Req_Gap_Report.md
- Risk_Analysis_Report.md
- Edge_Case_Report.md
- Test_Scenarios_Report.md
- Coverage_Report.md

Trong Testcases.md, các phần sau MUST sử dụng Tiếng Việt:

- Section Headings
- Metadata
- Technical Explanation
- Applied Test Design Techniques
- Quality Gate Checklist
- Edge Case Summary
- Risk Summary
- Self-Review Audit

## 2. Test Case Table Content — English

Toàn bộ Natural Language Content trong 14-column Test Case Table
MUST được viết bằng English, bao gồm:

- Test Case Description
- Pre-Requisite
- Steps Description
- Test Data
- Expected Result
- Remarks

Các Step MUST bắt đầu bằng English Action Verb phù hợp.

Examples include, but are not limited to:

Navigate, Open, Click, Tap, Enter, Input, Select, Choose,
Upload, Scroll, Submit, Confirm, Cancel, Enable, Disable,
Refresh, Retry, Verify, Observe, Check.

## 3. 14-Column Headers — English

14 column headers MUST remain in English exactly as defined
in templates/testcases.md.

AI MUST NOT translate or rename the standardized column headers.

## 4. Standardized Values & Identifiers — MUST NOT TRANSLATE

The following MUST be preserved exactly:

- Test Case ID
- FR ID / BR ID
- Requirement IDs
- Priority
- Severity
- Type values
- Automation Candidate values
- HTTP status codes
- API status codes
- Standard governance tags
- Technical identifiers explicitly defined by source documents

## 5. Business Terms & UI Labels

If a Business Term, UI Label, Status, Role, Error Message,
Notification or Product-defined value is explicitly defined
in the source document:

→ Preserve the original source-defined value.

→ Write the surrounding test description in English.

Example:

Click the "Hủy chuyến" button.

NOT:

Click the "Cancel Trip" button.

if "Hủy chuyến" is the exact source-defined UI label.

## 6. Source-Defined Text Preservation

Expected Result MUST preserve exact source-defined UI messages,
error messages, labels and business values when applicable.

AI MUST NOT translate, paraphrase or invent source-defined text.

Example:

The system displays the confirmation message
"Bạn có chắc chắn muốn hủy chuyến?".

## 7. Governance Tags

Standard Governance tags MUST preserve their canonical format:

- [Assumption]
- [Partial — Pending Verification]
- [SLA: TBD]
- [QA Hypothesis — Source Unverified]
- [Pending Evidence]

AI MUST NOT translate these tags into Vietnamese.

## 8. Core Language Principle

Natural-language explanation:

→ QA Reports = Vietnamese
→ Test Case Table = English

Source-defined identifiers, labels, values and governance metadata:

→ Preserve exactly
→ Do NOT translate
→ Do NOT invent

</RULE[qa_deliverables_language_standard]>

# 📌 Requirement Source-of-Truth Rule
<RULE[requirement_source_of_truth]>
AI BẮT BUỘC phải xác định và công bố rõ ràng **Requirement Source-of-Truth** trước khi tiến hành phân tích:

### Thứ tự ưu tiên xác định Source-of-Truth:
1. **Ưu tiên 1:** File Requirement được USER chỉ định trực tiếp trong prompt hoặc file đính kèm.
2. **Ưu tiên 2:** File Requirement chính thức mới nhất trong thư mục `docs/requirements/`.
3. **Khi có nhiều phiên bản (v1, v2, draft):** Bắt buộc đối chiếu `Last Modified` hoặc phiên bản (Revision/Version tag) để chọn bản mới nhất. Tuyệt đối KHÔNG dùng file trong `cache/`, `old/`, `backup/`, `archive/`.

### Bắt buộc công bố Metadata ở đầu mỗi Báo cáo / Testcases:
```markdown
- **Requirement Source-of-Truth:** `docs/requirements/[Requirement_Document_Name].md`
- **Requirement Module/Section:** `[Module_Name] ([Module_ID])`
- **Document Version/Date:** `vX.Y (Active)`
- **Integrity Status:** `VERIFIED & UNTRUNCATED`
```
</RULE[requirement_source_of_truth]>

# 🔍 Global Requirement Cross-Referencing & Anti-Local Scoping Rule (CRITICAL)
<RULE[global_frs_cross_referencing]>
AI TUYỆT ĐỐI KHÔNG ĐƯỢC chỉ đọc cục bộ một phân đoạn Requirement được chỉ định mà bỏ qua ngữ cảnh toàn cục (Global Context) của tài liệu:

### 1. Nguy cơ Đọc Cục bộ (Local Scoping Blindspot):
Trong các tài liệu đặc tả nghiệp vụ lớn (>1.000 dòng), các quy định liên quan đến: Mẫu Email (Email Templates), Thông báo đẩy (Push Notifications), Cơ chế Cron/Worker, Lịch chuyển trạng thái định kỳ, Chính sách ân hạn (Grace Period), Điều khoản thanh toán, hoặc Bảng mã lỗi chung thường được đặt tại **Phụ lục toàn cục (Global Appendices)** hoặc nằm rải rác ở các chương chung. Nếu chỉ đọc đúng section của module, AI CHẮC CHẮN sẽ bỏ sót các luồng kiểm thử quan trọng.

### 2. Hành động bắt buộc trước khi thiết kế kịch bản (Mandatory Global Grep):
Trước khi phân tích Gap hoặc sinh Test Cases, AI BẮT BUỘC phải thực hiện tìm kiếm toàn văn trên toàn bộ file Requirement theo 5 nhóm từ khóa phổ quát:
1. *Truyền thông & Thông báo:* `Email`, `Notification`, `Push`, `SMS`, `In-App`, `Alert`, `Template`, `Deep-link`.
2. *Tác vụ chạy ngầm & Vòng đời:* `Cron`, `Worker`, `Batch`, `Job`, `Schedule`, `Queue`, `Timer`, `Sync`, `Grace Period`, `Expiration`, `Effective Date`.
3. *Giao dịch & Tích hợp cổng bên ngoài:* `Payment`, `Gateway`, `Checkout`, `Refund`, `Invoice`, `Billing`, `Webhook`, `Third-party`.
4. *Bảo mật & Phân quyền:* `Auth`, `Role`, `Permission`, `Token`, `Session`, `OTP`, `MFA`.
5. *Phụ lục & Quy tắc toàn cục:* `Appendix`, `System Limits`, `Error Codes`, `Glossary`.

- **Bắt buộc trích xuất:**
  - Mẫu Email (Email Template): Subject, Sender, Branding, Dynamic Field Placeholders (ví dụ `{{user_name}}`, `{{effective_date}}`, `{{amount}}`).
  - Kịch bản Push Notification: Tiêu đề, Nội dung, Icon/Badge, Trạng thái App (Foreground, Background, Killed).
  - Quy tắc Deep-link: Khi người dùng bấm vào Notification hoặc Email link thì ứng dụng mở màn hình nào.
- Nếu phát hiện Requirement có nhắc đến Email/Notification liên quan đến module ➔ **BẮT BUỘC chuyển thành Test Cases độc lập**, cấm bỏ qua hoặc ghi chú qua loa.
</RULE[global_frs_cross_referencing]>

# 🧭 Core Governance Principle: Unknown ≠ Not Applicable (CRITICAL)
<RULE[unknown_not_equal_not_applicable]>
Khi AI không có đủ bằng chứng kỹ thuật (Technical Evidence) để xác định tính ứng dụng của một kỹ thuật, rule bảo mật, SLA hiệu năng hoặc hành vi hệ thống:

### BẮT BUỘC:
- Gắn cờ trạng thái `NEEDS VERIFICATION`, `[SLA: TBD]`, hoặc `[Pending Evidence]`.
- Ghi nhận chi tiết vào **Requirement Gap Report** hoặc **Verification Request**.
- Chỉ sinh test case / output cho phần đã có bằng chứng xác thực rõ ràng.

### TUYỆT ĐỐI KHÔNG:
- ❌ Tự suy diễn `Unknown = Not Applicable` (bỏ qua không kiểm tra).
- ❌ Tự suy diễn `Unknown = Applicable` (và tự bịa ra kịch bản kiểm thử giả định).
- ❌ Tự ý bỏ qua trong báo cáo mà không có ghi chú minh bạch.

### 📌 Ví dụ áp dụng minh họa:
| Tình huống thực tế | ❌ Sai (Unknown = Not Applicable) | ✅ Đúng (Unknown ≠ Not Applicable) |
|---|---|---|
| Không rõ input được filter ở client hay server | Bỏ qua SQL Injection test | Gắn cờ `Needs Verification` + Request API contract |
| FRS không nói đến số lần retry tối đa | Không kiểm thử retry logic | Ghi `[Retry Policy: TBD]` vào Gap Report |
| Không có API Contract cho Push Notification | Bỏ qua Contract & Timeout testing | Gắn cờ `Needs Verification — pending API spec` |
</RULE[unknown_not_equal_not_applicable]>

# 🧠 Assumption Control & Anti-Hallucination Rule (CRITICAL)
<RULE[assumption_control]>
AI TUYỆT ĐỐI KHÔNG ĐƯỢC tự ý biến các giả định chưa được kiểm chứng (Unverified Assumptions) thành sự thật nghiệp vụ, quy tắc hệ thống, dữ liệu kiểm thử, SLA, nhãn UI, mã lỗi, giá trị mặc định, giới hạn số lần retry hay chính sách phí.

### Quy định kiểm soát giả định (Assumption Protocol):
1. **Mọi khẳng định phải Traceable:** Mọi thuộc tính nghiệp vụ đưa vào Test Case phải truy vết được về tài liệu FRS/SRS, API Contract hoặc System Design.
2. **Xử lý khi bắt buộc phải giả định:** Nếu thiếu thông tin để thiết kế test (ví dụ: cần tài khoản test cụ thể):
   - Phải đánh dấu rõ ràng `[Assumption]: ...` trong phần Test Data hoặc Pre-Requisite.
   - Ghi nhận vào mục **Requirement Gap & Clarification Requests**.
3. **CẤM đưa Assumption vào Expected Result:** Expected Result chỉ chứa các kết quả đã được quy định hoặc suy luận logic tất yếu từ FRS. Tuyệt đối không viết Expected Result dựa trên giả định tự tạo (ví dụ: FRS không ghi thì cấm tự bịa *"Tối đa cho phép thử lại 3 lần"*).
</RULE[assumption_control]>

# 🚫 No Invented Business Rules Rule
<RULE[no_invented_business_rules]>
Khi FRS chỉ ghi nhận hành vi tổng quát (ví dụ: *"User can cancel booking"*, *"System applies processing fee"*):
1. **CẤM:** Tự định nghĩa tỷ lệ phần trăm phí (ví dụ: *"Phí là 20%"*), thời gian miễn phí hủy (ví dụ: *"Hủy trước 24h"*), hoặc mức bồi thường cụ thể.
2. **BẮT BUỘC phân loại hành động sau khi phát hiện:**
   - 🔵 **Đưa vào `NEEDS VERIFICATION`:** Khi chính sách chắc chắn tồn tại nhưng chưa được document trong FRS (ví dụ: *"Hệ thống trừ phí xử lý"* ➔ Tỷ lệ phí có thể hỏi/lấy từ BA hoặc API Contract).
   - 🔴 **Đưa vào `NOT TESTABLE`:** Khi yêu cầu hoàn toàn định tính/chủ quan và không có nguồn kỹ thuật nào định nghĩa được (ví dụ: *"Hệ thống tự tính giá hợp lý"*).
</RULE[no_invented_business_rules]>

# 🔍 Requirement Testability, Coverage Status & Escalation Rule
<RULE[requirement_testability_and_coverage_status]>
Mọi Requirement hoặc Atomic Condition phân tích BẮT BUỘC phải được phân loại vào 1 trong 4 trạng thái Testability:

### 4 Trạng thái Testability & Công thức tính Độ phủ:
1. 🟢 **TESTABLE (Kiểm thử được hoàn toàn):**
   - Có Acceptance Criteria, Logic rẽ nhánh và Oracle xác định Pass/Fail rõ ràng.
   - **Coverage:** Tính vào Functional Coverage (Covered = 100% khi toàn bộ atomic conditions có testcase).
2. 🟡 **PARTIALLY TESTABLE (Kiểm thử được một phần):**
   - Một phần requirement rõ ràng, một phần thiếu công thức hoặc định tính.
   - **Coverage Formula:** `Coverage = X/Y Atomic Conditions Covered` (Ví dụ: `2/4 conditions covered = 50% Coverage`).
   - **Status:** Gắn cờ `PARTIAL / Pending Clarification`. Không được tính là Fully Covered.
3. 🔵 **NEEDS VERIFICATION (Cần xác minh bằng chứng kỹ thuật):**
   - Requirement có thể kiểm thử về mặt lý thuyết, nhưng thiếu System Design / API Contract / Technical Evidence (Ví dụ: Chưa rõ server-side hay client-side filter, chưa rõ cache policy, chưa rõ WebSocket protocol).
   - **Escalation Protocol:**
     - Ghi rõ trong Gap Report: `[Verification Request — Pending response from: System Design / BA / Dev]`.
     - KHÔNG tự chuyển sang NOT TESTABLE và KHÔNG tự sinh test case dựa trên assumption.
     - Nếu USER yêu cầu tiếp tục: Chỉ sinh test case cho phần đã có bằng chứng; gắn cờ `[Partial — Pending Verification]` trong Remarks; **không tính vào Functional Coverage** cho đến khi có evidence chính thức.
4. 🔴 **NOT TESTABLE (Không thể kiểm thử):**
   - Không có Oracle/Tiêu chí khách quan để xác định Pass/Fail.
   - **Coverage:** `N/A` (Loại khỏi mẫu số Functional Coverage).
   - **Action:** **KHÔNG sinh functional testcase giả định** ➔ Đưa 100% vào **Requirement Gap Report**.
</RULE[requirement_testability_and_coverage_status]>

# 🚫 No Coverage Shortcuts & Parameterized Data Boundaries Rule
<RULE[no_coverage_shortcuts]>
Tuyệt đối KHÔNG ĐƯỢC sử dụng các "đường tắt" để giả vờ đạt độ phủ (Coverage Shortcut) hoặc tạo test case mẫu đại diện:
1. **CẤM:** Sinh vài testcase mẫu rồi ghi *"Các trường hợp tương tự được kiểm thử tương tự"* hoặc *"Và các case âm tính khác..."*.
2. **CẤM:** Tuyên bố 100% Coverage khi chưa phân rã hết toàn bộ Atomic Requirements, Decision Table branches và State Transitions.
3. **Ranh giới Parameterized Test Data:** Parameterized Test Data KHÔNG PHẢI là Coverage Shortcut khi mỗi data row đại diện cho một Equivalence Class hoặc Boundary Value KHÁC NHAU có ý nghĩa kiểm thử độc lập. Bị coi là Spam khi các dòng dữ liệu chỉ là biến thể ngẫu nhiên trùng lặp trong cùng 1 Equivalence Class.
   - ✅ **Hợp lệ:** `user@email.com` (valid), `invalid@` (format error), `[empty]` (required), `email_257_chars@...` (boundary over), `emoji@email.com` (special char) — 5 equivalence classes độc lập.
   - ❌ **Spam:** `user1@email.com`, `user2@email.com`, `user3@email.com` — 3 biến thể trong cùng 1 valid class.
4. **Ngoại lệ duy nhất:** Nếu người dùng yêu cầu rõ ràng *"Làm ví dụ/demo mẫu"*, AI được phép sinh số lượng giới hạn theo đúng yêu cầu.
</RULE[no_coverage_shortcuts]>

# 📝 Report Naming & Overwrite Rules
<RULE[report_naming_and_overwrite]>
1. **Report Naming:** Tên file báo cáo bắt buộc phải chứa mã và tên của Module/Requirement được phân tích (Ví dụ: `FR_ACS_FIN_Host_Financial_Management_Req_Gap_Report.md`). Tuyệt đối không dùng tên chung chung (`gap_report.md`).
2. **Report Overwrite:** Khi chạy lại một module, BẮT BUỘC ghi đè (overwrite) hoàn toàn lên file cũ, đảm bảo tính nhất quán của bản build mới nhất.
</RULE[report_naming_and_overwrite]>


# ==============================================================================
# 🧩 LEVEL 1 — TEST DESIGN, REQUIREMENT TYPES & APPLICABILITY
# ==============================================================================

# 🏷️ Primary & Supplementary Technique Selection Rule
<RULE[requirement_type_and_primary_technique]>
Trước khi thiết kế testcase, AI BẮT BUỘC phải phân loại **Requirement Type** để xác định **Kỹ thuật kiểm thử chính (Primary Technique)** và **Kỹ thuật bổ trợ (Supplementary Techniques)**:

### 1. Quy tắc chọn kỹ thuật theo Requirement Type:
- **IF Requirement chứa vòng đời chuyển đổi trạng thái (Lifecycle / State Transition):** 
  ➔ **Primary:** `State Transition Testing` | **Supplementary:** `Decision Table`, `EP/BVA`, `Negative Testing`.
- **IF Requirement chứa công thức tính toán / điều kiện rẽ nhánh (Calculation / Rule Logic):** 
  ➔ **Primary:** `Decision Table Testing / Cause-Effect Graphing` | **Supplementary:** `BVA`, `Error Guessing`.
- **IF Requirement liên quan tích hợp bên thứ 3, Webhook, Push Notification, API timeout:**
  ➔ **Primary:** `Contract Testing, Timeout & Network Resilience Testing` | **Supplementary:** `Error Guessing`, `Negative Testing`.
- **IF Requirement chứa trường nhập liệu, độ dài, định dạng, khoảng giá trị (Input / Field Validation):** 
  ➔ **Primary:** `Equivalence Partitioning (EP) & Boundary Value Analysis (BVA)` | **Supplementary:** `Error Guessing`.
- **IF Requirement mô tả phản ứng hệ thống với hành động người dùng, thông báo lỗi, UI tương tác:**
  ➔ **Primary:** `Error Guessing, Action Flow Testing` | **Supplementary:** `Negative Testing`, `EP/BVA`.
- **IF Requirement chứa bộ lọc đa tiêu chí, sắp xếp nâng cao (Search / Multi-Filter):** 
  ➔ **Primary:** `Pairwise / Combinatorial Testing` | **Supplementary:** `EP/BVA`.
- **IF Requirement là giao diện tĩnh, kiểu chữ, bố cục (Static UI / Typography):** 
  ➔ **Primary:** `Visual & Static UI Inspection` | **Supplementary:** `N/A`.

### 2. Xử lý yêu cầu hỗn hợp (Hybrid Requirement Resolution / Tie-Breaker):
Khi một Requirement thỏa mãn nhiều điều kiện `IF` cùng lúc (Ví dụ: Flow thanh toán có vừa State Machine, vừa tính phí rẽ nhánh, vừa gọi Stripe):
- **Primary Technique** BẮT BUỘC được chọn theo **thứ tự ưu tiên nghiêm ngặt** sau:
  1. `State Transition Testing` (nếu có vòng đời chuyển đổi trạng thái rõ ràng)
  2. `Decision Table Testing` (nếu có công thức tính toán / rẽ nhánh đa điều kiện)
  3. `Contract Testing & Integration` (nếu có tích hợp cổng bên thứ 3 / Webhook)
  4. `EP & BVA` (nếu trọng tâm là biên nhập liệu)
  5. `Error Guessing & Action Flow` (nếu trọng tâm là xử lý ngoại lệ giao diện)

### 3. Phân biệt Supplementary: INTEGRATED vs INDEPENDENT (CRITICAL):
- 🔹 **INTEGRATED Supplementary:** Kỹ thuật được lồng ghép thực hiện TRONG các test case của Primary (Ví dụ: BVA kiểm tra biên số tiền trong khi test chuyển trạng thái Payment) ➔ *Không cần tách test case riêng.*
- 🔶 **INDEPENDENT Supplementary:** Kỹ thuật kiểm tra một chiều/thành phần hoàn toàn độc lập với Primary (Ví dụ: Contract Testing cho Push Notification hoặc Webhook thanh toán độc lập với State Transition của cuốc xe) ➔ **BẮT BUỘC PHẢI CÓ TEST CASE RIÊNG BIỆT.**
  - *Dấu hiệu nhận biết INDEPENDENT:* Có thể fail độc lập mà Primary vẫn pass; liên quan đến external system/giao thức riêng; có bề mặt rủi ro và failure mode độc lập.

### 4. Quy định bắt buộc về ghi nhận `N/A`:
Nếu một kỹ thuật hoặc chiều kiểm thử không áp dụng, AI **BẮT BUỘC ghi rõ trong báo cáo:**
`[Kỹ thuật / Dimension]: N/A — [Lý do kỹ thuật cụ thể vì sao không áp dụng]`.
</RULE[requirement_type_and_primary_technique]>

# 🔬 Atomic Granularity & Parameterized Data Rule
<RULE[atomic_granularity_and_parameterized_data]>
1. **Atomic Level Granularity:** Mỗi Test Case BẮT BUỘC chỉ kiểm tra **một kịch bản / một điều kiện cụ thể**. Tuyệt đối không gộp nhiều trường độc lập vào 1 test case.
2. **Parameterized Test Data Standard:** Đối với các kiểm thử cùng 1 luồng, cùng precondition và cùng mục tiêu (ví dụ: validation format email):
   - Cho phép biểu diễn dạng bảng **Parameterized Data** trong cột Test Data.
   - **Mỗi dòng dữ liệu tham số hóa BẮT BUỘC có Expected Outcome độc lập tương ứng** (Ví dụ: `user@test.com ➔ Accepted`, `invalid@ ➔ Error format`, `[Empty] ➔ Required error`).
</RULE[atomic_granularity_and_parameterized_data]>

# 📊 Module Complexity Evaluation & Completeness Criteria Rule
<RULE[module_complexity_and_completeness]>
Trước khi sinh Test Cases, AI BẮT BUỘC phải công bố đánh giá độ phức tạp và Target Volume định hướng:

| Complexity Tier | Tiêu chí nhận diện (Criteria) | Target Volume (Định hướng) | Ví dụ Module thực tế |
|---|---|:---:|---|
| **Tier 1: Simple** | 1 màn hình đơn, luồng CRUD form cơ bản, ít rẽ nhánh, không tích hợp bên thứ 3 | **30 – 45 Test Cases** | Profile Management, Settings, Static FAQ, Empty State |
| **Tier 2: Medium** | 2–3 màn hình hoặc 1 luồng state machine đơn (Checkout, Cancel, OTP auth, Filter search) | **45 – 65 Test Cases** | Book Vehicle / Checkout, Account Management, Host Cancellation |
| **Tier 3: Mega Module** | **Wizard nhiều bước (>= 4 bước)**, luồng Realtime Sync 2 ứng dụng (Khách <-> Tài xế), tích hợp bên thứ 3, định giá phân tầng, upload đa tệp | **80 – 150+ Test Cases** | **Upload First Listing (8 bước)**, **Host Listing Management**, **Trip Details (6 States E2E)**, **Realtime Dispatch & Tracking** |

### 📌 Tie-Breaker phân loại Tier:
- **IF Module thỏa mãn tiêu chí của nhiều Tier khác nhau:** BẮT BUỘC chọn **Tier CAO HƠN** (Conservative estimate) để đảm bảo độ bao phủ, và ghi rõ lý do trong phần Complexity Justification.

## 🏆 Tiêu chuẩn đánh giá độ hoàn thiện (Completeness Criteria):
Target Volume là con số định hướng để chống làm ẩu. **Bộ Test Cases chỉ được xem là COMPLETE khi đạt đủ 4 tiêu chí cốt lõi:**
1. **100% Atomic Requirements Coverage:** Mọi yêu cầu con đều có test case tương ứng (hoặc có tỷ lệ Coverage X/Y minh bạch).
2. **100% Documented & Safely Derivable State Transitions:**
   - **Documented Transitions:** 100% các bước chuyển trạng thái đã mô tả trong tài liệu.
   - **Safely Derivable Invalid Transitions:** Áp dụng khi state đích là **TERMINAL (Completed, Cancelled, Rejected, Expired)** ➔ Mọi hành động kích hoạt chuyển tiếp ra khỏi Terminal State đều có thể test với Expected Result: *"Hệ thống từ chối hành động / Trả về thông báo lỗi phù hợp"*.
   - **Undocumented Intermediate Transitions:** Bước chuyển từ trạng thái trung gian không có tài liệu ➔ Bắt buộc tạo **Requirement Gap**, tuyệt đối không tự bịa Expected Result.
3. **100% Critical & High Risks Covered:** Mọi rủi ro nghiêm trọng trong Risk Register đều có kịch bản kiểm thử phòng ngừa.
4. **Không Spam Test Case:** Tuyệt đối không sinh test case trùng lặp na ná nhau chỉ để đối phó số lượng.
</RULE[module_complexity_and_completeness]>

# 🏛️ Mandatory 5-Pillar Functional Coverage Gate (CRITICAL)
<RULE[mandatory_five_pillar_coverage_gate]>
Đối với bất kỳ module nào có quy trình nghiệp vụ (Workflows), chuyển đổi trạng thái (State Transitions), giao dịch (Transactions), hoặc vòng đời theo lịch hẹn/chạy ngầm (Scheduled/Lifecycle), bộ Test Cases BẮT BUỘC phải vượt qua **Cổng Kiểm Thử Ngũ Trụ (5-Pillar Gate)**. Tuyệt đối không được phép thiếu bất kỳ trụ nào:

| Trụ Kiểm Thử (Pillar) | Nội Dung Bắt Buộc Phải Có | Tiêu Chí Kiểm Tra (Pass/Fail) |
|---|---|---|
| **Trụ 1: Giao diện & Luồng Biểu mẫu (UI & Form Flow)** | Mọi màn hình, form nhập liệu, validation biên (BVA/EP), trạng thái rỗng (empty state), loading skeleton, disabling nút khi đang xử lý | Phải có TCs kiểm tra giao diện, field validation và UX states |
| **Trụ 2: Ma trận Hoán vị Đầy đủ (Full Permutation Matrix)** | 100% các cặp hoán vị giữa các vai trò người dùng (Roles), trạng thái (States), gói dịch vụ/cấu hình (Options/Tiers), hoặc chu kỳ (Cycles). Tuyệt đối cấm chỉ kiểm thử 1-2 case mẫu đại diện | Phải test 100% các ô trong ma trận hoán vị |
| **Trụ 3: Vòng đời Theo Thời Gian (Time-based & Event-driven Lifecycle: T0 vs T1)** | Phân định rạch ròi 2 mốc thời gian:<br>• **T0 (Action/Schedule Phase):** Thời điểm kích hoạt lệnh (Pending, hiển thị tag lịch hẹn, ghi nhận audit trail, phản hồi tức thời).<br>• **T1 (Execution/Maturity Phase):** Thời điểm lịch hẹn/batch worker đến hạn (Kích hoạt thay đổi chính thức, cập nhật trạng thái mới, cấp quyền/quyền lợi mới, thu hồi quyền/quyền lợi cũ). | BẮT BUỘC phải có test case kiểm tra hành vi hệ thống và quyền lợi người dùng TẠI THỜI ĐIỂM HIỆU LỰC (T1) |
| **Trụ 4: Ngoại lệ Hệ thống, Mạng & Tích hợp (System, Network & Third-Party Exceptions)** | Lỗi xác thực OTP/MFA; Lỗi cổng thanh toán/dịch vụ bên thứ ba (bị từ chối, timeout, thẻ không hợp lệ); Mất kết nối mạng giữa chừng; Cơ chế thử lại (Retry / Dunning / Fallback) | Phải có TCs mô phỏng toàn bộ các tình huống ngoại lệ và khôi phục dịch vụ |
| **Trụ 5: Vòng lặp Truyền thông Khép kín (Communication Loop)** | Push Notification, In-App Notification Center, Transactional Email, SMS, Deep-link navigation | Phải có TCs kiểm tra toàn bộ các kênh truyền thông khi có sự kiện phát sinh |

### Chế tài Gate:
Nếu bất kỳ Pillar nào trong 5 Pillar trên có 0 Test Cases trong khi module có nghiệp vụ tương ứng ➔ **Đánh giá FAILED GATE ngay lập tức**. Bộ Test Case không được phép xuất CSV hay bàn giao cho USER.
</RULE[mandatory_five_pillar_coverage_gate]>

# ✉️ Dedicated Communication & Lifecycle First-Class Citizen Rule
<RULE[communication_and_lifecycle_first_class_citizen]>
Thông báo (Push/In-App Notifications) và Thư điện tử/Tin nhắn giao dịch (Transactional Emails/SMS) là **Thành phần Hạng Nhất (First-Class Citizens)** của trải nghiệm người dùng:

### 1. CẤM Xử lý Hời hợt (Anti-Secondary-Assertion):
- **TUYỆT ĐỐI CẤM:** Chỉ ghi kèm 1 dòng phụ trong cột Expected Result của test case bấm nút (Ví dụ: ❌ *"User clicks Submit and receives confirmation email"*).
- **Lý do:** Cách viết này bỏ qua toàn bộ việc kiểm tra tiêu đề, nội dung placeholder động, định dạng HTML, deep-link và trạng thái ứng dụng.

### 2. Bắt buộc tách thành Test Cases độc lập (Dedicated Communication TCs):
Mỗi sự kiện giao dịch (Khởi tạo thành công, Lên lịch hành động, Đến ngày hiệu lực, Thất bại nghiệp vụ, Nhắc nhở hạn, Hủy bỏ) **BẮT BUỘC PHẢI CÓ TEST CASE ĐỘC LẬP** (ví dụ tiền tố `*-NOT-*`):
- **Email/SMS Validation:**
  - Kiểm tra Sender Name và From Address (ví dụ: địa chỉ email hệ thống theo cấu hình dự án).
  - Kiểm tra Subject Line chuẩn theo tài liệu Requirement.
  - Kiểm tra các Placeholder động (`{{user_name}}`, `{{item_name}}`, `{{amount}}`, `{{effective_date}}`, `{{reference_id}}`).
  - Kiểm tra nút Call-to-Action (CTA) và Deep-link dẫn về đúng màn hình chi tiết trong app.
- **Push Notification Validation:**
  - Kiểm tra hiển thị banner/thanh thông báo của OS (iOS Notification Center / Android Notification Shade).
  - Kiểm tra hoạt động khi App ở 3 trạng thái: **Foreground** (Banner in-app), **Background** (OS notification), **Killed/Terminated** (OS notification).
  - Kiểm tra Deep-link: Chạm vào push notification mở đúng màn hình chi tiết tương ứng, không bị đưa về trang chủ (Home).
- **In-App Notification Center:**
  - Kiểm tra badge đếm số lượng thông báo chưa đọc (+1 unread count).
  - Kiểm tra bản ghi thông báo lưu trong tab Notifications / Hoạt động.
</RULE[communication_and_lifecycle_first_class_citizen]>


# ==============================================================================
# 🚗 LEVEL 2 — DOMAIN CONTEXT STRATIFICATION (RIDE-HAILING)
# ==============================================================================

# 🌐 Stratified Domain Context Rule
<RULE[domain_context_stratification]>
Mọi phân tích rủi ro, Edge Cases và Test Cases BẮT BUỘC phải được phân tầng theo đúng phạm vi hoạt động:

### 1. Phân tầng 1 — Universal App Baseline (Mọi tính năng):
- **Authentication & Authorization:** Phiên đăng nhập hết hạn, đổi mật khẩu từ thiết bị khác, phân quyền vai trò (Host vs Renter vs Admin).
- **Network Resilience:** Mất mạng tức thời (Drop/Reconnect), chuyển đổi giữa WiFi và 4G/5G, chế độ máy bay (Airplane Mode).
- **Device & OS Lifecycle:** Đa kích thước màn hình, bàn phím ảo che khuất trường nhập (Keyboard Overlap), chuyển app sang chạy ngầm (Background/Foreground), OS giải phóng bộ nhớ.
- **Local Storage & State Persistence:** Dữ liệu nháp khi tắt app đột ngột, cache cục bộ.

### 2. Phân tầng 2 — Ride Lifecycle & Realtime Features:
*(Bắt buộc áp dụng cho: Booking, Matching, Dispatch, In-trip Tracking, Trip Cancellation, Ride Payment, Driver-Rider Interaction)*
- **Cross-App Sync & State Handoff:** Trạng thái giữa Khách và Tài xế phải đồng bộ tức thì qua WebSocket/Push (Khách hủy -> Tài xế nhận thông báo ngay; Tài xế bấm Đã đón -> Khách chuyển sang In-trip).
- **Hardware & Location Limitations:** Tín hiệu GPS yếu trong hầm/nhà cao tầng, nhảy cóc tọa độ (GPS drift > 100m), bị thu hồi quyền Location khi app ở Background.
- **Transaction Safety:** Đảm bảo tính toàn vẹn khi mất kết nối giữa lúc bấm thanh toán hoặc xác nhận cuốc.
</RULE[domain_context_stratification]>

# ⚡ Race Condition & Concurrency Testing Governance Rule
<RULE[race_condition_concurrency_governance]>
Trong kiểm thử Concurrency / Race Condition, AI BẮT BUỘC phải phân biệt rạch ròi giữa **Scenario Trigger (Kịch bản kích hoạt)** và **Acceptance Oracle (Kết quả kiểm chứng)**:

### 1. Scenario Trigger (Điều kiện đồng thời):
- **ĐƯỢC PHÉP:** Mô tả điều kiện hành vi đồng thời mà không cần gán timing SLA cụ thể. (Ví dụ: *"Tài xế bấm Offline đồng thời với thời điểm Hệ thống đang xử lý gán cuốc"*).
- **KHÔNG ĐƯỢC PHÉP:** Tự bịa khoảng thời gian mili-giây giả định (Ví dụ: ❌ *"Tài xế bấm Offline trong vòng 50ms..."*).

### 2. Acceptance Oracle (Xác nhận tính toàn vẹn dữ liệu nghiệp vụ):
Expected Result BẮT BUỘC tập trung vào **Business Integrity**, không tự đặt SLA tốc độ:
- ✅ *"Chỉ một trạng thái cuối cùng hợp lệ được hệ thống ghi nhận (Không phát sinh đơn trùng hoặc cuốc xe mồ côi)."*
- ✅ *"Hệ thống từ chối lệnh thứ 2 một cách an toàn và hiển thị thông báo trạng thái cập nhật."*
- ❌ *"Hệ thống xử lý tranh chấp trong vòng 100ms."* (Trừ khi FRS có quy định SLA này).
</RULE[race_condition_concurrency_governance]>


# ==============================================================================
# 🛡️ LEVEL 3 — CONTEXTUAL NFR & RISK MATRIX
# ==============================================================================

# 🔒 Contextual Security Baseline & Security Coverage Gate Rule
<RULE[contextual_security_baseline]>
Kiểm thử bảo mật (Security Testing) phải dựa trên **bề mặt tấn công thực tế (Actual Attack Surface)** và được quản trị nghiêm ngặt:

### 1. Tiêu chí áp dụng từng nhóm bảo mật:
- **Authentication & Role Authorization:** Bắt buộc áp dụng cho mọi tài nguyên hoặc endpoint yêu cầu đăng nhập/phân quyền.
- **IDOR (Insecure Direct Object Reference):** Bắt buộc áp dụng ở mọi nơi có định danh tài nguyên (ID chuyến đi, ID hóa đơn, ID xe, ID người dùng).
- **Parameter Tampering:** Bắt buộc áp dụng cho các giá trị nghiệp vụ gửi từ client (giá tiền, mã giảm giá, số lượng, trạng thái).
- **XSS (Cross-Site Scripting):** Áp dụng cho các trường nhập văn bản tự do (Free-text) và nơi hiển thị nội dung người dùng nhập.
- **SQL Injection Testing Applicability:**
  - **APPLY:** Khi input người dùng gửi về Backend và Backend thực hiện truy vấn cơ sở dữ liệu dựa trên API Contract / Security Design.
  - **DO NOT APPLY:** Khi dữ liệu chỉ lọc thuần túy client-side hoặc có bằng chứng xác nhận không chạm DB query.
  - **IF UNKNOWN:** Đánh dấu là `Security Applicability: Needs Verification` (Tuyệt đối không tự suy diễn `Unknown = Not Applicable`).
- **HTTPS & Payload Protection:** Bắt buộc áp dụng khi truyền tải dữ liệu nhạy cảm (thẻ ngân hàng, mật khẩu, CCCD/GPLX).
- **GPS & Data Privacy:** Bắt buộc áp dụng cho các tính năng truy cập vị trí và lịch sử di chuyển.

### 2. Phân loại & Traceability của Security Tests:
- Các test case bảo mật BẮT BUỘC được phân loại là `Type = Security`.
- Security Tests có thể nằm cùng file test case nhưng **KHÔNG được tính vào Functional Coverage** trừ khi chúng kiểm tra một Functional Security Requirement cụ thể.

### 🏆 Security Coverage Gate & Zero Attack Surface Handling:
- **Công thức chuẩn:** `Security Coverage = [Số Attack Surfaces có Test Case Type=Security] / [Tổng Attack Surfaces Applicable] × 100%`.
- **IF Tổng Attack Surfaces Applicable = 0 (Ví dụ: Static FAQ, Static Legal/About Screen):**
  - Ghi nhận: `Security Coverage: N/A — No applicable attack surface identified for this feature type`.
  - Ghi nhận rõ lý do `N/A` cho từng attack surface trong section *Applied Test Design Techniques*.
  - Loại khỏi mẫu số Security Coverage tổng thể của toàn dự án (tránh lỗi chia cho 0).
- Mọi Attack Surface ở trạng thái `Needs Verification` BẮT BUỘC phải xuất hiện trong Verification Request, không được bỏ qua.
</RULE[contextual_security_baseline]>

# ⚡ Evidence-Based Performance Governance Rule (No Made-Up SLAs)
<RULE[evidence_based_performance_governance]>
Tuyệt đối CẤM tự bịa ra các mốc SLA như `"< 3s"` hay `"200 concurrent users"`. Khi FRS **KHÔNG quy định SLA cụ thể**, AI BẮT BUỘC tuân thủ quy trình sau:

### Quy trình xử lý khi SLA chưa xác định (SLA: TBD):
1. **Gap Report:** Ghi nhận rõ `[Performance SLA: TBD — Not specified in FRS]`.
2. **Test Case Remarks:** Ghi chú `[SLA: TBD — QC ghi nhận thời gian phản hồi thực tế khi thực thi]`.
3. **Expected Result:** Tách biệt kết quả chức năng khỏi SLA. Ghi rõ: *"Hệ thống phản hồi thành công và hoàn tất tác vụ nghiệp vụ mà không phát sinh lỗi."* (Tuyệt đối không dùng cụm từ mơ hồ như *"thời gian chấp nhận được"*).
4. **Performance Verdict:** Đánh dấu là `UNVERIFIED / Pending SLA definition` cho đến khi Product/BA ban hành SLA chính thức.
</RULE[evidence_based_performance_governance]>

# 📱 Compatibility NFR Baseline Rule
<RULE[compatibility_nfr_baseline]>
Đối với ứng dụng di động, các tiêu chí tương thích sau phải được đánh giá:
- **Hệ điều hành & Phiên bản:** Tương thích Android (tối thiểu API level quy định) và iOS (tối thiểu iOS version quy định).
- **Độ phân giải & Màn hình:** Khả năng hiển thị trên màn hình nhỏ (SE/Mini), màn hình chuẩn, màn hình lớn (Plus/Pro Max/Tablet), tai thỏ (Notch/Dynamic Island).
- **Chế độ giao diện:** Hỗ trợ Dark Mode / Light Mode và chuyển đổi tức thì không vỡ layout.
- **Quyền hạn thiết bị (Permissions):** Từ chối quyền GPS/Camera/Notification ➔ App hiển thị hướng dẫn cấp quyền thân thiện, không crash.
</RULE[compatibility_nfr_baseline]>

# 🔥 Risk Source Classification Rule
<RULE[risk_source_classification]>
Mọi rủi ro đưa vào Risk Assessment BẮT BUỘC phải được phân loại rõ ràng theo 4 nguồn gốc sau:
1. **Requirement-derived Risk:** Rủi ro phát sinh trực tiếp từ mâu thuẫn hoặc thiếu sót trong tài liệu nghiệp vụ.
2. **Architecture/System-derived Risk:** Rủi ro phát sinh từ kiến trúc hệ thống (Third-party downtime, Webhook drop, DB lock).
3. **Domain-derived Risk:** Rủi ro đặc thù của ngành Gọi xe / Thuê xe (GPS drift, Mock location, rớt mạng khi di chuyển).
4. **QA Risk Hypothesis:** Giả thuyết rủi ro do chuyên gia QA đặt ra khi chưa rõ nguồn. BẮT BUỘC gắn nhãn `[QA Hypothesis — Source Unverified]` và không được khẳng định là hành vi đã xác nhận của hệ thống (giữ nguyên để Product/BA xem xét).
</RULE[risk_source_classification]>

# 🚨 Contextual SLA Breach & Fallback Rule
<RULE[sla_breach_escalation]>
Cơ chế xử lý khi trễ hạn SLA (SLA Breach Fallback / Auto-Escalate to Human) CHỈ áp dụng cho các tính năng có định nghĩa thời hạn xử lý (Timeout) hoặc có quy trình hỗ trợ vận hành.

### 📌 Ví dụ minh họa (KHÔNG PHẢI SLA MẶC ĐỊNH):
- *"Điều phối xe không ai nhận sau [Timeout: TBD]"*
- *"Khiếu nại quá [SLA: TBD] chưa xử lý"*
*(Lưu ý: Các con số như 45s hay 48h chỉ là placeholder minh họa — BẮT BUỘC thay bằng giá trị thực tế từ FRS. Nếu FRS không quy định, tuyệt đối không tự gán mặc định mà phải đưa vào NEEDS VERIFICATION).*

### 📌 Xử lý khi Timeout/SLA chưa được Document:
- **IF Timeout hoặc SLA của cơ chế Escalation không được quy định:**
  - Áp dụng `RULE[evidence_based_performance_governance]`.
  - Gắn cờ `[Escalation Timeout: TBD — Pending BA definition]`.
  - CẤM tự bịa số giây/phút timeout giả định.
  - Đưa vào trạng thái `NEEDS VERIFICATION` trong Gap Report.
</RULE[sla_breach_escalation]>


# ==============================================================================
# 📋 LEVEL 4 — OUTPUT QUALITY, TRACEABILITY, STANDARDS & EXPORT
# ==============================================================================

# 📐 Output Template & Self-Review Audit Standard Rule
<RULE[output_template_strict_adherence]>
Khi sinh Test Cases, AI BẮT BUỘC phải dùng cấu trúc bảng 14 cột theo đúng chuẩn định nghĩa tại `templates/testcases.md`:

### 14 Cột bắt buộc:
1. `Test Case ID` | 2. `Module` | 3. `Function` | 4. `FR ID` | 5. `Test Case Description` | 6. `Pre-Requisite` | 7. `Steps Description` | 8. `Test Data` | 9. `Expected Result` | 10. `Priority` | 11. `Severity` | 12. `Type` | 13. `Automation Candidate` | 14. `Remarks`

### Quy chuẩn nội dung cột Pre-Requisite vs Steps Description (CRITICAL):
- **Pre-Requisite (Cột 6):** BẮT BUỘC chỉ chứa các phát biểu trạng thái/tiền điều kiện ban đầu (Declarative State / Precondition Statements, ví dụ: `User is logged into app.<br>User has no active subscription.`). **TUYỆT ĐỐI KHÔNG đánh số thứ tự hành động `Step 1:`, `Step 2:` trong cột Pre-Requisite.**
- **Steps Description (Cột 7):** BẮT BUỘC bắt đầu mỗi bước bằng English Action Verb và đánh số tuần tự theo định dạng `Step 1: [Action Verb]...<br>Step 2: [Action Verb]...<br>Step 3: ...`. Cấm dùng newline thực tế.

### Các section bắt buộc trong file Testcases.md:
- 🛠️ Applied Test Design Techniques (kèm Primary/Supplementary mapping & N/A justification)
- 📐 Applied Quality Gate Checklist
- 🧨 Edge Case Summary
- 🔥 Risk Summary (kèm Risk Source Classification)
- ✅ Self-Review Audit

### 📋 Checklist Mẫu Bắt Buộc cho section `✅ Self-Review Audit`:
```markdown
### ✅ Self-Review Audit Checklist (Pre-Export Audit):
- [ ] Mọi Test Case đều có FR ID hợp lệ (Orphan Test Cases = 0)
- [ ] Mọi FR Active đều xuất hiện trong Coverage Report (Unmapped = 0)
- [ ] 100% NOT TESTABLE requirements xuất hiện đầy đủ trong Gap Report
- [ ] 100% NEEDS VERIFICATION requirements xuất hiện trong Verification Request
- [ ] Mọi Security Test Case được đánh dấu Type = Security và loại khỏi Functional Coverage
- [ ] Security Coverage đã được tính và ghi nhận (Applicable Attack Surfaces = ? | Covered = ? | Needs Verification = ?)
- [ ] Expected Result tuân thủ Observable First, Contextual Atomic Assertions
- [ ] Tuyệt đối KHÔNG có Expected Result chứa SLA hoặc Assumption tự bịa
- [ ] Priority Distribution đã qua Heuristic Check (P0/P1 duy trì đúng bản chất nghiệp vụ)
- [ ] Risk Sources được phân loại chuẩn mực ([QA Hypothesis] được gắn nhãn minh bạch)
- [ ] Section Applied Techniques chỉ rõ Primary vs Supplementary (phân định rõ Integrated vs Independent) và lý do N/A
```
</RULE[output_template_strict_adherence]>

# 🔗 Bidirectional Traceability & Aligned Quality Gate Rule (CRITICAL)
<RULE[bidirectional_traceability_and_orphan_control]>
Mối quan hệ giữa Requirement và Test Case phải đảm bảo truy vết 2 chiều (Bidirectional Traceability):

### 1. Chiều xuôi (Test Case ➔ Requirement):
- Mỗi Test Case BẮT BUỘC có mã `FR ID` hoặc `BR ID` xác định.
- **Orphan Test Case = 0:** Tuyệt đối không có testcase nào có `FR ID` để trống, ghi `N/A` vô căn cứ, hoặc không gắn kết với yêu cầu nghiệp vụ.

### 2. Chiều ngược (Requirement ➔ Test Cases):
- Mọi Requirement con (Atomic Requirement) trong phạm vi phân tích đều phải xuất hiện trong Coverage Report.
- **Unmapped Active Requirements = 0:** 100% các active requirements đều phải được đối soát minh bạch.

### 🏆 Quality Gate Tiêu chuẩn Định lượng:
- **Functional Coverage** = `[Tổng conditions covered] / [Tổng conditions của 🟢 TESTABLE + 🟡 PARTIALLY TESTABLE requirements] × 100%`
- **Security Coverage** = `[Số Attack Surfaces có Test Case Type=Security] / [Tổng Attack Surfaces Applicable] × 100%` *(Ghi nhận `N/A` nếu Tổng Attack Surfaces Applicable = 0)*
- **🔴 NOT TESTABLE Requirements:** Xuất hiện đầy đủ trong Gap Report = 100%
- **🔵 NEEDS VERIFICATION Requirements:** Xuất hiện đầy đủ trong Verification Requests = 100%
- **Orphan Test Cases:** `0`
- **Unmapped Active Requirements:** `0`
</RULE[bidirectional_traceability_and_orphan_control]>

# 🎯 Exact-Match Coverage Mapping & Automated Reconciliation Rule (CRITICAL)
<RULE[coverage_exact_matching_and_reconciliation]>
Để loại bỏ triệt để hiện tượng đếm trùng (Double Counting), gán ảo (Phantom Mapping) và tính nhầm độ bao phủ:

### 1. Single Source of Truth cho Requirement Coverage:
- Cột `FR ID` trong bảng 14 cột Test Case Table (`testcases.md` / `testcases.csv`) là **nguồn sự thật duy nhất** để tính Requirement Coverage Matrix.
- Một Test Case CHỈ ĐƯỢC PHÉP xuất hiện tại dòng `FR ID` trong Coverage Report nếu cột `FR ID` của Test Case đó khớp chính xác với mã FR đó.

### 2. Nghiêm cấm gom dải theo tiền tố (No Prefix-Range Heuristic):
- Tuyệt đối KHÔNG ĐƯỢC nhìn thấy tiền tố (ví dụ: `SUB-CYC`) rồi viết gộp `SUB-CYC-001 đến SUB-CYC-006` vào một FR (`FR-SUB-07`), trừ khi đã kiểm chứng 100% các dòng trong dải đó đều có cột `FR ID` là `FR-SUB-07`.

### 3. Nghiêm cấm gán ảo gián tiếp (No Indirect / Phantom Traceability):
- Tuyệt đối KHÔNG ĐƯỢC lấy testcase từ `Risk_Analysis_Report` hoặc `Edge_Case_Report` để gán đại diện cho một FR trong Coverage Report nếu cột `FR ID` của testcase đó đang trỏ sang FR khác.

### 4. Quy tắc bảo toàn tổng số (Total Testcase Invariant):
- Mỗi Test Case chỉ được tính cho 1 Primary FR ID duy nhất trong Requirement Coverage Matrix.
- Tổng số Test Case phân bổ trong ma trận phải bằng chính xác tổng số Test Case có trong Test Suite:
  $$\sum (\text{Unique Test Cases trong từng dòng FR}) \equiv \text{Tổng số Test Cases trong Test Suite}$$

### 5. Kiểm tra tự động bắt buộc (Mandatory Linter Execution):
- Trước khi chốt báo cáo, AI BẮT BUỘC phải thực thi script kiểm toán:
  `python scripts/verify_traceability.py reports/<Module_Folder>`
- Nếu script báo cáo bất kỳ lỗi `[MISMATCH]`, `[GHOST TC]`, `[DOUBLE COUNTING]`, hoặc `[UNMAPPED TC]` ➔ AI BẮT BUỘC phải sửa chữa và chạy lại cho đến khi đạt `0 Errors`.
</RULE[coverage_exact_matching_and_reconciliation]>

# 🚦 Severity, Priority & Automation Candidate Governance Rule
<RULE[severity_priority_automation_standards]>
AI BẮT BUỘC phải tuân thủ chuẩn phân loại khách quan:

### 1. Phân loại Mức độ Nghiêm trọng (Severity — Tác động kỹ thuật/nghiệp vụ):
- **S1 (Critical):** Hệ thống crash, mất tiền/thanh toán sai, rò rỉ dữ liệu nhạy cảm, khóa toàn bộ luồng nghiệp vụ chính.
- **S2 (High):** Tính năng chính bị lỗi không có cách khắc phục tạm thời (workaround), sai lệch logic tính toán quan trọng.
- **S3 (Medium):** Tính năng phụ lỗi hoặc tính năng chính lỗi nhưng có workaround khả thi, validation hiển thị sai thông điệp.
- **S4 (Low):** Lỗi giao diện nhỏ, chính tả, khoảng cách hiển thị, định dạng typography không ảnh hưởng nghiệp vụ.

### 2. Phân loại Mức độ Ưu tiên & Priority Distribution Heuristic:
- **P0 (Blocker):** Bắt buộc chạy ngay trong Smoke/Sanity test (Happy path chính, đăng nhập, thanh toán lõi).
- **P1 (High):** Luồng nghiệp vụ chính, các case Negative biên quan trọng, bảo mật cơ bản.
- **P2 (Medium):** Các luồng nhánh phụ, Edge cases mạng/thiết bị, validation chi tiết.
- **P3 (Low):** Kiểm tra giao diện tĩnh, wording, trường hợp cực hiếm gặp.

*(Lưu ý: Severity ≠ Priority. Tỷ lệ phân bổ định hướng: P0: 3–8%, P1: 15–25%, P2: 40–50%, P3: 20–30%. Đây là GUIDELINE, KHÔNG PHẢI HARD GATE. Nếu P0 + P1 > 35%, AI thực hiện rà soát lại nhưng GIỮ NGUYÊN P0/P1 nếu điều kiện nghiệp vụ thực tế yêu cầu, tuyệt đối không tự hạ cấp test case giả tạo).*

### 3. Chuẩn hóa Khả năng Tự động hóa (Automation Candidate):
- **Yes:** Luồng logic xác định (Deterministic), API backend, validation biểu mẫu, tính toán số liệu, luồng thanh toán giả lập.
- **No:** Đánh giá trải nghiệm người dùng (UX/Feel), kiểm thử phần cứng vật lý đặc thù, luồng có CAPTCHA/Biometric thực.
- **Partial:** Kiểm thử giao diện trực quan cần mắt người đối soát layout chi tiết, kiểm thử di chuyển GPS thực địa ngoài đời thực.
</RULE[severity_priority_automation_standards]>

# 🎯 QA & QC Terminology Standard & API Exception Rule (CRITICAL)
<RULE[qa_qc_terminology_and_api_exception]>
AI BẮT BUỘC sử dụng **ngôn ngữ chuyên môn của QA / QC và nghiệp vụ người dùng (User & Business Domain)** theo nguyên tắc phân định tầng sau:

### 📌 Nguyên tắc cốt lõi: Dùng thuật ngữ ở mức NGHIỆP VỤ / SYSTEM LAYER — CẤM dùng ở mức IMPLEMENTATION / CODE / SCHEMA:
- ✅ **Được phép (Nghiệp vụ / Layer):** `Hệ thống ghi nhận trạng thái mới vào Database`, `Backend phản hồi mã thành công (HTTP 200) kèm dữ liệu chuyến đi`, `UI hiển thị huy hiệu Approved`, `Lưu trữ phiên người dùng (Session / Token)`, `Xác thực mã OTP`, `Thời gian phản hồi (Timeout)`.
- ❌ **Bị cấm (Implementation / Code / Schema):** `Cột is_active được set true trong bảng users`, `Redux store cập nhật booking state`, `Biến boolean is_locked = true`, `Thực thi SQL query SELECT...`, `Gọi React hook useEffect`, `Gắn CSS selector .btn-submit`.

## ⚡ Ngoại lệ API Testing Context:
Thuật ngữ kỹ thuật chuyên sâu CHỈ ĐƯỢC KÍCH HOẠT khi USER **yêu cầu rõ ràng về API Testing** hoặc sử dụng ngữ cảnh API cụ thể (`API test case`, `test endpoint`, `API contract`, `Postman`, `curl`, `payload validation`). Tuyệt đối không tự ý chuyển sang ngôn ngữ Dev chỉ vì tính năng đó có API backend.
</RULE[qa_qc_terminology_and_api_exception]>

# 🚫 Strict Black-Box Manual QA Vocabulary Blacklist Rule (CRITICAL)
<RULE[blackbox_manual_qa_vocabulary_blacklist]>
Toàn bộ Test Cases trong Manual Functional Test Suite BẮT BUỘC phải được viết từ **góc nhìn Hộp đen (Black-box Manual QA Tester & End-User)**:

### 1. Nguyên tắc Khả thi Thủ công (Manual Feasibility):
Mọi hành động trong `Steps Description` và `Expected Result` phải là thao tác mà một QA Tester cầm thiết bị vật lý trên tay CÓ THỂ TỰ TAY THỰC HIỆN hoặc TỰ MẮT NHÌN THẤY trên màn hình ứng dụng, thanh thông báo của hệ điều hành hoặc hộp thư email.

### 2. Danh mục Từ ngữ Kỹ thuật Bị Cấm (Strict White-Box Blacklist):
Tuyệt đối KHÔNG xuất hiện các thuật ngữ sau trong bảng test case manual (trừ khi là bộ test chuyên biệt cho API theo yêu cầu rõ ràng của USER):

| Nhóm bị cấm | Từ khóa bị cấm (Blacklisted Words) | Thuật ngữ chuẩn Black-box thay thế |
|---|---|---|
| **Webhook & Event** | `webhook`, `event listener`, `event bus`, `event payload`, `trigger event`, `evt_*`, `internal queue`, `message broker` | *"Sau khi hệ thống / dịch vụ bên thứ ba xử lý thành công"*, *"Hệ thống cập nhật trạng thái tự động"* |
| **API & Network Code**| `POST /api/...`, `GET /api/...`, `payload`, `HTTP 200`, `200 OK`, `status code 4xx/5xx`, `json response`, `REST endpoint`, `cURL` | *"Màn hình ứng dụng hiển thị..."*, *"Hệ thống thông báo lỗi..."*, *"Ứng dụng phản hồi..."* |
| **Database & Storage** | `database`, `table`, `column`, `row`, `SQL query`, `SELECT`, `UPDATE WHERE`, `foreign key`, `primary key`, `schema migration`, `cache key`, `is_active = true` | *"Hồ sơ tài khoản lưu trạng thái mới"*, *"Mục Lịch sử / Thông tin hiển thị trạng thái..."* |
| **Internal Variables**| Tên biến code, tên hàm backend, state store keys (`Redux`, `Pinia`), internal IDs | *"Dữ liệu người dùng đã lưu"*, *"Thông tin tính toán hiển thị trên màn hình xác nhận"* |

### 3. Quy chuẩn viết thao tác của Tester:
- ✅ **Đúng:** *"Tap the confirmation button. Observe the confirmation modal displaying the effective date matching the scheduled lifecycle."*
- ❌ **Sai:** *"Trigger background webhook with payload {status: 'active'} and verify DB table updates status column."*
</RULE[blackbox_manual_qa_vocabulary_blacklist]>

# ✍️ Action-Verb Steps & Contextual Atomic Expected Result Standard Rule
<RULE[test_step_and_expected_result_standards]>
### 📌 Chuẩn viết Test Step — Action Verb First:
- Mỗi Test Step BẮT BUỘC bắt đầu bằng một **động từ hành động** mô tả thao tác của người dùng (`Mở`, `Đăng nhập`, `Chọn`, `Nhập`, `Bấm nút`, `Cuộn`, `Chụp ảnh`).
- Không viết câu bị động (❌ `Màn hình được hiển thị` ➔ ✅ `Mở màn hình...`).

### 👁️ Nguyên tắc "Observable First" & Contextual Atomic Expected Result:
- **Observable First:** Ưu tiên mô tả kết quả quan sát được trên giao diện trước, sau đó mới đến trạng thái nghiệp vụ.
- **Contextual Assertions:** Expected Result chỉ chứa các assertion có ý nghĩa đối với mục tiêu test:
  1. **Người dùng nhìn thấy gì? (Observable UI):** Thông báo, nút đổi trạng thái, huy hiệu render.
  2. **Trạng thái nghiệp vụ thay đổi thế nào? (Business State):** Đơn chuyển trạng thái, số dư cập nhật.
  3. **Điều gì KHÔNG ĐƯỢC xảy ra? (Negative Assertion):** Không phát sinh bản ghi trùng, không trừ tiền 2 lần.
- **Linh hoạt cho UI tĩnh:** Với các test case chỉ kiểm tra UI tĩnh/placeholder, có thể bỏ qua Business State nếu nghiệp vụ không thay đổi.
- **Atomic Grouping:** Mỗi Expected Result chỉ xác nhận một nhóm hành vi logic, không gộp nhiều hành vi độc lập rời rạc.
</RULE[test_step_and_expected_result_standards]>

# 📂 Directory Organization Rule
<RULE[directory_organization]>
Khi sinh báo cáo và testcases cho một tính năng cụ thể, AI BẮT BUỘC phải tạo thư mục con bên trong `reports/` mang tên chức năng đó (ví dụ: `reports/FR_ACS_FIN_Host_Financial_Management/`). Tất cả các file liên quan phải được lưu trữ tập trung vào thư mục này.
</RULE[directory_organization]>

# 🔄 CSV Sync Workflow & Fallback Protocol Rule
<RULE[csv_sync_workflow]>
Khi cần cập nhật testcase:
1. Cập nhật trực tiếp trên file Markdown (`.md`).
2. Xóa file `.csv` cũ.
3. BẮT BUỘC chạy script của dự án để convert: `python scripts/md_to_csv.py <đường_dẫn_file_md> <đường_dẫn_file_csv>`.

### 🚨 Fallback Protocol khi Script lỗi / không tồn tại:
- **IF Script execution fails hoặc script không tồn tại:**
  - DỪNG LẠI NGAY LẬP TỨC.
  - Báo cáo chi tiết lỗi kỹ thuật cho USER.
  - **TUYỆT ĐỐI KHÔNG** tự tạo file CSV thủ công hoặc tự tiện viết lại script convert khác (nhằm bảo vệ cấu trúc UTF-8-SIG và định dạng HTML đa cột).
  - Chờ USER cung cấp script hoặc xác nhận phương án fallback.
</RULE[csv_sync_workflow]>
