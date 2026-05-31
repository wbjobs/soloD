import os
from typing import List, Dict, Optional
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import LLMChainExtractor

load_dotenv()


class FinancialQASystem:
    def __init__(
        self,
        persist_directory: str = "./chroma_db",
        collection_name: str = "financial_tables",
        openai_api_key: Optional[str] = None,
        model_name: str = "gpt-3.5-turbo"
    ):
        self.persist_directory = persist_directory
        self.collection_name = collection_name
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        self.model_name = model_name
        
        if not self.openai_api_key:
            raise ValueError("OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass it explicitly.")
        
        self.embeddings = OpenAIEmbeddings(openai_api_key=self.openai_api_key)
        self.llm = ChatOpenAI(
            model_name=self.model_name,
            temperature=0,
            openai_api_key=self.openai_api_key
        )
        
        self.vector_store = None
        self.retriever = None
        self.qa_chain = None
        
        self._init_vector_store()
        self._init_qa_chain()

    def _init_vector_store(self):
        self.vector_store = Chroma(
            collection_name=self.collection_name,
            persist_directory=self.persist_directory,
            embedding_function=self.embeddings
        )
        
        base_retriever = self.vector_store.as_retriever(
            search_type="similarity",
            search_kwargs={"k": 5}
        )
        
        compressor = LLMChainExtractor.from_llm(self.llm)
        self.retriever = ContextualCompressionRetriever(
            base_compressor=compressor,
            base_retriever=base_retriever
        )

    def _init_qa_chain(self):
        template = """
你是一个专业的财务分析师，擅长从财务报表数据中准确回答问题。请根据以下提供的财务表格信息回答问题。

背景信息:
- 这是从PDF财务报表中提取的表格数据，可能包含多行表头和合并单元格
- 表格中的财务数据需要仔细核对，注意单位（如：万元、亿元等）

参考表格数据:
{context}

问题: {question}

回答要求:
1. 基于提供的表格数据进行回答，不要编造数据
2. 如果表格中没有相关数据，请明确说明
3. 回答要简洁明了，重点突出
4. 对于营收类问题，明确指出具体金额和同比/环比变化（如有）
5. 如果数据来自多个表格，请分别说明来源

请给出你的回答:
"""
        
        prompt = ChatPromptTemplate.from_template(template)
        
        self.qa_chain = (
            {"context": self.retriever | self._format_docs, "question": RunnablePassthrough()}
            | prompt
            | self.llm
            | StrOutputParser()
        )

    def _format_docs(self, docs) -> str:
        formatted = []
        for i, doc in enumerate(docs, 1):
            formatted.append(f"\n=== 参考表格 {i} ===\n{doc.page_content}")
        return "\n".join(formatted)

    def answer_question(self, question: str) -> Dict:
        if not self.qa_chain:
            return {"error": "QA chain not initialized"}
        
        retrieved_docs = self.retriever.get_relevant_documents(question)
        
        answer = self.qa_chain.invoke(question)
        
        source_tables = []
        traceability_info = []
        
        for doc in retrieved_docs:
            metadata = doc.metadata
            source_info = {
                "content": doc.page_content,
                "metadata": metadata
            }
            source_tables.append(source_info)
            
            trace_info = self._extract_traceability_from_metadata(metadata)
            if trace_info:
                traceability_info.append(trace_info)
        
        return {
            "question": question,
            "answer": answer,
            "source_tables": source_tables,
            "traceability": traceability_info,
            "num_sources": len(retrieved_docs)
        }

    def _extract_traceability_from_metadata(self, metadata: Dict) -> Optional[Dict]:
        trace_info = {}
        
        if "trace_pdf_path" in metadata and metadata["trace_pdf_path"]:
            trace_info["pdf_path"] = metadata["trace_pdf_path"]
        
        if "trace_page_num" in metadata and metadata["trace_page_num"]:
            trace_info["page_num"] = metadata["trace_page_num"]
        
        if "trace_table_index" in metadata and metadata["trace_table_index"] is not None:
            trace_info["table_index"] = metadata["trace_table_index"]
        
        if "trace_bbox" in metadata and metadata["trace_bbox"]:
            try:
                bbox_str = metadata["trace_bbox"].strip("()")
                bbox = tuple(float(x.strip()) for x in bbox_str.split(","))
                if len(bbox) == 4:
                    trace_info["bbox"] = bbox
            except:
                pass
        
        if "trace_screenshot" in metadata and metadata["trace_screenshot"]:
            trace_info["screenshot_path"] = metadata["trace_screenshot"]
        
        if "trace_highlighted" in metadata and metadata["trace_highlighted"]:
            trace_info["highlighted_path"] = metadata["trace_highlighted"]
        
        return trace_info if trace_info else None

    def answer_revenue_question(self, year: int, quarter: Optional[int] = None) -> Dict:
        if quarter:
            question = f"{year}年第{quarter}季度的营收是多少？"
        else:
            question = f"{year}年的全年营收是多少？"
        
        return self.answer_question(question)

    def add_markdown_tables(self, markdown_tables: List[str], metadatas: Optional[List[Dict]] = None):
        if not markdown_tables:
            return
        
        if metadatas is None:
            metadatas = [{"source": "pdf_financial_table"} for _ in markdown_tables]
        
        ids = [f"table_{i}_{hash(md)}" for i, md in enumerate(markdown_tables)]
        
        self.vector_store.add_texts(
            texts=markdown_tables,
            metadatas=metadatas,
            ids=ids
        )
        
        print(f"Added {len(markdown_tables)} tables to vector store")

    def get_collection_stats(self) -> Dict:
        return {
            "collection_name": self.collection_name,
            "persist_directory": self.persist_directory,
            "model_name": self.model_name
        }

    def clear_collection(self):
        self.vector_store.delete_collection()
        self._init_vector_store()
        print("Collection cleared and reinitialized")
