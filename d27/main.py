#!/usr/bin/env python3
import argparse
import os
import sys
import logging
import gc
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Iterator, Optional
from tqdm import tqdm

from pcap_parser import PcapParser
from tls_extractor import TLSExtractor
from ip_mapper import GeoIPMapper
from report_generator import ReportGenerator

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def parse_time(time_str: str) -> Optional[float]:
    if not time_str:
        return None
    
    formats = [
        '%Y-%m-%d %H:%M:%S',
        '%Y-%m-%d %H:%M:%S.%f',
        '%Y-%m-%dT%H:%M:%S',
        '%Y-%m-%dT%H:%M:%S.%f',
        '%Y/%m/%d %H:%M:%S',
        '%Y/%m/%d %H:%M:%S.%f',
        '%Y%m%d %H%M%S',
        '%Y-%m-%d',
        '%Y/%m/%d',
        '%Y%m%d',
    ]
    
    for fmt in formats:
        try:
            dt = datetime.strptime(time_str, fmt)
            return dt.timestamp()
        except ValueError:
            continue
    
    try:
        return float(time_str)
    except ValueError:
        pass
    
    logger.error(f"Unable to parse time: {time_str}")
    logger.error("Supported formats: YYYY-MM-DD HH:MM:SS, YYYY-MM-DDTHH:MM:SS, or Unix timestamp")
    return None


def filter_by_time(handshakes: List[Dict[str, Any]], start_time: Optional[float], end_time: Optional[float]) -> List[Dict[str, Any]]:
    if start_time is None and end_time is None:
        return handshakes
    
    filtered = []
    for h in handshakes:
        ts = h.get('timestamp')
        if ts is None:
            continue
        if start_time is not None and ts < start_time:
            continue
        if end_time is not None and ts > end_time:
            continue
        filtered.append(h)
    
    logger.info(f"Time filter applied: {len(handshakes)} -> {len(filtered)} handshakes")
    return filtered


def process_single_pcap_streaming(pcap_file: str, geo_mapper: GeoIPMapper = None, batch_size: int = 5000,
                                   start_time: Optional[float] = None, end_time: Optional[float] = None) -> Dict[str, Any]:
    try:
        logger.info(f"Starting streaming processing of: {pcap_file}")
        if start_time is not None or end_time is not None:
            logger.info(f"Time window filter: {start_time} - {end_time}")
        
        parser = PcapParser(pcap_file, stream_tracking=True)
        extractor = TLSExtractor(max_streams=50000)
        
        all_handshakes = []
        handshake_batch = []
        batch_count = 0
        
        for packet_batch in parser.parse_stream(batch_size=batch_size):
            if start_time is not None or end_time is not None:
                filtered_packets = []
                for pkt in packet_batch:
                    ts = pkt.get('timestamp')
                    if ts is None:
                        continue
                    if start_time is not None and ts < start_time:
                        continue
                    if end_time is not None and ts > end_time:
                        continue
                    filtered_packets.append(pkt)
                packet_batch = filtered_packets
            
            handshakes = extractor.process_packet_batch(packet_batch)
            handshake_batch.extend(handshakes)
            
            batch_count += 1
            if batch_count % 20 == 0:
                all_handshakes.extend(handshake_batch)
                handshake_batch = []
                gc.collect()
                logger.debug(f"Processed {batch_count} batches, {len(all_handshakes)} handshakes found")
        
        if handshake_batch:
            all_handshakes.extend(handshake_batch)
        
        server_ips = parser.get_server_ips()
        logger.info(f"Found {len(server_ips)} unique server IPs")
        
        geo_data = {}
        if geo_mapper and server_ips:
            logger.info("Performing IP geolocation lookup")
            geo_data = geo_mapper.batch_lookup(server_ips)
        
        stats = extractor.get_stats()
        logger.info(f"TLS stream stats: {stats}")
        
        return {
            'file': pcap_file,
            'handshakes': all_handshakes,
            'geo_data': geo_data,
            'stats': stats
        }
    except Exception as e:
        logger.error(f"Error processing {pcap_file}: {e}", exc_info=True)
        return {'file': pcap_file, 'handshakes': [], 'geo_data': {}, 'error': str(e)}


def process_single_pcap_legacy(pcap_file: str, geo_mapper: GeoIPMapper = None,
                                start_time: Optional[float] = None, end_time: Optional[float] = None) -> Dict[str, Any]:
    try:
        parser = PcapParser(pcap_file, stream_tracking=True)
        tls_packets = parser.parse()
        
        if not tls_packets:
            return {'file': pcap_file, 'handshakes': [], 'geo_data': {}}
        
        if start_time is not None or end_time is not None:
            filtered_packets = []
            for pkt in tls_packets:
                ts = pkt.get('timestamp')
                if ts is None:
                    continue
                if start_time is not None and ts < start_time:
                    continue
                if end_time is not None and ts > end_time:
                    continue
                filtered_packets.append(pkt)
            tls_packets = filtered_packets
            logger.info(f"Time filter applied to packets: keep {len(tls_packets)} packets")
        
        extractor = TLSExtractor()
        handshakes = extractor.extract_from_packets(tls_packets)
        
        server_ips = parser.get_server_ips()
        if geo_mapper and server_ips:
            geo_data = geo_mapper.batch_lookup(server_ips)
        else:
            geo_data = {}
        
        return {
            'file': pcap_file,
            'handshakes': handshakes,
            'geo_data': geo_data
        }
    except Exception as e:
        logger.error(f"Error processing {pcap_file}: {e}")
        return {'file': pcap_file, 'handshakes': [], 'geo_data': {}, 'error': str(e)}


