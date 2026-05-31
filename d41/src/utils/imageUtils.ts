const getExifOrientation = (file: File): Promise<number> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const view = new DataView(e.target?.result as ArrayBuffer);
      if (view.getUint16(0, false) !== 0xFFD8) {
        resolve(1);
        return;
      }

      let offset = 2;
      while (offset < view.byteLength) {
        const marker = view.getUint16(offset, false);
        offset += 2;

        if (marker === 0xFFE1) {
          if (view.getUint32(offset + 2, false) !== 0x45786966) {
            resolve(1);
            return;
          }

          const little = view.getUint16(offset + 8, false) === 0x4949;
          offset += 10;
          const tags = view.getUint16(offset, little);
          offset += 2;

          for (let i = 0; i < tags; i++) {
            if (view.getUint16(offset + i * 12, little) === 0x0112) {
              const orientation = view.getUint16(offset + i * 12 + 8, little);
              resolve(orientation);
              return;
            }
          }
        } else if ((marker & 0xFF00) !== 0xFF00) {
          break;
        } else {
          offset += view.getUint16(offset, false);
        }
      }
      resolve(1);
    };
    reader.readAsArrayBuffer(file.slice(0, 65536));
  });
};

const resetImageOrientation = (
  img: HTMLImageElement,
  orientation: number
): Promise<HTMLCanvasElement> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(canvas);
      return;
    }

    const width = img.width;
    const height = img.height;

    if (orientation > 4 && orientation < 9) {
      canvas.width = height;
      canvas.height = width;
    } else {
      canvas.width = width;
      canvas.height = height;
    }

    switch (orientation) {
      case 2:
        ctx.transform(-1, 0, 0, 1, width, 0);
        break;
      case 3:
        ctx.transform(-1, 0, 0, -1, width, height);
        break;
      case 4:
        ctx.transform(1, 0, 0, -1, 0, height);
        break;
      case 5:
        ctx.transform(0, 1, 1, 0, 0, 0);
        break;
      case 6:
        ctx.transform(0, 1, -1, 0, height, 0);
        break;
      case 7:
        ctx.transform(0, -1, -1, 0, height, width);
        break;
      case 8:
        ctx.transform(0, -1, 1, 0, 0, width);
        break;
      default:
        break;
    }

    ctx.drawImage(img, 0, 0);
    resolve(canvas);
  });
};

export const loadImageWithOrientation = async (
  file: File
): Promise<HTMLImageElement> => {
  const orientation = await getExifOrientation(file);

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = async () => {
        if (orientation !== 1) {
          const correctedCanvas = await resetImageOrientation(img, orientation);
          const correctedImg = new Image();
          correctedImg.onload = () => resolve(correctedImg);
          correctedImg.src = correctedCanvas.toDataURL('image/jpeg');
        } else {
          resolve(img);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

export const setupCanvasForHiDPI = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): CanvasRenderingContext2D | null => {
  const dpr = window.devicePixelRatio || 1;

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
  }

  return ctx;
};

export const getCanvasCoordinates = (
  e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement
): { x: number; y: number } => {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  let clientX: number, clientY: number;

  const touchEvent = e as React.TouchEvent<HTMLCanvasElement>;
  const mouseEvent = e as React.MouseEvent<HTMLCanvasElement>;

  if ('touches' in e && touchEvent.touches.length > 0) {
    clientX = touchEvent.touches[0].clientX;
    clientY = touchEvent.touches[0].clientY;
  } else if ('changedTouches' in e && touchEvent.changedTouches.length > 0) {
    clientX = touchEvent.changedTouches[0].clientX;
    clientY = touchEvent.changedTouches[0].clientY;
  } else {
    clientX = mouseEvent.clientX;
    clientY = mouseEvent.clientY;
  }

  const scaleX = (canvas.width / dpr) / rect.width;
  const scaleY = (canvas.height / dpr) / rect.height;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
};
