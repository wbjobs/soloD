import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, vs } from 'react-syntax-highlighter/dist/esm/styles/prism'
import 'katex/dist/katex.min.css'
import { useMemo } from 'react'

interface MarkdownPreviewProps {
  content: string
  searchQuery?: string
  darkMode?: boolean
  onWikiLinkClick?: (title: string) => void
}

export function MarkdownPreview({ content, searchQuery, darkMode, onWikiLinkClick }: MarkdownPreviewProps) {
  const highlightedContent = searchQuery
    ? content.replace(
        new RegExp(`(${escapeRegExp(searchQuery)})`, 'gi'),
        '<mark class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">$1</mark>'
      )
    : content

  const processedContent = useMemo(() => {
    return parseWikiLinks(highlightedContent)
  }, [highlightedContent])

  return (
    <div className={`markdown-body p-6 overflow-auto h-full ${darkMode ? 'dark' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            return !inline && match ? (
              <SyntaxHighlighter
                style={darkMode ? oneDark : vs}
                language={match[1]}
                PreTag="div"
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={`${className} px-1 py-0.5 rounded ${
                darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800'
              }`} {...props}>
                {children}
              </code>
            )
          },
          a({ href, children, ...props }) {
            if (href?.startsWith('wiki://')) {
              const title = decodeURIComponent(href.replace('wiki://', ''))
              return (
                <button
                  onClick={() => onWikiLinkClick?.(title)}
                  className="text-blue-500 hover:text-blue-600 underline font-medium"
                >
                  [[{children}]]
                </button>
              )
            }
            return (
              <a href={href} className="text-blue-500 hover:text-blue-600 underline" {...props}>
                {children}
              </a>
            )
          },
          blockquote({ children }) {
            return (
              <blockquote className={`border-l-4 border-blue-500 pl-4 my-4 italic ${
                darkMode ? 'text-gray-300 bg-gray-800' : 'text-gray-600 bg-gray-50'
              } py-2 rounded-r`}>
                {children}
              </blockquote>
            )
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto">
                <table className={`border-collapse w-full my-4 ${
                  darkMode ? 'text-gray-200' : 'text-gray-800'
                }`}>
                  {children}
                </table>
              </div>
            )
          },
          th({ children }) {
            return (
              <th className={`border px-4 py-2 font-semibold ${
                darkMode ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-gray-100'
              }`}>
                {children}
              </th>
            )
          },
          td({ children }) {
            return (
              <td className={`border px-4 py-2 ${
                darkMode ? 'border-gray-600' : 'border-gray-300'
              }`}>
                {children}
              </td>
            )
          },
          h1({ children }) {
            return (
              <h1 className={`text-3xl font-bold mb-4 pb-2 border-b ${
                darkMode ? 'text-white border-gray-700' : 'text-gray-900 border-gray-200'
              }`}>
                {children}
              </h1>
            )
          },
          h2({ children }) {
            return (
              <h2 className={`text-2xl font-bold mb-3 pb-2 border-b ${
                darkMode ? 'text-white border-gray-700' : 'text-gray-900 border-gray-200'
              }`}>
                {children}
              </h2>
            )
          },
          h3({ children }) {
            return (
              <h3 className={`text-xl font-semibold mb-2 ${
                darkMode ? 'text-white' : 'text-gray-900'
              }`}>
                {children}
              </h3>
            )
          },
          h4({ children }) {
            return (
              <h4 className={`text-lg font-semibold mb-2 ${
                darkMode ? 'text-gray-100' : 'text-gray-800'
              }`}>
                {children}
              </h4>
            )
          },
          p({ children }) {
            return (
              <p className={`mb-4 leading-relaxed ${
                darkMode ? 'text-gray-200' : 'text-gray-700'
              }`}>
                {children}
              </p>
            )
          },
          ul({ children }) {
            return (
              <ul className={`list-disc pl-6 mb-4 space-y-1 ${
                darkMode ? 'text-gray-200' : 'text-gray-700'
              }`}>
                {children}
              </ul>
            )
          },
          ol({ children }) {
            return (
              <ol className={`list-decimal pl-6 mb-4 space-y-1 ${
                darkMode ? 'text-gray-200' : 'text-gray-700'
              }`}>
                {children}
              </ol>
            )
          },
          hr() {
            return (
              <hr className={`my-6 border-t-2 ${
                darkMode ? 'border-gray-700' : 'border-gray-200'
              }`} />
            )
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseWikiLinks(content: string): string {
  return content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, title, displayText) => {
    const linkText = displayText || title
    return `<a href="wiki://${encodeURIComponent(title.trim())}">${linkText.trim()}</a>`
  })
}

export function extractWikiLinks(content: string): string[] {
  const links: string[] = []
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  let match
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim())
  }
  return links
}