import pdfplumber
import camelot
import pandas as pd
import fitz
from typing import List, Dict, Optional, Tuple
import re
from collections import Counter


class TableExtractor:
    def __init__(self, pdf_path: str, enable_traceability: bool = True):
        self.pdf_path = pdf_path
        self.tables = []
        self.extraction_report = []
        self.enable_traceability = enable_traceability
        self.traceability = None
        
        if enable_traceability:
            from traceability import PDFTraceability
            self.traceability = PDFTraceability()

    def _get_pdfplumber_table_bbox(self, table, page) -> Optional[Tuple[float, float, float, float]]:
        try:
            rows = table.rows if hasattr(table, 'rows') else []
            if not rows:
                return None
            
            x0 = min(row.cells[0].x0 if row.cells else 0 for row in rows if row.cells)
            y0 = min(row.cells[0].y0 if row.cells else 0 for row in rows if row.cells)
            x1 = max(row.cells[-1].x1 if row.cells else 0 for row in rows if row.cells)
            y1 = max(row.cells[-1].y1 if row.cells else 0 for row in rows if row.cells)
            
            return (x0, y0, x1, y1)
        except:
            return None

    def extract_with_pdfplumber(self) -> List[Dict]:
        tables_data = []
        
        with pdfplumber.open(self.pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages, 1):
                table_settings_list = [
                    {
                        "vertical_strategy": "lines",
                        "horizontal_strategy": "lines",
                        "intersection_tolerance": 5,
                        "snap_tolerance": 3,
                        "edge_min_length": 3
                    },
                    {
                        "vertical_strategy": "lines_strict",
                        "horizontal_strategy": "lines_strict",
                        "intersection_tolerance": 8,
                        "snap_tolerance": 5,
                        "edge_min_length": 5
                    },
                    {
                        "vertical_strategy": "text",
                        "horizontal_strategy": "lines",
                        "intersection_tolerance": 10,
                        "snap_tolerance": 5
                    }
                ]
                
                best_tables = None
                best_score = 0
                best_settings = None
                
                for settings in table_settings_list:
                    try:
                        tables = page.find_tables(table_settings=settings)
                        if tables:
                            table_data = [t.extract() for t in tables]
                            score = self._evaluate_table_quality(table_data)
                            if score > best_score:
                                best_score = score
                                best_tables = tables
                                best_settings = settings
                    except Exception:
                        continue
                
                if best_tables:
                    for table_idx, table in enumerate(best_tables):
                        table_data = table.extract()
                        if table_data and len(table_data) > 0:
                            processed_table = self._process_complex_table(table_data)
                            
                            if self._validate_table_quality(processed_table):
                                table_info = {
                                    "page": page_num,
                                    "table_index": table_idx,
                                    "method": "pdfplumber",
                                    "data": processed_table["data"],
                                    "headers": processed_table["headers"],
                                    "markdown": self._to_markdown(processed_table["headers"], processed_table["data"]),
                                    "quality_score": processed_table.get("quality_score", 0),
                                    "traceability": None
                                }
                                
                                if self.enable_traceability and self.traceability:
                                    bbox = table.bbox if hasattr(table, 'bbox') else self._get_pdfplumber_table_bbox(table, page)
                                    if bbox:
                                        trace_info = self.traceability.create_traceability_info(
                                            pdf_path=self.pdf_path,
                                            page_num=page_num,
                                            bbox=bbox,
                                            table_index=table_idx,
                                            capture_screenshot=True
                                        )
                                        table_info["traceability"] = trace_info
                                
                                tables_data.append(table_info)
                            else:
                                self.extraction_report.append(
                                    f"Page {page_num}, Table {table_idx}: Quality too low, skipped"
                                )
        
        self.tables.extend(tables_data)
        return tables_data

    def extract_with_camelot(self) -> List[Dict]:
        tables_data = []
        
        lattice_params_list = [
            {
                "flavor": "lattice",
                "line_scale": 40,
                "split_text": True,
                "flag_size": True,
                "process_background": True,
                "line_tol": 2,
                "joint_tol": 2,
                "threshold_blocksize": 15,
                "threshold_constant": -2
            },
            {
                "flavor": "lattice",
                "line_scale": 30,
                "split_text": True,
                "flag_size": True,
                "process_background": False,
                "line_tol": 3,
                "joint_tol": 3
            },
            {
                "flavor": "stream",
                "edge_tol": 50,
                "row_tol": 10,
                "column_tol": 10
            }
        ]
        
        best_tables = None
        best_score = 0
        best_params_idx = 0
        
        for params_idx, params in enumerate(lattice_params_list):
            try:
                tables = camelot.read_pdf(
                    self.pdf_path,
                    pages="all",
                    **params
                )
                
                if tables:
                    table_list = [t.df.values.tolist() for t in tables]
                    score = self._evaluate_table_quality(table_list)
                    if score > best_score:
                        best_score = score
                        best_tables = tables
                        best_params_idx = params_idx
            except Exception as e:
                continue
        
        if best_tables:
            method_name = f"camelot_{['lattice_v1', 'lattice_v2', 'stream'][best_params_idx]}"
            for table_idx, table in enumerate(best_tables):
                df = table.df
                processed_table = self._process_camelot_table(df)
                
                if self._validate_table_quality(processed_table):
                    table_info = {
                        "page": int(table.page) if table.page else 1,
                        "table_index": table_idx,
                        "method": method_name,
                        "data": processed_table["data"],
                        "headers": processed_table["headers"],
                        "markdown": self._to_markdown(processed_table["headers"], processed_table["data"]),
                        "quality_score": processed_table.get("quality_score", 0),
                        "traceability": None
                    }
                    
                    if self.enable_traceability and self.traceability:
                        if hasattr(table, '_bbox') and table._bbox:
                            bbox = table._bbox
                        elif hasattr(table, 'bbox') and table.bbox:
                            bbox = table.bbox
                        else:
                            bbox = None
                        
                        if bbox:
                            page_num = int(table.page) if table.page else 1
                            trace_info = self.traceability.create_traceability_info(
                                pdf_path=self.pdf_path,
                                page_num=page_num,
                                bbox=bbox,
                                table_index=table_idx,
                                capture_screenshot=True
                            )
                            table_info["traceability"] = trace_info
                    
                    tables_data.append(table_info)
                else:
                    self.extraction_report.append(
                        f"Camelot Table {table_idx}: Quality too low, skipped"
                    )
        
        self.tables.extend(tables_data)
        return tables_data

    def _process_complex_table(self, table: List[List]) -> Dict:
        if not table:
            return {"headers": [], "data": [], "quality_score": 0}
        
        cleaned_table = self._pre_clean_table(table)
        aligned_table = self._align_table_columns(cleaned_table)
        
        max_cols = max(len(row) for row in aligned_table)
        padded_table = []
        for row in aligned_table:
            padded_row = row + [''] * (max_cols - len(row))
            padded_table.append(padded_row)
        
        header_rows = self._detect_header_rows(padded_table)
        
        if header_rows > 1:
            headers = self._merge_multi_header(padded_table[:header_rows])
            data_rows = padded_table[header_rows:]
        else:
            headers = padded_table[0] if padded_table else []
            data_rows = padded_table[1:] if len(padded_table) > 1 else []
        
        headers = self._clean_headers(headers)
        cleaned_data = self._clean_data_rows(data_rows)
        
        quality_score = self._calculate_table_quality(headers, cleaned_data)
        
        return {
            "headers": headers,
            "data": cleaned_data,
            "quality_score": quality_score
        }

    def _process_camelot_table(self, df: pd.DataFrame) -> Dict:
        table_data = df.values.tolist()
        return self._process_complex_table(table_data)

    def _detect_header_rows(self, table: List[List]) -> int:
        if len(table) < 2:
            return 1
        
        empty_ratio_threshold = 0.3
        header_rows = 0
        
        for i, row in enumerate(table):
            empty_cells = sum(1 for cell in row if cell is None or str(cell).strip() == '')
            empty_ratio = empty_cells / len(row)
            
            if i == 0:
                header_rows += 1
            elif empty_ratio > empty_ratio_threshold and i < 3:
                header_rows += 1
            else:
                if self._is_numeric_row(row):
                    break
                header_rows += 1
            
            if header_rows >= 3:
                break
        
        return max(1, header_rows)

    def _merge_multi_header(self, header_rows: List[List]) -> List[str]:
        if not header_rows:
            return []
        
        num_cols = len(header_rows[0])
        merged_headers = []
        
        for col in range(num_cols):
            header_parts = []
            for row in header_rows:
                if col < len(row):
                    cell_value = str(row[col]).strip() if row[col] else ''
                    if cell_value and cell_value not in header_parts:
                        header_parts.append(cell_value)
            
            merged_header = ' - '.join(filter(None, header_parts))
            merged_headers.append(merged_header if merged_header else f'Column_{col}')
        
        return merged_headers

    def _is_numeric_row(self, row: List) -> bool:
        numeric_count = 0
        for cell in row:
            if cell:
                cell_str = str(cell).strip()
                if re.match(r'^[\d,.-]+$', cell_str):
                    numeric_count += 1
        
        return numeric_count / len(row) > 0.3 if row else False

    def _clean_data_rows(self, rows: List[List]) -> List[List]:
        cleaned = []
        for row in rows:
            cleaned_row = []
            for cell in row:
                if cell:
                    cell_str = str(cell).strip()
                    cell_str = cell_str.replace('\n', ' ')
                    cell_str = re.sub(r'\s+', ' ', cell_str)
                    cleaned_row.append(cell_str)
                else:
                    cleaned_row.append('')
            
            if any(cleaned_row):
                cleaned.append(cleaned_row)
        
        return cleaned

    def _pre_clean_table(self, table: List[List]) -> List[List]:
        cleaned = []
        for row in table:
            cleaned_row = []
            for cell in row:
                if cell is None:
                    cleaned_row.append('')
                else:
                    cell_str = str(cell).strip()
                    cell_str = cell_str.replace('\r', '')
                    cell_str = re.sub(r'\n\s*', ' ', cell_str)
                    cell_str = re.sub(r'\s+', ' ', cell_str)
                    cleaned_row.append(cell_str)
            cleaned.append(cleaned_row)
        return cleaned

    def _align_table_columns(self, table: List[List]) -> List[List]:
        if not table:
            return table
        
        col_lengths = []
        for row in table:
            for i, cell in enumerate(row):
                if i >= len(col_lengths):
                    col_lengths.append([])
                col_lengths[i].append(len(cell))
        
        avg_col_lengths = [sum(lengths) / len(lengths) if lengths else 0 
                           for lengths in col_lengths]
        
        aligned_table = []
        for row in table:
            aligned_row = []
            i = 0
            while i < len(row):
                cell = row[i]
                
                if i > 0 and len(cell) < 3 and avg_col_lengths[i] < 2:
                    if aligned_row:
                        prev_cell = aligned_row[-1]
                        if prev_cell and not self._is_numeric_value(prev_cell):
                            aligned_row[-1] = prev_cell + ' ' + cell
                            i += 1
                            continue
                
                aligned_row.append(cell)
                i += 1
            
            aligned_table.append(aligned_row)
        
        return aligned_table

    def _is_numeric_value(self, value: str) -> bool:
        if not value:
            return False
        value = value.strip()
        return bool(re.match(r'^[\d,.-]+$', value))

    def _clean_headers(self, headers: List[str]) -> List[str]:
        cleaned = []
        seen = set()
        
        for i, header in enumerate(headers):
            header_str = str(header).strip()
            
            if not header_str or header_str == 'nan':
                header_str = f'Column_{i}'
            
            if header_str in seen:
                header_str = f"{header_str}_{i}"
            
            seen.add(header_str)
            cleaned.append(header_str)
        
        return cleaned

    def _evaluate_table_quality(self, tables: List[List[List]]) -> float:
        if not tables:
            return 0
        
        total_score = 0
        for table in tables:
            if not table or len(table) < 2:
                continue
            
            col_counts = [len(row) for row in table]
            col_consistency = 1 - (len(set(col_counts)) - 1) / max(len(table), 1)
            
            avg_cols = sum(col_counts) / len(col_counts)
            col_diversity = min(avg_cols / 3, 1)
            
            non_empty_rows = sum(1 for row in table if any(str(cell).strip() for cell in row))
            row_density = non_empty_rows / len(table)
            
            score = (col_consistency * 0.4 + col_diversity * 0.3 + row_density * 0.3)
            total_score += score
        
        return total_score / len(tables) if tables else 0

    def _calculate_table_quality(self, headers: List[str], data: List[List]) -> float:
        if not headers or not data:
            return 0
        
        non_empty_headers = sum(1 for h in headers if h and not h.startswith('Column_'))
        header_quality = non_empty_headers / len(headers)
        
        col_counts = [len(row) for row in data]
        col_consistency = 1 - (len(set(col_counts)) - 1) / max(len(data), 1)
        
        total_cells = len(headers) * len(data)
        non_empty_cells = sum(1 for row in data for cell in row if str(cell).strip())
        cell_density = non_empty_cells / total_cells if total_cells > 0 else 0
        
        quality = (header_quality * 0.3 + col_consistency * 0.4 + cell_density * 0.3) * 100
        return round(quality, 2)

    def _validate_table_quality(self, processed_table: Dict) -> bool:
        quality_score = processed_table.get("quality_score", 0)
        headers = processed_table.get("headers", [])
        data = processed_table.get("data", [])
        
        if quality_score < 30:
            return False
        
        if len(headers) < 2:
            return False
        
        if len(data) < 1:
            return False
        
        return True

    def _to_markdown(self, headers: List[str], data: List[List]) -> str:
        if not headers:
            return ""
        
        validated_headers, validated_data = self._validate_and_fix_markdown_table(headers, data)
        
        md_lines = []
        
        header_line = '| ' + ' | '.join(validated_headers) + ' |'
        md_lines.append(header_line)
        
        separator_line = '| ' + ' | '.join(['---'] * len(validated_headers)) + ' |'
        md_lines.append(separator_line)
        
        for row in validated_data:
            row_cells = []
            for i in range(len(validated_headers)):
                if i < len(row):
                    cell = str(row[i]) if row[i] else ''
                else:
                    cell = ''
                cell = cell.replace('|', '\\|')
                row_cells.append(cell)
            
            row_line = '| ' + ' | '.join(row_cells) + ' |'
            md_lines.append(row_line)
        
        return '\n'.join(md_lines)

    def _validate_and_fix_markdown_table(self, headers: List[str], data: List[List]) -> Tuple[List[str], List[List]]:
        num_cols = len(headers)
        
        fixed_data = []
        for row in data:
            if len(row) < num_cols:
                fixed_row = row + [''] * (num_cols - len(row))
            elif len(row) > num_cols:
                fixed_row = row[:num_cols]
            else:
                fixed_row = row
            fixed_data.append(fixed_row)
        
        return headers, fixed_data

    def extract_all(self) -> List[Dict]:
        self.tables = []
        self.extraction_report = []
        
        self.extract_with_pdfplumber()
        self.extract_with_camelot()
        
        self._deduplicate_tables()
        
        return self.tables

    def _deduplicate_tables(self):
        seen = set()
        unique_tables = []
        
        for table in self.tables:
            key = (
                table.get("page", 0),
                len(table.get("headers", [])),
                len(table.get("data", []))
            )
            
            if key not in seen:
                seen.add(key)
                unique_tables.append(table)
        
        self.tables = unique_tables

    def get_all_markdown_tables(self) -> List[str]:
        return [t["markdown"] for t in self.tables if t["markdown"]]

    def get_extraction_report(self) -> List[str]:
        report = self.extraction_report.copy()
        report.append(f"Total tables extracted: {len(self.tables)}")
        for i, table in enumerate(self.tables):
            report.append(
                f"Table {i}: Page {table.get('page', '?')}, "
                f"Method: {table.get('method', '?')}, "
                f"Quality: {table.get('quality_score', 0)}%, "
                f"Size: {len(table.get('headers', []))} cols x {len(table.get('data', []))} rows"
            )
        return report
