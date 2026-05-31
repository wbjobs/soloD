use wasm_bindgen::prelude::*;
use rustfft::{FftPlanner, num_complex::Complex};
use web_sys::AudioBuffer;

#[wasm_bindgen]
pub struct AudioProcessor {
    fft_planner: FftPlanner<f32>,
    window: Vec<f32>,
    size: usize,
}

#[wasm_bindgen]
impl AudioProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new(size: usize) -> AudioProcessor {
        let mut window = vec![0.0; size];
        for i in 0..size {
            window[i] = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (size - 1) as f32).cos());
        }

        AudioProcessor {
            fft_planner: FftPlanner::new(),
            window,
            size,
        }
    }

    pub fn compute_spectrum(&mut self, audio_data: &[f32]) -> Vec<f32> {
        let mut complex_data: Vec<Complex<f32>> = audio_data
            .iter()
            .zip(self.window.iter())
            .map(|(sample, window)| Complex::new(sample * window, 0.0))
            .collect();

        let fft = self.fft_planner.plan_fft_forward(self.size);
        fft.process(&mut complex_data);

        let spectrum_len = self.size / 2;
        let mut spectrum = vec![0.0; spectrum_len];

        for (i, complex) in complex_data[0..spectrum_len].iter().enumerate() {
            let magnitude = (complex.norm() / self.size as f32) * 2.0;
            spectrum[i] = if magnitude > 0.0 { magnitude.log10() * 20.0 } else { -100.0 };
        }

        spectrum
    }

    pub fn process_audio_buffer(&mut self, buffer: &AudioBuffer, channel: u32) -> Vec<f32> {
        let channel_data = buffer.get_channel_data(channel).unwrap_or_default();
        self.compute_spectrum(&channel_data[0..self.size.min(channel_data.len())])
    }
}

#[wasm_bindgen]
pub fn normalize_spectrum(spectrum: &[f32], min_db: f32, max_db: f32) -> Vec<f32> {
    spectrum
        .iter()
        .map(|&db| ((db.clamp(min_db, max_db) - min_db) / (max_db - min_db)))
        .collect()
}
