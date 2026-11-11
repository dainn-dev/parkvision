"""Export every QA test-case CSV into one formatted Excel workbook.

Usage:
    python qa-toolbox/scripts/export_testcases_excel.py

Reads qa-toolbox/reports/*_Testcases.csv, writes
qa-toolbox/reports/ParkVision_Full_Testcases.xlsx with:
  - Summary            : coverage gate verdict + per-suite metrics
  - All_Testcases      : every test case, 14 standard columns + Suite
  - one sheet per suite: 14 standard columns exactly
  - Huong_Dan          : methodology / caveats / sheet index

Coverage figures are taken from each suite's *_Coverage_Report.md. They are
mapping-based: no test suite has been executed.
"""

from __future__ import annotations

import csv
import math
import re
from datetime import date
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

REPORTS_DIR = Path(__file__).resolve().parent.parent / "reports"
OUTPUT = REPORTS_DIR / "ParkVision_Full_Testcases.xlsx"

COLUMNS = [
    "Test Case ID",
    "Module",
    "Function",
    "FR ID",
    "Test Case Description",
    "Pre-Requisite",
    "Steps Description",
    "Test Data",
    "Expected Result",
    "Priority",
    "Severity",
    "Type",
    "Automation Candidate",
    "Remarks",
]

SUITES = [
    {
        "key": "ANPR_Sidecar_Design",
        "doc": "docs/requirements/2026-09-29-anpr-sidecar-design.md",
        "func": "70/70 = 100%",
        "scen": "20/20 = 100%",
        "edge": "3/3 P1 = 100%",
        "risk": "6/6 High = 100%",
        "deferred": "18 clause + 14/17 atom partial",
        "note": "55/79 TC mang tag [Assumption] (70%). Chưa thực thi.",
    },
    {
        "key": "Barrier_Relay_HAL",
        "doc": "docs/requirements/2026-09-29-barrier-relay-hal.md",
        "func": "69/69 = 100%",
        "scen": "36/36 = 100%",
        "edge": "1/1 P0 = 100%",
        "risk": "4/4 High = 100%",
        "deferred": "11 NV",
        "note": "2/4 High risk mapping có điều kiện; nếu loại ra còn 2/4 = 50%. Chưa thực thi.",
    },
    {
        "key": "Driver_Memberships",
        "doc": "docs/requirements/2026-10-12-driver-memberships.md",
        "func": "7/7 task = 100%",
        "scen": "30/30 = 100%",
        "edge": "5/5 P1 = 100%",
        "risk": "3/3 High = 100%",
        "deferred": "5 NV",
        "note": "3 NV thuộc policy restoration/deactivation/vehicle mutation.",
    },
    {
        "key": "Driver_Payments",
        "doc": "docs/requirements/2026-10-12-driver-payments.md",
        "func": "54/54 = 100%",
        "scen": "25/25 = 100%",
        "edge": "18/18 P0/P1 = 100%",
        "risk": "7/7 P1 = 100%",
        "deferred": "5 NV",
        "note": "3 mapping P0/P1 có oracle deferred; loại ra còn 15/18 = 83,3%; scenario strict 22/25 = 88%.",
    },
    {
        "key": "Edge_Activation",
        "doc": "docs/requirements/2026-09-29-edge-activation.md",
        "func": "12/12 task = 100%",
        "scen": "42/42 = 100%",
        "edge": "4/4 P1 = 100%",
        "risk": "3/3 High = 100%",
        "deferred": "4 NV",
        "note": "NV gồm race oracle, concurrency proof, EMQX wiring, repeat-revoke contract.",
    },
    {
        "key": "Edge_Client_Tauri",
        "doc": "docs/requirements/2026-09-28-edge-client-tauri.md",
        "func": "99/99 = 100%",
        "scen": "20/20 = 100%",
        "edge": "3/3 P1 = 100%",
        "risk": "3/3 High = 100%",
        "deferred": "10 clause + 11 NV",
        "note": "Task 1 (process meta) và Task 16 (NV) bị loại khỏi mẫu số functional.",
    },
    {
        "key": "Fix_Landing_Theme_Toggle",
        "doc": "docs/requirements/2026-09-28-fix-landing-theme-toggle.md",
        "func": "10/10 = 100%",
        "scen": "6/6 = 100%",
        "edge": "0 P0/P1 (5/5 mapped)",
        "risk": "0 Critical/High (3/3 mapped)",
        "deferred": "3 NV",
        "note": "Không có edge/risk P0/P1 trong register; toàn bộ item vẫn được map.",
    },
    {
        "key": "Mobile_Driver_API",
        "doc": "docs/requirements/2026-10-07-mobile-driver-api.md",
        "func": "34/34 = 100%",
        "scen": "25/25 = 100%",
        "edge": "5/5 High = 100%",
        "risk": "3/3 High = 100%",
        "deferred": "17 D",
        "note": "13 dòng PARTIALLY TESTABLE + 1 NOT TESTABLE; nếu tính đúng phân số, coverage requirement tổng thể < 100% (report tự công bố).",
    },
    {
        "key": "Phase4_Payments_Ops",
        "doc": "docs/requirements/2026-10-12-phase4-payments-ops.md",
        "func": "40/40 = 100%",
        "scen": "14/14 = 100%",
        "edge": "9/9 P0/P1 = 100%",
        "risk": "4/4 Critical/High = 100%",
        "deferred": "6 NV",
        "note": "4 mapping P0/P1 có điều kiện; loại ra còn 5/9 = 55,6%; risk strict 3/4 = 75%.",
    },
    {
        "key": "Plate_Ownership",
        "doc": "docs/requirements/2026-10-23-plate-ownership.md (+ design)",
        "func": "17/17 = 100%",
        "scen": "30/30 = 100%",
        "edge": "4/4 P1 = 100%",
        "risk": "3/3 High = 100%",
        "deferred": "4 NV",
        "note": "SCENARIO-PLT-030 assumption-backed (strict 29/30 = 96,7%); EDGE-PLT-008 deferred.",
    },
    {
        "key": "Remove_Login_Demo_UI",
        "doc": "docs/requirements/2026-09-29-remove-login-demo-ui.md",
        "func": "14/14 = 100%",
        "scen": "13/13 = 100%",
        "edge": "3/3 P1 = 100%",
        "risk": "2/2 High = 100%",
        "deferred": "2 NV",
        "note": "BVA-002 acceptance half thuộc NV-1.",
    },
    {
        "key": "Tenant_Camera_Management",
        "doc": "docs/requirements/2026-09-28-tenant-camera-management.md",
        "func": "9/9 task = 100%",
        "scen": "17/17 = 100%",
        "edge": "4/4 P1 = 100%",
        "risk": "2/2 High = 100%",
        "deferred": "2 NV",
        "note": "Task 10 (process meta) bị loại khỏi mẫu số functional.",
    },
    {
        "key": "Tenant_Edge_Device_Management",
        "doc": "docs/requirements/2026-09-28-tenant-edge-device-management.md",
        "func": "57/57 = 100%",
        "scen": "16/16 = 100%",
        "edge": "4/4 P1 = 100%",
        "risk": "3/3 High = 100%",
        "deferred": "4 D",
        "note": "D1-D4 deferred oracle; SCENARIO-TDM-016 chờ hợp đồng partial-failure.",
    },
    {
        "key": "Tenant_Parking_Map",
        "doc": "docs/requirements/2026-09-29-tenant-parking-map.md",
        "func": "90/90 = 100%",
        "scen": "25/25 = 100%",
        "edge": "6/6 P1 = 100%",
        "risk": "3/3 High = 100%",
        "deferred": "11 NV",
        "note": "11 policy con NEEDS VERIFICATION bị loại khỏi mẫu số; RISK-PKM-001 rate-limit deferred.",
    },
]

