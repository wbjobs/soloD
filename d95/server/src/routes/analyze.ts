import { Router, Request, Response } from 'express';
import multer from 'multer';
import { XmlParserService } from '../services/xmlParser';
import { OllamaService } from '../services/ollama';

const router = Router();
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/xml' || file.originalname.endsWith('.xml')) {
      cb(null, true);
    } else {
      cb(new Error('只支持XML文件'));
    }
  }
});

const xmlParser = new XmlParserService();
const ollamaService = new OllamaService();

setInterval(() => {
  ollamaService.clearOldSessions(3600000);
}, 60000);

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传文件' });
    }

    const xmlContent = req.file.buffer.toString('utf-8');
    let scanResult;
    
    try {
      scanResult = await xmlParser.parseNmapXml(xmlContent);
    } catch (parseError) {
      return res.status(400).json({ 
        error: 'XML解析失败',
        details: parseError instanceof Error ? parseError.message : String(parseError)
      });
    }

    if (scanResult.hosts.length === 0) {
      return res.status(400).json({ error: '未能解析到有效的扫描结果' });
    }

    console.log(`解析完成: 发现 ${scanResult.hosts.length} 台主机, ${scanResult.openPorts} 个开放端口`);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    try {
      const session = ollamaService.createSession(scanResult);
      
      res.setHeader('X-Session-Id', session.id);
      console.log(`创建会话: ${session.id}, 当前会话数: ${ollamaService.getSessionCount()}`);

      const stream = ollamaService.analyzeScanResult(scanResult);

      for await (const chunk of stream) {
        if (chunk) {
          res.write(chunk);
          if (typeof res.flush === 'function') {
            res.flush();
          }
        }
      }
    } catch (streamError) {
      console.error('流式输出错误:', streamError);
      if (!res.writableEnded) {
        res.write('\n\n[错误] 生成报告时发生问题，请重试');
      }
    }

    res.end();
  } catch (error) {
    console.error('分析错误:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: '分析过程中发生错误',
        details: error instanceof Error ? error.message : String(error)
      });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: '缺少sessionId' });
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: '消息内容不能为空' });
    }

    const session = ollamaService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: '会话不存在或已过期' });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    console.log(`收到对话请求: 会话 ${sessionId}, 消息: "${message.substring(0, 50)}..."`);

    try {
      const stream = ollamaService.chat(sessionId, message);

      for await (const chunk of stream) {
        if (chunk) {
          res.write(chunk);
          if (typeof res.flush === 'function') {
            res.flush();
          }
        }
      }
    } catch (streamError) {
      console.error('对话流式输出错误:', streamError);
      if (!res.writableEnded) {
        res.write('\n\n[错误] 生成回复时发生问题，请重试');
      }
    }

    res.end();
  } catch (error) {
    console.error('对话错误:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: '对话过程中发生错误',
        details: error instanceof Error ? error.message : String(error)
      });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

router.delete('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const deleted = ollamaService.deleteSession(sessionId);
    
    if (deleted) {
      console.log(`删除会话: ${sessionId}, 当前会话数: ${ollamaService.getSessionCount()}`);
      res.json({ success: true, message: '会话已删除' });
    } else {
      res.status(404).json({ error: '会话不存在' });
    }
  } catch (error) {
    res.status(500).json({ error: '删除会话失败' });
  }
});

router.get('/sessions', async (_req: Request, res: Response) => {
  try {
    const count = ollamaService.getSessionCount();
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: '获取会话数失败' });
  }
});

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const ollamaConnected = await ollamaService.checkConnection();
    const sessionCount = ollamaService.getSessionCount();
    res.json({
      status: 'ok',
      ollama: ollamaConnected ? 'connected' : 'disconnected',
      sessionCount,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      ollama: 'disconnected',
      error: String(error),
    });
  }
});

export default router;
