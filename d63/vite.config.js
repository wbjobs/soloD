import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  
  // 服务器配置
  server: {
    port: 3000,
    // 启用跨域隔离以支持 SharedArrayBuffer（如果需要）
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  
  // 构建配置
  build: {
    target: 'esnext',
    // 确保 WASM 文件被正确处理
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // 确保 WASM 文件有正确的文件名
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.wasm')) {
            return 'assets/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  },
  
  // 优化依赖配置
  optimizeDeps: {
    exclude: []
  }
});
