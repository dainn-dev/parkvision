# Khung Quản Trị & Phân Tích Chất Lượng Phần Mềm Bằng AI (v3.1.0)

Một framework AI tinh gọn, hoạt động theo mô hình **Đa tác tử (Multi-Agent Architecture)** được thiết kế chuyên biệt để thực hiện Phân tích Yêu cầu, Đánh giá Rủi ro, Thiết kế Test Case và Thẩm định Nghiệp vụ trên các tài liệu đặc tả phần mềm.

> **Lưu ý**: Hệ thống này tập trung hoàn toàn vào việc phân tích logic, đánh giá rủi ro và sinh kịch bản kiểm thử Manual/UAT. Framework KHÔNG bao gồm CI/CD, automation test, API test thực thi, hay database test.

---

## 🏗 Kiến Trúc Hệ Thống

Framework này hoạt động theo kiến trúc đa tác tử tất định (deterministic), trong đó các tác tử chia sẻ dữ liệu đầu vào và đầu ra xuyên suốt chuỗi pipeline:

```text
Tài liệu Đầu vào → Quy tắc & Quản trị AI → Quy trình (Workflow) → Các Tác tử (Agents) → Báo cáo Đầu ra & Xuất dữ liệu
```

### Cấu Trúc Thư Mục

| Thư mục | Mục đích sử dụng |
|---------|------------------|
| `docs/requirements/` | **Đầu vào (Input)**: Chứa tài liệu PRD, BRD, SRS. |
| `docs/designs/` | **Đầu vào (Input)**: Chứa UI Flow, Wireframes, Figma exports. |
| `reports/` | **Đầu ra (Output)**: Nơi lưu trữ toàn bộ báo cáo Markdown, file CSV và DOCX được sinh ra. |
| `.agents/` | **Quản Trị AI (AI Governance)**: Bộ quy tắc kiểm soát hành vi của AI Agent (`AGENTS.md`) — Giao thức chống ảo giác (Anti-hallucination), quy tắc kiểm thử từ Level -1 đến Level 4, quản trị chân lý nguồn (Source-of-truth) cho các AI Coding Assistant. |
| `agents/` | **Các Tác Tử Phân Tích (Analytical QA Agents)**: Chứa 10 prompt định nghĩa vai trò phân tích chuyên biệt (Khoảng trống yêu cầu, Bất thường logic, Rủi ro, Kịch bản, Sinh test case, Đo lường độ bao phủ...). |
| `workflows/` | **Quy Trình Điều Phối (Orchestration)**: Định nghĩa các pipeline thực thi cho từng giai đoạn khác nhau trong vòng đời phát triển phần mềm SDLC (từ 01 đến 05). |
| `rules/` | **Quy Chuẩn Kỹ Thuật (Standards)**: Tiêu chuẩn chung, thang đo chất lượng yêu cầu, quy tắc thiết kế ca kiểm thử và chuẩn định dạng báo cáo. |
| `schemas/` | **Hợp Đồng Dữ Liệu Chuẩn (Master Contracts)**: Định nghĩa cấu trúc chuẩn cho Phát hiện lỗi (`finding.schema.md`), Bảng Test Case 14 cột (`testcase.schema.md`), Kịch bản UAT (`uat_script.schema.md`), và Báo cáo độ bao phủ (`coverage.schema.md`). |
| `templates/` | **Biểu Mẫu Báo Cáo (Formatting)**: Các mẫu Markdown có thể tái sử dụng để chuẩn hóa đầu ra đồng nhất cho toàn bộ báo cáo. |
| `scripts/` | **Bộ Tiện Ích Chuyển Đổi (Export Utilities)**: Các script Python hỗ trợ xuất tài liệu (`md_to_csv.py`, `md_to_docx.py`). |