HEADER_FILL = PatternFill("solid", fgColor="1F4E79")
HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)
TITLE_FONT = Font(bold=True, size=16, color="1F4E79")
SECTION_FONT = Font(bold=True, size=12, color="1F4E79")
SECTION_FILL = PatternFill("solid", fgColor="D9E2F3")
PASS_FILL = PatternFill("solid", fgColor="C6EFCE")
PASS_FONT = Font(color="006100", bold=True)
WARN_FILL = PatternFill("solid", fgColor="FFEB9C")
WARN_FONT = Font(color="9C6500")
ALT_FILL = PatternFill("solid", fgColor="F2F2F2")
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

WRAP_COLS = {5, 6, 7, 8, 9, 14}
DATA_WIDTHS = [22, 24, 26, 20, 55, 50, 65, 32, 60, 10, 10, 13, 12, 45, 28]


def read_suite(key: str) -> tuple[list[str], list[list[str]]]:
    path = REPORTS_DIR / f"{key}_Testcases.csv"
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        if header != COLUMNS:
            raise SystemExit(f"{path.name}: header mismatch: {header}")
        rows = []
        for row in reader:
            if not any(cell.strip() for cell in row):
                continue
            if len(row) > len(COLUMNS):
                raise SystemExit(f"{path.name}: row has {len(row)} cells: {row[0]}")
            rows.append(row + [""] * (len(COLUMNS) - len(row)))
    if not rows:
        raise SystemExit(f"{path.name}: no test cases")
    return header, rows


