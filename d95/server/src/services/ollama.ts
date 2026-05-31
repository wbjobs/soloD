import { Ollama } from 'ollama';
import { ScanResult, ChatSession, ChatMessage } from '../types';

export class OllamaService {
  private client: Ollama;
  private model: string = 'llama3';
  private sessions: Map<string, ChatSession> = new Map();

  constructor() {
    this.client = new Ollama({
      host: 'http://localhost:11434',
    });
  }

  private buildSystemPrompt(): string {
    return `你是一名资深网络安全专家，擅长安全审计和漏洞分析。
你的职责是：
1. 分析Nmap扫描结果，识别潜在的安全漏洞
2. 提供专业的安全建议和修复方案
3. 用通俗易懂的语言解释复杂的安全概念
4. 参考CVE标准和最佳实践

回答要求：
- 使用中文回答
- 语言专业、准确
- 建议具体可行
- 保持Markdown格式规范
- 如果用户有追问，请结合之前的对话历史进行回答`;
  }

  private buildInitialPrompt(scanData: string): string {
    return `请分析以下Nmap扫描结果，生成专业的安全报告。

扫描结果：
${scanData}

请按照以下Markdown格式输出：

## 📊 扫描概览
[总结扫描的主机数量、开放端口等关键信息]

## 🔍 发现的服务
[列出所有发现的服务及其版本信息，格式清晰]

## ⚠️ 潜在漏洞分析
[针对每个服务分析可能存在的漏洞，尽量参考已知的CVE编号和安全问题]

## 🛡️ 修复建议
[提供具体、可操作的修复建议，包括配置优化、版本升级等]

## 📝 总结
[给出整体安全评估和优先级建议]`;
  }

  createSession(scanResult?: ScanResult): ChatSession {
    const sessionId = this.generateSessionId();
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: this.buildSystemPrompt(),
      },
    ];

    if (scanResult) {
      const formattedData = this.formatScanData(scanResult);
      messages.push({
        role: 'user',
        content: this.buildInitialPrompt(formattedData),
      });
    }

    const session: ChatSession = {
      id: sessionId,
      messages,
      scanResult,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  updateSession(sessionId: string, message: ChatMessage): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push(message);
      session.updatedAt = new Date();
    }
  }

  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  clearOldSessions(maxAge: number = 3600000): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.updatedAt.getTime() > maxAge) {
        this.sessions.delete(id);
      }
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async *analyzeScanResult(scanResult: ScanResult): AsyncGenerator<string, void, unknown> {
    const session = this.createSession(scanResult);
    
    let fullResponse = '';
    const stream = await this.client.chat({
      model: this.model,
      messages: session.messages,
      stream: true,
    });

    for await (const part of stream) {
      const content = part.message?.content || '';
      fullResponse += content;
      yield content;
    }

    this.updateSession(session.id, {
      role: 'assistant',
      content: fullResponse,
    });
  }

  async *chat(sessionId: string, userMessage: string): AsyncGenerator<string, void, unknown> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('会话不存在');
    }

    session.messages.push({
      role: 'user',
      content: userMessage,
    });
    session.updatedAt = new Date();

    let fullResponse = '';
    const stream = await this.client.chat({
      model: this.model,
      messages: session.messages,
      stream: true,
    });

    for await (const part of stream) {
      const content = part.message?.content || '';
      fullResponse += content;
      yield content;
    }

    session.messages.push({
      role: 'assistant',
      content: fullResponse,
    });
    session.updatedAt = new Date();
  }

  private formatScanData(scanResult: ScanResult): string {
    let output = `Nmap扫描结果摘要：\n\n`;
    
    const startTime = parseInt(scanResult.startTime);
    if (!isNaN(startTime)) {
      output += `扫描时间: ${new Date(startTime * 1000).toLocaleString('zh-CN')}\n`;
    } else {
      output += `扫描时间: ${scanResult.startTime}\n`;
    }
    
    output += `发现主机数: ${scanResult.hosts.length}\n`;
    output += `总端口数: ${scanResult.totalPorts}\n`;
    output += `开放端口数: ${scanResult.openPorts}\n\n`;

    for (const host of scanResult.hosts) {
      output += `=== 主机: ${host.address} ===\n`;
      if (host.hostname) {
        output += `主机名: ${host.hostname}\n`;
      }
      output += `开放端口:\n`;

      const openPorts = host.ports.filter(p => p.state === 'open');
      if (openPorts.length === 0) {
        output += `  (无开放端口)\n`;
      } else {
        for (const port of openPorts) {
          output += `  - ${port.portid}/${port.protocol}`;
          if (port.service) {
            output += ` (${port.service.name}`;
            if (port.service.product) output += ` - ${port.service.product}`;
            if (port.service.version) output += ` ${port.service.version}`;
            if (port.service.extrainfo) output += ` - ${port.service.extrainfo}`;
            output += `)`;
          }
          output += `\n`;
        }
      }
      output += `\n`;
    }

    return output;
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.client.list();
      return true;
    } catch {
      return false;
    }
  }

  getSessionCount(): number {
    return this.sessions.size;
  }
}
