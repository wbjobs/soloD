from typing import List, Dict, Any, Optional, Tuple, Iterator
import logging
import struct
from collections import defaultdict
from OpenSSL import crypto

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


CIPHER_SUITES = {
    0x000A: "TLS_RSA_WITH_3DES_EDE_CBC_SHA",
    0x002F: "TLS_RSA_WITH_AES_128_CBC_SHA",
    0x0035: "TLS_RSA_WITH_AES_256_CBC_SHA",
    0x003C: "TLS_RSA_WITH_AES_128_CBC_SHA256",
    0x003D: "TLS_RSA_WITH_AES_256_CBC_SHA256",
    0x009C: "TLS_RSA_WITH_AES_128_GCM_SHA256",
    0x009D: "TLS_RSA_WITH_AES_256_GCM_SHA384",
    0xC013: "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA",
    0xC014: "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",
    0xC027: "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256",
    0xC028: "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384",
    0xC02F: "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
    0xC030: "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    0x1301: "TLS_AES_128_GCM_SHA256",
    0x1302: "TLS_AES_256_GCM_SHA384",
    0x1303: "TLS_CHACHA20_POLY1305_SHA256",
}


class TlsStreamState:
    def __init__(self):
        self.client_buffer = b''
        self.server_buffer = b''
        self.client_handshake = {}
        self.server_handshake = {}
        self.handshake_complete = False
        self.last_seen = 0