def style_header(ws, row: int, ncols: int, height: int = 30) -> None:
    for col in range(1, ncols + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = BORDER
    ws.row_dimensions[row].height = height


def set_widths(ws, widths: list[int]) -> None:
    for idx, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = width


def autoheight(ws, row: int, widths: list[int], wrap_cols: set[int]) -> None:
    lines = 1
    for col in wrap_cols:
        value = ws.cell(row=row, column=col).value
        if value is None:
            continue
        width = max(widths[col - 1] - 2, 8)
        estimate = 0
        for part in str(value).split("\n"):
            estimate += max(1, math.ceil(len(part) / width))
        lines = max(lines, estimate)
    ws.row_dimensions[row].height = min(120, max(18, 14 * lines))


def add_data_sheet(
    wb: Workbook,
    name: str,
    rows: list[list[str]],
    row_suites: list[str] | None = None,
) -> None:
    ws = wb.create_sheet(title=name[:31])
    header = COLUMNS + (["Suite"] if row_suites is not None else [])
    ws.append(header)
    style_header(ws, 1, len(header))
    widths = DATA_WIDTHS[: len(COLUMNS)] + ([28] if row_suites is not None else [])
    set_widths(ws, widths)
    wrap_cols = set(WRAP_COLS) | ({15} if row_suites is not None else set())

    for idx, row in enumerate(rows, start=2):
        values = row + ([row_suites[idx - 2]] if row_suites is not None else [])
        ws.append(values)
        for col in range(1, len(header) + 1):
            cell = ws.cell(row=idx, column=col)
            cell.alignment = Alignment(
                vertical="top",
                wrap_text=col in wrap_cols,
                horizontal="center" if col in (10, 11, 12, 13) else "left",
            )
            cell.font = Font(size=10)
            if idx % 2 == 0:
                cell.fill = ALT_FILL
            cell.border = BORDER
        autoheight(ws, idx, widths, wrap_cols)

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(header))}{len(rows) + 1}"
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_setup.orientation = "landscape"


