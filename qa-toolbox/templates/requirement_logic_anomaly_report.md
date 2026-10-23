# ⚠️ Báo Cáo Phân Tích Bất Thường Logic Yêu Cầu (Requirement Logic Anomaly Report)

---

## 📄 Thông Tin Tài Liệu (Document Metadata)
| Thuộc tính (Property) | Chi tiết (Details) |
|---|---|
| **Ngày tạo (Date Generated)** | [YYYY-MM-DD] |
| **Tài liệu phân tích (Target Requirements)** | [Tên tài liệu requirement, e.g., docs/requirements/PRD.md] |
| **Phân tích bởi (Analyzed By)** | Requirement Logic Analyst (v1.0.0) |
| **Tổng số bất thường (Total Anomalies)** | [X] |
| **Mức độ rủi ro logic (Logic Health)** | [🟢 Ổn định / 🟡 Cần làm rõ / 🔴 Rủi ro cao] |

---

## 📊 1. 📌 Tóm Tắt Tổng Quan (Executive Summary)

### Bảng Thống Kê Tổng Hợp
| Chỉ số (Metric) | Số lượng (Count) | Ghi chú (Notes) |
|---|:---:|---|
| **Tổng số yêu cầu (Total Requirements)** | [X] | Tổng số requirement trong phạm vi |
| **Yêu cầu đã phân tích (Requirements Analyzed)** | [X] | Đã rà soát chi tiết |
| **Tổng số bất thường phát hiện (Total Anomalies)** | [X] | Gồm cả confirmed và potential |
| 🔴 **Bất thường Nghiêm trọng (Critical Anomalies)** | [X] | Khủng hoảng logic, chặn luồng cốt lõi |
| 🟠 **Bất thường Cao (High Anomalies)** | [X] | Sai lệch nghiệp vụ nghiêm trọng |
| 🟡 **Bất thường Trung bình (Medium Anomalies)** | [X] | Thiếu sót điều kiện biên, case phụ |
| 🟢 **Bất thường Thấp (Low Anomalies)** | [X] | Không nhất quán nhỏ, mơ hồ nhẹ |
| **Vấn đề đã xác nhận (Confirmed Issues)** | [X] | Chắc chắn có lỗi logic trong văn bản |
| **Vấn đề tiềm ẩn (Potential Issues)** | [X] | Khả năng cao phát sinh lỗi tùy thuộc rule thiếu |
| **Điểm mơ hồ cần làm rõ (Ambiguities)** | [X] | Cần BA/PO trả lời để thống nhất |

> **Lưu ý**: Báo cáo này không chấm điểm chất lượng tổng thể bằng phần trăm (%) mà tập trung vào các rủi ro logic thực tế.

---

> **Schema Reference:** `schemas/finding.schema.md`

## 🚨 2. Danh Mục Bất Thường (Anomaly Register)

| ID | Yêu Cầu (Requirement) | Phân Loại (Type) | Mức Độ (Severity) | Trạng Thái (Status) | Phát Hiện (Finding) |
|---|---|---|:---:|:---:|---|
| **`LOGIC-MODULE-001`** | [FR-ID hoặc trích dẫn] | `LOGIC_ANOMALY` / `CONTRADICTION` / `INVALID_STATE_TRANSITION` / `MISSING_RULE` / `AMBIGUOUS_BEHAVIOR` | 🔴 Critical (P0) / 🟠 High (P1) / 🟡 Medium (P2) / 🟢 Low (P3) | Open / Pending Verification | [Mô tả ngắn gọn điểm bất thường] |

---

## 🔍 3. Đánh Giá Chi Tiết Từng Bất Thường (Detailed Anomaly Assessment)

*(Lặp lại khối thông tin bên dưới cho mỗi bất thường trong danh mục)*

### 📌 [LOGIC-MODULE-001]: [Tiêu đề ngắn gọn của bất thường]
- **Yêu cầu liên quan (Requirement):** [Trích dẫn nguyên văn câu/đoạn requirement hoặc mã FR-ID]
- **Phân loại (Type):** `LOGIC_ANOMALY` / `CONTRADICTION` / `INVALID_STATE_TRANSITION` / `CALCULATION_ISSUE` / `TIME_DATE_ISSUE` / `DATA_CONSISTENCY` / `CONCURRENCY_ISSUE` / `REAL_WORLD_PLAUSIBILITY`
- **Mức độ nghiêm trọng (Severity):** 🔴 Critical (P0) / 🟠 High (P1) / 🟡 Medium (P2) / 🟢 Low (P3)
- **Trạng thái (Status):** Open / Pending Verification / Confirmed
- **Phát hiện (Finding):** [Mô tả chi tiết điểm có vẻ bất thường hoặc vô lý]
- **Lý do đáng ngờ (Why It Is Suspicious):** [Giải thích lập luận logic vì sao quy tắc này không hợp lý]
- **Logic kỳ vọng hợp lý (Expected Logic):** [Mô tả hành vi được kỳ vọng theo lẽ thường — KHÔNG tự bịa quy tắc nghiệp vụ chưa có tài liệu]
- **Hệ quả tiềm ẩn (Possible Consequence):** [Hệ thống/người dùng sẽ gặp vấn đề gì nếu triển khai đúng y hệt tài liệu hiện tại]
- **Kịch bản minh họa (Example Scenario):** [Mô tả một tình huống cụ thể từng bước minh chứng lỗ hổng]
- **Câu hỏi làm rõ cho BA/PO (Clarification Question):** [Câu hỏi rõ ràng, trực diện dành cho BA/PO để chốt phương án]
- **Kịch bản kiểm thử thách thức đề xuất (Recommended QA Challenge):** [Kịch bản QA nên dùng để kiểm tra hệ thống]

