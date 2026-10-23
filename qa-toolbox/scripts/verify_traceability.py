#!/usr/bin/env python3
"""
Automated Traceability & Coverage Reconciliation Linter
Checks bidirectional consistency between Testcases (CSV/MD) and Coverage_Report.md
Detects:
1. Double Counting (same test case mapped to multiple FRs)
2. Mismapping / Phantom Mapping (test case mapped to FR-A in Coverage Report, but declared with FR-B in CSV)
3. Omissions (test cases in CSV missing from Coverage Report)
4. Ghost Test Cases (test cases mentioned in Coverage Report that do not exist in CSV)
5. Range expansions (e.g. 'SUB-CAT-001 đến SUB-CAT-008' or 'SUB-CAT-001 to SUB-CAT-008')
"""

import sys
import os
import re
import csv
from glob import glob

# Ensure UTF-8 output on Windows terminal
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def expand_test_case_references(raw_text):
    """
    Expands references like:
    - 'SUB-CAT-001 đến SUB-CAT-008'
    - 'SUB-CAT-001 to SUB-CAT-008'
    - '`SUB-ENT-001`, `SUB-ENT-002`'
    Returns a list of clean TC IDs.
    """
    if not raw_text:
        return []
    
    # Remove HTML tags like <br>
    cleaned = re.sub(r'<br\s*/?>', '\n', raw_text)
    
    found_tcs = []
    range_pattern = r'[`]?([A-Z0-9]+-[A-Z0-9]+)-(\d+)[`]?\s*(?:đến|to|-)\s*[`]?([A-Z0-9]+-[A-Z0-9]+)-(\d+)[`]?'
    
    for line in cleaned.split('\n'):
        def replace_range(match):
            prefix1, start_num, prefix2, end_num = match.groups()
            if prefix1.upper() == prefix2.upper():
                s = int(start_num)
                e = int(end_num)
                step = 1 if s <= e else -1
                pad = len(start_num)
                for n in range(s, e + step, step):
                    found_tcs.append(f"{prefix1.upper()}-{n:0{pad}d}")
            else:
                found_tcs.append(f"{prefix1.upper()}-{start_num}")
                found_tcs.append(f"{prefix2.upper()}-{end_num}")
            return " "

        line_without_ranges = re.sub(range_pattern, replace_range, line, flags=re.IGNORECASE)
        for token in re.findall(r'\b([A-Z0-9]{2,8}-[A-Z0-9]{2,6}-\d{3})\b', line_without_ranges):
            found_tcs.append(token.upper())
                
    return found_tcs

def load_testcases_from_csv(csv_path):
    """
    Loads test cases from 14-column CSV.
    Returns: dict {tc_id: {'fr_id': fr_id, 'function': function, 'module': module}}
    """
    tcs = {}
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            return tcs
        
        # Normalize header indices
        col_indices = {}
        for idx, col in enumerate(header):
            norm = col.strip().lower()
            col_indices[norm] = idx
            
        tc_id_col = col_indices.get('test case id', 0)
        fr_id_col = col_indices.get('fr id', 3)
        func_col = col_indices.get('function', 2)
        mod_col = col_indices.get('module', 1)
        
        for row in reader:
            if not row or len(row) <= tc_id_col:
                continue
            tc_id = row[tc_id_col].strip().strip('*').strip('`')
            if not tc_id or tc_id.lower() == 'test case id':
                continue
            fr_id = row[fr_id_col].strip().strip('`') if len(row) > fr_id_col else ''
            func = row[func_col].strip() if len(row) > func_col else ''
            mod = row[mod_col].strip() if len(row) > mod_col else ''
            
            tcs[tc_id] = {
                'fr_id': fr_id,
                'function': func,
                'module': mod,
                'raw_row': row
            }
    return tcs

def parse_coverage_matrix(md_path):
    """
    Parses Section 2: Requirement Coverage Matrix from Coverage_Report.md
    Returns: list of dicts: [{'fr_id': fr_id, 'mapped_tcs': [tc_ids], 'raw_line': line}]
    """
    if not os.path.exists(md_path):
        return []
        
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    matrix_rows = []
    in_matrix_section = False
    
    for line in content.split('\n'):
        # Detect start of Requirement Coverage Matrix
        if re.search(r'Section 2.*Requirement Coverage Matrix', line, re.IGNORECASE):
            in_matrix_section = True
            continue
        # Detect next major section (Section 3 or similar)
        if in_matrix_section and re.search(r'^##\s+.*Section\s+[3-9]', line, re.IGNORECASE):
            in_matrix_section = False
            break
            
        if in_matrix_section:
            stripped = line.strip()
            if not stripped.startswith('|') or re.match(r'^\|[\s\-\|:]+\|$', stripped):
                continue
            cols = [c.strip() for c in stripped.strip('|').split('|')]
            if len(cols) >= 4:
                fr_candidate = cols[0].strip().strip('`').strip('*')
                # Check if it looks like an FR ID or BR ID
                if re.match(r'^(FR|BR|NFR)[-_A-Z0-9\.]+', fr_candidate, re.IGNORECASE):
                    # Column 3 (0-indexed) or Column with test cases
                    mapped_raw = cols[3]
                    mapped_tcs = expand_test_case_references(mapped_raw)
                    matrix_rows.append({
                        'fr_id': fr_candidate,
                        'sub_module': cols[1],
                        'mapped_tcs': mapped_tcs,
                        'raw_cell': mapped_raw
                    })
    return matrix_rows

