const API_BASE_URL = 'http://localhost:3001/api';

export interface AnalysisCallbacks {
  onChunk: (chunk: string) => void;
  onComplete: (sessionId?: string) => void;
  onError: (error: string) => void;
  onProgress?: (progress: number) => void;
}

export interface ChatCallbacks {
  onChunk: (chunk: string) => void;
  onComplete: () => void;
  onError: (error: string) => void;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export async function analyzeScanFile(
  file: File,
  callbacks: AnalysisCallbacks
): Promise<void> {
  const { onChunk, onComplete, onError } = callbacks;

  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/analyze`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorMsg = `请求失败: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
        if (errorData.details) {
          errorMsg += ` - ${errorData.details}`;
        }
      } catch {
        // 忽略JSON解析错误
      }
      throw new Error(errorMsg);
    }

    const sessionId = response.headers.get('X-Session-Id') || undefined;

    const reader = response.body?.getReader();
    const decoder = new TextDecoder('utf-8');

    if (!reader) {
      throw new Error('无法读取响应流');
    }

    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        onComplete(sessionId);
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      receivedLength += value.length;
      
      if (chunk) {
        onChunk(chunk);
      }
    }
  } catch (error) {
    console.error('分析错误:', error);
    onError(error instanceof Error ? error.message : '未知错误');
  }
}

export async function chatWithAI(
  sessionId: string,
  message: string,
  callbacks: ChatCallbacks
): Promise<void> {
  const { onChunk, onComplete, onError } = callbacks;

  try {
    const response = await fetch(`${API_BASE_URL}/analyze/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, message }),
    });

    if (!response.ok) {
      let errorMsg = `请求失败: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch {
        // 忽略JSON解析错误
      }
      throw new Error(errorMsg);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder('utf-8');

    if (!reader) {
      throw new Error('无法读取响应流');
    }

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        onComplete();
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      
      if (chunk) {
        onChunk(chunk);
      }
    }
  } catch (error) {
    console.error('对话错误:', error);
    onError(error instanceof Error ? error.message : '未知错误');
  }
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/analyze/session/${sessionId}`, {
      method: 'DELETE',
    });
    return response.ok;
  } catch (error) {
    console.error('删除会话失败:', error);
    return false;
  }
}

export async function checkHealth(): Promise<{ 
  status: string; 
  ollama?: string;
  service?: string;
  sessionCount?: number;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/analyze/health`);
    return await response.json();
  } catch {
    return { status: 'error', ollama: 'disconnected' };
  }
}

export async function checkServerHealth(): Promise<{ 
  status: string; 
  timestamp: string;
  service: string;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return await response.json();
  } catch {
    return { status: 'error', timestamp: '', service: '' };
  }
}
