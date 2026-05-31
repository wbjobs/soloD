import { execSync } from 'child_process'
import { Database } from './database'
import { Encryption } from './encryption'
import { SensitiveDetector } from './sensitive-detector'
import { DataMasker } from './data-masker'

function readClipboard(): string {
  try {
    if (process.platform === 'win32') {
      const result = execSync('powershell.exe -NoProfile -Command "Get-Clipboard -Raw"', {
        encoding: 'utf8',
        timeout: 500,
        stdio: ['pipe', 'pipe', 'ignore']
      })
      return result.replace(/\r\n$/, '\n').trimEnd()
    } else {
      const { execSync } = require('child_process')
      const result = execSync('xclip -selection clipboard -o 2>/dev/null || pbpaste 2>/dev/null', {
        encoding: 'utf8',
        timeout: 500
      })
      return result
    }
  } catch (e) {
    return ''
  }
}

function writeClipboard(text: string): void {
  try {
    if (process.platform === 'win32') {
      const escapedText = text.replace(/"/g, '`"').replace(/\$/g, '`$')
      execSync(`powershell.exe -NoProfile -Command "Set-Clipboard -Value \"${escapedText}\""`, {
        timeout: 500,
        stdio: ['pipe', 'pipe', 'ignore']
      })
    } else {
      const { execSync } = require('child_process')
      execSync(`echo -n "${text.replace(/"/g, '\\"')}" | xclip -selection clipboard 2>/dev/null || echo -n "${text.replace(/"/g, '\\"')}" | pbcopy 2>/dev/null`, {
        timeout: 500
      })
    }
  } catch (e) {
    console.error('Failed to write clipboard:', e)
  }
}

export class ClipboardMonitor {
  private db: Database
  private encryption: Encryption
  private detector: SensitiveDetector
  private masker: DataMasker
  private lastContent: string = ''
  private intervalId: NodeJS.Timeout | null = null
  private isRunningFlag: boolean = false
  private isProcessing: boolean = false

  constructor(db: Database, encryption: Encryption) {
    this.db = db
    this.encryption = encryption
    this.detector = new SensitiveDetector()
    this.masker = new DataMasker()
  }

  start(callback?: (record: any) => void): void {
    if (this.isRunningFlag) return

    this.isRunningFlag = true
    this.lastContent = readClipboard()

    this.intervalId = setInterval(() => {
      this.checkClipboard(callback)
    }, 150)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isRunningFlag = false
  }

  isRunning(): boolean {
    return this.isRunningFlag
  }

  private checkClipboard(callback?: (record: any) => void): void {
    if (this.isProcessing) return
    this.isProcessing = true

    try {
      const currentContent = readClipboard()

      if (currentContent && currentContent !== this.lastContent) {
        this.lastContent = currentContent

        const settings = this.db.getSettings()
        const enabledTypes = this.detector.getAllTypes().filter(type => 
          settings[`detect${type.charAt(0).toUpperCase() + type.slice(1)}`] === 'true'
        )

        const result = this.detector.detect(currentContent, enabledTypes)

        if (result && result.matches.length > 0) {
          const sensitiveText = result.matches[0]
          
          const keepStart = parseInt(settings.maskKeepStart || '3')
          const keepEnd = parseInt(settings.maskKeepEnd || '4')
          const maskChar = settings.maskChar || '*'
          
          const maskedText = this.masker.maskByType(sensitiveText, result.type, keepStart, keepEnd, maskChar)
          const maskedContent = currentContent.replace(sensitiveText, maskedText)

          const { encrypted, iv, authTag } = this.encryption.encrypt(currentContent)

          const recordId = this.db.insertRecord({
            original_content: encrypted,
            masked_content: maskedText,
            sensitive_type: result.type,
            iv,
            auth_tag: authTag
          })

          writeClipboard(maskedContent)
          this.lastContent = maskedContent

          if (callback) {
            const record = this.db.getRecordById(recordId)
            callback(record)
          }
        }
      }
    } catch (error) {
      console.error('Clipboard monitor error:', error)
    } finally {
      this.isProcessing = false
    }
  }
}