> 💡 **Phân biệt quan trọng giữa `.agents/` và `agents/`:**
> - `.agents/` (ẩn): Chứa quy tắc quản trị cấp hệ thống (`AGENTS.md`) quy định AI coding assistant (Antigravity, Cursor, Copilot) phải tuân thủ nghiêm ngặt: không được bịa đặt (Anti-hallucination), chuẩn ngôn ngữ (Báo cáo tiếng Việt, Testcase tiếng Anh), xử lý fail-fast, phân loại Testability.
> - `agents/`: Chứa các role/agent nghiệp vụ cụ thể tham gia vào từng bước phân tích và sinh test trong pipeline.

---

## 🤖 Danh Mục 10 Tác Tử Phân Tích (The Agents)

1. **`requirement_gap_analyst`**: Rà soát lỗi logic nội bộ (mơ hồ, thiếu edge cases) VÀ phát hiện các khoảng trống truy vết chéo giữa các tài liệu (ví dụ: PRD đối chiếu với SRS).
2. **`requirement_logic_analyst`**: Thử thách tính hợp lý của nghiệp vụ, phát hiện các bất thường về logic, mâu thuẫn nội tại, bước chuyển trạng thái không hợp lệ, quy tắc còn thiếu và các giả định ngầm chưa được chứng minh.
3. **`design_auditor`**: Kiểm toán luồng giao diện UI/UX đối chiếu với SRS để tìm kiếm thành phần còn thiếu, trạng thái lỗi chưa thiết kế và điểm lệch luồng người dùng.
4. **`advanced_edge_case_analyzer`**: Đào sâu vào các điều kiện biên dữ liệu cực hạn, hiện tượng đồng thời (concurrency), tranh chấp tài nguyên (race conditions) và ngắt quãng trạng thái hệ thống.
5. **`risk_analyst`**: Nhận diện các rủi ro về nghiệp vụ, kỹ thuật, bảo mật, hiệu năng và vận hành; chấm điểm mức độ nghiêm trọng để phân loại thứ tự ưu tiên kiểm thử.
6. **`scenario_generator`**: Thiết kế các kịch bản kiểm thử tổng quát bao quát cả Happy Path, Negative Testing và các ca khó (Edge Cases).
7. **`testcase_generator`**: Chuyển hóa kịch bản thành các bước kiểm thử Manual chi tiết theo cấu trúc 14 cột chuẩn, kèm quy chuẩn kiểm soát toán học và số tiền sạch (Anti-LaTeX).
8. **`uat_script_generator`**: Sinh kịch bản kiểm thử chấp nhận người dùng (UAT) bằng ngôn ngữ kinh doanh thân thiện dành cho Khách hàng và Stakeholders.
9. **`coverage_analyst`**: Ánh xạ toàn bộ test case đã tạo ngược lại tài liệu yêu cầu để đo lường độ bao phủ 100% (Functional, Scenario, Risk, Edge Case).
10. **`master_orchestrator`**: Tác tử nhạc trưởng trung tâm chịu trách nhiệm điều phối và vận hành các chuỗi quy trình (workflows).

---

## 🔄 Các Quy Trình Thực Thi & Trường Hợp Sử Dụng (Khi nào dùng cái nào?)

Hệ thống có 5 Quy trình chính, phục vụ cho các thời điểm (Phases) khác nhau trong vòng đời phát triển phần mềm (SDLC):

### 1. `01_Requirement_Review_Workflow.md` (Đánh Giá Yêu Cầu & Thiết Kế)
- **Giai đoạn**: Khởi tạo dự án (Project Kick-off) / Giai đoạn thiết kế (Design Phase).
- **Khi nào dùng**: Khi BA vừa viết xong bản thảo yêu cầu và team Design vừa hoàn thành giao diện wireframe/flow.
- **Thứ tự thực thi**: `requirement_gap_analyst` → `requirement_logic_analyst` → `design_auditor` (tuỳ chọn) → `Executive Summary`.
- **Mục đích**: Phát hiện lỗ hổng logic, bất thường nghiệp vụ (`requirement_logic_analyst`), mâu thuẫn trong tài liệu và kiểm tra tính nhất quán giữa Design với Requirement. Đưa ra đánh giá Go/No-Go trước khi Dev bắt đầu lập trình.

