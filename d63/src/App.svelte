<script>
  import { onMount, onDestroy } from 'svelte';
  import { 
    loadWasm, 
    encodeImage, 
    decodeImage,
    bytesToBlobUrl,
    downloadBlobUrl
  } from './wasmLoader.js';

  let wasmLoaded = false;
  let loadingError = '';
  let activeTab = 'encode';

  // 编码相关状态
  let carrierFile = null;
  let carrierPreview = '';
  let secretText = '';
  let encodePassword = '';
  let encoding = false;
  let encodeError = '';
  let encodedImageUrl = '';

  // 解码相关状态
  let stegoFile = null;
  let stegoPreview = '';
  let decodePassword = '';
  let decoding = false;
  let decodeError = '';
  let decodedText = '';

  // 文件预览 URL 清理
  function revokeUrls() {
    if (carrierPreview) URL.revokeObjectURL(carrierPreview);
    if (stegoPreview) URL.revokeObjectURL(stegoPreview);
    if (encodedImageUrl) URL.revokeObjectURL(encodedImageUrl);
  }

  onDestroy(() => {
    revokeUrls();
  });

  // 页面加载时初始化 WASM
  onMount(async () => {
    try {
      await loadWasm();
      wasmLoaded = true;
      console.log('WASM 初始化完成');
    } catch (err) {
      loadingError = `WASM 加载失败: ${err.message}`;
      console.error('WASM 初始化失败:', err);
    }
  });

  // 处理载体图片上传
  function handleCarrierUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    revokeUrls();
    carrierFile = file;
    carrierPreview = URL.createObjectURL(file);
    encodedImageUrl = '';
    encodeError = '';
    console.log('选择载体图片:', file.name, file.size, 'bytes');
  }

  // 处理隐写图片上传
  function handleStegoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    revokeUrls();
    stegoFile = file;
    stegoPreview = URL.createObjectURL(file);
    decodedText = '';
    decodeError = '';
    console.log('选择隐写图片:', file.name, file.size, 'bytes');
  }

  // 编码处理
  async function handleEncode() {
    if (!carrierFile) {
      encodeError = '请先选择载体图片';
      return;
    }
    if (!secretText.trim()) {
      encodeError = '请输入要隐藏的秘密文本';
      return;
    }

    encoding = true;
    encodeError = '';
    encodedImageUrl = '';

    try {
      // 调用 WASM 编码函数（包含密码参数）
      const resultBytes = await encodeImage(carrierFile, secretText, encodePassword);
      
      // 转换为 Blob URL 用于预览和下载
      encodedImageUrl = bytesToBlobUrl(resultBytes);
      
      console.log('编码成功，结果大小:', resultBytes.length, 'bytes');
    } catch (err) {
      encodeError = `编码失败: ${err.message}`;
      console.error('编码失败:', err);
    } finally {
      encoding = false;
    }
  }

  // 下载编码后的图片
  function handleDownload() {
    if (encodedImageUrl) {
      downloadBlobUrl(encodedImageUrl, 'stego_image.png');
    }
  }

  // 解码处理
  async function handleDecode() {
    if (!stegoFile) {
      decodeError = '请先选择隐写图片';
      return;
    }

    decoding = true;
    decodeError = '';
    decodedText = '';

    try {
      // 调用 WASM 解码函数（包含密码参数）
      decodedText = await decodeImage(stegoFile, decodePassword);
      
      console.log('解码成功，提取文本长度:', decodedText.length);
    } catch (err) {
      decodeError = `解码失败（密码错误？）: ${err.message}`;
      console.error('解码失败:', err);
    } finally {
      decoding = false;
    }
  }

  // 切换标签
  function switchTab(tab) {
    activeTab = tab;
    encodeError = '';
    decodeError = '';
  }
</script>

