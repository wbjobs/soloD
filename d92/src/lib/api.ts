import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

export interface UploadInitRequest {
  file_name: string;
  file_size: number;
  total_chunks: number;
}

export interface UploadInitResponse {
  upload_id: string;
  chunk_size: number;
}

export interface ChunkUploadResponse {
  received: boolean;
  chunk_index: number;
}

export interface UploadCompleteRequest {
  upload_id: string;
  file_hash: string;
}

export interface ObservationMetadata {
  id: string;
  file_hash: string;
  file_name: string;
  file_size: number;
  observation_time: string;
  frequency_start: number;
  frequency_end: number;
  ra: number;
  dec: number;
  created_at: string;
  is_compressed?: boolean;
  original_size?: number;
  compressed_size?: number;
  compression_ratio?: number;
  estimated_download_time?: number;
  estimated_download_time_str?: string;
}

export interface UploadCompleteResponse {
  success: boolean;
  observation_id: string;
  metadata: ObservationMetadata;
}

export interface SpatialQueryRequest {
  ra_min: number;
  ra_max: number;
  dec_min: number;
  dec_max: number;
  page?: number;
  page_size?: number;
}

export interface ObservationListResponse {
  data: ObservationMetadata[];
  total: number;
  page: number;
  page_size: number;
}

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const uploadApi = {
  initUpload: (data: UploadInitRequest) =>
    api.post<UploadInitResponse>('/api/upload/init', data),
  
  uploadChunk: (formData: FormData) =>
    api.post<ChunkUploadResponse>('/api/upload/chunk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  
  completeUpload: (data: UploadCompleteRequest) =>
    api.post<{ success: boolean; upload_id: string; message: string }>('/api/upload/complete', data),
  
  getUploadStatus: (uploadId: string) =>
    api.get<{
      upload_id: string;
      status: string;
      progress: number;
      error: string | null;
      result: {
        observation_id: string;
        file_hash: string;
        metadata: {
          ra: number;
          dec: number;
          observation_time: string;
          frequency_start?: number;
          frequency_end?: number;
        };
      } | null;
    }>(`/api/upload/status/${uploadId}`),
};

export const observationsApi = {
  getObservations: (page = 1, pageSize = 20) =>
    api.get<ObservationListResponse>('/api/observations', {
      params: { page, page_size: pageSize },
    }),
  
  getObservation: (id: string) =>
    api.get<ObservationMetadata>(`/api/observations/${id}`),
  
  querySpatial: (data: SpatialQueryRequest) =>
    api.post<ObservationListResponse>('/api/observations/query/spatial', data),
};

export default api;