### 2. `02_Shift_Left_Risk_Assessment.md` (Đánh Giá Rủi Ro Sớm - Shift-Left)
- **Giai đoạn**: Lên kế hoạch Sprint (Sprint Planning) / Tinh chỉnh Backlog (Backlog Grooming).
- **Khi nào dùng**: Khi cần ước lượng mức độ rủi ro của một tính năng mới trước khi quyết định đưa vào Sprint phát triển.
- **Thứ tự thực thi**: `requirement_gap_analyst` → `requirement_logic_analyst` → `advanced_edge_case_analyzer` → `risk_analyst` → `Development Readiness Report`.
- **Mục đích**: Tập trung rà soát tính hợp lý nghiệp vụ, dò tìm rủi ro tiềm ẩn (bảo mật, hiệu năng, tài chính) và các ca biên hóc búa (Edge Cases). Giúp PM/EM cân nhắc mức độ rủi ro và độ sẵn sàng trước khi sprint bắt đầu.

### 3. `03_QA_Test_Engineering.md` (Kỹ Thuật Thiết Kế Kiểm Thử Toàn Diện)
- **Giai đoạn**: Giai đoạn phát triển (Development Phase) / Lập kế hoạch QA (QA Planning).
- **Khi nào dùng**: Khi Dev đang code và team QA/Tester cần chuẩn bị sẵn sàng bộ Kịch bản kiểm thử (Test Scenarios & Test Cases).
- **Thứ tự thực thi**: `requirement_gap_analyst` → `requirement_logic_analyst` → `advanced_edge_case_analyzer` → `risk_analyst` → `scenario_generator` → `testcase_generator` → `coverage_analyst` → `CSV Export`.
- **Mục đích**: Sinh ra bộ test case chi tiết đầy đủ (Positive, Negative, Boundary, 14 cột chuẩn, sạch LaTeX) và đo lường độ bao phủ (Coverage) 100% trước khi xuất file CSV sẵn sàng import vào Test Management Tools (Jira / Xray / Zephyr / TestRail).

### 4. `04_Business_UAT_Validation.md` (Thẩm Định Nghiệp Vụ & Sẵn Sàng Nghiệm Thu UAT)
- **Giai đoạn**: Môi trường Staging / Tiền phát hành (Pre-Release).
- **Khi nào dùng**: Khi chuẩn bị bàn giao phần mềm cho Khách hàng (Client) hoặc đại diện người dùng (Business User) tiến hành nghiệm thu.
- **Thứ tự thực thi**: `requirement_gap_analyst` (kiểm tra nền tảng) → `risk_analyst` → `scenario_generator` → `uat_script_generator` → `UAT Readiness Report`.
- **Mục đích**: Kiểm tra nền tảng yêu cầu, tự động viết ra các kịch bản UAT bằng ngôn ngữ hành trình người dùng (User Journeys), có tính đến các rủi ro cốt lõi để các bên liên quan dễ dàng thao tác nghiệm thu thực tế.

### 5. `05_Ultimate_QA_Pipeline.md` (Chuỗi Pipeline QA Hoàn Chỉnh Toàn Diện)
- **Giai đoạn**: Phiên bản phát hành lớn (Major Release) / Kiểm thử hồi quy toàn diện (Regression Testing).
- **Khi nào dùng**: Trước một đợt ra mắt phiên bản quan trọng, hoặc khi cần rà soát hồi quy lại toàn bộ hệ thống.
- **Thứ tự thực thi**: Chạy liên hoàn 10 Tác tử từ Step 1 đến Step 9, kết thúc bằng việc xuất dữ liệu chuẩn hóa CSV và tổng hợp báo cáo.
- **Mục đích**: Dòng chảy tự động hóa mạnh mẽ nhất: bóc tách khoảng trống yêu cầu, thử thách logic nghiệp vụ, tìm edge cases, lập ma trận rủi ro, sinh kịch bản test, tạo test case chi tiết 14 cột, chuẩn bị kịch bản UAT, chốt sổ độ bao phủ 100% và tổng hợp báo cáo điều hành hoàn chỉnh.