<div class="app-container">
  <header class="app-header">
    <h1>🔐 图像隐写工具</h1>
    <p>基于 Rust WebAssembly 的 LSB 隐写算法实现</p>
  </header>

  {#if !wasmLoaded}
    <div class="loading-state">
      {#if loadingError}
        <div class="error-box">{loadingError}</div>
        <p class="hint">请先运行 <code>npm run build:wasm</code> 编译 WASM 模块</p>
      {:else}
        <div class="spinner"></div>
        <p>正在加载 WASM 模块...</p>
      {/if}
    </div>
  {:else}
    <div class="tabs">
      <button 
        class="tab-btn"
        class:active={activeTab === 'encode'}
        on:click={() => switchTab('encode')}
      >
        📤 编码（隐藏信息）
      </button>
      <button 
        class="tab-btn"
        class:active={activeTab === 'decode'}
        on:click={() => switchTab('decode')}
      >
        📥 解码（提取信息）
      </button>
    </div>

    {#if activeTab === 'encode'}
      <div class="panel">
        <h2>将秘密文本隐藏到图片中</h2>

        <div class="form-group">
          <label>1. 选择载体图片</label>
          <input 
            type="file" 
            accept="image/*" 
            on:change={handleCarrierUpload}
            disabled={encoding}
          />
          {#if carrierPreview}
            <div class="preview-box">
              <img src={carrierPreview} alt="载体图片预览" class="preview-img" />
              <p class="file-name">{carrierFile?.name}</p>
            </div>
          {/if}
        </div>

        <div class="form-group">
                    <label>2. 输入秘密文本</label>
                    <textarea 
                        bind:value={secretText}
                        placeholder="在此输入要隐藏的秘密文本..."
                        rows="4"
                        disabled={encoding}
                    ></textarea>
                </div>

                <div class="form-group">
                    <label>3. 设置密码（可选）</label>
                    <input 
                        type="password"
                        bind:value={encodePassword}
                        placeholder="输入密码用于加密..."
                        disabled={encoding}
                    />
                    <p class="hint-text">密码用于 XOR 加密，解码时需要使用相同密码</p>
                </div>

                <button 
                    class="btn-primary"
                    on:click={handleEncode}
                    disabled={encoding}
                >
          {encoding ? '⏳ 编码中...' : '🔐 开始编码'}
        </button>

        {#if encodeError}
          <div class="error-box">{encodeError}</div>
        {/if}

        {#if encodedImageUrl}
          <div class="result-box">
            <h3>✅ 编码成功！</h3>
            <div class="preview-box">
              <img src={encodedImageUrl} alt="隐写图片" class="preview-img" />
            </div>
            <button class="btn-secondary" on:click={handleDownload}>
              📥 下载隐写图片
            </button>
          </div>
        {/if}
      </div>
    {:else}
      <div class="panel">
        <h2>从图片中提取秘密文本</h2>

        <div class="form-group">
                    <label>1. 选择隐写图片</label>
                    <input 
                        type="file" 
                        accept="image/*" 
                        on:change={handleStegoUpload}
                        disabled={decoding}
                    />
                    {#if stegoPreview}
                        <div class="preview-box">
                            <img src={stegoPreview} alt="隐写图片预览" class="preview-img" />
                            <p class="file-name">{stegoFile?.name}</p>
                        </div>
                    {/if}
                </div>

                <div class="form-group">
                    <label>2. 输入密码</label>
                    <input 
                        type="password"
                        bind:value={decodePassword}
                        placeholder="输入解密密码..."
                        disabled={decoding}
                    />
                    <p class="hint-text">使用编码时设置的密码，如果未设置密码则留空</p>
                </div>

                <button 
                    class="btn-primary"
                    on:click={handleDecode}
                    disabled={decoding}
                >
          {decoding ? '⏳ 解码中...' : '🔓 开始解码'}
        </button>

        {#if decodeError}
          <div class="error-box">{decodeError}</div>
        {/if}

        {#if decodedText}
          <div class="result-box">
            <h3>✅ 解码成功！</h3>
            <div class="decoded-box">
              <pre>{decodedText}</pre>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  {/if}

  <footer class="app-footer">
    <p>💡 提示：隐写信息使用 PNG 格式保存，JPEG 压缩会破坏隐藏信息</p>
  </footer>
</div>

<style>
  .app-container {
    max-width: 800px;
    margin: 0 auto;
    background: white;
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    overflow: hidden;
  }

  .app-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 30px;
    text-align: center;
  }

  .app-header h1 {
    margin: 0 0 8px 0;
    font-size: 1.8rem;
  }

  .app-header p {
    margin: 0;
    opacity: 0.9;
    font-size: 0.95rem;
  }

  .loading-state {
    padding: 60px 30px;
    text-align: center;
  }

  .spinner {
    width: 50px;
    height: 50px;
    border: 4px solid #e0e0e0;
    border-top: 4px solid #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 20px;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .hint {
    color: #666;
    margin-top: 15px;
  }

  .hint code {
    background: #f0f0f0;
    padding: 3px 8px;
    border-radius: 4px;
    font-family: monospace;
  }

  .tabs {
    display: flex;
    border-bottom: 2px solid #e8e8e8;
  }

  .tab-btn {
    flex: 1;
    padding: 18px 20px;
    border: none;
    background: none;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s;
    color: #666;
    border-bottom: 3px solid transparent;
  }

  .tab-btn:hover {
    background: #f5f5f5;
  }

  .tab-btn.active {
    color: #667eea;
    border-bottom-color: #667eea;
    background: #f8f9ff;
  }

  .panel {
    padding: 30px;
  }

  .panel h2 {
    margin: 0 0 25px 0;
    font-size: 1.3rem;
    color: #333;
  }

  .form-group {
    margin-bottom: 25px;
  }

  .form-group label {
    display: block;
    margin-bottom: 10px;
    font-weight: 600;
    color: #444;
    font-size: 0.95rem;
  }

  .form-group input[type="file"] {
    width: 100%;
    padding: 15px;
    border: 2px dashed #ddd;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.3s;
    font-size: 0.9rem;
  }

  .form-group input[type="file"]:hover {
    border-color: #667eea;
    background: #f8f9ff;
  }

  .form-group input[type="file"]:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .form-group textarea {
        width: 100%;
        padding: 15px;
        border: 2px solid #e0e0e0;
        border-radius: 10px;
        font-size: 1rem;
        font-family: inherit;
        resize: vertical;
        transition: border-color 0.3s;
        min-height: 100px;
    }

    .form-group textarea:focus {
        outline: none;
        border-color: #667eea;
    }

    .form-group textarea:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .form-group input[type="password"] {
        width: 100%;
        padding: 15px;
        border: 2px solid #e0e0e0;
        border-radius: 10px;
        font-size: 1rem;
        font-family: inherit;
        transition: border-color 0.3s;
    }

    .form-group input[type="password"]:focus {
        outline: none;
        border-color: #667eea;
    }

    .form-group input[type="password"]:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .hint-text {
        margin: 8px 0 0 0;
        font-size: 0.85rem;
        color: #888;
        line-height: 1.4;
    }

  .preview-box {
    margin-top: 15px;
    text-align: center;
    padding: 15px;
    background: #f8f9ff;
    border-radius: 10px;
  }

  .preview-img {
    max-width: 100%;
    max-height: 300px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .file-name {
    margin: 10px 0 0 0;
    font-size: 0.9rem;
    color: #666;
  }

  .btn-primary {
    width: 100%;
    padding: 16px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 1.05rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .btn-secondary {
    width: 100%;
    padding: 14px;
    background: white;
    color: #667eea;
    border: 2px solid #667eea;
    border-radius: 10px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
    margin-top: 15px;
  }

  .btn-secondary:hover {
    background: #667eea;
    color: white;
  }

  .error-box {
    margin-top: 20px;
    padding: 15px 20px;
    background: #fee;
    color: #c33;
    border-radius: 10px;
    border-left: 4px solid #c33;
  }

  .result-box {
    margin-top: 30px;
    padding: 25px;
    background: #f0fdf4;
    border-radius: 12px;
    border-left: 4px solid #22c55e;
  }

  .result-box h3 {
    margin: 0 0 15px 0;
    color: #166534;
    font-size: 1.1rem;
  }

  .decoded-box {
    background: white;
    padding: 18px;
    border-radius: 8px;
    border: 2px solid #bbf7d0;
  }

  .decoded-box pre {
    margin: 0;
    font-family: 'Consolas', monospace;
    font-size: 0.95rem;
    white-space: pre-wrap;
    word-break: break-all;
    color: #333;
    line-height: 1.5;
  }

  .app-footer {
    padding: 20px 30px;
    background: #f8f9fa;
    border-top: 1px solid #e8e8e8;
    text-align: center;
  }

  .app-footer p {
    margin: 0;
    color: #666;
    font-size: 0.9rem;
  }
</style>
