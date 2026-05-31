const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { create } = require('kubo-rpc-client');
const { Readable } = require('stream');
const crypto = require('crypto');

const app = express();
const PORT = 3001;

app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

const ipfs = create({ url: 'http://127.0.0.1:5001' });

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const uploadedFiles = [];
const hashToCidMap = new Map();
const progressClients = new Map();

const calculateFileHash = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

app.get('/api/progress/:uploadId', (req, res) => {
  const { uploadId } = req.params;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  progressClients.set(uploadId, res);

  req.on('close', () => {
    progressClients.delete(uploadId);
  });
});

const sendProgress = (uploadId, progress) => {
  const client = progressClients.get(uploadId);
  if (client) {
    client.write(`data: ${JSON.stringify(progress)}\n\n`);
  }
};

app.post('/api/upload', upload.single('file'), async (req, res) => {
  const uploadId = req.query.uploadId || Date.now().toString();
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    const totalSize = file.size;

    const fileHash = calculateFileHash(file.buffer);

    if (hashToCidMap.has(fileHash)) {
      const existingCid = hashToCidMap.get(fileHash);
      const existingFile = uploadedFiles.find(f => f.cid === existingCid);
      
      sendProgress(uploadId, {
        progress: 100,
        uploaded: totalSize,
        total: totalSize,
        completed: true,
        cid: existingCid,
        duplicate: true
      });

      setTimeout(() => {
        progressClients.delete(uploadId);
      }, 1000);

      return res.json({
        success: true,
        cid: existingCid,
        filename: existingFile ? existingFile.filename : file.originalname,
        size: file.size,
        duplicate: true,
        message: '文件已存在，无需重复上传'
      });
    }

    const result = await ipfs.add({
      path: file.originalname,
      content: file.buffer
    }, {
      progress: (bytes) => {
        const progress = Math.round((bytes / totalSize) * 100);
        sendProgress(uploadId, {
          progress: progress,
          uploaded: bytes,
          total: totalSize
        });
      }
    });

    const cid = result.cid.toString();
    
    const fileRecord = {
      cid: cid,
      filename: file.originalname,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      hash: fileHash
    };
    
    uploadedFiles.push(fileRecord);
    hashToCidMap.set(fileHash, cid);

    sendProgress(uploadId, {
      progress: 100,
      uploaded: totalSize,
      total: totalSize,
      completed: true,
      cid: cid
    });

    setTimeout(() => {
      progressClients.delete(uploadId);
    }, 1000);

    res.json({
      success: true,
      cid: cid,
      filename: file.originalname,
      size: file.size
    });
  } catch (error) {
    console.error('Upload error:', error);
    sendProgress(uploadId, {
      progress: 0,
      error: error.message
    });
    res.status(500).json({ 
      error: 'Failed to upload file to IPFS',
      details: error.message 
    });
  }
});

app.get('/api/file/:cid', async (req, res) => {
  try {
    const { cid } = req.params;
    
    if (!cid || cid === 'undefined' || cid === 'null' || cid.length < 10) {
      return res.status(400).json({ error: 'Invalid CID' });
    }

    const chunks = [];
    for await (const chunk of ipfs.cat(cid)) {
      chunks.push(chunk);
    }
    
    const content = Buffer.concat(chunks);
    
    const fileInfo = uploadedFiles.find(f => f.cid === cid);
    
    const filename = fileInfo ? fileInfo.filename : cid;
    const safeFilename = encodeURIComponent(filename).replace(/['()]/g, escape);
    
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${safeFilename}`);
    res.setHeader('Content-Length', content.length);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    
    res.send(content);
  } catch (error) {
    console.error('Read error:', error);
    res.status(500).json({ 
      error: 'Failed to read file from IPFS',
      details: error.message 
    });
  }
});

app.get('/api/files', (req, res) => {
  res.json({
    success: true,
    files: uploadedFiles
  });
});

app.delete('/api/file/:cid', (req, res) => {
  const { cid } = req.params;
  const index = uploadedFiles.findIndex(f => f.cid === cid);
  
  if (index !== -1) {
    const file = uploadedFiles[index];
    if (file.hash) {
      hashToCidMap.delete(file.hash);
    }
    uploadedFiles.splice(index, 1);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.listen(PORT, () => {
  console.log(`IPFS Gateway Backend running on http://localhost:${PORT}`);
  console.log('Make sure IPFS daemon is running on http://127.0.0.1:5001');
  console.log('Progress SSE endpoint: /api/progress/:uploadId');
  console.log('File deduplication enabled (SHA-256)');
});
