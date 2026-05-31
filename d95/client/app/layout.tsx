import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '安全报告分析工具',
  description: '使用AI分析Nmap扫描结果，生成专业的安全报告',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className="dark">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
