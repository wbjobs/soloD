import os
import argparse
from dotenv import load_dotenv

from table_extractor import TableExtractor
from vector_store import VectorStore
from qa_system import FinancialQASystem

load_dotenv()


def process_pdf(pdf_path: str, clear_existing: bool = False, show_report: bool = True):
    if not os.path.exists(pdf_path):
        print(f"Error: PDF file not found: {pdf_path}")
        return
    
    print(f"Processing PDF: {pdf_path}")
    
    print("\n=== Step 1: Extracting tables from PDF ===")
    extractor = TableExtractor(pdf_path)
    tables = extractor.extract_all()
    
    if not tables:
        print("No tables found in the PDF.")
        return
    
    print(f"Found {len(tables)} tables:")
    for i, table in enumerate(tables, 1):
        quality = table.get('quality_score', 0)
        print(f"  Table {i}: Page {table['page']}, Method: {table['method']}, "
              f"Quality: {quality}%, Rows: {len(table['data'])}, Cols: {len(table['headers'])}")
    
    if show_report:
        print("\n=== Extraction Quality Report ===")
        for line in extractor.get_extraction_report():
            print(f"  {line}")
    
    print("\n=== Step 2: Validating and cleaning tables ===")
    vector_store = VectorStore()
    
    validated_tables = []
    for table in tables:
        markdown = table.get("markdown", "")
        is_valid, msg = vector_store._validate_markdown_table(markdown)
        if is_valid:
            validated_tables.append(table)
        else:
            print(f"  Table validation issue: {msg}, attempting to clean...")
            cleaned_markdown = vector_store._clean_markdown_table(markdown)
            is_valid_cleaned, _ = vector_store._validate_markdown_table(cleaned_markdown)
            if is_valid_cleaned:
                table["markdown"] = cleaned_markdown
                validated_tables.append(table)
                print(f"    Table cleaned successfully!")
    
    print(f"  {len(validated_tables)} tables ready for vector store")
    
    print("\n=== Step 3: Adding tables to vector database ===")
    if clear_existing:
        vector_store.clear_collection()
    
    vector_store.add_tables(validated_tables)
    
    stats = vector_store.get_collection_stats()
    print(f"Vector store stats: {stats}")
    
    print("\n=== Done! ===")
    print(f"Processed {len(validated_tables)} valid tables from {pdf_path}")
    print("You can now ask questions about the financial data.")


def ask_question(question: str, openai_api_key: str = None, show_traceability: bool = True):
    print(f"\nQuestion: {question}")
    
    try:
        qa_system = FinancialQASystem(openai_api_key=openai_api_key)
        
        result = qa_system.answer_question(question)
        
        print("\n" + "=" * 80)
        print("📝 ANSWER:")
        print("=" * 80)
        print(result["answer"])
        
        if show_traceability and result.get("traceability"):
            print("\n" + "=" * 80)
            print("📊 TRACEABILITY - 溯源信息:")
            print("=" * 80)
            
            for i, trace_info in enumerate(result["traceability"], 1):
                print(f"\n--- Source {i} ---")
                print(f"📄 PDF: {trace_info.get('pdf_path', 'N/A')}")
                print(f"📄 Page: {trace_info.get('page_num', 'N/A')}")
                print(f"📋 Table Index: {trace_info.get('table_index', 'N/A')}")
                print(f"📍 Position: {trace_info.get('bbox', 'N/A')}")
                
                screenshot = trace_info.get('screenshot_path')
                if screenshot:
                    print(f"🖼️ Table Screenshot: {screenshot}")
                
                highlighted = trace_info.get('highlighted_path')
                if highlighted:
                    print(f"🟡 Highlighted Page: {highlighted}")
        
        print("\n" + "=" * 80)
        print(f"Total source tables used: {result['num_sources']}")
        print("=" * 80)
        
        return result
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return None


def ask_revenue_question(year: int, quarter: int = None, openai_api_key: str = None):
    if quarter:
        question = f"{year}年第{quarter}季度的营收是多少？"
    else:
        question = f"{year}年的全年营收是多少？"
    
    return ask_question(question, openai_api_key)


def load_sample_data():
    print("Loading sample financial data...")
    
    sample_markdown_tables = [
        """
| 项目 - 2023年 - Q1 | 2023年 - Q1 - 金额（万元） | 2023年 - Q1 - 同比增长 | 2023年 - Q2 - 金额（万元） | 2023年 - Q2 - 同比增长 |
| --- | --- | --- | --- | --- |
| 营业收入 | 15,000 | +12.5% | 18,500 | +15.3% |
| 营业成本 | 8,500 | +8.2% | 10,200 | +10.1% |
| 毛利润 | 6,500 | +18.3% | 8,300 | +22.1% |
| 净利润 | 2,800 | +25.0% | 3,600 | +30.5% |
""",
        """
| 项目 - 2023年 - Q3 | 2023年 - Q3 - 金额（万元） | 2023年 - Q3 - 同比增长 | 2023年 - Q4 - 金额（万元） | 2023年 - Q4 - 同比增长 |
| --- | --- | --- | --- | --- |
| 营业收入 | 20,000 | +18.0% | 22,500 | +20.5% |
| 营业成本 | 11,000 | +12.5% | 12,800 | +15.2% |
| 毛利润 | 9,000 | +25.0% | 9,700 | +28.3% |
| 净利润 | 4,100 | +35.0% | 4,500 | +38.5% |
""",
        """
| 年度汇总 | 2022年 - 金额（万元） | 2023年 - 金额（万元） | 同比增长 |
| --- | --- | --- | --- |
| 全年营业收入 | 65,000 | 76,000 | +16.9% |
| 全年净利润 | 11,500 | 15,000 | +30.4% |
| 每股收益（元） | 1.15 | 1.50 | +30.4% |
"""
    ]
    
    vector_store = VectorStore()
    vector_store.clear_collection()
    vector_store.add_markdown_tables(sample_markdown_tables, "sample_financial_data")
    
    print("Sample data loaded successfully!")
    print("Tables loaded: 3 quarterly/annual financial tables")
    print("You can now ask questions like:")
    print("  - 2023年Q1的营收是多少？")
    print("  - 2023年的全年营收？")
    print("  - 2023年Q2的净利润？")


def main():
    parser = argparse.ArgumentParser(description="Financial PDF QA System")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    process_parser = subparsers.add_parser("process", help="Process a PDF file")
    process_parser.add_argument("pdf_path", help="Path to the PDF file")
    process_parser.add_argument("--clear", action="store_true", help="Clear existing data")
    
    ask_parser = subparsers.add_parser("ask", help="Ask a question")
    ask_parser.add_argument("question", help="Your question")
    ask_parser.add_argument("--api-key", help="OpenAI API key (optional if set in .env)")
    
    revenue_parser = subparsers.add_parser("revenue", help="Ask revenue question")
    revenue_parser.add_argument("year", type=int, help="Year")
    revenue_parser.add_argument("--quarter", type=int, help="Quarter (1-4)")
    revenue_parser.add_argument("--api-key", help="OpenAI API key (optional if set in .env)")
    
    subparsers.add_parser("sample", help="Load sample data for testing")
    
    args = parser.parse_args()
    
    if args.command == "process":
        process_pdf(args.pdf_path, args.clear)
    
    elif args.command == "ask":
        ask_question(args.question, args.api_key)
    
    elif args.command == "revenue":
        ask_revenue_question(args.year, args.quarter, args.api_key)
    
    elif args.command == "sample":
        load_sample_data()
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