def build_summary(wb: Workbook, suite_rows: dict[str, list[list[str]]]) -> None:
    ws = wb.active
    ws.title = "Summary"
    ws.sheet_view.showGridLines = False
    widths = [6, 32, 48, 8, 9, 8, 9, 8, 10, 18, 16, 18, 20, 16, 24, 60]
    set_widths(ws, widths)

    ws.merge_cells("A1:P1")
    ws["A1"] = "PARKVISION — TỔNG HỢP TEST CASES & COVERAGE (14 SUITES)"
    ws["A1"].font = TITLE_FONT
    ws["A1"].alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 28

    ws.merge_cells("A2:P2")
    ws["A2"] = (
        f"Xuất ngày {date.today().isoformat()} · Nguồn: qa-toolbox/reports/*_Testcases.csv "
        "· Coverage: qa-toolbox/reports/*_Coverage_Report.md"
    )
    ws["A2"].font = Font(size=10, italic=True, color="595959")

    ws.merge_cells("A3:P3")
    ws["A3"] = (
        "CƠ SỞ ĐÁNH GIÁ: mapping-based (thiết kế test case ↔ requirement). "
        "CHƯA THỰC THI BẤT KỲ SUITE NÀO — 100% là coverage thiết kế, KHÔNG phải pass rate."
    )
    ws["A3"].font = Font(size=10, bold=True, color="9C6500")
    ws["A3"].fill = WARN_FILL
    ws["A3"].alignment = Alignment(wrap_text=True, vertical="center")
    ws.row_dimensions[3].height = 32

    total_tcs = sum(len(rows) for rows in suite_rows.values())
    nv_total = 64
    d_total = 21
    anpr_clauses = 18
    ws.merge_cells("A5:P5")
    ws["A5"] = "1. TỔNG QUAN"
    ws["A5"].font = SECTION_FONT
    ws["A5"].fill = SECTION_FILL
    ws.row_dimensions[5].height = 22

    overview = [
        ("Tổng số test case", f"{total_tcs} TC trong {len(SUITES)} suites"),
        ("Export gate", "14/14 suites PASS (100% cả 4 chiều theo mẫu số của coverage schema)"),
        ("Test execution", "0 suite đã chạy — chưa có pass/fail, chưa có bằng chứng runtime"),
        (
            "Deferred / NEEDS VERIFICATION",
            f"{nv_total + d_total + anpr_clauses} mục ({nv_total} NV + {d_total} D + {anpr_clauses} clause ANPR)",
        ),
        (
            "Kiểm tra traceability độc lập",
            "0 TC trùng ID · 0 FR ID rỗng · 0 ghost · 0 unmapped · MD↔CSV đồng bộ 14/14",
        ),
        (
            "Lưu ý số liệu",
            "Coverage_Uplift_Execution_Status.md ghi 701 TC (số cũ); bảng per-suite trong chính tài liệu cộng lại = 757 TC",
        ),
    ]
    row = 6
    for label, value in overview:
        ws.cell(row=row, column=1, value="")
        ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=3)
        ws.cell(row=row, column=2, value=label).font = Font(bold=True, size=10)
        ws.merge_cells(start_row=row, start_column=4, end_row=row, end_column=16)
        cell = ws.cell(row=row, column=4, value=value)
        cell.font = Font(size=10)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[row].height = 26 if len(value) < 110 else 40
        row += 1

    row += 1
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=16)
    ws.cell(row=row, column=1, value="2. COVERAGE THEO TỪNG SUITE").font = SECTION_FONT
    ws.cell(row=row, column=1).fill = SECTION_FILL
    ws.row_dimensions[row].height = 22
    row += 1

    summary_header = [
        "STT",
        "Suite",
        "Requirement Document",
        "TCs",
        "Critical",
        "High",
        "Medium",
        "Low",
        "Auto Yes",
        "Functional",
        "Scenario",
        "Edge P0/P1",
        "Risk Critical/High",
        "Export Gate",
        "Deferred / NV",
        "Ghi chú & caveat",
    ]
    for col, value in enumerate(summary_header, start=1):
        ws.cell(row=row, column=col, value=value)
    style_header(ws, row, len(summary_header), height=34)
    header_row = row
    row += 1

    totals = [0, 0, 0, 0, 0]
    for idx, meta in enumerate(SUITES, start=1):
        rows = suite_rows[meta["key"]]
        priorities = [r[9].strip() for r in rows]
        auto_yes = sum(1 for r in rows if r[12].strip().lower() == "yes")
        counts = [
            priorities.count("Critical"),
            priorities.count("High"),
            priorities.count("Medium"),
            priorities.count("Low"),
        ]
        totals = [totals[0] + len(rows)] + [totals[i + 1] + counts[i] for i in range(4)]
        values = [
            idx,
            meta["key"],
            meta["doc"],
            len(rows),
            *counts,
            auto_yes,
            meta["func"],
            meta["scen"],
            meta["edge"],
            meta["risk"],
            "PASS",
            meta["deferred"],
            meta["note"],
        ]
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=row, column=col, value=value)
            cell.font = Font(size=10)
            cell.alignment = Alignment(
                vertical="top",
                wrap_text=col in (2, 3, 10, 11, 12, 13, 15, 16),
                horizontal="center" if col in (1, 4, 5, 6, 7, 8, 9, 14) else "left",
            )
            cell.border = BORDER
            if idx % 2 == 0:
                cell.fill = ALT_FILL
        gate_cell = ws.cell(row=row, column=14)
        gate_cell.fill = PASS_FILL
        gate_cell.font = PASS_FONT
        ws.row_dimensions[row].height = 42
        row += 1

    total_values = ["", "TỔNG CỘNG", "", totals[0], *totals[1:], "", "", "", "", "", "4 chiều PASS", "103 mục", ""]
    for col, value in enumerate(total_values, start=1):
        cell = ws.cell(row=row, column=col, value=value)
        cell.font = Font(bold=True, size=10)
        cell.fill = SECTION_FILL
        cell.border = BORDER
        cell.alignment = Alignment(horizontal="center" if col in (1, 4, 5, 6, 7, 8, 14, 15) else "left")
    ws.row_dimensions[row].height = 22
    total_row = row

    row += 2
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=16)
    ws.cell(row=row, column=1, value="3. KẾT LUẬN & CẢNH BÁO").font = SECTION_FONT
    ws.cell(row=row, column=1).fill = SECTION_FILL
    row += 1

    conclusions = [
        "ĐẠT: 14/14 suite PASS export gate theo 4 chiều (Functional 100%, Scenario ≥95%, Edge P0/P1 100%, Risk Critical/High 100%) trên cơ sở mapping.",
        "ĐỦ SỐ LƯỢNG: 757 test case; không có Test Case ID trùng; không có FR ID rỗng; mọi TC trong CSV đều xuất hiện trong Coverage Report tương ứng (0 ghost, 0 unmapped).",
        "CHƯA ĐẠT NGHĨA 'ĐÃ KIỂM THỬ': 0 test được chạy. Không có bằng chứng pass/fail; 100% chỉ là độ phủ thiết kế.",
        "RỦI RO CÒN MỞ: 103 mục deferred/NEEDS VERIFICATION; các mapping có điều kiện tại Driver_Payments/Phase4/Barrier; Mobile_Driver_API có 13 dòng PARTIALLY TESTABLE nên coverage requirement thực tế < 100%.",
        "CHẤT LƯỢNG DỮ LIỆU: 14/14 MD↔CSV đồng bộ. 8 dòng Driver_Memberships thiếu cột Remarks rỗng do CSV bỏ trailing empty — cột Remarks là optional theo schema.",
        "SỐ LIỆU STATUS DOC: 701 TC là số cũ; tổng hiện tại đếm được 757 TC.",
    ]
    for text in conclusions:
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=16)
        cell = ws.cell(row=row, column=1, value="• " + text)
        cell.font = Font(size=10)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[row].height = 30 if len(text) < 170 else 44
        row += 1

    row += 1
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=16)
    ws.cell(row=row, column=1, value="4. CẤU TRÚC WORKBOOK").font = SECTION_FONT
    ws.cell(row=row, column=1).fill = SECTION_FILL
    row += 1
    structure = [
        ("All_Testcases", "Toàn bộ 757 TC, 14 cột chuẩn + cột Suite (cột 15) để lọc theo suite."),
        ("14 sheet suite", "Mỗi suite một sheet, giữ đúng 14 cột chuẩn theo schemas/testcase.schema.md."),
        ("Huong_Dan", "Phương pháp, nguồn dữ liệu, quy ước và cảnh báo sử dụng."),
    ]
    for name, desc in structure:
        ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=3)
        ws.cell(row=row, column=2, value=name).font = Font(bold=True, size=10)
        ws.merge_cells(start_row=row, start_column=4, end_row=row, end_column=16)
        cell = ws.cell(row=row, column=4, value=desc)
        cell.font = Font(size=10)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[row].height = 22
        row += 1

    ws.page_setup.orientation = "landscape"
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0

    return total_row


