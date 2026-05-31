import { SerialPort } from 'serialport'
import { EventEmitter } from 'events'
import { dbManager } from './database'

export interface PortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
  vendorId?: string
  productId?: string
}

class SerialManager extends EventEmitter {
  private port: SerialPort | null = null
  private currentPort: string = ''

  async listPorts(): Promise<PortInfo[]> {
    const ports = await SerialPort.list()
    return ports.map(p => ({
      path: p.path,
      manufacturer: p.manufacturer,
      serialNumber: p.serialNumber,
      vendorId: p.vendorId,
      productId: p.productId
    }))
  }

  async connect(portPath: string, baudRate: number = 9600): Promise<void> {
    if (this.port) {
      await this.disconnect()
    }

    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: portPath,
        baudRate,
        autoOpen: false
      })

      this.port.open((err) => {
        if (err) {
          reject(err)
          return
        }

        this.currentPort = portPath
        this.setupListeners()
        resolve()
      })
    })
  }

  private setupListeners() {
    if (!this.port) return

    let buffer = Buffer.alloc(0)

    this.port.on('data', (data: Buffer) => {
      buffer = Buffer.concat([buffer, data])
      
      while (buffer.length > 0) {
        const hexData = buffer.toString('hex')
        const asciiData = buffer.toString('utf8')
        
        dbManager.insertRecord({
          timestamp: Date.now(),
          type: 'receive',
          data: asciiData,
          hexData: hexData,
          port: this.currentPort
        })

        this.emit('data', {
          timestamp: Date.now(),
          type: 'receive',
          data: asciiData,
          hexData: hexData,
          port: this.currentPort
        })

        buffer = Buffer.alloc(0)
      }
    })

    this.port.on('error', (err) => {
      this.emit('error', err)
    })

    this.port.on('close', () => {
      this.emit('disconnected')
    })
  }

  async sendHex(hexString: string): Promise<void> {
    if (!this.port || !this.port.isOpen) {
      throw new Error('Serial port not connected')
    }

    const cleanHex = hexString.replace(/\s/g, '')
    const buffer = Buffer.from(cleanHex, 'hex')

    return new Promise((resolve, reject) => {
      this.port!.write(buffer, (err) => {
        if (err) {
          reject(err)
          return
        }

        dbManager.insertRecord({
          timestamp: Date.now(),
          type: 'send',
          data: buffer.toString('utf8'),
          hexData: cleanHex,
          port: this.currentPort
        })

        this.emit('data', {
          timestamp: Date.now(),
          type: 'send',
          data: buffer.toString('utf8'),
          hexData: cleanHex,
          port: this.currentPort
        })

        resolve()
      })
    })
  }

  async disconnect(): Promise<void> {
    if (!this.port) return

    return new Promise((resolve) => {
      this.port!.close(() => {
        this.port = null
        this.currentPort = ''
        resolve()
      })
    })
  }

  isConnected(): boolean {
    return this.port !== null && this.port.isOpen
  }

  getCurrentPort(): string {
    return this.currentPort
  }
}

export const serialManager = new SerialManager()