---

## 🛠 Bộ Công Cụ & Script Tiện Ích

Thư mục `scripts/` cung cấp các công cụ hỗ trợ chuyển đổi dữ liệu tự động:

1. **`scripts/md_to_csv.py`**:
   - Tự động trích xuất bảng Test Case 14-cột từ file Markdown `*_Testcases.md` sang định dạng `.csv` (sử dụng mã hóa UTF-8 BOM chuẩn cho tiếng Việt).
   - Tích hợp bộ lọc **làm sạch công thức toán LaTeX (Anti-LaTeX)**: tự động chuyển đổi các ký tự `\Delta`, `\$`, `\times`, `\le` sang dạng Plain Text sạch, giúp copy/paste trực tiếp vào Google Sheets / Microsoft Excel hoặc import vào Jira Xray mà không bị vỡ cột hay lỗi ký tự.
   - Xử lý mượt mà thẻ ngắt dòng `<br>` và ký tự escape pipe (`\|`).
   - Lệnh thực thi: `python scripts/md_to_csv.py reports/[Requirement_Name]_Testcases.md reports/[Requirement_Name]_Testcases.csv`

2. **`scripts/md_to_docx.py`**:
   - Chuyển đổi báo cáo Markdown sang tài liệu Microsoft Word (`.docx`) chuyên nghiệp khi có yêu cầu riêng từ Stakeholder.
   - Tự động định dạng bảng, tiêu đề, blockquote, bullet points và làm sạch các biểu thức toán học.
   - Lệnh thực thi: `python scripts/md_to_docx.py reports/[Requirement_Name]_Executive_Summary.md reports/[Requirement_Name]_Executive_Summary.docx`

---

## 🚀 Hướng Dẫn Sử Dụng (Execution Flow)

1. **Chuẩn bị đầu vào**: Đặt file tài liệu yêu cầu (ví dụ: `PRD.md`, `BRD.md`, `SRS.md`) vào thư mục `docs/requirements/`. Nếu có tài liệu thiết kế giao diện, đặt vào `docs/designs/`.
2. **Kích hoạt Master Orchestrator**:
   ```bash
   Run agents/master_orchestrator.md
   ```
3. **Chọn Quy trình thực thi**: Yêu cầu Master Orchestrator thực hiện một trong 5 quy trình (workflows) phù hợp với giai đoạn phát triển hiện tại của dự án.

---

## 🛡 Các Nguyên Tắc Cốt Lõi (Core Principles)

1. **Chống Ảo Giác Tuyệt Đối (No Hallucination)**: Các tác tử bị nghiêm cấm tự ý bịa đặt hoặc suy diễn các quy tắc nghiệp vụ ngoài tài liệu nguồn.
2. **Dựa Trên Bằng Chứng (Evidence-Based)**: Mọi phát hiện lỗi (ngoại trừ tính năng còn thiếu) đều bắt buộc phải trích dẫn trực tiếp câu từ nguồn làm bằng chứng đối chiếu.
3. **Đầu Ra Tất Định (Deterministic Output)**: Toàn bộ báo cáo và bảng test case bắt buộc phải tuân thủ nghiêm ngặt các Schema (`schemas/`) và Biểu mẫu (`templates/`) đã ban hành.
4. **Quy Chuẩn Ngôn Ngữ Kép (Language Governance)**: Báo cáo phân tích và giao tiếp bằng **Tiếng Việt**; Bảng Test Case viết bằng **Tiếng Anh** chuyên ngành; Giữ nguyên vẹn 100% nhãn UI, mã lỗi và thuật ngữ nguồn được định nghĩa trong FRS.
