import { useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/tauri'

function App() {
  const [tooltip, setTooltip] = useState('')
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [messageType, setMessageType] = useState('')

  const showResult = (msg, type = 'success') => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => {
      setMessage('')
      setMessageType('')
    }, 3000)
  }

  const handleSetTooltip = async () => {
    const trimmedText = tooltip.trim()
    
    if (!trimmedText) {
      showResult('⚠️ 请输入提示文本', 'warning')
      return
    }

    setIsLoading(true)
    
    try {
      console.log('正在调用 set_tray_tooltip 命令，参数:', { text: trimmedText })
      
      await invoke('set_tray_tooltip', { text: trimmedText })
      
      showResult('✅ 托盘提示已更新成功！请将鼠标悬停在托盘图标上查看', 'success')
      console.log('命令调用成功！新提示:', trimmedText)
      
    } catch (error) {
      console.error('命令调用失败:', error)
      showResult('❌ 设置失败: ' + (error.message || error), 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div class="container">
      <h1>系统托盘提示设置</h1>
      
      <div class="input-group">
        <input
          type="text"
          placeholder="输入托盘提示文本（如：Hello World）"
          value={tooltip}
          onInput={(e) => setTooltip(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSetTooltip()}
          disabled={isLoading}
          maxlength="127"
        />
        <button 
          onClick={handleSetTooltip} 
          disabled={isLoading}
        >
          {isLoading ? '设置中...' : '设置托盘提示'}
        </button>
      </div>
      
      {message && (
        <div class={`message ${messageType}`}>
          {message}
        </div>
      )}
      
      <div class="info-box">
        <h3>使用说明</h3>
        <ul>
          <li>📝 在输入框中输入想要显示的提示文本</li>
          <li>🖱️ 点击"设置托盘提示"按钮或按 Enter 键</li>
          <li>👀 将鼠标悬停在系统托盘图标上查看效果</li>
          <li>💡 提示文本最多支持 127 个字符</li>
        </ul>
      </div>
      
      <div class="debug-info">
        <details>
          <summary>调试信息（开发者）</summary>
          <p>• 命令名: <code>set_tray_tooltip</code></p>
          <p>• 参数结构: <code>{'{ text: "..." }'}</code></p>
          <p>• 已在 Rust 中通过 <code>invoke_handler</code> 注册</p>
        </details>
      </div>
    </div>
  )
}

export default App