def reconcile_module(report_dir):
    """
    Runs reconciliation for a specific report module directory.
    """
    print(f"\n========================================================")
    print(f"🔍 Auditing Traceability: {os.path.basename(report_dir)}")
    print(f"========================================================")
    
    csv_files = glob(os.path.join(report_dir, "*_Testcases.csv"))
    if not csv_files:
        csv_files = glob(os.path.join(report_dir, "testcases.csv"))
    
    cov_files = glob(os.path.join(report_dir, "*_Coverage_Report.md"))
    if not cov_files:
        cov_files = glob(os.path.join(report_dir, "coverage_report.md"))
        
    if not csv_files:
        print(f"❌ Error: No Testcases.csv found in {report_dir}")
        return False
    if not cov_files:
        print(f"❌ Error: No Coverage_Report.md found in {report_dir}")
        return False
        
    csv_path = csv_files[0]
    cov_path = cov_files[0]
    
    csv_tcs = load_testcases_from_csv(csv_path)
    matrix_rows = parse_coverage_matrix(cov_path)
    
    print(f"📄 Testcases CSV: {os.path.basename(csv_path)} (Total: {len(csv_tcs)} test cases)")
    print(f"📄 Coverage Report: {os.path.basename(cov_path)} (Parsed {len(matrix_rows)} FR rows)")
    
    errors = []
    warnings = []
    
    # 1. Track mapping per test case in Coverage Matrix
    tc_to_coverage_frs = {} # tc_id -> list of FR rows it appeared in
    
    for row in matrix_rows:
        fr_id = row['fr_id']
        for tc_id in row['mapped_tcs']:
            tc_to_coverage_frs.setdefault(tc_id, []).append(fr_id)
            
            # Check Ghost Test Case (in Coverage Report but not in CSV)
            if tc_id not in csv_tcs:
                errors.append(f"[GHOST TC] '{tc_id}' is mapped under '{fr_id}' in Coverage Report, but does NOT exist in {os.path.basename(csv_path)}!")
            else:
                # Check FR ID Misalignment (in CSV, declared with a different FR ID)
                declared_fr = csv_tcs[tc_id]['fr_id']
                # Check for direct match or parent/child match
                if declared_fr.upper() != fr_id.upper() and not (declared_fr.upper().startswith(fr_id.upper()) or fr_id.upper().startswith(declared_fr.upper())):
                    errors.append(
                        f"[MISMATCH] '{tc_id}' is placed under '{fr_id}' in Coverage Report, "
                        f"but its declared FR ID in CSV is '{declared_fr}'!"
                    )

    # 2. Check Double Counting
    for tc_id, fr_list in tc_to_coverage_frs.items():
        if len(fr_list) > 1:
            errors.append(
                f"[DOUBLE COUNTING] '{tc_id}' appears {len(fr_list)} times in Coverage Matrix under FRs: {', '.join(fr_list)}"
            )

    # 3. Check Omissions (TCs in CSV not mapped to any FR in Coverage Report)
    for tc_id, data in csv_tcs.items():
        if tc_id not in tc_to_coverage_frs:
            warnings.append(
                f"[UNMAPPED TC] '{tc_id}' (Declared FR: '{data['fr_id']}', Function: '{data['function']}') is in CSV but NOT mapped in Section 2 of Coverage Report."
            )

    # Summary
    print("\n--- Audit Results ---")
    if errors:
        print(f"🚨 FAILED: Found {len(errors)} Critical Traceability Errors:")
        for err in errors[:15]:
            print(f"   ❌ {err}")
        if len(errors) > 15:
            print(f"   ... and {len(errors) - 15} more errors.")
    else:
        print("✅ No Critical Traceability Errors (0 Ghost TCs, 0 Double Counts, 0 FR Misalignments)!")

    if warnings:
        print(f"⚠️ Found {len(warnings)} Warnings / Unmapped Cases:")
        for w in warnings[:10]:
            print(f"   🔸 {w}")
        if len(warnings) > 10:
            print(f"   ... and {len(warnings) - 10} more unmapped test cases.")
    else:
        print("✅ 100% of CSV Test Cases are accounted for in the Coverage Matrix!")

    is_success = len(errors) == 0
    return is_success

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else 'reports/FR_SUB_BEN_Subscriptions'
    if os.path.isdir(target):
        # Check if target is a specific report folder
        if glob(os.path.join(target, "*_Coverage_Report.md")):
            success = reconcile_module(target)
            sys.exit(0 if success else 1)
        else:
            # Audit all subdirectories in reports/
            subdirs = [os.path.join(target, d) for d in os.listdir(target) if os.path.isdir(os.path.join(target, d))]
            total_fail = 0
            for d in subdirs:
                if glob(os.path.join(d, "*_Coverage_Report.md")):
                    if not reconcile_module(d):
                        total_fail += 1
            sys.exit(1 if total_fail > 0 else 0)
    else:
        print(f"Usage: python scripts/verify_traceability.py [reports_directory_or_module_dir]")
        sys.exit(1)

if __name__ == '__main__':
    main()