---

## 🔄 4. Phân Tích Chuyển Đổi Trạng Thái (State Transition Analysis)

### 4.1 Sơ Đồ / Luồng Chuyển Đổi Thực Tế Theo Tài Liệu
```text
[Trạng thái hiện tại (Current State)]
      ↓
[Hành động kích hoạt (Action)]
      ↓
[Trạng thái đích (Expected State)]
```

### 4.2 Các Bước Chuyển Bất Thường / Bị Thiếu (Suspicious / Invalid Transitions)
| Mã (ID) | Trạng Thái Ban Đầu (From) | Hành Động (Action) | Trạng Thái Đích (To) | Vấn Đề Phát Hiện (Identified Issue) |
|---|---|---|---|---|
| **ST-001** | [State A] | [Action] | [State B] | [Lý do chuyển đổi này vô lý hoặc mâu thuẫn] |

---

## ⚠️ 5. Báo Cáo Mâu Thuẫn Nội Tại (Contradiction Report)

| ID | Yêu Cầu A (Requirement A) | Yêu Cầu B (Requirement B) | Điểm Xung Đột (Conflict) | Tác Động Hệ Thống / Nghiệp Vụ (Impact) |
|---|---|---|---|---|
| **CONT-001** | [Trích dẫn Req A] | [Trích dẫn Req B] | [Giải thích vì sao hai quy tắc này triệt tiêu hoặc mâu thuẫn nhau] | [Tác động nếu Dev/QA hiểu theo 1 trong 2 chiều] |

> **Quy tắc**: Chỉ ghi nhận các mâu thuẫn thực sự có cơ sở, không suy diễn định kiến.

---

## ❓ 6. Báo Cáo Điểm Mơ Hồ (Ambiguity Report)

| ID | Yêu Cầu (Requirement) | Cụm Từ Mơ Hồ (Ambiguous Phrase) | Các Hướng Hiểu Khác Nhau (Possible Interpretations) | Câu Hỏi Làm Rõ (Clarification Question) |
|---|---|---|---|---|
| **AMB-001** | [Đoạn văn bản chứa từ ngữ mơ hồ] | [Ví dụ: "sớm nhất có thể", "giá cả hợp lý", "ngay lập tức"] | - Hướng 1: [Cách hiểu A]<br>- Hướng 2: [Cách hiểu B] | [Câu hỏi cụ thể để BA lượng hóa tiêu chí] |

---

## 🧩 7. Báo Cáo Quy Tắc Bị Thiếu (Missing Rule Report)

| ID | Khu Vực / Tính Năng (Area) | Quy Tắc Bị Thiếu (Missing Rule) | Vì Sao Cần Phải Có (Why It Matters) | Câu Hỏi Cho BA/PO (BA/PO Question) |
|---|---|---|---|---|
| **MISS-001** | [Module/Luồng thao tác] | [Quy tắc chưa được định nghĩa (vd: timeout, retry, hoàn tiền)] | [Nếu thiếu rule này, hệ thống rơi vào trạng thái không xác định] | [Câu hỏi đề xuất quy tắc cụ thể] |

---

## 🧪 8. Kịch Bản Kiểm Thử Thách Thức Nghiệp Vụ (QA Challenge Scenarios)

| ID | Kịch Bản Thách Thức (Challenge Scenario) | Vì Sao Quan Trọng (Why It Matters) | Kỳ Vọng Làm Rõ (Expected Clarification) |
|---|---|---|---|
| **CHAL-001** | [Mô tả kịch bản thử thách tính đúng đắn của logic] | [Rủi ro cốt lõi hoặc trạng thái lỗi được phơi bày] | [Điều BA/PO cần xác nhận trước khi chốt] |

---

## 🧠 9. Giả Định & Bằng Chứng (Assumptions & Evidence)

- **Bằng chứng tài liệu rõ ràng (Explicit Requirement Evidence):**
  - [Liệt kê các tài liệu và phần mục cụ thể đã trích dẫn]
- **Tài liệu bổ trợ được tham chiếu (Supporting Documentation):**
  - [API specs, UI mocks, Database schema nếu có]
- **Các giả định QA đưa ra (QA Assumptions):**
  - [Ghi chú rõ `[Assumption]: ...` — Không bao giờ biến assumption thành sự thật nghiệp vụ]
- **Thông tin còn thiếu chưa thể kiểm chứng (Missing Information):**
  - [Các khía cạnh chưa có tài liệu xác minh `[Needs Verification]`]
- **Giới hạn về độ tin cậy (Confidence Limitations):**
  - [Phạm vi mà phân tích này chưa thể khẳng định 100%]

---

## 📋 10. Phân Nhóm Kết Luận Cuối Cùng (Final Findings)

- **🔴 Bất thường đã xác nhận (Confirmed Anomalies):** Các yêu cầu chắc chắn chứa lỗi logic hoặc mâu thuẫn không thể chối cãi.
- **🟡 Bất thường tiềm ẩn (Potential Anomalies):** Các yêu cầu có thể hoạt động sai lệch tùy thuộc vào các quy tắc chưa được quy định.
- **❓ Điểm mơ hồ (Ambiguities):** Các câu chữ mơ hồ đòi hỏi phải chốt lại tiêu chuẩn nghiệm thu trước khi bắt đầu lập trình.
- **🟢 Yêu cầu đã kiểm tra ổn định (No Significant Anomaly):** Các yêu cầu đã được phản biện logic nhưng không phát hiện bất thường đáng kể nào.

---
# Kết Thúc Báo Cáo (End of Report)
