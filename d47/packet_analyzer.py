from scapy.all import rdpcap, IP, TCP, UDP
from scapy.error import Scapy_Exception
from collections import defaultdict
from datetime import datetime


class PacketAnalyzer:
    def __init__(self):
        self.packets = []
        self.ip_stats = defaultdict(lambda: {'sent': 0, 'received': 0, 'total': 0})
        self.packet_details = []
        self.parse_errors = 0

    def load_pcap(self, file_path):
        try:
            self.packets = rdpcap(file_path)
            self.parse_errors = 0
            self._analyze_packets()
            msg = f"成功加载 {len(self.packets)} 个数据包"
            if self.parse_errors > 0:
                msg += f"（{self.parse_errors} 个数据包解析时被跳过）"
            return True, msg
        except Scapy_Exception as e:
            return False, f"Scapy 解析错误: {str(e)}"
        except Exception as e:
            return False, f"加载文件失败: {str(e)}"

    def _analyze_packets(self):
        self.ip_stats.clear()
        self.packet_details.clear()

        for idx, pkt in enumerate(self.packets):
            detail = {
                'no': idx + 1,
                'time': self._safe_get_time(pkt),
                'src_ip': '',
                'dst_ip': '',
                'protocol': '',
                'src_port': '',
                'dst_port': '',
                'length': len(pkt),
                'tcp_flags': '',
                'tcp_seq': '',
                'tcp_ack': '',
                'tcp_window': '',
                'udp_length': ''
            }

            try:
                if IP in pkt:
                    ip_layer = pkt[IP]
                    detail['src_ip'] = self._safe_get_attr(ip_layer, 'src')
                    detail['dst_ip'] = self._safe_get_attr(ip_layer, 'dst')

                    if detail['src_ip']:
                        self.ip_stats[detail['src_ip']]['sent'] += 1
                        self.ip_stats[detail['src_ip']]['total'] += 1
                    if detail['dst_ip']:
                        self.ip_stats[detail['dst_ip']]['received'] += 1
                        self.ip_stats[detail['dst_ip']]['total'] += 1

                    if ip_layer.flags & 0x1:
                        detail['protocol'] = 'IP-Fragment'
                    elif TCP in pkt:
                        tcp_layer = pkt[TCP]
                        detail['protocol'] = 'TCP'
                        detail['src_port'] = str(tcp_layer.sport)
                        detail['dst_port'] = str(tcp_layer.dport)
                        detail['tcp_flags'] = self._get_tcp_flags(tcp_layer.flags)
                        detail['tcp_seq'] = str(tcp_layer.seq)
                        detail['tcp_ack'] = str(tcp_layer.ack)
                        detail['tcp_window'] = str(tcp_layer.window)
                    elif UDP in pkt:
                        udp_layer = pkt[UDP]
                        detail['protocol'] = 'UDP'
                        detail['src_port'] = str(udp_layer.sport)
                        detail['dst_port'] = str(udp_layer.dport)
                        detail['udp_length'] = str(udp_layer.len)
                    else:
                        detail['protocol'] = 'IP'
                elif TCP in pkt:
                    detail['protocol'] = 'TCP'
                    tcp_layer = pkt[TCP]
                    detail['src_port'] = str(tcp_layer.sport)
                    detail['dst_port'] = str(tcp_layer.dport)
                    detail['tcp_flags'] = self._get_tcp_flags(tcp_layer.flags)
                elif UDP in pkt:
                    detail['protocol'] = 'UDP'
                    udp_layer = pkt[UDP]
                    detail['src_port'] = str(udp_layer.sport)
                    detail['dst_port'] = str(udp_layer.dport)

            except (Scapy_Exception, AttributeError, IndexError, ValueError, TypeError) as e:
                self.parse_errors += 1
                if detail['protocol'] == 'IP-Fragment':
                    detail['protocol'] = 'Fragment'
                else:
                    detail['protocol'] = 'Parse-Error'

            self.packet_details.append(detail)

    def _safe_get_time(self, pkt):
        try:
            return datetime.fromtimestamp(float(pkt.time)).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        except (ValueError, TypeError, OverflowError):
            return '1970-01-01 00:00:00.000'

    def _safe_get_attr(self, obj, attr):
        try:
            return str(getattr(obj, attr, ''))
        except Exception:
            return ''
    
    def _get_tcp_flags(self, flags):
        flag_map = {
            'S': 'SYN',
            'A': 'ACK',
            'F': 'FIN',
            'R': 'RST',
            'P': 'PSH',
            'U': 'URG',
            'E': 'ECE',
            'C': 'CWR',
            'N': 'NS'
        }
        result = []
        for f in str(flags):
            if f in flag_map:
                result.append(flag_map[f])
        return ','.join(result) if result else str(flags)
    
    def get_packet_list(self):
        return self.packet_details
    
    def get_ip_statistics(self):
        sorted_ips = sorted(
            self.ip_stats.items(),
            key=lambda x: x[1]['total'],
            reverse=True
        )
        return [
            {
                'ip': ip,
                'sent': stats['sent'],
                'received': stats['received'],
                'total': stats['total']
            }
            for ip, stats in sorted_ips
        ]
    
    def get_protocol_stats(self):
        stats = defaultdict(int)
        for detail in self.packet_details:
            if detail['protocol']:
                stats[detail['protocol']] += 1
        return dict(stats)
