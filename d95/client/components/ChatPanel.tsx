'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Bot, User, Loader2, Trash2, MessageSquare } from 'lucide-react';
import { chatWithAI, ChatMessage, deleteSession } from '@/lib/api';

interface ChatPanelProps {
  sessionId: string | null;
  disabled?: boolean;
}

export function ChatPanel({ sessionId, disabled }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !sessionId || isLoading || disabled) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    const assistantMessageId = generateId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInputValue('');
    setIsLoading(true);
    setError('');

    await chatWithAI(sessionId, userMessage.content, {
      onChunk: (chunk) => {
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, content: msg.content + chunk }
            : msg
        ));
      },
      onComplete: () => {
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, isStreaming: false }
            : msg
        ));
        setIsLoading(false);
      },
      onError: (errorMsg) => {
        setError(errorMsg);
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, isStreaming: false }
            : msg
        ));
        setIsLoading(false);
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = async () => {
    if (sessionId) {
      await deleteSession(sessionId);
    }
    setMessages([]);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-dark-400 p-8">
        <MessageSquare className="w-16 h-16 mb-4 opacity-50" />
        <p className="text-lg font-medium text-center">上传Nmap扫描文件开始分析</p>
        <p className="text-sm mt-2 text-center">分析完成后可在此进行多轮对话追问</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-dark-700">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary-400" />
          <h3 className="font-semibold text-dark-100">智能对话</h3>
          {isLoading && (
            <div className="flex items-center gap-1 text-primary-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>思考中...</span>
            </div>
          )}
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-dark-700 hover:bg-dark-600 text-dark-300 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            清空对话
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-dark-600 scrollbar-track-dark-800 scrollbar-thumb-rounded-full">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-dark-400">
            <Bot className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-center">有任何问题？请随时提问</p>
            <div className="mt-4 space-y-2 text-sm">
              <p className="text-primary-400">示例问题：</p>
              <ul className="list-disc list-inside space-y-1 text-dark-500">
                <li>请详细解释一下SQL注入的原理</li>
                <li>如何加固SSH服务？</li>
                <li>Apache有哪些常见的安全漏洞？</li>
              </ul>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                message.role === 'user' 
                  ? 'bg-primary-500 text-white' 
                  : 'bg-dark-600 text-primary-400'
              }`}>
                {message.role === 'user' ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>
              <div className={`flex-1 max-w-[85%] ${
                message.role === 'user' ? 'text-right' : ''
              }`}>
                <div className={`inline-block px-4 py-3 rounded-2xl text-left ${
                  message.role === 'user'
                    ? 'bg-primary-500 text-white rounded-tr-sm'
                    : 'bg-dark-700 text-dark-100 rounded-tl-sm'
                }`}>
                  <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                    {message.isStreaming && (
                      <span className="inline-block w-1.5 h-4 ml-1 bg-primary-400 animate-pulse rounded-full align-middle" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-dark-500 mt-1 px-2">
                  {formatTime(message.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="mt-4">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入您的问题..."
            disabled={isLoading || disabled || !sessionId}
            rows={2}
            className="w-full px-4 py-3 pr-12 bg-dark-700 border border-dark-600 rounded-xl text-dark-100 placeholder-dark-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 resize-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || disabled || !sessionId || !inputValue.trim()}
            className="absolute right-2 bottom-2 p-2 bg-primary-500 hover:bg-primary-400 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary-500"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-dark-500 mt-2 text-center">
          按 Enter 发送，Shift + Enter 换行
        </p>
      </div>
    </div>
  );
}
