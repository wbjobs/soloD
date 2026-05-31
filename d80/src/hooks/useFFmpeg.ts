import { useState, useCallback, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { VideoMetadata, ProcessingState } from '@/types/video';

const SUPPORTED_FORMATS = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v'];
const MAX_FILE_SIZE = 200 * 1024 * 1024;

export function useFFmpeg() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const createdObjectUrlsRef = useRef<Set<string>>(new Set());
  const activeFilesRef = useRef<Set<string>>(new Set());

  const [state, setState] = useState<ProcessingState>({
    isLoading: false,
    isReady: false,
    progress: 0,
    error: null,
    status: '',
  });

  const cleanupObjectUrls = useCallback(() => {
    createdObjectUrlsRef.current.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    createdObjectUrlsRef.current.clear();
  }, []);

  const cleanupFFmpegFiles = useCallback(async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg?.loaded) return;

    const filesToDelete = Array.from(activeFilesRef.current);
    for (const fileName of filesToDelete) {
      try {
        await ffmpeg.deleteFile(fileName);
        activeFilesRef.current.delete(fileName);
      } catch (e) {
        console.warn(`Failed to delete file ${fileName}:`, e);
      }
    }
  }, []);

  const terminateFFmpeg = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    await cleanupFFmpegFiles();
    cleanupObjectUrls();

    if (ffmpegRef.current?.loaded) {
      try {
        ffmpegRef.current = null;
      } catch (e) {
        console.warn('Failed to terminate FFmpeg:', e);
      }
    }

    setState((prev) => ({
      ...prev,
      isReady: false,
      isLoading: false,
      progress: 0,
    }));
  }, [cleanupFFmpegFiles, cleanupObjectUrls]);

  useEffect(() => {
    return () => {
      terminateFFmpeg();
    };
  }, [terminateFFmpeg]);

  const loadFFmpeg = useCallback(async () => {
    if (ffmpegRef.current?.loaded) {
      return ffmpegRef.current;
    }

    setState((prev) => ({ ...prev, isLoading: true, status: '正在加载 FFmpeg...', progress: 10 }));

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const ffmpeg = new FFmpeg();

      ffmpeg.on('log', ({ message }) => {
        if (!signal.aborted) {
          console.log('[FFmpeg]', message);
        }
      });

      ffmpeg.on('progress', ({ progress }) => {
        if (!signal.aborted) {
          setState((prev) => ({ ...prev, progress: Math.round(progress * 100) }));
        }
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

      await Promise.race([
        ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        }),
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('Loading aborted')));
        }),
      ]);

      if (signal.aborted) {
        throw new Error('Loading aborted');
      }

      ffmpegRef.current = ffmpeg;
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isReady: true,
        status: 'FFmpeg 已就绪',
        progress: 100,
        error: null,
      }));
      return ffmpeg;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载 FFmpeg 失败';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        status: '加载失败',
      }));
      throw error;
    }
  }, []);

  const getFFmpeg = useCallback(async () => {
    if (ffmpegRef.current?.loaded) {
      return ffmpegRef.current;
    }
    return loadFFmpeg();
  }, [loadFFmpeg]);

  const checkFileSize = useCallback((file: File): boolean => {
    if (file.size > MAX_FILE_SIZE) {
      setState((prev) => ({
        ...prev,
        error: `文件过大 (${(file.size / 1024 / 1024).toFixed(2)}MB)，最大支持 200MB`,
      }));
      return false;
    }
    return true;
  }, []);

  const safeWriteFile = useCallback(
    async (ffmpeg: FFmpeg, fileName: string, data: Uint8Array) => {
      try {
        await ffmpeg.writeFile(fileName, data);
        activeFilesRef.current.add(fileName);
      } catch (error) {
        throw new Error(`写入文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    },
    []
  );

  const safeDeleteFile = useCallback(async (ffmpeg: FFmpeg, fileName: string) => {
    try {
      await ffmpeg.deleteFile(fileName);
      activeFilesRef.current.delete(fileName);
    } catch (e) {
      console.warn(`Failed to delete file ${fileName}:`, e);
    }
  }, []);

  const extractMetadata = useCallback(
    async (file: File): Promise<VideoMetadata> => {
      if (!checkFileSize(file)) {
        throw new Error('文件超过大小限制');
      }

      const ffmpeg = await getFFmpeg();

      setState((prev) => ({
        ...prev,
        isLoading: true,
        status: '正在解析元数据...',
        progress: 20,
        error: null,
      }));

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      const inputFileName = `input_meta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const outputFileName = `metadata_${Date.now()}.json`;

      try {
        await safeWriteFile(ffmpeg, inputFileName, await fetchFile(file));

        if (signal.aborted) throw new Error('Operation aborted');
        setState((prev) => ({ ...prev, progress: 40 }));

        await Promise.race([
          ffmpeg.exec([
            '-i', inputFileName,
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            '-v', 'quiet',
            outputFileName,
          ]),
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('Operation aborted')));
          }),
        ]);

        if (signal.aborted) throw new Error('Operation aborted');
        setState((prev) => ({ ...prev, progress: 70 }));

        const data = await ffmpeg.readFile(outputFileName);
        const decoder = new TextDecoder();
        const jsonStr = decoder.decode(data as Uint8Array);
        const metadata = JSON.parse(jsonStr);

        setState((prev) => ({ ...prev, progress: 90 }));

        await safeDeleteFile(ffmpeg, inputFileName);
        await safeDeleteFile(ffmpeg, outputFileName);

        setState((prev) => ({
          ...prev,
          isLoading: false,
          status: '元数据解析完成',
          progress: 100,
        }));

        return {
          format: {
            filename: file.name,
            duration: parseFloat(metadata.format?.duration) || 0,
            size: file.size,
            bit_rate: parseInt(metadata.format?.bit_rate) || 0,
            format_name: metadata.format?.format_name || '',
            format_long_name: metadata.format?.format_long_name,
            start_time: parseFloat(metadata.format?.start_time),
            probe_score: parseInt(metadata.format?.probe_score),
          },
          streams: (metadata.streams || []).map((stream: any) => ({
            codec_type: stream.codec_type,
            codec_name: stream.codec_name,
            codec_long_name: stream.codec_long_name,
            width: stream.width,
            height: stream.height,
            r_frame_rate: stream.r_frame_rate,
            bit_rate: stream.bit_rate,
            sample_rate: stream.sample_rate,
            channels: stream.channels,
            channel_layout: stream.channel_layout,
            pix_fmt: stream.pix_fmt,
            level: stream.level,
          })),
        };
      } catch (error) {
        await safeDeleteFile(ffmpeg, inputFileName);
        await safeDeleteFile(ffmpeg, outputFileName);

        const errorMessage = error instanceof Error ? error.message : '解析元数据失败';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
          status: '解析失败',
        }));
        throw error;
      }
    },
    [getFFmpeg, checkFileSize, safeWriteFile, safeDeleteFile]
  );

  const extractThumbnail = useCallback(
    async (file: File, timeInSeconds: number = 1): Promise<string> => {
      if (!checkFileSize(file)) {
        throw new Error('文件超过大小限制');
      }

      const ffmpeg = await getFFmpeg();

      setState((prev) => ({
        ...prev,
        isLoading: true,
        status: '正在提取缩略图...',
        progress: 20,
        error: null,
      }));

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      const inputFileName = `thumb_input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const outputFileName = `thumbnail_${Date.now()}.png`;
      let objectUrl: string | null = null;

      try {
        await safeWriteFile(ffmpeg, inputFileName, await fetchFile(file));

        if (signal.aborted) throw new Error('Operation aborted');
        setState((prev) => ({ ...prev, progress: 40 }));

        await Promise.race([
          ffmpeg.exec([
            '-ss', timeInSeconds.toString(),
            '-i', inputFileName,
            '-vframes', '1',
            '-q:v', '2',
            '-y',
            outputFileName,
          ]),
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('Operation aborted')));
          }),
        ]);

        if (signal.aborted) throw new Error('Operation aborted');
        setState((prev) => ({ ...prev, progress: 70 }));

        const data = await ffmpeg.readFile(outputFileName);
        const blob = new Blob([data], { type: 'image/png' });
        objectUrl = URL.createObjectURL(blob);
        createdObjectUrlsRef.current.add(objectUrl);

        setState((prev) => ({ ...prev, progress: 90 }));

        await safeDeleteFile(ffmpeg, inputFileName);
        await safeDeleteFile(ffmpeg, outputFileName);

        setState((prev) => ({
          ...prev,
          isLoading: false,
          status: '缩略图提取完成',
          progress: 100,
        }));

        return objectUrl;
      } catch (error) {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          createdObjectUrlsRef.current.delete(objectUrl);
        }

        await safeDeleteFile(ffmpeg, inputFileName);
        await safeDeleteFile(ffmpeg, outputFileName);

        const errorMessage = error instanceof Error ? error.message : '提取缩略图失败';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
          status: '提取失败',
        }));
        throw error;
      }
    },
    [getFFmpeg, checkFileSize, safeWriteFile, safeDeleteFile]
  );

  const isFormatSupported = useCallback((fileName: string): boolean => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ext ? SUPPORTED_FORMATS.includes(ext) : false;
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const cancelOperation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      isLoading: false,
      status: '已取消',
      progress: 0,
    }));
  }, []);

  const cropVideo = useCallback(
    async (file: File, startTime: number, endTime: number): Promise<string> => {
      if (!checkFileSize(file)) {
        throw new Error('文件超过大小限制');
      }

      if (startTime < 0 || endTime <= startTime) {
        throw new Error('无效的时间范围');
      }

      const ffmpeg = await getFFmpeg();

      setState((prev) => ({
        ...prev,
        isLoading: true,
        status: '正在裁剪视频...',
        progress: 10,
        error: null,
      }));

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      const duration = endTime - startTime;
      const inputFileName = `crop_input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const outputFileName = `cropped_${Date.now()}.mp4`;
      let objectUrl: string | null = null;

      try {
        await safeWriteFile(ffmpeg, inputFileName, await fetchFile(file));

        if (signal.aborted) throw new Error('Operation aborted');
        setState((prev) => ({ ...prev, progress: 30 }));

        await Promise.race([
          ffmpeg.exec([
            '-ss', startTime.toString(),
            '-i', inputFileName,
            '-t', duration.toString(),
            '-c:v', 'libx264',
            '-crf', '23',
            '-preset', 'fast',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-y',
            outputFileName,
          ]),
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('Operation aborted')));
          }),
        ]);

        if (signal.aborted) throw new Error('Operation aborted');
        setState((prev) => ({ ...prev, progress: 80 }));

        const data = await ffmpeg.readFile(outputFileName);
        const blob = new Blob([data], { type: 'video/mp4' });
        objectUrl = URL.createObjectURL(blob);
        createdObjectUrlsRef.current.add(objectUrl);

        setState((prev) => ({ ...prev, progress: 90 }));

        await safeDeleteFile(ffmpeg, inputFileName);
        await safeDeleteFile(ffmpeg, outputFileName);

        setState((prev) => ({
          ...prev,
          isLoading: false,
          status: '视频裁剪完成',
          progress: 100,
        }));

        return objectUrl;
      } catch (error) {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          createdObjectUrlsRef.current.delete(objectUrl);
        }

        await safeDeleteFile(ffmpeg, inputFileName);
        await safeDeleteFile(ffmpeg, outputFileName);

        const errorMessage = error instanceof Error ? error.message : '裁剪视频失败';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
          status: '裁剪失败',
        }));
        throw error;
      }
    },
    [getFFmpeg, checkFileSize, safeWriteFile, safeDeleteFile]
  );

  return {
    state,
    loadFFmpeg,
    extractMetadata,
    extractThumbnail,
    cropVideo,
    isFormatSupported,
    clearError,
    cancelOperation,
    cleanupObjectUrls,
    maxFileSize: MAX_FILE_SIZE,
  };
}
