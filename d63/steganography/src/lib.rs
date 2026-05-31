use wasm_bindgen::prelude::*;
use image::{ImageBuffer, Rgba, DynamicImage, ImageOutputFormat};
use std::io::Cursor;

/// XOR 加密/解密函数（加密和解密使用相同的操作）
fn xor_cipher(data: &[u8], password: &str) -> Vec<u8> {
    let password_bytes = password.as_bytes();
    if password_bytes.is_empty() {
        return data.to_vec();
    }
    
    data.iter()
        .enumerate()
        .map(|(i, &byte)| byte ^ password_bytes[i % password_bytes.len()])
        .collect()
}

#[wasm_bindgen]
pub fn encode_image(carrier: &[u8], secret: &str, password: &str) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(carrier)
        .map_err(|e| format!("Failed to load image: {}", e))?;
    
    let mut rgba: ImageBuffer<Rgba<u8>, Vec<u8>> = img.to_rgba8();
    
    // 使用密码对秘密信息进行 XOR 加密
    let encrypted_secret = xor_cipher(secret.as_bytes(), password);
    let secret_len = encrypted_secret.len();
    
    let pixel_count = rgba.pixels().count();
    let max_bytes = (pixel_count * 3) / 8 - 4;
    
    if secret_len > max_bytes {
        return Err(format!(
            "Secret too large! Max {} bytes for this image, got {} bytes",
            max_bytes, secret_len
        ));
    }
    
    let pixels = rgba.as_mut();
    let mut bit_index = 0;
    
    for i in 0..32 {
        let pixel_byte_idx = (i / 3) * 4;
        let channel = i % 3;
        let len_bit = ((secret_len as u32 >> i) & 1) as u8;
        pixels[pixel_byte_idx + channel] = (pixels[pixel_byte_idx + channel] & 0xFE) | len_bit;
    }
    
    bit_index = 32;
    
    for &byte in &encrypted_secret {
        for i in 0..8 {
            let pixel_byte_idx = (bit_index / 3) * 4;
            let channel = bit_index % 3;
            let bit = (byte >> i) & 1;
            pixels[pixel_byte_idx + channel] = (pixels[pixel_byte_idx + channel] & 0xFE) | bit;
            bit_index += 1;
        }
    }
    
    let mut output = Vec::new();
    let mut cursor = Cursor::new(&mut output);
    
    let dynamic_img = DynamicImage::ImageRgba8(rgba);
    dynamic_img.write_to(&mut cursor, ImageOutputFormat::Png)
        .map_err(|e| format!("Failed to write image: {}", e))?;
    
    Ok(output)
}

#[wasm_bindgen]
pub fn decode_image(stego: &[u8], password: &str) -> Result<String, String> {
    let img = image::load_from_memory(stego)
        .map_err(|e| format!("Failed to load image: {}", e))?;
    
    let rgba = img.to_rgba8();
    let pixels = rgba.as_raw();
    
    let mut secret_len: u32 = 0;
    
    for i in 0..32 {
        let pixel_byte_idx = (i / 3) * 4;
        let channel = i % 3;
        let bit = (pixels[pixel_byte_idx + channel] & 1) as u32;
        secret_len |= bit << i;
    }
    
    if secret_len == 0 || secret_len > 10_000_000 {
        return Err("No valid hidden message found".to_string());
    }
    
    let mut secret_bytes = Vec::with_capacity(secret_len as usize);
    let mut bit_index = 32;
    
    for _ in 0..secret_len {
        let mut byte: u8 = 0;
        for i in 0..8 {
            let pixel_byte_idx = (bit_index / 3) * 4;
            let channel = bit_index % 3;
            let bit = pixels[pixel_byte_idx + channel] & 1;
            byte |= bit << i;
            bit_index += 1;
        }
        secret_bytes.push(byte);
    }
    
    // 使用密码对提取的字节进行 XOR 解密
    let decrypted_bytes = xor_cipher(&secret_bytes, password);
    
    String::from_utf8(decrypted_bytes)
        .map_err(|e| format!("Failed to decode UTF-8 (wrong password?): {}", e))
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}
