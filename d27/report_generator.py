from typing import List, Dict, Any
import json
import csv
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ReportGenerator:
    def __init__(self, output_format: str = 'text'):
        self.output_format = output_format.lower()

    def generate(self, tls_handshakes: List[Dict[str, Any]], geo_data: Dict[str, Dict[str, str]], output_file: str = None):
        logger.info(f"Generating report in {self.output_format} format")
        
        enriched_data = self._enrich_with_geo(tls_handshakes, geo_data)
        
        if self.output_format == 'json':
            return self._generate_json(enriched_data, output_file)
        elif self.output_format == 'csv':
            return self._generate_csv(enriched_data, output_file)
        else:
            return self._generate_text(enriched_data, output_file)

    def _enrich_with_geo(self, tls_handshakes: List[Dict[str, Any]], geo_data: Dict[str, Dict[str, str]]) -> List[Dict[str, Any]]:
        enriched = []
        for handshake in tls_handshakes:
            server_ip = handshake.get('server_ip')
            geo_info = geo_data.get(server_ip, {}) if server_ip else {}
            
            enriched_handshake = {
                'timestamp': handshake.get('timestamp'),
                'datetime': datetime.fromtimestamp(handshake.get('timestamp')).isoformat() if handshake.get('timestamp') else None,
                'server_ip': server_ip,
                'client_ip': handshake.get('client_ip'),
                'sni': handshake.get('sni', 'N/A'),
                'cert_issuer': handshake.get('cert_issuer', 'N/A'),
                'cert_subject': handshake.get('cert_subject', 'N/A'),
                'cipher_suite': handshake.get('cipher_suite', 'N/A'),
                'country': geo_info.get('country', 'N/A'),
                'country_code': geo_info.get('country_code', 'N/A'),
                'city': geo_info.get('city', 'N/A'),
                'latitude': geo_info.get('latitude'),
                'longitude': geo_info.get('longitude'),
                'timezone': geo_info.get('timezone', 'N/A')
            }
            enriched.append(enriched_handshake)
        return enriched

    def _generate_text(self, data: List[Dict[str, Any]], output_file: str = None) -> str:
        lines = []
        lines.append("=" * 100)
        lines.append("TLS HANDSHAKE ANALYSIS REPORT")
        lines.append("=" * 100)
        lines.append(f"Total Handshakes: {len(data)}")
        lines.append(f"Report Generated: {datetime.now().isoformat()}")
        lines.append("")

        for i, record in enumerate(data, 1):
            lines.append(f"--- Handshake #{i} ---")
            lines.append(f"Timestamp: {record['datetime']}")
            lines.append(f"Server IP: {record['server_ip']}")
            lines.append(f"Client IP: {record['client_ip']}")
            lines.append(f"Server Name (SNI): {record['sni']}")
            lines.append(f"Location: {record['city']}, {record['country']} ({record['country_code']})")
            lines.append(f"Latitude/Longitude: {record['latitude']}, {record['longitude']}")
            lines.append(f"Timezone: {record['timezone']}")
            lines.append(f"Cipher Suite: {record['cipher_suite']}")
            lines.append(f"Certificate Issuer: {record['cert_issuer']}")
            lines.append(f"Certificate Subject: {record['cert_subject']}")
            lines.append("")

        lines.append("=" * 100)
        lines.append(f"Summary Statistics")
        lines.append("=" * 100)
        
        unique_snis = set(r['sni'] for r in data if r['sni'] != 'N/A')
        unique_ips = set(r['server_ip'] for r in data)
        unique_countries = set(r['country'] for r in data if r['country'] != 'N/A')
        
        lines.append(f"Unique Server Names: {len(unique_snis)}")
        lines.append(f"Unique Server IPs: {len(unique_ips)}")
        lines.append(f"Unique Countries: {len(unique_countries)}")
        
        if unique_snis:
            lines.append(f"\nTop Server Names:")
            for sni in sorted(unique_snis)[:10]:
                lines.append(f"  - {sni}")

        report = "\n".join(lines)
        
        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(report)
            logger.info(f"Text report saved to: {output_file}")
        
        return report

    def _generate_json(self, data: List[Dict[str, Any]], output_file: str = None) -> str:
        report = {
            'metadata': {
                'generated_at': datetime.now().isoformat(),
                'total_handshakes': len(data)
            },
            'handshakes': data
        }
        
        json_str = json.dumps(report, indent=2, ensure_ascii=False)
        
        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(json_str)
            logger.info(f"JSON report saved to: {output_file}")
        
        return json_str

    def _generate_csv(self, data: List[Dict[str, Any]], output_file: str = None) -> str:
        if not data:
            return ""
        
        fieldnames = [
            'timestamp', 'datetime', 'server_ip', 'client_ip',
            'sni', 'cert_issuer', 'cert_subject', 'cipher_suite',
            'country', 'country_code', 'city', 'latitude', 'longitude', 'timezone'
        ]
        
        if output_file:
            with open(output_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(data)
            logger.info(f"CSV report saved to: {output_file}")
        
        import io
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)
        return output.getvalue()
