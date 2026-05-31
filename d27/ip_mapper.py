import geoip2.database
import os
import logging
from typing import Dict, Optional
import urllib.request
import tarfile

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class GeoIPMapper:
    def __init__(self, db_path: str = None):
        if db_path is None:
            db_path = os.path.join(os.path.dirname(__file__), 'GeoLite2-City.mmdb')
        self.db_path = db_path
        self.reader = None
        self._ensure_database()

    def _ensure_database(self):
        if not os.path.exists(self.db_path):
            logger.info("GeoIP database not found, downloading...")
            self._download_database()
        try:
            self.reader = geoip2.database.Reader(self.db_path)
            logger.info("GeoIP database loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load GeoIP database: {e}")
            self.reader = None

    def _download_database(self):
        url = "https://git.io/GeoLite2-City.mmdb"
        try:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            logger.info(f"Downloading GeoLite2-City database from: {url}")
            urllib.request.urlretrieve(url, self.db_path)
            logger.info("GeoIP database downloaded successfully")
        except Exception as e:
            logger.error(f"Failed to download GeoIP database: {e}")
            raise

    def lookup(self, ip_address: str) -> Optional[Dict[str, str]]:
        if self.reader is None:
            return None
        try:
            response = self.reader.city(ip_address)
            return {
                'ip': ip_address,
                'country': response.country.name if response.country.name else 'Unknown',
                'country_code': response.country.iso_code if response.country.iso_code else 'Unknown',
                'city': response.city.name if response.city.name else 'Unknown',
                'latitude': response.location.latitude if response.location.latitude else None,
                'longitude': response.location.longitude if response.location.longitude else None,
                'timezone': response.location.time_zone if response.location.time_zone else None
            }
        except geoip2.errors.AddressNotFoundError:
            logger.debug(f"IP address not found: {ip_address}")
            return {
                'ip': ip_address,
                'country': 'Unknown',
                'country_code': 'Unknown',
                'city': 'Unknown',
                'latitude': None,
                'longitude': None,
                'timezone': None
            }
        except Exception as e:
            logger.error(f"Error looking up IP {ip_address}: {e}")
            return None

    def batch_lookup(self, ip_addresses: list) -> Dict[str, Dict[str, str]]:
        results = {}
        unique_ips = list(set(ip_addresses))
        logger.info(f"Looking up geolocation for {len(unique_ips)} unique IPs")
        for ip in unique_ips:
            result = self.lookup(ip)
            if result:
                results[ip] = result
        return results

    def close(self):
        if self.reader:
            self.reader.close()
