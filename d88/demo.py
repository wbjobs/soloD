import os
from dotenv import load_dotenv

from table_extractor import TableExtractor
from vector_store import VectorStore
from qa_system import FinancialQASystem

load_dotenv()


def print_header(title):
    print("\n" + "=" * 80)
    print(f"  {title}")
    print("=" * 80)


def demo_step_1_load_sample_data():
    print_header("Step 1: Load Sample Financial Data")
    
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
    
    print("Loading 3 sample financial tables into vector store...")
    print("\nSample Table 1 (Q1-Q2):")
    print(sample_markdown_tables[0])
    
    vector_store = VectorStore()
    vector_store.clear_collection()
    vector_store.add_markdown_tables(sample_markdown_tables, "sample_financial_data")
    
    stats = vector_store.get_collection_stats()
    print(f"\n✓ Data loaded successfully!")
    print(f"  Total documents: {stats['total_documents']}")


def demo_step_2_ask_questions():
    print_header("Step 2: Ask Financial Questions")
    
    api_key = os.getenv("OPENAI_API_KEY")
    
    if not api_key:
        print("⚠️  OPENAI_API_KEY not found in environment variables.")
        print("   Please set your API key in .env file to continue.")
        print("\nSkipping QA demo...")
        return
    
    try:
        qa_system = FinancialQASystem()
        print("✓ QA System initialized successfully!")
        
        questions = [
            "2023年Q1的营收是多少？",
            "2023年的全年营收是多少？",
            "2023年Q2的净利润是多少？"
        ]
        
        for i, question in enumerate(questions, 1):
            print(f"\n--- Question {i}: {question} ---")
            result = qa_system.answer_question(question)
            
            if "error" not in result:
                print(f"Answer: {result['answer']}")
                print(f"Sources used: {result['num_sources']}")
            else:
                print(f"Error: {result['error']}")
        
    except Exception as e:
        print(f"Error initializing QA system: {e}")
        print("\nPlease ensure your OpenAI API key is valid.")


def demo_step_3_table_extraction_demo():
    print_header("Step 3: Table Extraction and Quality Demo")
    
    test_table_data = [
        ["", "2023年", "", "2022年", ""],
        ["项目", "Q1", "Q2", "Q1", "Q2"],
        ["收入", "1,000", "1,200", "800", "900"],
        ["成本", "500", "600", "400", "450"],
        ["利润", "500", "600", "400", "450"]
    ]
    
    print("Test Table (with multi-row header):")
    for row in test_table_data:
        print(f"  {row}")
    
    from table_extractor import TableExtractor
    
    dummy_extractor = TableExtractor("dummy.pdf", enable_traceability=False)
    
    processed = dummy_extractor._process_complex_table(test_table_data)
    
    print("\nProcessed Headers:")
    print(f"  {processed['headers']}")
    
    print(f"\nQuality Score: {processed['quality_score']}%")
    
    print("\nConverted to Markdown:")
    print(processed['markdown'])
    
    print("\n✓ Table extraction completed!")
    print("  - Multi-row headers have been merged")
    print("  - Data has been cleaned")
    print("  - Table converted to Markdown format")
    print("  - Quality score calculated")
    
    print("\n=== Markdown Validation Demo ===")
    from vector_store import VectorStore
    vs = VectorStore()
    
    is_valid, msg = vs._validate_markdown_table(processed['markdown'])
    print(f"Table validation: {'✓ PASS' if is_valid else '✗ FAIL'} - {msg}")
    
    print("\n=== Misaligned Column Fix Demo ===")
    malformed_markdown = """| 项目 | 2023 Q1 |
| --- | --- |
| 收入 | 1,000 | 1,500 |
| 成本 | 500 |"""
    
    print("Malformed table (column mismatch):")
    print(malformed_markdown)
    
    is_valid, msg = vs._validate_markdown_table(malformed_markdown)
    print(f"\nBefore cleaning: {msg}")
    
    cleaned = vs._clean_markdown_table(malformed_markdown)
    is_valid_cleaned, msg_cleaned = vs._validate_markdown_table(cleaned)
    
    print(f"\nAfter cleaning: {msg_cleaned}")
    print("\nCleaned table:")
    print(cleaned)


def demo_step_4_traceability_demo():
    print_header("Step 4: Traceability Feature Demo")
    
    print("\n📋 Traceability Features Available:")
    print("  1. Table coordinate capture (bbox) during PDF extraction")
    print("  2. Auto-capture table area screenshots")
    print("  3. Highlight table position on full page")
    print("  4. Store traceability info in vector DB metadata")
    print("  5. Show source locations when answering questions")
    
    print("\n📁 Screenshot Storage Location:")
    print("  ./table_screenshots/")
    print("    - table_page{page}_idx{index}_{hash}.png (table crop)")
    print("    - highlighted_page{page}_{hash}.png (full page with highlight)")
    
    print("\n💡 How to Use Traceability:")
    print("  1. Process PDF: python main.py process your_report.pdf")
    print("  2. Ask question: python main.py ask \"What's Q1 revenue?\"")
    print("  3. Answer will include:")
    print("     - PDF file path")
    print("     - Page number")
    print("     - Table position coordinates")
    print("     - Screenshot file paths")
    
    print("\n✓ Traceability system ready!")
    print("  - PyMuPDF (fitz) for PDF rendering")
    print("  - OpenCV for table highlighting")
    print("  - Automatic screenshot capture during extraction")


def main():
    print_header("Financial PDF QA System - Interactive Demo")
    print("This demo will show you:")
    print("  1. How tables with multi-row headers are extracted and processed")
    print("  2. Markdown table validation and cleaning")
    print("  3. Traceability feature - screenshot capture and source tracking")
    print("  4. How financial data is stored in vector database")
    print("  5. How to ask questions and get sourced answers")
    
    input("\nPress Enter to start the demo...")
    
    demo_step_3_table_extraction_demo()
    
    input("\nPress Enter to continue to traceability demo...")
    
    demo_step_4_traceability_demo()
    
    input("\nPress Enter to continue to vector database demo...")
    
    demo_step_1_load_sample_data()
    
    input("\nPress Enter to continue to QA demo...")
    
    demo_step_2_ask_questions()
    
    print_header("Demo Complete!")
    print("\nNext Steps:")
    print("  1. Copy .env.example to .env and add your OPENAI_API_KEY")
    print("  2. Run 'pip install -r requirements.txt' to install dependencies")
    print("  3. Process a PDF: python main.py process your_report.pdf")
    print("  4. Ask questions: python main.py ask \"2023年Q1的营收是多少？\"")
    print("  5. Answers include TRACEABILITY info: source page, position, screenshots")
    print("\nFor more information, check the source code files.")


if __name__ == "__main__":
    main()
