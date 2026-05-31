import chromadb
from chromadb.config import Settings
from typing import List, Dict, Optional, Tuple
import hashlib
import uuid
import re


class VectorStore:
    def __init__(self, persist_directory: str = "./chroma_db", collection_name: str = "financial_tables"):
        self.persist_directory = persist_directory
        self.collection_name = collection_name
        self.client = None
        self.collection = None
        self._init_client()

    def _init_client(self):
        self.client = chromadb.PersistentClient(
            path=self.persist_directory,
            settings=Settings(anonymized_telemetry=False)
        )
        self._get_or_create_collection()

    def _get_or_create_collection(self):
        try:
            self.collection = self.client.get_collection(self.collection_name)
        except Exception:
            self.collection = self.client.create_collection(
                name=self.collection_name,
                metadata={"description": "Financial tables from PDF reports in markdown format"},
                embedding_function=None
            )

    def _generate_id(self, content: str) -> str:
        hash_obj = hashlib.md5(content.encode())
        return f"table_{hash_obj.hexdigest()[:8]}_{uuid.uuid4().hex[:8]}"

    def _parse_markdown_table(self, markdown_table: str) -> Tuple[List[str], List[List[str]]]:
        lines = markdown_table.strip().split('\n')
        lines = [line.strip() for line in lines if line.strip()]
        
        if len(lines) < 2:
            return [], []
        
        headers = self._parse_markdown_row(lines[0])
        
        if len(lines) >= 2:
            separator_line = lines[1]
            if not re.match(r'^[\|\s\-\:]+$', separator_line):
                return [], []
        
        data = []
        for line in lines[2:]:
            row = self._parse_markdown_row(line)
            if row:
                data.append(row)
        
        return headers, data

    def _parse_markdown_row(self, line: str) -> List[str]:
        line = line.strip()
        if line.startswith('|') and line.endswith('|'):
            line = line[1:-1]
        
        cells = line.split('|')
        cells = [cell.strip() for cell in cells]
        
        return cells

    def _validate_markdown_table(self, markdown_table: str) -> Tuple[bool, str]:
        if not markdown_table or not markdown_table.strip():
            return False, "Empty table"
        
        headers, data = self._parse_markdown_table(markdown_table)
        
        if not headers:
            return False, "No headers found"
        
        if len(headers) < 2:
            return False, f"Too few columns: {len(headers)}"
        
        for i, row in enumerate(data):
            if len(row) != len(headers):
                return False, f"Row {i} has {len(row)} columns, expected {len(headers)}"
        
        return True, "Valid"

    def _clean_markdown_table(self, markdown_table: str) -> str:
        headers, data = self._parse_markdown_table(markdown_table)
        
        if not headers:
            return markdown_table
        
        num_cols = len(headers)
        
        cleaned_data = []
        for row in data:
            if len(row) < num_cols:
                cleaned_row = row + [''] * (num_cols - len(row))
            elif len(row) > num_cols:
                cleaned_row = row[:num_cols]
            else:
                cleaned_row = row
            cleaned_data.append(cleaned_row)
        
        return self._build_markdown_table(headers, cleaned_data)

    def _build_markdown_table(self, headers: List[str], data: List[List[str]]) -> str:
        if not headers:
            return ""
        
        lines = []
        
        header_line = '| ' + ' | '.join(headers) + ' |'
        lines.append(header_line)
        
        separator_line = '| ' + ' | '.join(['---'] * len(headers)) + ' |'
        lines.append(separator_line)
        
        for row in data:
            row_line = '| ' + ' | '.join(str(cell) if cell else '' for cell in row) + ' |'
            lines.append(row_line)
        
        return '\n'.join(lines)

    def _create_enhanced_document(self, markdown_table: str, table_metadata: Dict) -> str:
        is_valid, validation_msg = self._validate_markdown_table(markdown_table)
        
        if not is_valid:
            cleaned_markdown = self._clean_markdown_table(markdown_table)
            is_valid_cleaned, _ = self._validate_markdown_table(cleaned_markdown)
            if is_valid_cleaned:
                markdown_table = cleaned_markdown
        
        doc_parts = []
        
        if "page" in table_metadata:
            doc_parts.append(f"Page: {table_metadata['page']}")
        
        if "method" in table_metadata:
            doc_parts.append(f"Extraction Method: {table_metadata['method']}")
        
        if "quality_score" in table_metadata:
            doc_parts.append(f"Quality Score: {table_metadata['quality_score']}%")
        
        if "headers" in table_metadata:
            headers_str = ", ".join(table_metadata["headers"])
            doc_parts.append(f"Headers: {headers_str}")
        
        if "traceability" in table_metadata and table_metadata["traceability"]:
            trace = table_metadata["traceability"]
            if "page_num" in trace:
                doc_parts.append(f"Source Page: {trace['page_num']}")
            if "bbox" in trace:
                doc_parts.append(f"Table Position: {trace['bbox']}")
        
        doc_parts.append("\nTable Content:")
        doc_parts.append(markdown_table)
        
        return "\n".join(doc_parts)

    def add_tables(self, tables_data: List[Dict]):
        if not tables_data:
            print("No tables to add to vector store")
            return
        
        documents = []
        metadatas = []
        ids = []
        
        for table in tables_data:
            markdown = table.get("markdown", "")
            if not markdown:
                continue
            
            enhanced_doc = self._create_enhanced_document(markdown, table)
            doc_id = self._generate_id(enhanced_doc)
            
            metadata = {
                "page": table.get("page", 0),
                "table_index": table.get("table_index", 0),
                "method": table.get("method", ""),
                "num_rows": len(table.get("data", [])),
                "num_cols": len(table.get("headers", [])),
                "headers": ", ".join(table.get("headers", [])),
                "source": "pdf_financial_table",
                "quality_score": table.get("quality_score", 0)
            }
            
            traceability = table.get("traceability")
            if traceability:
                metadata["trace_pdf_path"] = traceability.get("pdf_path", "")
                metadata["trace_page_num"] = traceability.get("page_num", 0)
                metadata["trace_table_index"] = traceability.get("table_index", 0)
                metadata["trace_bbox"] = str(traceability.get("bbox", ""))
                metadata["trace_screenshot"] = traceability.get("screenshot_path", "")
                metadata["trace_highlighted"] = traceability.get("highlighted_path", "")
            
            documents.append(enhanced_doc)
            metadatas.append(metadata)
            ids.append(doc_id)
        
        if documents:
            self.collection.add(
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )
            print(f"Added {len(documents)} tables to vector store with traceability info")

    def add_markdown_tables(self, markdown_tables: List[str], source_pdf: str = None):
        documents = []
        metadatas = []
        ids = []
        
        for idx, markdown in enumerate(markdown_tables):
            if not markdown:
                continue
            
            doc_id = self._generate_id(markdown)
            
            metadata = {
                "table_index": idx,
                "source": source_pdf if source_pdf else "pdf_financial_table",
                "table_type": "markdown"
            }
            
            documents.append(markdown)
            metadatas.append(metadata)
            ids.append(doc_id)
        
        if documents:
            self.collection.add(
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )
            print(f"Added {len(documents)} markdown tables to vector store")

    def search(self, query: str, n_results: int = 5, filter: Dict = None) -> Dict:
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results,
            where=filter
        )
        return results

    def search_relevant_tables(self, question: str, n_results: int = 5) -> List[str]:
        search_results = self.search(question, n_results=n_results)
        
        relevant_tables = []
        if search_results and 'documents' in search_results:
            for doc_list in search_results['documents']:
                relevant_tables.extend(doc_list)
        
        return relevant_tables

    def get_all_documents(self) -> List[Dict]:
        results = self.collection.get()
        documents = []
        
        if results:
            ids = results.get('ids', [])
            docs = results.get('documents', [])
            metadatas = results.get('metadatas', [])
            
            for i in range(len(ids)):
                documents.append({
                    'id': ids[i],
                    'document': docs[i] if i < len(docs) else '',
                    'metadata': metadatas[i] if i < len(metadatas) else {}
                })
        
        return documents

    def clear_collection(self):
        try:
            self.client.delete_collection(self.collection_name)
            self._get_or_create_collection()
            print("Collection cleared")
        except Exception as e:
            print(f"Error clearing collection: {e}")

    def get_collection_stats(self) -> Dict:
        count = self.collection.count()
        return {
            "collection_name": self.collection_name,
            "total_documents": count,
            "persist_directory": self.persist_directory
        }
