from typing import List, Optional
from pathlib import Path
from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from config import settings
import os
import shutil
import json


class VectorStoreService:
    def __init__(self):
        self.embeddings = OpenAIEmbeddings(
            openai_api_key=settings.OPENAI_API_KEY,
            openai_api_base=settings.OPENAI_BASE_URL
        )
        self.persist_directory = settings.CHROMA_PERSIST_DIRECTORY
        self.vector_store = Chroma(
            persist_directory=self.persist_directory,
            embedding_function=self.embeddings
        )
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP
        )
        self.metadata_file = os.path.join(self.persist_directory, "document_metadata.json")
        self.document_metadata = self._load_document_metadata()

    def _load_document_metadata(self) -> dict:
        if os.path.exists(self.metadata_file):
            try:
                with open(self.metadata_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                return {}
        return {}

    def _save_document_metadata(self):
        with open(self.metadata_file, 'w', encoding='utf-8') as f:
            json.dump(self.document_metadata, f, ensure_ascii=False, indent=2)

    def add_documents(self, documents: List[Document], source_id: str,
                     filename: str = None) -> List[str]:
        splits = self.text_splitter.split_documents(documents)
        for split in splits:
            split.metadata["source_id"] = source_id
        
        ids = self.vector_store.add_documents(splits)
        
        self.document_metadata[source_id] = {
            "source_id": source_id,
            "filename": filename or source_id,
            "chunk_count": len(splits),
            "total_pages": len(documents)
        }
        self._save_document_metadata()
        
        return ids

    def similarity_search(self, query: str, k: int = None,
                         filter: Optional[dict] = None) -> List[Document]:
        k = k or settings.TOP_K
        return self.vector_store.similarity_search(query, k=k, filter=filter)

    def delete_by_source_id(self, source_id: str):
        self.vector_store.delete(where={"source_id": source_id})
        if source_id in self.document_metadata:
            del self.document_metadata[source_id]
            self._save_document_metadata()

    def get_all_documents_info(self) -> List[dict]:
        return list(self.document_metadata.values())

    def get_document_by_id(self, source_id: str) -> Optional[dict]:
        return self.document_metadata.get(source_id)

    def update_document(self, source_id: str, documents: List[Document],
                       filename: str = None):
        self.delete_by_source_id(source_id)
        return self.add_documents(documents, source_id, filename)

    def clear_all(self):
        if os.path.exists(self.persist_directory):
            shutil.rmtree(self.persist_directory)
            os.makedirs(self.persist_directory)
        self.vector_store = Chroma(
            persist_directory=self.persist_directory,
            embedding_function=self.embeddings
        )
        self.document_metadata = {}
        self._save_document_metadata()

    def get_stats(self) -> dict:
        return {
            "total_documents": len(self.document_metadata),
            "total_chunks": sum(meta["chunk_count"] for meta in self.document_metadata.values()),
            "documents": list(self.document_metadata.values())
        }


vector_store_service = VectorStoreService()
