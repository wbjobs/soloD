export interface NetworkStats {
  packetLossRate: number;
  rtt: number;
  availableBandwidth: number;
  timestamp: number;
}

export interface BitrateStrategy {
  targetBitrate: number;
  maxBitrate: number;
  minBitrate: number;
  resolution: { width: number; height: number };
  frameRate: number;
  qualityLevel: 'high' | 'medium' | 'low';
}

export interface ParticipantInfo {
  id: string;
  name: string;
}

export interface PeerConnection {
  id: string;
  name: string;
  connection: RTCPeerConnection;
  streams: MediaStream[];
}

export interface SimulcastLayer {
  rid: string;
  active: boolean;
  bitrate: number;
  scaleResolutionDownBy: number;
  maxFramerate: number;
}

export interface BandwidthHistory {
  timestamp: number;
  availableBandwidth: number;
  packetLossRate: number;
  rtt: number;
  recommendedBitrate: number;
  qualityLevel: string;
}

export interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface SerialOptions {
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
  parity?: 'none' | 'even' | 'odd';
  bufferSize?: number;
  flowControl?: 'none' | 'hardware';
}

export interface SerialPort extends EventTarget {
  readonly readable: ReadableStream | null;
  readonly writable: WritableStream | null;
  open(options?: SerialOptions): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
  setSignals(signals: {
    dataTerminalReady?: boolean;
    requestToSend?: boolean;
    break?: boolean;
  }): Promise<void>;
  getSignals(): Promise<{
    dataCarrierDetect: boolean;
    clearToSend: boolean;
    ringIndicator: boolean;
    dataSetReady: boolean;
  }>;
  forget(): Promise<void>;
}

export interface Serial extends EventTarget {
  requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

declare global {
  interface Navigator {
    readonly serial: Serial;
  }
}
