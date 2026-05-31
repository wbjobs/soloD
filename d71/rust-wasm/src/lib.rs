use wasm_bindgen::prelude::*;
use web_sys::ImageData;
use std::cmp::{min, max};

#[wasm_bindgen]
pub struct VideoProcessor {
    width: u32,
    height: u32,
    kernel: Vec<f32>,
}

#[wasm_bindgen]
impl VideoProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32) -> VideoProcessor {
        let width = max(width, 1);
        let height = max(height, 1);
        let kernel = Self::create_gaussian_kernel(5, 2.0);
        VideoProcessor {
            width,
            height,
            kernel,
        }
    }

    fn create_gaussian_kernel(size: usize, sigma: f32) -> Vec<f32> {
        let size = max(size, 1);
        let mut kernel = vec![0.0; size * size];
        let center = size as f32 / 2.0;
        let mut sum = 0.0;

        for y in 0..size {
            for x in 0..size {
                let dx = x as f32 - center + 0.5;
                let dy = y as f32 - center + 0.5;
                let value = (- (dx * dx + dy * dy) / (2.0 * sigma * sigma)).exp();
                kernel[y * size + x] = value;
                sum += value;
            }
        }

        for val in kernel.iter_mut() {
            *val /= sum;
        }

        kernel
    }

    fn is_skin_pixel(r: u8, g: u8, b: u8) -> bool {
        let r_f = r as f32;
        let g_f = g as f32;
        let b_f = b as f32;

        let rgb_condition = r_f > 95.0 && g_f > 40.0 && b_f > 20.0
            && (r_f - g_f).abs() > 15.0
            && r_f > g_f
            && r_f > b_f;

        let ycbcr_condition = {
            let y = 0.299 * r_f + 0.587 * g_f + 0.114 * b_f;
            let cb = (b_f - y) * 0.564 + 128.0;
            let cr = (r_f - y) * 0.713 + 128.0;
            cr >= 133.0 && cr <= 173.0 && cb >= 77.0 && cb <= 127.0
        };

        rgb_condition || ycbcr_condition
    }

    pub fn process_frame(&mut self, image_data: &ImageData) -> Vec<u8> {
        let data = image_data.data();
        let img_width = image_data.width();
        let img_height = image_data.height();

        let expected_len = (img_width * img_height * 4) as usize;
        if data.len() != expected_len {
            return vec![0u8; min(data.len(), expected_len)];
        }

        if img_width != self.width || img_height != self.height {
            self.width = img_width;
            self.height = img_height;
        }

        let width = self.width as usize;
        let height = self.height as usize;
        let pixel_count = width * height;

        let mut output = vec![0u8; pixel_count * 4];
        let mut mask = vec![0u8; pixel_count];

        for y in 0..height {
            for x in 0..width {
                let idx = y * width + x;
                if idx * 4 + 3 < data.len() {
                    let r = data[idx * 4];
                    let g = data[idx * 4 + 1];
                    let b = data[idx * 4 + 2];
                    
                    if Self::is_skin_pixel(r, g, b) {
                        mask[idx] = 255;
                    }
                }
            }
        }

        self.erode_mask(&mut mask, width, height);
        self.dilate_mask(&mut mask, width, height);
        self.smooth_mask(&mut mask, width, height);

        let kernel_size = 5;
        let half_kernel = 2;

        for y in 0..height {
            for x in 0..width {
                let idx = y * width + x;
                if idx >= mask.len() {
                    continue;
                }
                let mask_val = mask[idx] as f32 / 255.0;

                if mask_val > 0.9 {
                    if idx * 4 + 3 < data.len() && idx * 4 + 3 < output.len() {
                        output[idx * 4] = data[idx * 4];
                        output[idx * 4 + 1] = data[idx * 4 + 1];
                        output[idx * 4 + 2] = data[idx * 4 + 2];
                        output[idx * 4 + 3] = data[idx * 4 + 3];
                    }
                } else {
                    let (mut r_sum, mut g_sum, mut b_sum, mut weight_sum) = (0.0, 0.0, 0.0, 0.0);

                    for ky in 0..kernel_size {
                        for kx in 0..kernel_size {
                            let py = (y as i32 - half_kernel as i32 + ky as i32).clamp(0, height as i32 - 1) as usize;
                            let px = (x as i32 - half_kernel as i32 + kx as i32).clamp(0, width as i32 - 1) as usize;
                            let pidx = py * width + px;

                            if pidx * 4 + 2 < data.len() {
                                let kernel_idx = ky * kernel_size + kx;
                                if kernel_idx < self.kernel.len() {
                                    let weight = self.kernel[kernel_idx];
                                    r_sum += data[pidx * 4] as f32 * weight;
                                    g_sum += data[pidx * 4 + 1] as f32 * weight;
                                    b_sum += data[pidx * 4 + 2] as f32 * weight;
                                    weight_sum += weight;
                                }
                            }
                        }
                    }

                    if weight_sum > 0.0 && idx * 4 + 3 < output.len() && idx * 4 + 3 < data.len() {
                        let blur_r = (r_sum / weight_sum).clamp(0.0, 255.0) as u8;
                        let blur_g = (g_sum / weight_sum).clamp(0.0, 255.0) as u8;
                        let blur_b = (b_sum / weight_sum).clamp(0.0, 255.0) as u8;

                        let orig_r = data[idx * 4] as f32;
                        let orig_g = data[idx * 4 + 1] as f32;
                        let orig_b = data[idx * 4 + 2] as f32;

                        output[idx * 4] = ((orig_r * mask_val) + (blur_r as f32 * (1.0 - mask_val))).clamp(0.0, 255.0) as u8;
                        output[idx * 4 + 1] = ((orig_g * mask_val) + (blur_g as f32 * (1.0 - mask_val))).clamp(0.0, 255.0) as u8;
                        output[idx * 4 + 2] = ((orig_b * mask_val) + (blur_b as f32 * (1.0 - mask_val))).clamp(0.0, 255.0) as u8;
                        output[idx * 4 + 3] = data[idx * 4 + 3];
                    }
                }
            }
        }

        output
    }

    fn erode_mask(&self, mask: &mut [u8], width: usize, height: usize) {
        if width < 3 || height < 3 || mask.is_empty() {
            return;
        }
        let mut temp = mask.to_vec();

        for y in 1..height - 1 {
            for x in 1..width - 1 {
                let mut min_val = 255u8;
                for dy in -1..=1 {
                    for dx in -1..=1 {
                        let py = (y as i32 + dy) as usize;
                        let px = (x as i32 + dx) as usize;
                        let pidx = py * width + px;
                        if pidx < temp.len() {
                            min_val = min_val.min(temp[pidx]);
                        }
                    }
                }
                let idx = y * width + x;
                if idx < mask.len() {
                    mask[idx] = min_val;
                }
            }
        }
    }

    fn dilate_mask(&self, mask: &mut [u8], width: usize, height: usize) {
        if width < 3 || height < 3 || mask.is_empty() {
            return;
        }
        let mut temp = mask.to_vec();

        for y in 1..height - 1 {
            for x in 1..width - 1 {
                let mut max_val = 0u8;
                for dy in -1..=1 {
                    for dx in -1..=1 {
                        let py = (y as i32 + dy) as usize;
                        let px = (x as i32 + dx) as usize;
                        let pidx = py * width + px;
                        if pidx < temp.len() {
                            max_val = max_val.max(temp[pidx]);
                        }
                    }
                }
                let idx = y * width + x;
                if idx < mask.len() {
                    mask[idx] = max_val;
                }
            }
        }
    }

    fn smooth_mask(&self, mask: &mut [u8], width: usize, height: usize) {
        if width < 3 || height < 3 || mask.is_empty() {
            return;
        }
        let temp = mask.to_vec();

        for y in 1..height - 1 {
            for x in 1..width - 1 {
                let mut sum = 0u32;
                let mut count = 0u32;
                for dy in -1..=1 {
                    for dx in -1..=1 {
                        let py = (y as i32 + dy) as usize;
                        let px = (x as i32 + dx) as usize;
                        let pidx = py * width + px;
                        if pidx < temp.len() {
                            sum += temp[pidx] as u32;
                            count += 1;
                        }
                    }
                }
                let idx = y * width + x;
                if idx < mask.len() && count > 0 {
                    mask[idx] = (sum / count) as u8;
                }
            }
        }
    }

    pub fn set_dimensions(&mut self, width: u32, height: u32) {
        self.width = max(width, 1);
        self.height = max(height, 1);
    }

    pub fn get_width(&self) -> u32 {
        self.width
    }

    pub fn get_height(&self) -> u32 {
        self.height
    }
}
