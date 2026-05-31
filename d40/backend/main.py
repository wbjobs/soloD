from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from paddleocr import PaddleOCR
from PIL import Image
import io
import numpy as np
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="财务票据OCR识别服务")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    ocr = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
    logger.info("PaddleOCR初始化成功")
except Exception as e:
    logger.error(f"PaddleOCR初始化失败: {e}")
    ocr = None

def normalize_bbox(box):
    """标准化边界框格式
    [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] -> [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
    """
    try:
        if not box or len(box) < 4:
            return [[0, 0], [0, 0], [0, 0], [0, 0]]
        return [[int(coord) for coord in point] for point in box[:4]]
    except Exception as e:
        logger.warning(f"bbox标准化失败: {e}")
        return [[0, 0], [0, 0], [0, 0], [0, 0]]

def create_ocr_result(text, confidence, bbox):
    """创建标准化的OCR结果对象"""
    return {
        "text": str(text) if text else "",
        "confidence": float(confidence) if confidence is not None else 0.0,
        "bbox": normalize_bbox(bbox)
    }

@app.post("/api/ocr")
async def ocr_endpoint(file: UploadFile = File(...)):
    try:
        if ocr is None:
            raise HTTPException(status_code=500, detail="OCR引擎未初始化")
        
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="请上传图片文件")
        
        contents = await file.read()
        
        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="上传文件为空")
        
        try:
            image = Image.open(io.BytesIO(contents))
            image_np = np.array(image)
        except Exception as e:
            logger.error(f"图片解析失败: {e}")
            raise HTTPException(status_code=400, detail="无法解析图片文件，请检查文件格式")
        
        try:
            result = ocr.ocr(image_np, cls=True)
        except Exception as e:
            logger.error(f"OCR识别失败: {e}")
            raise HTTPException(status_code=500, detail="OCR识别处理失败")
        
        ocr_results = []
        if result and result[0]:
            for line in result[0]:
                try:
                    box = line[0]
                    text_info = line[1]
                    ocr_results.append(create_ocr_result(
                        text=text_info[0],
                        confidence=text_info[1],
                        bbox=box
                    ))
                except Exception as e:
                    logger.warning(f"处理OCR结果行失败: {e}")
                    continue
        
        logger.info(f"OCR识别完成，共识别到 {len(ocr_results)} 行文本")
        
        return {
            "success": True,
            "results": ocr_results,
            "engine": "paddleocr",
            "count": len(ocr_results)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OCR接口异常: {e}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "invoice-ocr-backend"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
