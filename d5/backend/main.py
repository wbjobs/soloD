from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uuid
import os
from pathlib import Path

from config import settings
from document_parser import DocumentParser
from vector_store import vector_store_service
from rag_service import rag_service

app = FastAPI(title="本地知识库问答系统", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    question: str
    session_id: str = "default"
    chat_history: Optional[List[dict]] = None


class FeedbackRequest(BaseModel):
    session_id: str
    question: str
    answer: str
    rating: int
    comment: str = ""
    sources: List = []


class MemorySettingRequest(BaseModel):
    window_size: int


class DocumentInfo(BaseModel):
    source_id: str
    filename: str
    chunk_count: int


@app.get("/")
async def root():
    return {
        "message": "本地知识库问答系统 API",
        "version": "1.1.0",
        "features": [
            "文档上传解析",
            "向量存储检索",
            "RAG问答",
            "记忆管理",
            "增量更新",
            "反馈评分"
        ]
    }


@app.get("/documents", response_model=List[DocumentInfo])
async def list_documents():
    return vector_store_service.get_all_documents_info()


@app.get("/documents/{source_id}")
async def get_document(source_id: str):
    doc = vector_store_service.get_document_by_id(source_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    return doc


@app.get("/documents/stats")
async def get_document_stats():
    return vector_store_service.get_stats()


@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="没有文件名")
    
    allowed_extensions = {'.pdf', '.docx', '.txt'}
    file_ext = Path(file.filename).suffix.lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式。仅支持: {', '.join(allowed_extensions)}"
        )

    source_id = str(uuid.uuid4())
    file_path = os.path.join(settings.UPLOAD_DIRECTORY, f"{source_id}_{file.filename}")
    
    try:
        content = await file.read()
        
        if len(content) > settings.MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="文件过大，最大支持10MB")
        
        with open(file_path, "wb") as f:
            f.write(content)
        
        documents = DocumentParser.parse(file_path)
        for doc in documents:
            doc.metadata["source"] = file.filename
        
        vector_store_service.add_documents(documents, source_id, file.filename)
        
        return {
            "success": True,
            "source_id": source_id,
            "filename": file.filename,
            "chunk_count": len(documents),
            "message": "文档上传成功并已向量化"
        }
    
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"处理文件失败: {str(e)}")


@app.put("/documents/{source_id}")
async def update_document(source_id: str, file: UploadFile = File(...)):
    existing_doc = vector_store_service.get_document_by_id(source_id)
    if not existing_doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    file_path = os.path.join(settings.UPLOAD_DIRECTORY, f"{source_id}_{file.filename}")
    
    try:
        content = await file.read()
        if len(content) > settings.MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="文件过大，最大支持10MB")
        
        with open(file_path, "wb") as f:
            f.write(content)
        
        documents = DocumentParser.parse(file_path)
        for doc in documents:
            doc.metadata["source"] = file.filename
        
        vector_store_service.update_document(source_id, documents, file.filename)
        
        return {
            "success": True,
            "source_id": source_id,
            "filename": file.filename,
            "chunk_count": len(documents),
            "message": "文档更新成功"
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新文档失败: {str(e)}")


@app.delete("/documents/{source_id}")
async def delete_document(source_id: str):
    try:
        vector_store_service.delete_by_source_id(source_id)
        
        for file in os.listdir(settings.UPLOAD_DIRECTORY):
            if file.startswith(f"{source_id}_"):
                os.remove(os.path.join(settings.UPLOAD_DIRECTORY, file))
        
        return {"success": True, "message": "文档删除成功"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除文档失败: {str(e)}")


@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        result = rag_service.chat(
            request.question,
            request.session_id,
            request.chat_history
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"问答失败: {str(e)}")


@app.post("/feedback")
async def submit_feedback(feedback: FeedbackRequest):
    try:
        rag_service.add_feedback(
            session_id=feedback.session_id,
            question=feedback.question,
            answer=feedback.answer,
            rating=feedback.rating,
            comment=feedback.comment,
            sources=feedback.sources
        )
        return {"success": True, "message": "反馈已提交"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"提交反馈失败: {str(e)}")


@app.get("/feedback/stats")
async def get_feedback_statistics():
    return rag_service.get_feedback_stats()


@app.post("/memory/window-size")
async def set_memory_window_size(request: MemorySettingRequest):
    if request.window_size < 2 or request.window_size > 20:
        raise HTTPException(status_code=400, detail="窗口大小必须在2-20之间")
    rag_service.set_memory_window_size(request.window_size)
    return {"success": True, "window_size": request.window_size}


@app.delete("/memory/{session_id}")
async def clear_conversation_memory(session_id: str):
    rag_service.clear_conversation(session_id)
    return {"success": True, "message": f"会话 {session_id} 的记忆已清除"}


@app.delete("/clear-all")
async def clear_all():
    try:
        vector_store_service.clear_all()
        
        for file in os.listdir(settings.UPLOAD_DIRECTORY):
            file_path = os.path.join(settings.UPLOAD_DIRECTORY, file)
            if os.path.isfile(file_path):
                os.remove(file_path)
        
        return {"success": True, "message": "所有数据已清除"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清除数据失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
