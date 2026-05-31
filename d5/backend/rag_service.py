from typing import List, Dict, Optional, Deque
from collections import deque
from langchain_openai import ChatOpenAI
from langchain.schema import HumanMessage, AIMessage, BaseMessage
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from config import settings
from vector_store import vector_store_service
import json
import os


class ConversationMemory:
    def __init__(self, max_window_size: int = 6):
        self.max_window_size = max_window_size
        self.conversations: Dict[str, Deque[Dict[str, str]]] = {}

    def add_message(self, session_id: str, role: str, content: str):
        if session_id not in self.conversations:
            self.conversations[session_id] = deque(maxlen=self.max_window_size)
        self.conversations[session_id].append({"role": role, "content": content})

    def get_history(self, session_id: str) -> List[Dict[str, str]]:
        if session_id not in self.conversations:
            return []
        return list(self.conversations[session_id])

    def set_window_size(self, size: int):
        self.max_window_size = size
        for session_id in self.conversations:
            self.conversations[session_id] = deque(
                list(self.conversations[session_id])[-size:],
                maxlen=size
            )

    def clear_session(self, session_id: str):
        if session_id in self.conversations:
            del self.conversations[session_id]


class FeedbackManager:
    def __init__(self, feedback_file: str = "feedback_data.json"):
        self.feedback_file = feedback_file
        self.feedbacks: List[Dict] = []
        self._load_feedbacks()

    def _load_feedbacks(self):
        if os.path.exists(self.feedback_file):
            try:
                with open(self.feedback_file, 'r', encoding='utf-8') as f:
                    self.feedbacks = json.load(f)
            except:
                self.feedbacks = []

    def _save_feedbacks(self):
        with open(self.feedback_file, 'w', encoding='utf-8') as f:
            json.dump(self.feedbacks, f, ensure_ascii=False, indent=2)

    def add_feedback(self, session_id: str, question: str, answer: str,
                    rating: int, comment: str = "", sources: List = None):
        feedback = {
            "session_id": session_id,
            "question": question,
            "answer": answer,
            "rating": rating,
            "comment": comment,
            "sources": sources or [],
            "timestamp": str(os.times())
        }
        self.feedbacks.append(feedback)
        self._save_feedbacks()

    def get_statistics(self) -> Dict:
        if not self.feedbacks:
            return {"total": 0, "avg_rating": 0, "good_count": 0, "bad_count": 0}
        
        total = len(self.feedbacks)
        avg_rating = sum(f["rating"] for f in self.feedbacks) / total
        good_count = sum(1 for f in self.feedbacks if f["rating"] >= 4)
        bad_count = sum(1 for f in self.feedbacks if f["rating"] <= 2)
        
        return {
            "total": total,
            "avg_rating": round(avg_rating, 2),
            "good_count": good_count,
            "bad_count": bad_count
        }


class RAGService:
    def __init__(self):
        self.llm = ChatOpenAI(
            model="gpt-3.5-turbo",
            temperature=0.1,
            openai_api_key=settings.OPENAI_API_KEY,
            openai_api_base=settings.OPENAI_BASE_URL
        )
        self.retriever = vector_store_service.vector_store.as_retriever(
            search_kwargs={"k": 5}
        )
        self.memory = ConversationMemory(max_window_size=6)
        self.feedback_manager = FeedbackManager()
        self._setup_chain()

    def _setup_chain(self):
        system_prompt = (
            "你是一个基于知识库的智能助手，必须严格基于提供的上下文信息回答问题。\n\n"
            "重要规则：\n"
            "1. 只使用上下文中明确提到的信息进行回答\n"
            "2. 如果上下文信息中没有相关内容，必须回答："
            '"抱歉，根据知识库中的信息，我无法回答这个问题。"'
            "\n3. 绝对不能编造或推断知识库之外的信息\n"
            "4. 如果上下文信息相互矛盾，请指出信息存在冲突\n"
            "5. 回答要清晰、准确，引用原文相关内容\n\n"
            "上下文信息：\n{context}"
        )

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}")
        ])

        question_answer_chain = create_stuff_documents_chain(self.llm, prompt)
        self.chain = create_retrieval_chain(self.retriever, question_answer_chain)

    def chat(self, question: str, session_id: str = "default",
             chat_history: Optional[List[Dict[str, str]]] = None) -> Dict:
        if chat_history is None:
            chat_history = self.memory.get_history(session_id)

        history_messages = self._convert_to_messages(chat_history)
        
        result = self.chain.invoke({
            "input": question,
            "chat_history": history_messages
        })

        answer = result["answer"]
        sources = self._format_sources(result["context"])

        self.memory.add_message(session_id, "human", question)
        self.memory.add_message(session_id, "ai", answer)

        return {
            "answer": answer,
            "sources": sources,
            "session_id": session_id
        }

    def _convert_to_messages(self, chat_history: List[Dict[str, str]]) -> List[BaseMessage]:
        messages = []
        for msg in chat_history:
            if msg["role"] == "human":
                messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "ai":
                messages.append(AIMessage(content=msg["content"]))
        return messages

    def _format_sources(self, documents) -> List[Dict]:
        sources = []
        seen = set()
        for doc in documents:
            source_id = doc.metadata.get("source_id", "")
            page = doc.metadata.get("page", 0)
            filename = doc.metadata.get("source", "").split("\\")[-1].split("/")[-1]
            key = f"{source_id}_{page}"
            
            if key not in seen:
                seen.add(key)
                sources.append({
                    "source_id": source_id,
                    "filename": filename,
                    "page": page,
                    "content": doc.page_content[:300] + "..." if len(doc.page_content) > 300 else doc.page_content
                })
        return sources

    def set_memory_window_size(self, size: int):
        self.memory.set_window_size(size)

    def clear_conversation(self, session_id: str):
        self.memory.clear_session(session_id)

    def add_feedback(self, session_id: str, question: str, answer: str,
                    rating: int, comment: str = "", sources: List = None):
        self.feedback_manager.add_feedback(
            session_id, question, answer, rating, comment, sources
        )

    def get_feedback_stats(self):
        return self.feedback_manager.get_statistics()


rag_service = RAGService()
