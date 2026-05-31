from scapy.all import PcapReader, TCP, IP
from typing import List, Dict, Any, Iterator, Tuple
import logging
from collections import defaultdict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TcpStreamTracker:
    def __init__(self):
        self.streams = defaultdict(dict)
        self.processed_seqs = defaultdict(set)
        self.handshake_complete = set()
    
    def _get_stream_id(self, src_ip: str, dst_ip: str, src_port: int, dst_port: int) -> Tuple:
        if src_port > dst_port:
            return (src_ip, dst_ip, src_port, dst_port)
        else:
            return (dst_ip, src_ip, dst_port, src_port)
    
    def is_packet_processed(self, src_ip: str, dst_ip: str, src_port: int, dst_port: int, seq: int) -> bool:
        stream_id = self._get_stream_id(src_ip, dst_ip, src_port, dst_port)
        return seq in self.processed_seqs[stream_id]
    
    def mark_processed(self, src_ip: str, dst_ip: str, src_port: int, dst_port: int, seq: int):
        stream_id = self._get_stream_id(src_ip, dst_ip, src_port, dst_port)
        self.processed_seqs[stream_id].add(seq)
    
    def is_handshake_complete(self, src_ip: str, dst_ip: str, src_port: int, dst_port: int) -> bool:
        stream_id = self._get_stream_id(src_ip, dst_ip, src_port, dst_port)
        return stream_id in self.handshake_complete
    
    def mark_handshake_complete(self, src_ip: str, dst_ip: str, src_port: int, dst_port: int):
        stream_id = self._get_stream_id(src_ip, dst_ip, src_port, dst_port)
        self.handshake_complete.add(stream_id)
    
    def cleanup_old_streams(self, max_streams: int = 10000):
        if len(self.processed_seqs) > max_streams:
            keys = list(self.processed_seqs.keys())
            for key in keys[:len(keys) // 2]:
                del self.processed_seqs[key]
            for key in list(self.handshake_complete)[:len(self.handshake_complete) // 2]:
                self.handshake_complete.remove(key)
            logger.debug(f"Cleaned up old TCP streams, remaining: {len(self.processed_seqs)}")


class PcapParser:
    def __init__(self, pcap_file: str, stream_tracking: bool = True):
        self.pcap_file = pcap_file
        self.stream_tracking = stream_tracking
        self.stream_tracker = TcpStreamTracker() if stream_tracking else None
        self._server_ips = set()
    
    def parse_stream(self, batch_size: int = 1000) -> Iterator[List[Dict[str, Any]]]:
        logger.info(f"Streaming parsing pcap file: {self.pcap_file}")
        packet_count = 0
        tls_count = 0
        batch = []
        
        try:
            with PcapReader(self.pcap_file) as pcap_reader:
                for pkt in pcap_reader:
                    packet_count += 1
                    
                    if pkt.haslayer(TCP) and pkt.haslayer(IP):
                        tcp_layer = pkt[TCP]
                        ip_layer = pkt[IP]
                        
                        if tcp_layer.dport == 443 or tcp_layer.sport == 443:
                            if len(tcp_layer.payload) > 0:
                                src_ip = ip_layer.src
                                dst_ip = ip_layer.dst
                                src_port = tcp_layer.sport
                                dst_port = tcp_layer.dport
                                seq = tcp_layer.seq
                                
                                if self.stream_tracker:
                                    if self.stream_tracker.is_packet_processed(src_ip, dst_ip, src_port, dst_port, seq):
                                        continue
                                    
                                    if self.stream_tracker.is_handshake_complete(src_ip, dst_ip, src_port, dst_port):
                                        continue
                                    
                                    self.stream_tracker.mark_processed(src_ip, dst_ip, src_port, dst_port, seq)
                                    self.stream_tracker.cleanup_old_streams()
                                
                                batch.append({
                                    'src_ip': src_ip,
                                    'dst_ip': dst_ip,
                                    'src_port': src_port,
                                    'dst_port': dst_port,
                                    'payload': bytes(tcp_layer.payload),
                                    'timestamp': float(pkt.time),
                                    'seq': seq,
                                    'ack': tcp_layer.ack
                                })
                                tls_count += 1
                                
                                if dst_port == 443:
                                    self._server_ips.add(dst_ip)
                                elif src_port == 443:
                                    self._server_ips.add(src_ip)
                                
                                if len(batch) >= batch_size:
                                    yield batch
                                    batch = []
                    
                    if packet_count % 100000 == 0:
                        logger.debug(f"Processed {packet_count} packets, found {tls_count} TLS packets")
                
                if batch:
                    yield batch
                
                logger.info(f"Parsing complete: {packet_count} total packets, {tls_count} TLS packets")
                
        except Exception as e:
            logger.error(f"Error parsing pcap file: {e}")
            if batch:
                yield batch
    
    def parse(self) -> List[Dict[str, Any]]:
        all_packets = []
        for batch in self.parse_stream(batch_size=10000):
            all_packets.extend(batch)
        return all_packets
    
    def get_server_ips(self, tls_packets: List[Dict[str, Any]] = None) -> List[str]:
        if tls_packets is None:
            return list(self._server_ips)
        server_ips = set(self._server_ips)
        for pkt in tls_packets:
            if pkt['dst_port'] == 443:
                server_ips.add(pkt['dst_ip'])
            elif pkt['src_port'] == 443:
                server_ips.add(pkt['src_ip'])
        return list(server_ips)
    
    def mark_stream_handshake_complete(self, src_ip: str, dst_ip: str, src_port: int, dst_port: int):
        if self.stream_tracker:
            self.stream_tracker.mark_handshake_complete(src_ip, dst_ip, src_port, dst_port)
