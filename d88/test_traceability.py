#!/usr/bin/env python3
"""
Test script for traceability feature.
Demonstrates PDF table extraction with screenshot capture.
"""

import os
import sys
from traceability import PDFTraceability, display_screenshot_info


def test_basic_traceability():
    """Test basic traceability functionality"""
    print("=" * 60)
    print("Testing PDF Traceability Feature")
    print("=" * 60)
    
    tracer = PDFTraceability()
    
    print(f"\n✓ Screenshot directory: {tracer.screenshot_dir}")
    
    if not os.path.exists(tracer.screenshot_dir):
        os.makedirs(tracer.screenshot_dir)
        print(f"✓ Created screenshot directory")
    
    return tracer


def test_demo_with_sample_data():
    """Test traceability with sample table data"""
    print("\n" + "=" * 60)
    print("Demo: Simulated Table Extraction with Traceability")
    print("=" * 60)
    
    sample_trace_info = {
        "pdf_path": "sample_financial_report.pdf",
        "page_num": 1,
        "table_index": 0,
        "bbox": (100.0, 150.0, 500.0, 350.0),
        "screenshot_path": "./table_screenshots/table_page1_idx0_demo.png",
        "highlighted_path": "./table_screenshots/highlighted_page1_demo.png"
    }
    
    print("\n📊 Sample Traceability Information:")
    display_screenshot_info(sample_trace_info)


def test_process_pdf_demo():
    """
    To run full PDF demo, you need a test PDF.
    Example usage:
        python test_traceability.py --pdf your_report.pdf
    """
    print("\n" + "=" * 60)
    print("How to Test Full PDF Traceability:")
    print("=" * 60)
    
    print("""
1. Prepare a PDF with tables (financial report preferred)

2. Run table extraction:
   python main.py process your_report.pdf

3. Check screenshot directory:
   ls -la ./table_screenshots/

4. Ask a question to see traceability in action:
   python main.py ask "What is the Q1 revenue?"

5. Expected output includes:
   - PDF file path
   - Page number
   - Table position coordinates (bbox)
   - Table screenshot file path
   - Highlighted page screenshot file path
""")


def main():
    test_basic_traceability()
    test_demo_with_sample_data()
    test_process_pdf_demo()
    
    print("\n" + "=" * 60)
    print("✓ Traceability feature is ready!")
    print("=" * 60)
    print("\nNext steps:")
    print("  1. Run: pip install pymupdf opencv-python pillow")
    print("  2. Run: python demo.py")
    print("  3. Process a real PDF to see screenshot capture")
    print("  4. Ask questions to see traceability in answers!")


if __name__ == "__main__":
    main()
