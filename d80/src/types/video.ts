export interface VideoStream {
  codec_type: 'video' | 'audio';
  codec_name: string;
  codec_long_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  bit_rate?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  pix_fmt?: string;
  level?: number;
}

export interface VideoFormat {
  filename: string;
  duration: number;
  size: number;
  bit_rate: number;
  format_name: string;
  format_long_name?: string;
  start_time?: number;
  probe_score?: number;
}

export interface VideoMetadata {
  format: VideoFormat;
  streams: VideoStream[];
}

export interface ProcessingState {
  isLoading: boolean;
  isReady: boolean;
  progress: number;
  error: string | null;
  status: string;
}

export interface VideoFile {
  file: File;
  name: string;
  size: number;
  url?: string;
  metadata?: VideoMetadata;
  thumbnail?: string;
}