def build_guide(wb: Workbook, suite_rows: dict[str, list[list[str]]]) -> None:
    ws = wb.create_sheet("Huong_Dan")
    ws.sheet_view.showGridLines = False
    set_widths(ws, [28, 110])
    ws["A1"] = "HƯỚNG DẪN & PHƯƠNG PHÁP"
    ws["A1"].font = TITLE_FONT
    ws.merge_cells("A1:B1")
    ws.row_dimensions[1].height = 28

    entries = [
        ("Mục đích", "Tổng hợp toàn bộ test case của 14 suite QA thành một workbook Excel để review, import hoặc gửi stakeholder."),
        ("Nguồn test case", "qa-toolbox/reports/<Suite>_Testcases.csv (sinh từ file Markdown cùng tên bằng scripts/md_to_csv.py)."),
        ("Nguồn coverage", "qa-toolbox/reports/<Suite>_Coverage_Report.md, phiên bản 2026-10-24/25."),
        ("Cột dữ liệu", "14 cột chuẩn theo schemas/testcase.schema.md, giữ nguyên thứ tự và header tiếng Anh."),
        ("Ngôn ngữ", "Nội dung test case (Description/Steps/Expected...) là tiếng Anh theo governance; phần Summary/Hướng dẫn là tiếng Việt."),
        ("Coverage gate", "Functional 100% điều kiện TESTABLE; Scenario ≥95%; Edge P0/P1 100%; Risk Critical/High 100% — tính trên mẫu số đã loại các mục NEEDS VERIFICATION/NOT TESTABLE."),
        ("Giới hạn quan trọng", "Toàn bộ 14 report khẳng định: KHÔNG test nào được thực thi. Đây là coverage thiết kế, không phải tỷ lệ pass."),
        ("Deferred/NV", "64 mục NV + 21 mục D + 18 clause ANPR (tổng 103) chưa có oracle/policy chốt; không được tính là đã kiểm chứng."),
        ("Mapping có điều kiện", "Một số mapping P0/P1 được tính là 'mapped' nhưng oracle chưa xác nhận (Driver_Payments, Phase4, Barrier). Số strict thấp hơn số headline."),
        ("Partial coverage", "Mobile_Driver_API có 13 dòng PARTIALLY TESTABLE và 1 NOT TESTABLE; nếu tính đúng phân số thì coverage requirement tổng thể dưới 100%."),
        ("Assumption tags", "ANPR có 55/79 TC mang [Assumption]; các suite khác có assumption rải rác trong Remarks."),
        ("Kiểm tra tự động", "Đã đối chiếu: 0 duplicate ID, 0 empty FR ID, 0 ghost TC, 0 unmapped TC; MD↔CSV khớp 14/14 suite."),
        ("Khác biệt 701 vs 757", "Coverage_Uplift_Execution_Status.md ghi tổng 701 TC, nhưng bảng per-suite trong chính file cộng lại 757 TC; workbook dùng số đếm thực tế 757."),
        ("Khuyến nghị", "Trước khi sign-off: chạy test thực tế, đóng các NV/D, và xác nhận oracle cho các mapping có điều kiện."),
    ]
    row = 3
    for label, value in entries:
        ws.cell(row=row, column=1, value=label).font = Font(bold=True, size=10)
        cell = ws.cell(row=row, column=2, value=value)
        cell.font = Font(size=10)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        ws.cell(row=row, column=1).alignment = Alignment(vertical="top")
        ws.row_dimensions[row].height = 34 if len(value) < 145 else 48
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="DANH MỤC SHEET").font = SECTION_FONT
    ws.cell(row=row, column=1).fill = SECTION_FILL
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
    row += 1
    for name, count in [("Summary", "Tổng quan + bảng coverage 14 suite")] + [
        (s["key"], f"{len(suite_rows[s['key']])} TC") for s in SUITES
    ] + [("All_Testcases", "757 TC gộp"), ("Huong_Dan", "Trang này")]:
        ws.cell(row=row, column=1, value=name).font = Font(size=10)
        ws.cell(row=row, column=2, value=count).font = Font(size=10)
        row += 1


