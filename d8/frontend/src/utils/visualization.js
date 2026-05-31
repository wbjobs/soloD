export function drawVelocityField(ctx, data, width, height) {
  const { velocity_magnitude, obstacle, nx, ny } = data;
  const scaleX = width / nx;
  const scaleY = height / ny;

  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      let r, g, b;
      if (obstacle[i][j]) {
        r = 74;
        g = 74;
        b = 106;
      } else {
        const speed = velocity_magnitude[i][j];
        const normalizedSpeed = Math.min(speed * 5, 1);
        
        const hue = 200 - normalizedSpeed * 120;
        const saturation = 0.7 + normalizedSpeed * 0.3;
        const lightness = 0.4 + normalizedSpeed * 0.2;
        
        const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
        const x = c * (1 - Math.abs(((hue / 60) % 2 - 1)));
        const m = lightness - c / 2;
        
        if (hue < 60) { r = c; g = x; b = 0; }
        else if (hue < 120) { r = x; g = c; b = 0; }
        else if (hue < 180) { r = 0; g = c; b = x; }
        else if (hue < 240) { r = 0; g = x; b = c; }
        else if (hue < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        
        r = Math.floor((r + m) * 255);
        g = Math.floor((g + m) * 255);
        b = Math.floor((b + m) * 255);
      }

      const startX = Math.floor(i * scaleX);
      const endX = Math.min(Math.floor((i + 1) * scaleX), width);
      const startY = Math.floor(j * scaleY);
      const endY = Math.min(Math.floor((j + 1) * scaleY), height);

      for (let px = startX; px < endX; px++) {
        for (let py = startY; py < endY; py++) {
          const idx = (py * width + px) * 4;
          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export function drawPressureField(ctx, data, width, height) {
  const { pressure, obstacle, nx, ny } = data;
  const scaleX = width / nx;
  const scaleY = height / ny;

  let minP = Infinity;
  let maxP = -Infinity;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (!obstacle[i][j]) {
        minP = Math.min(minP, pressure[i][j]);
        maxP = Math.max(maxP, pressure[i][j]);
      }
    }
  }

  const range = maxP - minP || 1;
  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      let r, g, b;
      if (obstacle[i][j]) {
        r = 74;
        g = 74;
        b = 106;
      } else {
        const normalizedP = (pressure[i][j] - minP) / range;
        const hue = 240 - normalizedP * 180;
        const saturation = 0.6 + normalizedP * 0.2;
        const lightness = 0.45 + normalizedP * 0.15;

        const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
        const x = c * (1 - Math.abs(((hue / 60) % 2 - 1)));
        const m = lightness - c / 2;

        if (hue < 60) { r = c; g = x; b = 0; }
        else if (hue < 120) { r = x; g = c; b = 0; }
        else if (hue < 180) { r = 0; g = c; b = x; }
        else if (hue < 240) { r = 0; g = x; b = c; }
        else if (hue < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }

        r = Math.floor((r + m) * 255);
        g = Math.floor((g + m) * 255);
        b = Math.floor((b + m) * 255);
      }

      const startX = Math.floor(i * scaleX);
      const endX = Math.min(Math.floor((i + 1) * scaleX), width);
      const startY = Math.floor(j * scaleY);
      const endY = Math.min(Math.floor((j + 1) * scaleY), height);

      for (let px = startX; px < endX; px++) {
        for (let py = startY; py < endY; py++) {
          const idx = (py * width + px) * 4;
          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export function drawVorticityField(ctx, data, width, height) {
  const { vorticity, obstacle, nx, ny } = data;
  const scaleX = width / nx;
  const scaleY = height / ny;

  let maxV = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (!obstacle[i][j]) {
        maxV = Math.max(maxV, Math.abs(vorticity[i][j]));
      }
    }
  }

  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      let r, g, b;
      if (obstacle[i][j]) {
        r = 74;
        g = 74;
        b = 106;
      } else {
        const normalizedV = vorticity[i][j] / (maxV || 1);
        if (normalizedV > 0) {
          const intensity = Math.min(normalizedV, 1);
          r = Math.floor(255 * intensity);
          g = Math.floor(100 * intensity);
          b = Math.floor(100 * intensity);
        } else {
          const intensity = Math.min(-normalizedV, 1);
          r = Math.floor(100 * intensity);
          g = Math.floor(150 * intensity);
          b = Math.floor(255 * intensity);
        }
      }

      const startX = Math.floor(i * scaleX);
      const endX = Math.min(Math.floor((i + 1) * scaleX), width);
      const startY = Math.floor(j * scaleY);
      const endY = Math.min(Math.floor((j + 1) * scaleY), height);

      for (let px = startX; px < endX; px++) {
        for (let py = startY; py < endY; py++) {
          const idx = (py * width + px) * 4;
          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export function drawVelocityVectors(ctx, data, width, height, step = 8) {
  const { ux, uy, obstacle, nx, ny } = data;
  const scaleX = width / nx;
  const scaleY = height / ny;
  const vectorScale = Math.min(scaleX, scaleY) * 20;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1;

  ctx.beginPath();
  for (let i = 0; i < nx; i += step) {
    for (let j = 0; j < ny; j += step) {
      if (!obstacle[i][j]) {
        const x = i * scaleX + scaleX / 2;
        const y = j * scaleY + scaleY / 2;
        const vx = ux[i][j] * vectorScale;
        const vy = uy[i][j] * vectorScale;

        ctx.moveTo(x, y);
        ctx.lineTo(x + vx, y + vy);

        const angle = Math.atan2(vy, vx);
        const headLength = 3;
        const headX1 = x + vx - headLength * Math.cos(angle - Math.PI / 6);
        const headY1 = y + vy - headLength * Math.sin(angle - Math.PI / 6);
        const headX2 = x + vx - headLength * Math.cos(angle + Math.PI / 6);
        const headY2 = y + vy - headLength * Math.sin(angle + Math.PI / 6);
        
        ctx.moveTo(x + vx, y + vy);
        ctx.lineTo(headX1, headY1);
        ctx.moveTo(x + vx, y + vy);
        ctx.lineTo(headX2, headY2);
      }
    }
  }
  ctx.stroke();
}
