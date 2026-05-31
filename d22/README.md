# 情感分析后端API服务

基于人脸表情图像和文本进行情感分析的纯后端API服务。

## 架构概述

- **FastAPI**: Web框架，提供REST API
- **Redis**: 任务队列管理，支持异步任务处理
- **MongoDB**: 结果存储
- **Transformers**: 预训练模型（表情识别+情感分类）

## 项目结构

```
├── main.py              # 主应用入口
├── api_routes.py        # API路由定义
├── redis_client.py      # Redis客户端
├── mongodb_store.py     # MongoDB存储
├── model_loader.py      # 模型加载器
├── task_worker.py       # 任务处理Worker
└── requirements.txt     # 依赖包
```

## 安装依赖

```bash
pip install -r requirements.txt
```

## 前置要求

1. **Redis**: 运行在 `localhost:6379`
2. **MongoDB**: 运行在 `localhost:27017`

## 启动服务

```bash
python main.py
```

服务将在 `http://localhost:8000` 启动。

## API接口

### 1. 提交任务

**POST** `/task`

提交图像和文本进行情感分析。

请求格式: `multipart/form-data`

参数:
- `text`: 短文本（用户语句）
- `image`: 人脸表情图像文件

响应:
```json
{
  "task_id": "uuid-string",
  "status": "pending",
  "message": "Task submitted successfully"
}
```

### 2. 查询结果

**GET** `/result/{task_id}`

查询任务处理结果。

响应（处理中）:
```json
{
  "task_id": "uuid-string",
  "status": "pending",
  "message": "Task is still processing"
}
```

响应（完成）:
```json
{
  "task_id": "uuid-string",
  "status": "completed",
  "result": {
    "final_emotion": "positive",
    "final_score": 0.85,
    "text_analysis": {
      "emotion": "positive",
      "score": 0.9
    },
    "face_analysis": {
      "emotion": "neutral",
      "score": 0.8
    }
  }
}
```

### 3. 健康检查

**GET** `/health`

检查服务状态。

响应:
```json
{
  "status": "healthy"
}
```

## 使用示例

使用curl提交任务:

```bash
curl -X POST "http://localhost:8000/task" \
  -F "text=今天天气真好！" \
  -F "image=@face.jpg"
```

查询结果:

```bash
curl "http://localhost:8000/result/{task_id}"
```
