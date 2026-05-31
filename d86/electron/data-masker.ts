export class DataMasker {
  mask(text: string, keepStart: number = 3, keepEnd: number = 4, maskChar: string = '*'): string {
    if (text.length <= keepStart + keepEnd) {
      return maskChar.repeat(text.length)
    }

    const start = text.substring(0, keepStart)
    const middle = maskChar.repeat(text.length - keepStart - keepEnd)
    const end = text.substring(text.length - keepEnd)

    return start + middle + end
  }

  maskEmail(email: string): string {
    const [username, domain] = email.split('@')
    if (!domain) return this.mask(email)

    const maskedUsername = this.mask(username, 2, 1)
    return `${maskedUsername}@${domain}`
  }

  maskIP(ip: string): string {
    const parts = ip.split('.')
    if (parts.length !== 4) return this.mask(ip)
    return `${parts[0]}.${'*'.repeat(3)}.${'*'.repeat(3)}.${parts[3]}`
  }

  maskByType(text: string, type: string, keepStart?: number, keepEnd?: number, maskChar?: string): string {
    switch (type) {
      case '邮箱':
        return this.maskEmail(text)
      case 'IP地址':
        return this.maskIP(text)
      default:
        return this.mask(text, keepStart, keepEnd, maskChar)
    }
  }
}
