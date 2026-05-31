use wasm_bindgen::prelude::*;

#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

fn process_pixels<F>(data: &mut [u8], f: F)
where
    F: Fn(u8, u8, u8) -> (u8, u8, u8),
{
    let len = data.len();
    for i in (0..len).step_by(4) {
        if i + 2 >= len {
            break;
        }
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];
        
        let (nr, ng, nb) = f(r, g, b);
        
        data[i] = nr;
        data[i + 1] = ng;
        data[i + 2] = nb;
    }
}

#[wasm_bindgen]
pub fn grayscale(data: &mut [u8]) {
    process_pixels(data, |r, g, b| {
        let gray = (0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32) as u8;
        (gray, gray, gray)
    });
}

#[wasm_bindgen]
pub fn invert(data: &mut [u8]) {
    process_pixels(data, |r, g, b| {
        (255 - r, 255 - g, 255 - b)
    });
}

#[wasm_bindgen]
pub fn sepia(data: &mut [u8]) {
    process_pixels(data, |r, g, b| {
        let tr = (0.393 * r as f32 + 0.769 * g as f32 + 0.189 * b as f32).min(255.0) as u8;
        let tg = (0.349 * r as f32 + 0.686 * g as f32 + 0.168 * b as f32).min(255.0) as u8;
        let tb = (0.272 * r as f32 + 0.534 * g as f32 + 0.131 * b as f32).min(255.0) as u8;
        (tr, tg, tb)
    });
}
