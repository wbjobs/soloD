import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const ALGORITHM = 'aes-256-gcm'
const KEY_SIZE = 32
const IV_SIZE = 16
const AUTH_TAG_SIZE = 16

export class Encryption {
  private key: Buffer

  constructor() {
    this.key = this.loadOrGenerateKey()
  }

  private loadOrGenerateKey(): Buffer {
    const keyPath = path.join(app.getPath('userData'), '.encryption-key')
    
    if (fs.existsSync(keyPath)) {
      const keyHex = fs.readFileSync(keyPath, 'utf8')
      return Buffer.from(keyHex, 'hex')
    }

    const key = crypto.randomBytes(KEY_SIZE)
    fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 })
    return key
  }

  encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(IV_SIZE)
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv)
    
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const authTag = cipher.getAuthTag().toString('hex')
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag
    }
  }

  decrypt(encryptedHex: string, ivHex: string, authTagHex: string): string {
    try {
      const iv = Buffer.from(ivHex, 'hex')
      const authTag = Buffer.from(authTagHex, 'hex')
      
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv)
      decipher.setAuthTag(authTag)
      
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      
      return decrypted
    } catch (error) {
      console.error('Decryption failed:', error)
      return '[解密失败]'
    }
  }
}
