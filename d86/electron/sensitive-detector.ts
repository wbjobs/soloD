export interface DetectionResult {
  detected: boolean
  type: string
  matches: string[]
}

export class SensitiveDetector {
  private patterns: { [key: string]: RegExp } = {
    idCard: /(^|\D)([1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx])($|\D)/,
    phone: /(^|\D)(1[3-9]\d{9})($|\D)/,
    email: /(^|\D)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})($|\D)/,
    ip: /(^|\D)((?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))($|\D)/,
    apiKey: /(^|\W)(sk_[a-zA-Z0-9]{20,}|pk_[a-zA-Z0-9]{20,}|api[_-]?key|secret[_-]?key[a-zA-Z0-9_]*\s*[=:]\s*['"]?[a-zA-Z0-9]{16,}['"]?)/i
  }

  private typeNames: { [key: string]: string } = {
    idCard: '身份证号',
    phone: '手机号',
    email: '邮箱',
    ip: 'IP地址',
    apiKey: 'API密钥'
  }

  detect(text: string, enabledTypes: string[] = ['idCard', 'phone', 'email', 'ip', 'apiKey']): DetectionResult | null {
    for (const type of enabledTypes) {
      const pattern = this.patterns[type]
      if (pattern) {
        const match = text.match(pattern)
        if (match) {
          const matchedText = match[2] || match[0].trim()
          return {
            detected: true,
            type: this.typeNames[type] || type,
            matches: [matchedText]
          }
        }
      }
    }
    return null
  }

  getAllTypes(): string[] {
    return Object.keys(this.patterns)
  }

  getTypeName(type: string): string {
    return this.typeNames[type] || type
  }
}
