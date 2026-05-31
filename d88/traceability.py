import os
import fitz
from typing import List, Dict, Tuple, Optional
from PIL import Image
import numpy as np
import cv2
import hashlib


class TablePosition:
    def __init__(
        self,
        page_num: int,
        bbox: Tuple[float, float, float, float],
        pdf_path: str,
        table_index: int = 0
    ):
        self.page_num = page_num
        self.bbox = bbox
        self.pdf_path = pdf_path
        self.table_index = table_index
        self.screenshot_path = None

    def to_dict(self) -> Dict:
        return {
            "page_num": self.page_num,
            "bbox": self.bbox,
            "pdf_path": self.pdf_path,
            "table_index": self.table_index,
            "screenshot_path": self.screenshot_path
        }


class PDFTraceability:
    def __init__(self, screenshot_dir: str = "./table_screenshots"):
        self.screenshot_dir = screenshot_dir
        self._ensure_screenshot_dir()

    def _ensure_screenshot_dir(self):
        if not os.path.exists(self.screenshot_dir):
            os.makedirs(self.screenshot_dir)

    def _generate_screenshot_id(self, pdf_path: str, page_num: int, table_index: int) -> str:
        content = f"{pdf_path}_{page_num}_{table_index}"
        return hashlib.md5(content.encode()).hexdigest()[:12]

    def capture_table_screenshot(
        self,
        pdf_path: str,
        page_num: int,
        bbox: Tuple[float, float, float, float],
        table_index: int = 0,
        padding: int = 10,
        zoom: float = 2.0
    ) -> Optional[str]:
        try:
            doc = fitz.open(pdf_path)
            if page_num < 1 or page_num > len(doc):
                print(f"Invalid page number: {page_num}, total pages: {len(doc)}")
                return None

            page = doc[page_num - 1]
            x0, y0, x1, y1 = bbox

            x0 = max(0, x0 - padding)
            y0 = max(0, y0 - padding)
            x1 = min(page.rect.width, x1 + padding)
            y1 = min(page.rect.height, y1 + padding)

            clip_rect = fitz.Rect(x0, y0, x1, y1)

            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat, clip=clip_rect)

            screenshot_id = self._generate_screenshot_id(pdf_path, page_num, table_index)
            filename = f"table_page{page_num}_idx{table_index}_{screenshot_id}.png"
            filepath = os.path.join(self.screenshot_dir, filename)

            pix.save(filepath)
            doc.close()

            return filepath

        except Exception as e:
            print(f"Error capturing screenshot: {e}")
            return None

    def capture_full_page_screenshot(
        self,
        pdf_path: str,
        page_num: int,
        zoom: float = 2.0
    ) -> Optional[str]:
        try:
            doc = fitz.open(pdf_path)
            if page_num < 1 or page_num > len(doc):
                print(f"Invalid page number: {page_num}")
                return None

            page = doc[page_num - 1]
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)

            screenshot_id = self._generate_screenshot_id(pdf_path, page_num, -1)
            filename = f"fullpage_page{page_num}_{screenshot_id}.png"
            filepath = os.path.join(self.screenshot_dir, filename)

            pix.save(filepath)
            doc.close()

            return filepath

        except Exception as e:
            print(f"Error capturing full page screenshot: {e}")
            return None

    def highlight_table_in_page(
        self,
        pdf_path: str,
        page_num: int,
        bbox: Tuple[float, float, float, float],
        output_path: Optional[str] = None,
        highlight_color: Tuple[int, int, int] = (255, 200, 0),
        zoom: float = 2.0
    ) -> Optional[str]:
        try:
            doc = fitz.open(pdf_path)
            if page_num < 1 or page_num > len(doc):
                return None

            page = doc[page_num - 1]
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)

            img_np = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
            img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

            x0, y0, x1, y1 = bbox
            x0 = int(x0 * zoom)
            y0 = int(y0 * zoom)
            x1 = int(x1 * zoom)
            y1 = int(y1 * zoom)

            cv2.rectangle(img_bgr, (x0, y0), (x1, y1), highlight_color, 3)

            overlay = img_bgr.copy()
            cv2.rectangle(overlay, (x0, y0), (x1, y1), highlight_color, -1)
            cv2.addWeighted(overlay, 0.2, img_bgr, 0.8, 0, img_bgr)

            if output_path is None:
                screenshot_id = self._generate_screenshot_id(pdf_path, page_num, 0)
                filename = f"highlight_page{page_num}_{screenshot_id}.png"
                output_path = os.path.join(self.screenshot_dir, filename)

            cv2.imwrite(output_path, img_bgr)
            doc.close()

            return output_path

        except Exception as e:
            print(f"Error highlighting table: {e}")
            return None

    def get_page_table_bboxes(
        self,
        pdf_path: str,
        page_num: int
    ) -> List[Tuple[float, float, float, float]]:
        try:
            doc = fitz.open(pdf_path)
            if page_num < 1 or page_num > len(doc):
                return []

            page = doc[page_num - 1]
            tables = page.find_tables()

            bboxes = []
            for table in tables:
                bboxes.append(table.bbox)

            doc.close()
            return bboxes

        except Exception as e:
            print(f"Error getting table bboxes: {e}")
            return []

    def create_traceability_info(
        self,
        pdf_path: str,
        page_num: int,
        bbox: Tuple[float, float, float, float],
        table_index: int = 0,
        capture_screenshot: bool = True
    ) -> Dict:
        trace_info = {
            "pdf_path": pdf_path,
            "page_num": page_num,
            "table_index": table_index,
            "bbox": bbox,
            "screenshot_path": None,
            "highlighted_path": None
        }

        if capture_screenshot:
            screenshot_path = self.capture_table_screenshot(
                pdf_path, page_num, bbox, table_index
            )
            trace_info["screenshot_path"] = screenshot_path

            highlighted_path = self.highlight_table_in_page(
                pdf_path, page_num, bbox
            )
            trace_info["highlighted_path"] = highlighted_path

        return trace_info


def display_screenshot_info(trace_info: Dict):
    print("\n" + "=" * 60)
    print("📊 溯源信息 (Traceability)")
    print("=" * 60)
    print(f"📄 PDF 文件: {trace_info.get('pdf_path', 'N/A')}")
    print(f"📄 页码: {trace_info.get('page_num', 'N/A')}")
    print(f"📋 表格序号: {trace_info.get('table_index', 'N/A')}")
    print(f"📍 位置 (x0, y0, x1, y1): {trace_info.get('bbox', 'N/A')}")
    
    screenshot = trace_info.get('screenshot_path')
    if screenshot:
        print(f"🖼️ 表格截图: {screenshot}")
    
    highlighted = trace_info.get('highlighted_path')
    if highlighted:
        print(f"🟡 高亮标注图: {highlighted}")
    print("=" * 60 + "\n")