def main():
    parser = argparse.ArgumentParser(
        description='TLS Handshake Analyzer - Extract TLS metadata and geolocation from PCAP files'
    )
    
    parser.add_argument(
        'pcap_files',
        nargs='+',
        help='PCAP file(s) to analyze (supports wildcards)'
    )
    
    parser.add_argument(
        '-o', '--output',
        help='Output file path (default: stdout)'
    )
    
    parser.add_argument(
        '-f', '--format',
        choices=['text', 'json', 'csv'],
        default='text',
        help='Output format (default: text)'
    )
    
    parser.add_argument(
        '-t', '--threads',
        type=int,
        default=4,
        help='Number of threads for parallel processing (default: 4)'
    )
    
    parser.add_argument(
        '--no-geo',
        action='store_true',
        help='Skip IP geolocation lookup'
    )
    
    parser.add_argument(
        '--geo-db',
        help='Path to custom GeoLite2-City.mmdb database file'
    )
    
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )
    
    parser.add_argument(
        '--batch-size',
        type=int,
        default=5000,
        help='Batch size for streaming processing (default: 5000)'
    )
    
    parser.add_argument(
        '--no-stream',
        action='store_true',
        help='Disable streaming mode (use only for small pcap files)'
    )
    
    parser.add_argument(
        '--start-time',
        help='Start time for filtering (formats: YYYY-MM-DD HH:MM:SS, YYYY-MM-DDTHH:MM:SS, Unix timestamp)'
    )
    
    parser.add_argument(
        '--end-time',
        help='End time for filtering (formats: YYYY-MM-DD HH:MM:SS, YYYY-MM-DDTHH:MM:SS, Unix timestamp)'
    )
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    start_ts = parse_time(args.start_time)
    end_ts = parse_time(args.end_time)
    
    if args.start_time is not None and start_ts is None:
        sys.exit(1)
    if args.end_time is not None and end_ts is None:
        sys.exit(1)
    
    if start_ts is not None or end_ts is not None:
        start_str = datetime.fromtimestamp(start_ts).isoformat() if start_ts else "unbounded"
        end_str = datetime.fromtimestamp(end_ts).isoformat() if end_ts else "unbounded"
        logger.info(f"Time window filter: [{start_str}] to [{end_str}]")
    
    pcap_files = []
    import glob
    for pattern in args.pcap_files:
        matched = glob.glob(pattern)
        if matched:
            pcap_files.extend(matched)
        else:
            if os.path.exists(pattern):
                pcap_files.append(pattern)
    
    pcap_files = list(set(pcap_files))
    if not pcap_files:
        logger.error("No valid PCAP files found")
        sys.exit(1)
    
    logger.info(f"Found {len(pcap_files)} PCAP file(s) to process")
    
    geo_mapper = None
    if not args.no_geo:
        try:
            geo_mapper = GeoIPMapper(args.geo_db)
        except Exception as e:
            logger.warning(f"Failed to initialize GeoIP mapper: {e}")
            logger.warning("Continuing without geolocation...")
    
    all_handshakes = []
    all_geo_data = {}
    
    if len(pcap_files) == 1:
        pcap_file = pcap_files[0]
        file_size = os.path.getsize(pcap_file)
        file_size_mb = file_size / (1024 * 1024)
        
        logger.info(f"File size: {file_size_mb:.1f} MB")
        
        if args.no_stream or file_size_mb < 100:
            logger.info("Using legacy processing mode")
            result = process_single_pcap_legacy(pcap_file, geo_mapper, start_ts, end_ts)
        else:
            logger.info("Using streaming processing mode for large file")
            result = process_single_pcap_streaming(pcap_file, geo_mapper, args.batch_size, start_ts, end_ts)
        
        all_handshakes.extend(result['handshakes'])
        all_geo_data.update(result['geo_data'])
    else:
        logger.info(f"Processing {len(pcap_files)} files with {args.threads} threads")
        
        def process_file(pcap_file):
            file_size_mb = os.path.getsize(pcap_file) / (1024 * 1024)
            if args.no_stream or file_size_mb < 100:
                return process_single_pcap_legacy(pcap_file, None, start_ts, end_ts)
            else:
                return process_single_pcap_streaming(pcap_file, None, args.batch_size, start_ts, end_ts)
        
        with ThreadPoolExecutor(max_workers=args.threads) as executor:
            futures = {executor.submit(process_file, pcap_file): pcap_file 
                      for pcap_file in pcap_files}
            
            with tqdm(total=len(futures), desc="Processing PCAP files") as pbar:
                for future in as_completed(futures):
                    result = future.result()
                    all_handshakes.extend(result['handshakes'])
                    all_geo_data.update(result['geo_data'])
                    pbar.update(1)
        
        if geo_mapper:
            all_ips = set()
            for handshake in all_handshakes:
                if 'server_ip' in handshake:
                    all_ips.add(handshake['server_ip'])
            if all_ips:
                logger.info(f"Performing bulk geolocation for {len(all_ips)} IPs")
                all_geo_data = geo_mapper.batch_lookup(list(all_ips))
    
    if geo_mapper:
        geo_mapper.close()
    
    logger.info(f"Total TLS handshakes extracted: {len(all_handshakes)}")
    
    report_generator = ReportGenerator(args.format)
    report = report_generator.generate(all_handshakes, all_geo_data, args.output)
    
    if not args.output:
        print(report)
    
    logger.info("Analysis completed successfully")


if __name__ == '__main__':
    main()
