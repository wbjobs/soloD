'use client';

import React, { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { Copy, Download, Loader2, FileText, AlertCircle } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  isAnalyzing: boolean;
  error?: string;
}

export function MarkdownRenderer({ content, isAnalyzing, error }: MarkdownRendererProps) {
  const [copied, setCopied] = React.useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current && isAnalyzing) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, isAnalyzing]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `安全报告_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-red-400 p-8">
        <AlertCircle className="w-16 h-16 mb-4" />
        <h3 className="text-xl font-semibold mb-2">分析失败</h3>
        <p className="text-center text-dark-400">{error}</p>
      </div>
    );
  }

  if (!content && !isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-dark-500">
        <div className="p-6 rounded-full bg-dark-800 mb-4 border border-dark-700">
          <FileText className="w-12 h-12 opacity-60" />
        </div>
        <p className="text-lg font-medium text-dark-300">上传Nmap扫描文件开始分析</p>
        <p className="text-sm mt-2 text-dark-500">AI将生成专业的安全评估报告</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-dark-700">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-dark-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-400" />
            分析报告
          </h2>
          {isAnalyzing && (
            <div className="flex items-center gap-2 text-primary-400 text-sm bg-primary-500/10 px-3 py-1 rounded-full">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>正在生成报告...</span>
            </div>
          )}
          {!isAnalyzing && content && (
            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 px-3 py-1 rounded-full">
              <span>✓ 分析完成</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={!content || isAnalyzing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-dark-700 hover:bg-dark-600 text-dark-200 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-dark-600 hover:border-primary-500/50"
          >
            <Copy className="w-4 h-4" />
            {copied ? '已复制!' : '复制'}
          </button>
          <button
            onClick={handleDownload}
            disabled={!content || isAnalyzing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary-500/20"
          >
            <Download className="w-4 h-4" />
            导出报告
          </button>
        </div>
      </div>

      <div 
        ref={contentRef}
        className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-dark-600 scrollbar-track-dark-800 scrollbar-thumb-rounded-full"
      >
        <article className="markdown-content pb-8">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-2xl font-bold text-primary-400 mb-4 pb-2 border-b border-primary-500/30">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl font-bold text-primary-400 mt-6 mb-3 pb-2 border-b border-dark-700 flex items-center gap-2">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-lg font-semibold text-primary-300 mt-4 mb-2">
                  {children}
                </h3>
              ),
              h4: ({ children }) => (
                <h4 className="text-base font-semibold text-dark-200 mt-3 mb-1">
                  {children}
                </h4>
              ),
              p: ({ children }) => (
                <p className="mb-3 leading-relaxed text-dark-200">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="mb-3 ml-6 space-y-1 list-disc text-dark-200">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-3 ml-6 space-y-1 list-decimal text-dark-200">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="mb-1">{children}</li>
              ),
              code: ({ node, inline, className, children, ...props }: any) => {
                const match = /language-(\w+)/.exec(className || '');
                return !inline && match ? (
                  <div className="my-4 rounded-lg overflow-hidden">
                    <SyntaxHighlighter
                      style={oneDark as any}
                      language={match[1]}
                      PreTag="div"
                      showLineNumbers
                      customStyle={{
                        margin: 0,
                        borderRadius: '0.5rem',
                        fontSize: '0.875rem',
                      }}
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <code className="bg-dark-700 px-1.5 py-0.5 rounded text-sm font-mono text-primary-300 border border-dark-600">
                    {children}
                  </code>
                );
              },
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-primary-500 pl-4 py-2 my-4 bg-dark-800/50 rounded-r-lg italic text-dark-300">
                  {children}
                </blockquote>
              ),
              table: ({ children }) => (
                <div className="my-4 overflow-x-auto rounded-lg border border-dark-700">
                  <table className="w-full border-collapse">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-dark-800">
                  {children}
                </thead>
              ),
              th: ({ children }) => (
                <th className="border border-dark-700 px-4 py-2 text-left text-primary-400 font-semibold text-sm">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-dark-700 px-4 py-2 text-dark-200 text-sm">
                  {children}
                </td>
              ),
              strong: ({ children }) => (
                <strong className="text-primary-400 font-semibold">
                  {children}
                </strong>
              ),
              a: ({ href, children }) => (
                <a 
                  href={href} 
                  className="text-primary-400 hover:text-primary-300 underline underline-offset-2 transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
          
          {isAnalyzing && (
            <span className="inline-block w-1 h-5 ml-1 bg-primary-400 animate-pulse rounded-full align-middle" />
          )}
        </article>
      </div>
    </div>
  );
}
