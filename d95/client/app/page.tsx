'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Shield, Zap, CheckCircle, XCircle, FileText, MessageSquare } from 'lucide-react';
import { FileUpload } from '@/components/FileUpload';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { ChatPanel } from '@/components/ChatPanel';
import { analyzeScanFile, checkServerHealth } from '@/lib/api';

type TabType = 'report' | 'chat';

export default function Home() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [error, setError] = useState('');
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('report');

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const result = await checkServerHealth();
        setServerStatus(result.status === 'ok' ? 'online' : 'offline');
      } catch {
        setServerStatus('offline');
      }
    };
    
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    setIsAnalyzing(true);
    setError('');
    setReportContent('');
    setSessionId(null);
    setActiveTab('report');

    await analyzeScanFile(file, {
      onChunk: (chunk) => {
        setReportContent(prev => prev + chunk);
      },
      onComplete: (sid) => {
        setSessionId(sid || null);
        setIsAnalyzing(false);
      },
      onError: (errorMsg) => {
        setError(errorMsg);
        setIsAnalyzing(false);
      },
    });
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900">
      {/* 背景装饰 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary-600/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative border-b border-dark-700/50 backdrop-blur-sm bg-dark-900/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-500/20 rounded-xl">
                <Shield className="w-6 h-6 text-primary-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-dark-100">安全报告分析工具</h1>
                <p className="text-xs text-dark-400">AI驱动的Nmap扫描结果智能分析</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {serverStatus === 'checking' && (
                  <div className="flex items-center gap-2 text-dark-400 text-sm">
                  <div className="w-2 h-2 rounded-full bg-dark-500 animate-pulse" />
                  检查服务状态...
                </div>
                )}
                {serverStatus === 'online' && (
                  <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 px-3 py-1 rounded-full">
                    <CheckCircle className="w-4 h-4" />
                    服务在线
                  </div>
                )}
                {serverStatus === 'offline' && (
                  <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-3 py-1 rounded-full">
                    <XCircle className="w-4 h-4" />
                    服务离线
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2 px-3 py-1.5 bg-dark-800 rounded-full border border-dark-700">
                <Zap className="w-4 h-4 text-primary-400" />
                <span className="text-sm text-dark-300">Powered by Ollama + Llama 3</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* 左侧：文件上传区域 */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-dark-800/50 backdrop-blur-sm rounded-2xl border border-dark-700/50 p-6">
              <h2 className="text-lg font-semibold text-dark-100 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-primary-400 rounded-full" />
                上传扫描文件
              </h2>
              <FileUpload
                onFileSelect={handleFileSelect}
                isAnalyzing={isAnalyzing}
                error={error}
              />
            </div>

            {/* 提示卡片 */}
            <div className="bg-dark-800/30 backdrop-blur-sm rounded-2xl border border-dark-700/30 p-6">
              <h3 className="text-sm font-semibold text-dark-200 mb-3">使用说明</h3>
              <ul className="space-y-2 text-sm text-dark-400">
                <li className="flex items-start gap-2">
                  <span className="text-primary-400 mt-0.5">1.</span>
                  使用 Nmap 命令生成 XML 格式的扫描结果
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-400 mt-0.5">2.</span>
                  命令示例: <code className="bg-dark-700 px-1.5 py-0.5 rounded text-xs">nmap -oX scan.xml 192.168.1.0/24</code>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-400 mt-0.5">3.</span>
                  上传生成的 scan.xml 文件即可获得 AI 分析报告
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-400 mt-0.5">4.</span>
                  报告生成后可在"智能对话"中进行追问
                </li>
              </ul>
            </div>

            {/* 特性卡片 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-dark-800/30 rounded-xl border border-dark-700/30 p-4 text-center">
                <div className="text-2xl font-bold text-primary-400 mb-1">AI</div>
                <div className="text-xs text-dark-400">智能分析</div>
              </div>
              <div className="bg-dark-800/30 rounded-xl border border-dark-700/30 p-4 text-center">
                <div className="text-2xl font-bold text-primary-400 mb-1">对话</div>
                <div className="text-xs text-dark-400">多轮问答</div>
              </div>
            </div>
          </div>

          {/* 右侧：结果展示区域 */}
          <div className="lg:col-span-3">
            <div className="bg-dark-800/50 backdrop-blur-sm rounded-2xl border border-dark-700/50 p-6 h-[calc(100vh-12rem)] flex flex-col">
              {/* Tabs */}
              <div className="flex gap-2 mb-4 pb-4 border-b border-dark-700">
                <button
                  onClick={() => setActiveTab('report')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    activeTab === 'report'
                      ? 'bg-primary-500 text-white'
                      : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  分析报告
                </button>
                <button
                  onClick={() => setActiveTab('chat')}
                  disabled={!sessionId}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    activeTab === 'chat'
                      ? 'bg-primary-500 text-white'
                      : sessionId
                        ? 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                        : 'bg-dark-700/50 text-dark-500 cursor-not-allowed'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  智能对话
                  {sessionId && (
                    <span className="w-2 h-2 bg-green-400 rounded-full" />
                  )}
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === 'report' ? (
                  <MarkdownRenderer
                    content={reportContent}
                    isAnalyzing={isAnalyzing}
                    error={error}
                  />
                ) : (
                  <ChatPanel sessionId={sessionId} disabled={isAnalyzing} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative border-t border-dark-700/50 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <p className="text-center text-sm text-dark-500">
            安全报告分析工具 · 保护您的网络安全
          </p>
        </div>
      </footer>
    </main>
  );
}
