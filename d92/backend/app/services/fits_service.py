import hashlib
import os
from typing import Tuple, Optional
from datetime import datetime
from astropy.io import fits
import numpy as np

def calculate_sha256(file_path: str) -> str:
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def extract_fits_metadata(file_path: str) -> dict:
    try:
        with fits.open(file_path) as hdul:
            header = hdul[0].header
            
            observation_time = header.get('DATE-OBS', 
                header.get('DATE', header.get('TIME-OBS', None)))
            if isinstance(observation_time, str):
                try:
                    observation_time = datetime.fromisoformat(observation_time.replace('T', ' '))
                except:
                    observation_time = datetime.now()
            else:
                observation_time = datetime.now()
            
            freq_start = float(header.get('FREQ-SRT', header.get('FREQ-START', 
                header.get('OBS-FREQ', 1000.0))))
            freq_end = float(header.get('FREQ-END', header.get('FREQ-STOP', freq_start + 100.0)))
            
            ra = float(header.get('RA', header.get('OBJCTRA', 0.0)))
            dec = float(header.get('DEC', header.get('OBJCTDEC', 0.0)))
            
            return {
                'observation_time': observation_time,
                'frequency_start': freq_start,
                'frequency_end': freq_end,
                'ra': ra,
                'dec': dec
            }
    except Exception as e:
        return {
            'observation_time': datetime.now(),
            'frequency_start': 1000.0,
            'frequency_end': 2000.0,
            'ra': 180.0,
            'dec': 0.0
        }
