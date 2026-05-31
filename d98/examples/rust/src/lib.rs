#![no_std]

use core::panic::PanicInfo;

#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    loop {}
}

static mut LARGE_BUFFER: [u8; 6 * 1024 * 1024] = [0; 6 * 1024 * 1024];

#[no_mangle]
pub extern "C" fn calculate(n: i64) -> i64 {
    fibonacci(n)
}

#[no_mangle]
pub extern "C" fn fibonacci(n: i64) -> i64 {
    if n <= 0 {
        return 0;
    }
    if n == 1 {
        return 1;
    }
    
    let mut a = 0;
    let mut b = 1;
    for _ in 2..=n {
        let c = a + b;
        a = b;
        b = c;
    }
    b
}

#[no_mangle]
pub extern "C" fn factorial(n: i64) -> i64 {
    if n <= 1 {
        return 1;
    }
    n * factorial(n - 1)
}

#[no_mangle]
pub extern "C" fn square(n: i64) -> i64 {
    n * n
}

#[no_mangle]
pub extern "C" fn infinite_loop(_n: i64) -> i64 {
    loop {}
}

#[no_mangle]
pub extern "C" fn slow_calculation(n: i64) -> i64 {
    let mut result = 0;
    for i in 0..n {
        for j in 0..n {
            result += i * j;
        }
    }
    result
}

#[no_mangle]
pub extern "C" fn memory_hog(n: i64) -> i64 {
    let mut total = 0;
    unsafe {
        for i in 0..n as usize {
            if i < LARGE_BUFFER.len() {
                LARGE_BUFFER[i] = (i % 256) as u8;
                total += LARGE_BUFFER[i] as i64;
            }
        }
    }
    total
}
