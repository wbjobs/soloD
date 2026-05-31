import os
import gzip
import shutil
from pathlib import Path
from typing import Tuple, Optional
from astropy.io import fits


def compress_fits_to_fz(
    input_path: str,
    output_path: Optional[str] = None,
    compression_level: int = 6
) -> Tuple[str, int, float]:
    """
    将FITS文件压缩为.fz格式

    Args:
        input_path: 输入FITS文件路径
        output_path: 输出文件路径，如果为None则自动生成
        compression_level: 压缩级别 1-9

    Returns:
        (output_path, compressed_size, compression_ratio)
    """
    if output_path is None:
        base, _ = os.path.splitext(input_path)
        output_path = f"{base}.fz"

    original_size = os.path.getsize(input_path)

    # 使用astropy读取并压缩FITS文件
    with fits.open(input_path) as hdul:
        # 对每个HDU使用压缩
        compressed_hdul = fits.HDUList()

        for hdu in hdul:
            if isinstance(hdu, fits.ImageHDU) or isinstance(hdu, fits.PrimaryHDU):
                # 使用CompImageHDU进行压缩
                if hdu.data is not None:
                    compressed_hdu = fits.CompImageHDU(
                        hdu.data,
                        header=hdu.header,
                        compression_type='RICE_1',
                        quantize_level=compression_level
                    )
                    compressed_hdul.append(compressed_hdu)
                else:
                    compressed_hdul.append(hdu.copy())
            else:
                compressed_hdul.append(hdu.copy())

        compressed_hdul.writeto(output_path, overwrite=True, checksum=True)

    compressed_size = os.path.getsize(output_path)
    compression_ratio = original_size / compressed_size if compressed_size > 0 else 1.0

    return output_path, compressed_size, compression_ratio


def estimate_download_time(
    file_size: int,
    bandwidth_mbps: float = 10.0
) -> float:
    """
    估算下载时间

    Args:
        file_size: 文件大小(字节)
        bandwidth_mbps: 网络带宽(Mbps)，默认10Mbps

    Returns:
        预估下载时间(秒)
    """
    # Mbps转字节/秒: 1 Mbps = 125,000 字节/秒
    bytes_per_second = bandwidth_mbps * 125000
    estimated_seconds = file_size / bytes_per_second
    return estimated_seconds


def format_download_time(seconds: float) -> str:
    """
    格式化下载时间显示

    Args:
        seconds: 秒数

    Returns:
        格式化字符串
    """
    if seconds < 1:
        return f"{int(seconds * 1000)} ms"
    elif seconds < 60:
        return f"{seconds:.1f} 秒"
    elif seconds < 3600:
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{minutes} 分 {secs} 秒"
    else:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        return f"{hours} 小时 {minutes} 分"


def uncompress_fz(
    input_path: str,
    output_path: Optional[str] = None
) -> str:
    """
    解压.fz文件为标准FITS格式

    Args:
        input_path: 输入.fz文件路径
        output_path: 输出文件路径

    Returns:
        输出文件路径
    """
    if output_path is None:
        base, _ = os.path.splitext(input_path)
        output_path = f"{base}_uncompressed.fits"

    with fits.open(input_path) as hdul:
        # 解压所有HDU
        uncompressed_hdul = fits.HDUList()

        for hdu in hdul:
            if isinstance(hdu, fits.CompImageHDU):
                # 解压压缩HDU
                uncompressed_data = hdu.data
                uncompressed_hdu = fits.ImageHDU(
                    uncompressed_data,
                    header=hdu.header
                )
                uncompressed_hdul.append(uncompressed_hdu)
            else:
                uncompressed_hdul.append(hdu.copy())

        uncompressed_hdul.writeto(output_path, overwrite=True)

    return output_path


def get_compression_info(file_path: str) -> dict:
    """
    获取压缩文件信息

    Args:
        file_path: 文件路径

    Returns:
        压缩信息字典
    """
    is_compressed = file_path.lower().endswith('.fz')

    info = {
        'is_compressed': is_compressed,
        'file_size': os.path.getsize(file_path),
    }

    if is_compressed:
        try:
            with fits.open(file_path) as hdul:
                compression_types = []
                for hdu in hdul:
                    if isinstance(hdu, fits.CompImageHDU):
                        compression_types.append(hdu.compression_type)
                info['compression_types'] = list(set(compression_types))
                info['num_hdus'] = len(hdul)
        except Exception:
            pass

    return info