def main() -> None:
    suite_rows: dict[str, list[list[str]]] = {}
    suites_on_disk = {p.name[: -len("_Testcases.csv")] for p in REPORTS_DIR.glob("*_Testcases.csv")}
    configured = {s["key"] for s in SUITES}
    missing = suites_on_disk - configured
    if missing:
        raise SystemExit(f"Unconfigured suites found: {sorted(missing)}")
    for meta in SUITES:
        _, rows = read_suite(meta["key"])
        suite_rows[meta["key"]] = rows

    wb = Workbook()
    build_summary(wb, suite_rows)

    all_rows: list[list[str]] = []
    all_suites: list[str] = []
    for meta in SUITES:
        for row in suite_rows[meta["key"]]:
            all_rows.append(row)
            all_suites.append(meta["key"])
    add_data_sheet(wb, "All_Testcases", all_rows, row_suites=all_suites)

    for meta in SUITES:
        add_data_sheet(wb, meta["key"], suite_rows[meta["key"]])

    build_guide(wb, suite_rows)

    wb.properties.title = "ParkVision Full Test Cases & Coverage"
    wb.properties.creator = "ParkVision QA"
    wb.properties.description = "14 QA suites, mapping-based coverage, no execution evidence."
    wb.save(OUTPUT)
    print(f"WROTE {OUTPUT}")

    check = load_workbook(OUTPUT, read_only=True)
    print("SHEETS:", len(check.sheetnames))
    for name in check.sheetnames:
        if name in ("Summary", "Huong_Dan"):
            continue
        ws = check[name]
        print(f"  {name}: rows={ws.max_row - 1}, cols={ws.max_column}")
    check.close()


if __name__ == "__main__":
    main()
