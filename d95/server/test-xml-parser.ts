import { XmlParserService } from './src/services/xmlParser';
import * as fs from 'fs';
import * as path from 'path';

async function testXmlParser() {
  console.log('========================================');
  console.log('测试 XML 解析器');
  console.log('========================================\n');

  const parser = new XmlParserService();
  
  const testXmlPath = path.join(__dirname, '..', 'example-scan.xml');
  
  if (!fs.existsSync(testXmlPath)) {
    console.error('❌ 测试文件不存在:', testXmlPath);
    process.exit(1);
  }

  console.log('📄 读取测试文件:', testXmlPath);
  
  const xmlContent = fs.readFileSync(testXmlPath, 'utf-8');
  console.log('✅ 文件读取成功\n');

  try {
    console.log('🔍 开始解析 XML...');
    const result = await parser.parseNmapXml(xmlContent);
    
    console.log('\n✅ 解析成功!');
    console.log('========================================');
    console.log('解析结果:');
    console.log('========================================');
    console.log('开始时间:', result.startTime);
    console.log('主机数量:', result.hosts.length);
    console.log('总端口数:', result.totalPorts);
    console.log('开放端口数:', result.openPorts);
    console.log('');

    for (const host of result.hosts) {
      console.log('🌐 主机地址:', host.address);
      if (host.hostname) {
        console.log('   主机名:', host.hostname);
      }
      console.log('   端口数:', host.ports.length);
      
      const openPorts = host.ports.filter(p => p.state === 'open');
      console.log('   开放端口:');
      
      for (const port of openPorts) {
        let portInfo = `     ${port.portid}/${port.protocol}`;
        if (port.service) {
          portInfo += ` - ${port.service.name}`;
          if (port.service.version) portInfo += ` v${port.service.version}`;
        }
        console.log(portInfo);
      }
      console.log('');
    }

    console.log('========================================');
    console.log('📝 格式化输出 (用于LLM):');
    console.log('========================================');
    const formatted = parser.formatScanResultForLLM(result);
    console.log(formatted);
    
    console.log('\n========================================');
    console.log('✅ 所有测试通过!');
    console.log('========================================');
    
  } catch (error) {
    console.error('\n❌ 解析失败:', error);
    process.exit(1);
  }
}

testXmlParser();
