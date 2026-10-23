# Workflow: Comprehensive QA Pipeline (The Ultimate Pipeline)

> **Controller**: `agents/master_orchestrator.md`

---

## Purpose
Một pipeline chạy toàn bộ từ lúc nhận Requirement đến lúc sinh ra mọi tài liệu test và đo coverage. Hoàn hảo cho các chu kỳ kiểm thử hồi quy (Regression QA Cycle) lớn hoặc trước những Release quan trọng. Tận dụng tối đa input chéo giữa các Agent v3.0.0.

## Execution Order

```mermaid
graph TD
    A[Start Pipeline] --> B(requirement_gap_analyst)
    B --> C(requirement_logic_analyst)
    C --> D(advanced_edge_case_analyzer)
    D --> E(risk_analyst)
    E --> F(scenario_generator)
    F --> G(testcase_generator)
    G --> H(uat_script_generator)
    H --> I(coverage_analyst)
    I --> J[Generate Final Executive Summary]
    J --> K[Export Artifacts: CSV & DOCX]
    K --> L[End Pipeline]
```

## Step 1: Gap Analysis
- **Agent**: `agents/requirement_gap_analyst.md`
- **Output**: `reports/[Requirement_Name]_Req_Gap_Report.md` (dynamic naming)

## Step 2: Logic Anomaly Analysis
- **Agent**: `agents/requirement_logic_analyst.md`
- **Output**: `reports/[Requirement_Name]_Logic_Anomaly_Report.md` (dynamic naming)
- **Template**: `templates/requirement_logic_anomaly_report.md`
- **Objective**: Thử thách tính hợp lý của nghiệp vụ, mâu thuẫn giữa các quy tắc, chuyển trạng thái bất thường và các giả định ngầm.

## Step 3: Edge Case Discovery
- **Agent**: `agents/advanced_edge_case_analyzer.md`
- **Output**: `reports/[Requirement_Name]_Edge_Case_Report.md` (dynamic naming)
- **Dependency**: `docs/requirements/*`, `reports/[Requirement_Name]_Logic_Anomaly_Report.md`

## Step 4: Risk Analysis
- **Agent**: `agents/risk_analyst.md`
- **Output**: `reports/[Requirement_Name]_Risk_Analysis_Report.md` (dynamic naming)
- **Dependency**: Sử dụng thêm `reports/[Requirement_Name]_Logic_Anomaly_Report.md` và `reports/[Requirement_Name]_Edge_Case_Report.md` để đánh giá rủi ro sâu hơn.

## Step 5: Scenario Generation
- **Agent**: `agents/scenario_generator.md`
- **Output**: `reports/[Requirement_Name]_Test_Scenarios_Report.md` (dynamic naming)
- **Dependency**: Đọc cả `reports/[Requirement_Name]_Risk_Analysis_Report.md` và `reports/[Requirement_Name]_Edge_Case_Report.md` để sinh kịch bản bao phủ các ca khó.

## Step 6: Test Case Generation
- **Agent**: `agents/testcase_generator.md`
- **Output**: `reports/[Requirement_Name]_Testcases.md` (dynamic naming)

## Step 7: UAT Script Generation
- **Agent**: `agents/uat_script_generator.md`
- **Output**: `reports/[Requirement_Name]_UAT_Scripts_Report.md` (dynamic naming)
- **Dependency**: Dùng `reports/[Requirement_Name]_Risk_Analysis_Report.md` và `reports/[Requirement_Name]_Test_Scenarios_Report.md` để sinh kịch bản UAT sát với rủi ro nghiệp vụ nhất.

## Step 8: Coverage Analysis
- **Agent**: `agents/coverage_analyst.md`
- **Output**: `reports/[Requirement_Name]_Coverage_Report.md` (dynamic naming)
- **Objective**: Chốt sổ độ bao phủ từ tất cả các file trên.

## Step 9: Consolidation
- **Agent**: `agents/master_orchestrator.md`
- **Output**: Báo cáo tổng hợp `reports/[Requirement_Name]_Executive_Summary.md` (dynamic naming).
- **Template**: `templates/executive_summary.md`

## Step 10: Multi-Format Export (CSV & DOCX)
- **CSV Export (Quality Gate Enforced)**:
  - **Precondition**: Chỉ kích hoạt sau khi Step 8 (`coverage_analyst`) xác nhận đạt **100% Quality Gate Pass**. Nếu chưa đạt, bắt buộc quay lại Step 6 cập nhật test case.
  - **Tool/Script**: `python scripts/md_to_csv.py`
  - **Command**: `python scripts/md_to_csv.py reports/[Requirement_Name]_Testcases.md reports/[Requirement_Name]_Testcases.csv`
  - **Output**: `reports/[Requirement_Name]_Testcases.csv`
- **Word (DOCX) Export**:
  - **Tool/Script**: `python scripts/md_to_docx.py`
  - **Command**: `python scripts/md_to_docx.py reports/[Requirement_Name]_Executive_Summary.md reports/[Requirement_Name]_Executive_Summary.docx`
  - **Output**: `reports/[Requirement_Name]_Executive_Summary.docx` (và tuỳ chọn cho `*_Testcases.docx` / `*_UAT_Scripts_Report.docx`)
  - **Objective**: Tạo tài liệu báo cáo định dạng Microsoft Word chuyên nghiệp sẵn sàng gửi cho Stakeholders, Product Owners hoặc Khách hàng mà không cần chỉnh sửa thủ công.
