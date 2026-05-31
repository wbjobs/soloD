import { parseStringPromise } from 'xml2js';
import { ScanResult, NmapHost, NmapPort, NmapService } from '../types';

export class XmlParserService {
  async parseNmapXml(xmlContent: string): Promise<ScanResult> {
    try {
      const result = await parseStringPromise(xmlContent, {
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: false,
        explicitRoot: true,
      });

      const nmapRun = result.nmaprun;
      const hosts: NmapHost[] = [];
      let totalPorts = 0;
      let openPorts = 0;

      if (nmapRun.host) {
        const hostArray = Array.isArray(nmapRun.host) ? nmapRun.host : [nmapRun.host];
        
        for (const host of hostArray) {
          const address = this.getHostAddress(host);
          const hostname = this.getHostname(host);
          const ports = this.extractPorts(host);
          
          totalPorts += ports.length;
          openPorts += ports.filter(p => p.state === 'open').length;
          
          hosts.push({
            address,
            hostname,
            ports,
          });
        }
      }

      return {
        hosts,
        startTime: this.getAttributeValue(nmapRun, 'start') || new Date().toISOString(),
        endTime: this.getAttributeValue(nmapRun.runstats?.finished, 'time'),
        totalPorts,
        openPorts,
      };
    } catch (error) {
      console.error('XML解析错误:', error);
      throw new Error(`XML解析失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getAttributeValue(obj: any, attrName: string): string | undefined {
    if (!obj) return undefined;
    if (obj.$ && obj.$[attrName]) return obj.$[attrName];
    if (obj[attrName]) return obj[attrName];
    return undefined;
  }

  private getHostAddress(host: any): string {
    if (!host.address) return 'unknown';
    
    const addresses = Array.isArray(host.address) ? host.address : [host.address];
    
    for (const addr of addresses) {
      const addrType = this.getAttributeValue(addr, 'addrtype');
      const addrValue = this.getAttributeValue(addr, 'addr');
      if (addrType === 'ipv4' && addrValue) {
        return addrValue;
      }
    }
    
    const firstAddr = addresses[0];
    return this.getAttributeValue(firstAddr, 'addr') || 'unknown';
  }

  private getHostname(host: any): string | undefined {
    if (!host.hostnames) return undefined;
    
    let hostnames = host.hostnames.hostname;
    if (!hostnames) return undefined;
    
    if (!Array.isArray(hostnames)) {
      hostnames = [hostnames];
    }
    
    for (const hn of hostnames) {
      const name = this.getAttributeValue(hn, 'name');
      if (name) return name;
    }
    
    return undefined;
  }

  private extractPorts(host: any): NmapPort[] {
    const ports: NmapPort[] = [];
    
    if (!host.ports || !host.ports.port) {
      return ports;
    }
    
    const portArray = Array.isArray(host.ports.port) ? host.ports.port : [host.ports.port];
    
    for (const port of portArray) {
      const portid = this.getAttributeValue(port, 'portid');
      const protocol = this.getAttributeValue(port, 'protocol') || 'tcp';
      
      if (!portid) continue;
      
      const state = this.getAttributeValue(port.state, 'state') || 'unknown';
      
      const portInfo: NmapPort = {
        portid,
        protocol,
        state,
      };

      if (port.service) {
        const service: NmapService = {
          name: this.getAttributeValue(port.service, 'name') || '',
        };
        
        const version = this.getAttributeValue(port.service, 'version');
        const product = this.getAttributeValue(port.service, 'product');
        const extrainfo = this.getAttributeValue(port.service, 'extrainfo');
        
        if (version) service.version = version;
        if (product) service.product = product;
        if (extrainfo) service.extrainfo = extrainfo;
        
        portInfo.service = service;
      }

      ports.push(portInfo);
    }

    return ports;
  }

  formatScanResultForLLM(scanResult: ScanResult): string {
    let output = `Nmap扫描结果摘要：\n\n`;
    
    const startTime = parseInt(scanResult.startTime);
    if (!isNaN(startTime)) {
      output += `扫描时间: ${new Date(startTime * 1000).toLocaleString('zh-CN')}\n`;
    } else {
      output += `扫描时间: ${scanResult.startTime}\n`;
    }
    
    output += `发现主机数: ${scanResult.hosts.length}\n`;
    output += `总端口数: ${scanResult.totalPorts}\n`;
    output += `开放端口数: ${scanResult.openPorts}\n\n`;

    for (const host of scanResult.hosts) {
      output += `=== 主机: ${host.address} ===\n`;
      if (host.hostname) {
        output += `主机名: ${host.hostname}\n`;
      }
      output += `开放端口:\n`;

      const openPorts = host.ports.filter(p => p.state === 'open');
      if (openPorts.length === 0) {
        output += `  (无开放端口)\n`;
      } else {
        for (const port of openPorts) {
          output += `  - ${port.portid}/${port.protocol}`;
          if (port.service) {
            output += ` (${port.service.name}`;
            if (port.service.product) output += ` - ${port.service.product}`;
            if (port.service.version) output += ` ${port.service.version}`;
            if (port.service.extrainfo) output += ` - ${port.service.extrainfo}`;
            output += `)`;
          }
          output += `\n`;
        }
      }
      output += `\n`;
    }

    return output;
  }
}
