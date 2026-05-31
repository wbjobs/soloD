import { FluidSimulator } from './FluidSimulator';
import { UIController } from './UIController';
import './styles.css';

function getDetailedErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const errorCode = error.message.split(':')[0];
    
    const errorMessages: Record<string, string> = {
      'WebGPU_NOT_SUPPORTED': `
        <h3>❌ 您的浏览器不支持 WebGPU</h3>
        <p>请使用以下支持 WebGPU 的浏览器：</p>
        <ul>
          <li>Chrome 113+</li>
          <li>Edge 113+</li>
          <li>Brave 1.52+</li>
        </ul>
        <p><strong>Chrome 启用方法：</strong>在地址栏输入 chrome://flags/#enable-unsafe-webgpu，启用后重启浏览器</p>
      `,
      'WEBGPU_ADAPTER_FAILED': `
        <h3>⚠️ 无法获取 GPU 适配器</h3>
        <p>可能的原因：</p>
        <ul>
          <li>浏览器未启用 WebGPU</li>
          <li>显卡驱动过旧</li>
          <li>显卡不支持 WebGPU</li>
        </ul>
      `,
      'WEBGPU_NO_ADAPTER': `
        <h3>⚠️ 没有可用的 GPU 适配器</h3>
        <p>您的硬件可能不支持 WebGPU。请确保：</p>
        <ul>
          <li>使用独立显卡（非集成显卡）</li>
          <li>更新显卡驱动到最新版本</li>
          <li>浏览器已启用硬件加速</li>
        </ul>
      `,
      'WEBGPU_DEVICE_FAILED': `
        <h3>⚠️ 无法创建 GPU 设备</h3>
        <p>请尝试：</p>
        <ul>
          <li>更新您的图形驱动程序</li>
          <li>重启浏览器</li>
          <li>检查浏览器是否启用了硬件加速</li>
        </ul>
      `,
      'WEBGPU_CONTEXT_FAILED': `
        <h3>⚠️ Canvas 上下文创建失败</h3>
        <p>请刷新页面重试，或使用支持 WebGPU 的浏览器。</p>
      `,
      'WEBGPU_CONFIGURE_FAILED': `
        <h3>⚠️ Canvas 配置失败</h3>
        <p>可能存在兼容性问题，请尝试使用最新版 Chrome 浏览器。</p>
      `,
      'WEBGPU_DEVICE_LOST': `
        <h3>⚠️ GPU 设备连接断开</h3>
        <p>${(error as Error).message}</p>
        <p>请刷新页面重试。</p>
      `,
    };

    if (errorMessages[errorCode]) {
      return errorMessages[errorCode];
    }

    return `
      <h3>⚠️ 初始化失败</h3>
      <p>${error.message}</p>
      <p>请刷新页面重试，或检查浏览器是否支持 WebGPU。</p>
    `;
  }

  return `
    <h3>⚠️ 未知错误</h3>
    <p>发生未知错误，请刷新页面重试。</p>
  `;
}

async function init() {
  const canvas = document.getElementById('fluidCanvas') as HTMLCanvasElement;
  const errorOverlay = document.getElementById('errorMessage');
  const errorContent = errorOverlay?.querySelector('.error-content');

  const containerWidth = (canvas.parentElement as HTMLElement).clientWidth - 16;
  const aspectRatio = 16 / 9;
  canvas.width = Math.min(containerWidth, 1024);
  canvas.height = canvas.width / aspectRatio;

  try {
    const simulator = new FluidSimulator(canvas);
    await simulator.init();
    
    new UIController(simulator, canvas);
    simulator.start();

    const cleanup = () => {
      simulator.stop();
    };

    window.addEventListener('beforeunload', cleanup);
  } catch (error) {
    console.error('Failed to initialize fluid simulator:', error);
    if (errorOverlay && errorContent) {
      errorContent.innerHTML = getDetailedErrorMessage(error);
      errorOverlay.classList.remove('hidden');
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