class TLSExtractor:
    def __init__(self, max_streams: int = 50000):
        self.streams = defaultdict(TlsStreamState)
        self.max_streams = max_streams
        self.completed_handshakes = set()
        self.handshake_count = 0
    
    def _get_stream_id(self, src_ip: str, dst_ip: str, src_port: int, dst_port: int) -> Tuple:
        if src_port > dst_port:
            return (src_ip, dst_ip, src_port, dst_port)
        else:
            return (dst_ip, src_ip, dst_port, src_port)
    
    def _cleanup_old_streams(self):
        if len(self.streams) > self.max_streams:
            sorted_streams = sorted(
                self.streams.items(),
                key=lambda x: x[1].last_seen,
                reverse=True
            )
            keep_count = self.max_streams // 2
            for stream_id, _ in sorted_streams[keep_count:]:
                del self.streams[stream_id]
    
    def extract_tls_records(self, payload: bytes) -> List[bytes]:
        records = []
        offset = 0
        while offset + 5 <= len(payload):
            content_type = payload[offset]
            if content_type not in [20, 21, 22, 23]:
                break
            length = struct.unpack("!H", payload[offset + 3:offset + 5])[0]
            if offset + 5 + length > len(payload):
                break
            record_data = payload[offset + 5:offset + 5 + length]
            if content_type == 22:
                records.append(record_data)
            offset += 5 + length
        return records
    
    def parse_client_hello(self, handshake_data: bytes) -> Optional[Dict[str, Any]]:
        result = {}
        try:
            offset = 0
            if len(handshake_data) < 42:
                return None
            
            msg_type = handshake_data[offset]
            if msg_type != 1:
                return None
            
            offset += 1
            hello_len = struct.unpack("!I", b'\x00' + handshake_data[offset:offset + 3])[0]
            offset += 3
            
            if offset + hello_len > len(handshake_data):
                return None
            
            client_version = (handshake_data[offset], handshake_data[offset + 1])
            offset += 2 + 32
            
            session_id_length = handshake_data[offset]
            offset += 1 + session_id_length
            
            cipher_suites_length = struct.unpack("!H", handshake_data[offset:offset + 2])[0]
            offset += 2 + cipher_suites_length
            
            compression_methods_length = handshake_data[offset]
            offset += 1 + compression_methods_length
            
            if offset + 2 > len(handshake_data):
                return result
            
            extensions_length = struct.unpack("!H", handshake_data[offset:offset + 2])[0]
            offset += 2
            
            while offset + 4 <= len(handshake_data):
                ext_type = struct.unpack("!H", handshake_data[offset:offset + 2])[0]
                ext_length = struct.unpack("!H", handshake_data[offset + 2:offset + 4])[0]
                offset += 4
                
                if ext_type == 0:
                    if offset + 2 > len(handshake_data):
                        break
                    list_length = struct.unpack("!H", handshake_data[offset:offset + 2])[0]
                    ext_offset = offset + 2
                    while ext_offset + 3 < offset + list_length:
                        name_type = handshake_data[ext_offset]
                        name_length = struct.unpack("!H", handshake_data[ext_offset + 1:ext_offset + 3])[0]
                        if name_type == 0:
                            sni = handshake_data[ext_offset + 3:ext_offset + 3 + name_length].decode('utf-8', errors='ignore')
                            result['sni'] = sni
                            break
                        ext_offset += 3 + name_length
                
                offset += ext_length
            
            return result if result else None
        except Exception as e:
            logger.debug(f"Error parsing Client Hello: {e}")
            return None
    
    def parse_server_hello(self, handshake_data: bytes) -> Optional[Dict[str, Any]]:
        result = {}
        try:
            offset = 0
            if len(handshake_data) < 38:
                return None
            
            msg_type = handshake_data[offset]
            if msg_type != 2:
                return None
            
            offset += 4
            
            server_version = (handshake_data[offset], handshake_data[offset + 1])
            offset += 2 + 32
            
            session_id_length = handshake_data[offset]
            offset += 1 + session_id_length
            
            if offset + 2 > len(handshake_data):
                return None
            
            cipher_suite_id = struct.unpack("!H", handshake_data[offset:offset + 2])[0]
            result['cipher_suite'] = CIPHER_SUITES.get(cipher_suite_id, f"Unknown (0x{cipher_suite_id:04X})")
            
            return result
        except Exception as e:
            logger.debug(f"Error parsing Server Hello: {e}")
            return None
    
    def parse_certificate(self, handshake_data: bytes) -> Optional[Dict[str, Any]]:
        result = {}
        try:
            offset = 0
            if len(handshake_data) < 3:
                return None
            
            msg_type = handshake_data[offset]
            if msg_type != 11:
                return None
            
            offset += 1
            certs_length = struct.unpack("!I", b'\x00' + handshake_data[offset:offset + 3])[0]
            offset += 3
            
            if offset + certs_length > len(handshake_data):
                return None
            
            certs = []
            certs_end = offset + certs_length
            while offset + 3 < certs_end:
                cert_length = struct.unpack("!I", b'\x00' + handshake_data[offset:offset + 3])[0]
                offset += 3
                if offset + cert_length > certs_end:
                    break
                cert_data = handshake_data[offset:offset + cert_length]
                offset += cert_length
                certs.append(cert_data)
            
            if certs:
                try:
                    cert = crypto.load_certificate(crypto.FILETYPE_ASN1, certs[0])
                    issuer = cert.get_issuer()
                    issuer_components = []
                    for name, value in issuer.get_components():
                        issuer_components.append(f"{name.decode('utf-8')}={value.decode('utf-8', errors='ignore')}")
                    result['cert_issuer'] = ', '.join(issuer_components)
                    result['cert_subject'] = cert.get_subject().CN.decode('utf-8', errors='ignore') if cert.get_subject().CN else None
                except Exception as e:
                    logger.debug(f"Error parsing certificate: {e}")
            
            return result if result else None
        except Exception as e:
            logger.debug(f"Error parsing Certificate message: {e}")
            return None
    
    def process_packet(self, packet: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        src_ip = packet['src_ip']
        dst_ip = packet['dst_ip']
        src_port = packet['src_port']
        dst_port = packet['dst_port']
        timestamp = packet['timestamp']
        
        stream_id = self._get_stream_id(src_ip, dst_ip, src_port, dst_port)
        
        if stream_id in self.completed_handshakes:
            return None
        
        stream_state = self.streams[stream_id]
        stream_state.last_seen = timestamp
        
        is_client_to_server = dst_port == 443
        
        records = self.extract_tls_records(packet['payload'])
        
        for record in records:
            if is_client_to_server:
                client_hello = self.parse_client_hello(record)
                if client_hello:
                    stream_state.client_handshake.update(client_hello)
            else:
                server_hello = self.parse_server_hello(record)
                if server_hello:
                    stream_state.server_handshake.update(server_hello)
                
                cert = self.parse_certificate(record)
                if cert:
                    stream_state.server_handshake.update(cert)
                    
                    if stream_state.client_handshake or stream_state.server_handshake:
                        handshake = {
                            'timestamp': timestamp,
                            'client_ip': stream_id[0] if dst_port != 443 else src_ip,
                            'server_ip': stream_id[1] if dst_port != 443 else dst_ip,
                            **stream_state.client_handshake,
                            **stream_state.server_handshake
                        }
                        
                        self.completed_handshakes.add(stream_id)
                        self.handshake_count += 1
                        
                        if stream_id in self.streams:
                            del self.streams[stream_id]
                        
                        self._cleanup_old_streams()
                        
                        return handshake
        
        self._cleanup_old_streams()
        return None
    
    def process_packet_batch(self, packets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        handshakes = []
        for packet in packets:
            handshake = self.process_packet(packet)
            if handshake:
                handshakes.append(handshake)
        return handshakes
    
    def extract_from_packets(self, tls_packets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        logger.info("Extracting TLS handshake metadata")
        results = []
        
        for pkt in tls_packets:
            handshake = self.process_packet(pkt)
            if handshake:
                results.append(handshake)
        
        logger.info(f"Extracted {len(results)} TLS handshakes")
        return results
    
    def extract_stream(self, packet_batches: Iterator[List[Dict[str, Any]]]) -> Iterator[List[Dict[str, Any]]]:
        logger.info("Streaming extraction of TLS handshake metadata")
        total_handshakes = 0
        
        for batch in packet_batches:
            handshakes = self.process_packet_batch(batch)
            if handshakes:
                total_handshakes += len(handshakes)
                yield handshakes
        
        logger.info(f"Extraction complete: {total_handshakes} total TLS handshakes")
    
    def get_stats(self) -> Dict[str, int]:
        return {
            'active_streams': len(self.streams),
            'completed_handshakes': len(self.completed_handshakes),
            'total_handshakes': self.handshake_count
        }
