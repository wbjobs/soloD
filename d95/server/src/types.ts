export interface NmapService {
  name: string;
  version?: string;
  product?: string;
  extrainfo?: string;
}

export interface NmapPort {
  portid: string;
  protocol: string;
  state: string;
  service?: NmapService;
}

export interface NmapHost {
  address: string;
  hostname?: string;
  ports: NmapPort[];
}

export interface ScanResult {
  hosts: NmapHost[];
  startTime: string;
  endTime?: string;
  totalPorts: number;
  openPorts: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  scanResult?: ScanResult;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
}

export interface ChatResponseChunk {
  sessionId: string;
  content: string;
  done: boolean;
}
