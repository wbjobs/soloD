/**
 * WASM 模块加载和工具函数
 * 演示如何正确处理 File 对象到 Uint8Array 的转换
 */

let wasmModule = null;

/**
 * 加载 WASM 模块
 * @returns {Promise<object>} WASM 模块
 */
export async function loadWasm() {
  if (wasmModule) {
    return wasmModule;
  }

  try {
    // wasm-pack build --target web 生成的模块
    const module = await import('./pkg/steganography.js');
    await module.default();
    wasmModule = module;
    console.log('✅ WASM 模块加载成功');
    return module;
  } catch (error) {
    console.error('❌ WASM 模块加载失败:', error);
    throw error;
  }
}

/**
 * 将 File 对象转换为 Uint8Array
 * @param {File} file - 文件对象
 * @returns {Promise<Uint8Array>} 字节数组
 */
export async function fileToUint8Array(file) {
  if (!(file instanceof File)) {
    throw new Error('参数必须是 File 对象');
  }

  console.log(`📄 处理文件: ${file.name}, 大小: ${file.size} 字节`);

  // 方法 1: 使用 arrayBuffer() (现代浏览器推荐)
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // 方法 2: 使用 FileReader (兼容旧浏览器)
  // const uint8Array = await new Promise((resolve, reject) => {
  //   const reader = new FileReader();
  //   reader.onload = (e) => resolve(new Uint8Array(e.target.result));
  //   reader.onerror = reject;
  //   reader.readAsArrayBuffer(file);
  // });

  console.log(`✅ 转换完成，Uint8Array 长度: ${uint8Array.length}`);
  return uint8Array;
}

/**
 * 编码图片：将秘密文本隐藏到载体图片
 * @param {File} carrierFile - 载体图片文件
 * @param {string} secret - 秘密文本
 * @param {string} password - 加密密码
 * @returns {Promise<Uint8Array>} 隐写后的图片字节数组
 */
export async function encodeImage(carrierFile, secret, password = '') {
  const wasm = await loadWasm();
  
  // 步骤 1: 将 File 转换为 Uint8Array
  const carrierBytes = await fileToUint8Array(carrierFile);
  
  console.log('🔐 开始编码...');
  
  // 步骤 2: 调用 WASM 函数（包含密码参数）
  const result = wasm.encode_image(carrierBytes, secret, password);
  
  console.log('✅ 编码完成');
  return result;
}

/**
 * 解码图片：从隐写图片中提取秘密文本
 * @param {File} stegoFile - 隐写图片文件
 * @param {string} password - 解密密码
 * @returns {Promise<string>} 提取的秘密文本
 */
export async function decodeImage(stegoFile, password = '') {
  const wasm = await loadWasm();
  
  // 步骤 1: 将 File 转换为 Uint8Array
  const stegoBytes = await fileToUint8Array(stegoFile);
  
  console.log('🔓 开始解码...');
  
  // 步骤 2: 调用 WASM 函数（包含密码参数）
  const result = wasm.decode_image(stegoBytes, password);
  
  console.log('✅ 解码完成');
  return result;
}

/**
 * 将 Uint8Array 转换为可下载的 Blob URL
 * @param {Uint8Array} bytes - 字节数组
 * @param {string} mimeType - MIME 类型
 * @returns {string} Blob URL
 */
export function bytesToBlobUrl(bytes, mimeType = 'image/png') {
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * 下载 Blob URL 为文件
 * @param {string} blobUrl - Blob URL
 * @param {string} filename - 文件名
 */
export function downloadBlobUrl(blobUrl, filename) {
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default {
  loadWasm,
  fileToUint8Array,
  encodeImage,
  decodeImage,
  bytesToBlobUrl,
  downloadBlobUrl
};
