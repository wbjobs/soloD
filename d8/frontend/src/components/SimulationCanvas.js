import React, { useRef, useEffect, useMemo } from 'react';
import {
  drawVelocityField,
  drawPressureField,
  drawVorticityField,
  drawVelocityVectors
} from '../utils/visualization';

const SimulationCanvas = ({ 
  data, 
  fieldType, 
  showVectors = false, 
  width = 800, 
  height = 400 
}) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const dataRef = useRef(null);

  const shouldRedraw = useMemo(() => {
    if (!data || !dataRef.current) return true;
    return data.step !== dataRef.current.step;
  }, [data]);

  useEffect(() => {
    if (!data || !canvasRef.current || !shouldRedraw) return;
    
    dataRef.current = data;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    animationRef.current = requestAnimationFrame(() => {
      switch (fieldType) {
        case 'velocity':
          drawVelocityField(ctx, data, width, height);
          break;
        case 'pressure':
          drawPressureField(ctx, data, width, height);
          break;
        case 'vorticity':
          drawVorticityField(ctx, data, width, height);
          break;
        default:
          drawVelocityField(ctx, data, width, height);
      }

      if (showVectors && data.ux && data.uy) {
        drawVelocityVectors(ctx, data, width, height);
      }
    });

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [data, fieldType, showVectors, width, height, shouldRedraw]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          border: '1px solid #333',
          borderRadius: '4px',
          backgroundColor: '#1a1a2e'
        }}
      />
      {data && (
        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          background: 'rgba(0,0,0,0.7)',
          padding: '5px 10px',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#fff'
        }}>
          Step: {data.step}
        </div>
      )}
    </div>
  );
};

export default React.memo(SimulationCanvas);
