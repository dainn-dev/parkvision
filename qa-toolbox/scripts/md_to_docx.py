import os
import re
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import nsdecls
from docx.oxml import parse_xml

def set_cell_background(cell, fill="D9D9D9"):
    shading_elm = parse_xml(r'<w:shd {} w:fill="{}"/>'.format(nsdecls('w'), fill))
    cell._tc.get_or_add_tcPr().append(shading_elm)

def clean_latex(t):
    # Process \text{} recursively or sequentially
    while re.search(r'\\text\{([^}]+)\}', t):
        t = re.sub(r'\\text\{([^}]+)\}', r'\1', t)
    
    t = t.replace(r'\times', '×')
    t = t.replace(r'\min', 'min')
    t = t.replace(r'\max', 'max')
    t = t.replace(r'\left(', '(')
    t = t.replace(r'\right)', ')')
    t = t.replace(r'\Delta', 'Δ')
    t = t.replace(r'\le', '≤')
    t = t.replace(r'\ge', '≥')
    t = t.replace(r'\star', '★')
    t = t.replace(r'\Rightarrow', '⇒')
    t = t.replace(r'\rightarrow', '→')
    t = t.replace(r'\$', '$')
    
    # Handle subscripts like S_{match} -> S_match
    t = re.sub(r'_\{([^}]+)\}', r'_\1', t)
    
    # Remove block math delimiters
    t = t.replace('$$', '')
    
    # Clean inline math delimiters only if they wrap something like $4.9 \star$
    # We will just remove $ if it's followed by a space or something? 
    # Actually, the user's currency is \$2.50. So plain $ means inline math.
    # We can carefully replace $...$ with ...
    t = re.sub(r'(?<!\\)\$([^$]+?)(?<!\\)\$', r'\1', t)
    
    # Clean up escaped dollars to just dollars
    t = t.replace('\\$', '$')
    
    return t

def markdown_to_docx(md_path, docx_path):
    doc = Document()
    
    with open(md_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    in_code_block = False
    in_table = False
    table = None
    header_processed = False
    
    for line in lines:
        raw_line = line.strip('\n')
        stripped_line = raw_line.strip()
        
        # Table closing logic
        if in_table and not (stripped_line.startswith('|') and stripped_line.endswith('|')):
            in_table = False
            table = None
            header_processed = False
        
        # Handle code blocks
        if stripped_line.startswith('```'):
            in_code_block = not in_code_block
            if not in_code_block:
                continue
            continue
        
        if in_code_block:
            p = doc.add_paragraph(raw_line, style='Intense Quote')
            continue
            
        if not stripped_line:
            continue
            
        # Clean latex formulas
        stripped_line = clean_latex(stripped_line)
            
        # Handle Headers
        header_match = re.match(r'^(#+)\s+(.*)', stripped_line)
        if header_match:
            level = len(header_match.group(1))
            text = header_match.group(2)
            text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
            text = re.sub(r'_(.*?)_', r'\1', text)
            text = re.sub(r'`(.*?)`', r'\1', text)
            doc.add_heading(text, level=level if level <= 9 else 9)
            continue
            
        # Handle Blockquotes
        if stripped_line.startswith('>'):
            text = stripped_line[1:].strip()
            p = doc.add_paragraph(text, style='Quote')
            continue
            
        # Handle Lists
        if re.match(r'^[-*]\s+', stripped_line) and not in_table:
            text = re.sub(r'^[-*]\s+', '', stripped_line)
            p = doc.add_paragraph(style='List Bullet')
            _add_formatted_text(p, text)
            continue
            
        if re.match(r'^\d+\.\s+', stripped_line) and not in_table:
            text = re.sub(r'^\d+\.\s+', '', stripped_line)
            p = doc.add_paragraph(style='List Number')
            _add_formatted_text(p, text)
            continue
            
        # Handle Tables
        if stripped_line.startswith('|') and stripped_line.endswith('|'):
            cells = [cell.strip() for cell in stripped_line.split('|')][1:-1]
            
            if '---' in stripped_line:
                header_processed = True
                continue
                
            if not in_table:
                in_table = True
                table = doc.add_table(rows=1, cols=len(cells))
                table.style = 'Table Grid'
                row_cells = table.rows[0].cells
                for i, cell_text in enumerate(cells):
                    if i < len(row_cells):
                        p = row_cells[i].paragraphs[0]
                        _add_formatted_text(p, cell_text)
                        set_cell_background(row_cells[i], "D9D9D9")
            else:
                row_cells = table.add_row().cells
                for i, cell_text in enumerate(cells):
                    if i < len(row_cells):
                        cell_text = cell_text.replace('<br>', '\n').replace('<br/>', '\n')
                        p = row_cells[i].paragraphs[0]
                        _add_formatted_text(p, cell_text)
            continue
            
        # Regular Paragraph
        p = doc.add_paragraph()
        
        # Center align if it looks like a block formula
        if raw_line.strip().startswith('Core Trip Cost =') or raw_line.strip().startswith('Final Surge Multiplier') or raw_line.strip().startswith('S_match =') or raw_line.strip().startswith('Subtotal =') or raw_line.strip().startswith('Taxable Amount') or raw_line.strip().startswith('Final Main Fare'):
             p.alignment = WD_ALIGN_PARAGRAPH.CENTER

        _add_formatted_text(p, stripped_line)

    doc.save(docx_path)

def _add_formatted_text(paragraph, text):
    tokens = re.split(r'(\*\*.*?\*\*|`.*?`)', text)
    for token in tokens:
        if not token:
            continue
        if token.startswith('**') and token.endswith('**'):
            run = paragraph.add_run(token[2:-2])
            run.bold = True
        elif token.startswith('`') and token.endswith('`'):
            run = paragraph.add_run(token[1:-1])
            run.font.name = 'Consolas'
        else:
            subtokens = re.split(r'(\*.*?\*|_.*?_)', token)
            for sub in subtokens:
                if not sub:
                    continue
                if (sub.startswith('*') and sub.endswith('*') and not sub.startswith('**')) or (sub.startswith('_') and sub.endswith('_')):
                    run = paragraph.add_run(sub[1:-1])
                    run.italic = True
                else:
                    paragraph.add_run(sub)

if __name__ == '__main__':
    import sys
    if len(sys.argv) < 3:
        print("Usage: python md_to_docx.py <input.md> <output.docx>")
        sys.exit(1)
    
    md_file = sys.argv[1]
    docx_file = sys.argv[2]
    markdown_to_docx(md_file, docx_file)
    print(f"Docx generated successfully with clean formatting: {docx_file}")
