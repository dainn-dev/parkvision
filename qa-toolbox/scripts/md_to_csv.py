import sys
import csv
import re
import os

def clean_math_formatting(text):
    if not text:
        return text

    t = text

    # 1. Clean \text{...} recursively
    while re.search(r'\\text\{([^}]+)\}', t):
        t = re.sub(r'\\text\{([^}]+)\}', r'\1', t)

    # 2. Convert LaTeX greek & math symbols to plain words / operators
    t = re.sub(r'\(\s*\$?\\Delta\$?\s*\)', '(Delta)', t)
    t = re.sub(r'\$\\Delta\$|\\Delta', '(Delta)', t)
    t = re.sub(r'\(\s*\(Delta\)', '(Delta', t)
    t = re.sub(r'\(Delta\)\s*\)', 'Delta)', t)

    t = re.sub(r'\\times|\\cdot', '*', t)
    t = re.sub(r'\\div', '/', t)
    t = re.sub(r'\\le(q)?', '<=', t)
    t = re.sub(r'\\ge(q)?', '>=', t)
    t = re.sub(r'\\ne(q)?', '!=', t)
    t = re.sub(r'\\approx', '~', t)
    t = re.sub(r'\\pm', '+/-', t)
    t = re.sub(r'\\min', 'min', t)
    t = re.sub(r'\\max', 'max', t)
    t = re.sub(r'\\left\(', '(', t)
    t = re.sub(r'\\right\)', ')', t)
    t = re.sub(r'\\rightarrow|\\to', '->', t)
    t = re.sub(r'\\leftarrow', '<-', t)

    # 3. Handle inline math wrapping equations (e.g. '$\$38.50 - \$30.00 = +\$8.50$' -> '$38.50 - $30.00 = +$8.50')
    def clean_inline_math(match):
        inner = match.group(1)
        return inner.replace(r'\$', '$')

    t = re.sub(r'(?<!\\)\$((?:\\\$|[^$])*(?:[=+\-<>\\*\/]|\\\$)(?:\\\$|[^$])*?)(?<!\\)\$', clean_inline_math, t)

    # 4. Clean escaped LaTeX symbols: \$, \%, \_, \&
    t = t.replace(r'\$', '$')
    t = t.replace(r'\%', '%')
    t = t.replace(r'\_', '_')
    t = t.replace(r'\&', '&')

    # 5. Clean standalone double dollars $$...$$
    t = re.sub(r'\$\$(.*?)\$\$', r'\1', t)

    # 6. Clean subscripts like S_{match} -> S_match
    t = re.sub(r'_\{([^}]+)\}', r'_\1', t)

    # 7. Clean residual math wrappers around simple numbers with symbols: e.g. $4.9 \star$ -> 4.9 ★
    t = re.sub(r'\\star', '★', t)

    return t

def markdown_to_csv(md_path, csv_path):
    if not os.path.exists(md_path):
        print(f"Error: File '{md_path}' does not exist.")
        return

    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')
    
    # Phân nhóm các dòng thành các bảng riêng biệt (nhóm các dòng liên tiếp bắt đầu bằng |)
    tables = []
    current_table = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('|'):
            current_table.append(stripped)
        else:
            if current_table:
                tables.append(current_table)
                current_table = []
    if current_table:
        tables.append(current_table)

    if not tables:
        print(f"Error: No Markdown table found in '{md_path}'.")
        return

    # Lựa chọn bảng có số lượng cột lớn nhất (thường là bảng test cases với 14 cột, bỏ qua bảng metadata chỉ có 2 cột)
    target_table = None
    max_cols = 0
    for t in tables:
        # Tách cột dòng header đầu tiên để đếm số cột
        first_line = t[0].strip('|')
        cols_count = len([col.strip() for col in first_line.split('|')])
        if cols_count > max_cols:
            max_cols = cols_count
            target_table = t

    # Lọc bỏ dòng gạch ngang (VD: |---|---|)
    table_lines = [line for line in target_table if not re.match(r'^\|[\s\-\|:]+\|$', line)]

    rows = []
    placeholder = "__ESCAPED_PIPE__"
    for line in table_lines:
        # Bỏ dấu | ở đầu và cuối dòng chính xác
        if line.startswith('|'):
            line = line[1:]
        if line.endswith('|'):
            line = line[:-1]
        
        # Xử lý escaped pipe \| trước khi split
        line_safe = line.replace(r'\|', placeholder)
        
        # Split các cột bằng dấu |
        columns = [col.strip().replace(placeholder, '|') for col in line_safe.split('|')]
        
        # Xử lý thẻ <br> thành newline thực tế cho file CSV/Excel
        columns = [col.replace('<br>', '\n').replace('<br/>', '\n') for col in columns]
        
        # Loại bỏ markdown bold/italic bọc toàn bộ chuỗi (ví dụ: **SCH-001** -> SCH-001)
        columns = [re.sub(r'^\*\*(.*?)\*\*$', r'\1', col) for col in columns]
        
        # Làm sạch công thức toán LaTeX sang plain text tương thích Google Sheets / Excel
        columns = [clean_math_formatting(col) for col in columns]
        
        rows.append(columns)

    # Ghi ra file CSV, sử dụng utf-8-sig để Excel nhận diện đúng tiếng Việt (BOM)
    with open(csv_path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerows(rows)
        
    print(f"Successfully converted markdown table to CSV!")
    print(f"Exported {len(rows)-1} records to: {csv_path}")

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python md_to_csv.py <input.md> <output.csv>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    markdown_to_csv(input_file, output_file)
