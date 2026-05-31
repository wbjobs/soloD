import React, { useState, useRef } from 'react';

function CircuitElement({ element, isSelected, onSelect, onDrag, onPointClick, points }) {
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect();
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - element.x,
      y: e.clientY - element.y
    };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const newX = e.clientX - dragOffset.current.x;
    const newY = e.clientY - dragOffset.current.y;
    onDrag(element.id, newX, newY);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  const getElementSymbol = () => {
    switch (element.type) {
      case 'resistor':
        return 'Ω';
      case 'capacitor':
        return 'C';
      case 'opamp':
        return '▷';
      case 'voltage_source':
        return 'V';
      case 'ground':
        return '⏚';
      default:
        return '';
    }
  };

  const formatValue = () => {
    if (element.value === null) return '';
    if (element.type === 'capacitor') {
      if (element.value >= 1e-6) return `${element.value / 1e-6} μF`;
      if (element.value >= 1e-9) return `${element.value / 1e-9} nF`;
      return `${element.value / 1e-12} pF`;
    }
    if (element.type === 'resistor') {
      if (element.value >= 1e6) return `${element.value / 1e6} MΩ`;
      if (element.value >= 1e3) return `${element.value / 1e3} kΩ`;
      return `${element.value} Ω`;
    }
    return `${element.value} ${element.unit || ''}`;
  };

  return (
    <>
      <div
        className={`circuit-element ${isSelected ? 'selected' : ''}`}
        style={{
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height
        }}
        onMouseDown={handleMouseDown}
      >
        <div style={{ fontSize: '20px' }}>{getElementSymbol()}</div>
        <div className="element-label">{element.label}</div>
        <div className="element-value">{formatValue()}</div>
      </div>

      {points.map((point, index) => (
        <div
          key={index}
          className="point"
          style={{
            left: point.x - 5,
            top: point.y - 5
          }}
          onClick={(e) => onPointClick(element.id, index, e)}
        />
      ))}
    </>
  );
}

export default CircuitElement;
