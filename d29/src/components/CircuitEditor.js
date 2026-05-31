import React, { useState, useRef } from 'react';
import CircuitElement from './CircuitElement';

function CircuitEditor({
  elements,
  wires,
  selectedElement,
  onSelectElement,
  onUpdateElement,
  onDeleteElement,
  onAddWire
}) {
  const canvasRef = useRef(null);
  const [wireStart, setWireStart] = useState(null);
  const [tempWire, setTempWire] = useState(null);

  const handleDrop = (e) => {
    e.preventDefault();
    const componentData = e.dataTransfer.getData('component');
    if (!componentData) return;

    const component = JSON.parse(componentData);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - component.width / 2;
    const y = e.clientY - rect.top - component.height / 2;

    const newElement = {
      ...component,
      x: Math.max(0, x),
      y: Math.max(0, y),
      params: getDefaultParams(component.type)
    };
    onAddElement(newElement);
  };

  const getDefaultParams = (type) => {
    switch (type) {
      case 'resistor':
        return { temperature: 300 };
      case 'opamp':
        return { voltageNoise: 10e-9, currentNoise: 1e-12, cornerFrequency: 100 };
      default:
        return {};
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleElementDrag = (elementId, newX, newY) => {
    const element = elements.find(el => el.id === elementId);
    if (element) {
      onUpdateElement({ ...element, x: newX, y: newY });
    }
  };

  const handlePointClick = (elementId, pointIndex, e) => {
    e.stopPropagation();
    const element = elements.find(el => el.id === elementId);
    if (!element) return;

    const point = getElementPoint(element, pointIndex);

    if (!wireStart) {
      setWireStart({ elementId, pointIndex, point });
    } else if (wireStart.elementId !== elementId) {
      onAddWire({
        from: { elementId: wireStart.elementId, pointIndex: wireStart.pointIndex },
        to: { elementId, pointIndex },
        fromPoint: wireStart.point,
        toPoint: point
      });
      setWireStart(null);
    }
  };

  const getElementPoint = (element, pointIndex) => {
    const points = getElementPoints(element);
    return points[pointIndex];
  };

  const getElementPoints = (element) => {
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;

    switch (element.type) {
      case 'resistor':
      case 'capacitor':
        return [
          { x: element.x, y: centerY },
          { x: element.x + element.width, y: centerY }
        ];
      case 'voltage_source':
        return [
          { x: centerX, y: element.y },
          { x: centerX, y: element.y + element.height }
        ];
      case 'opamp':
        return [
          { x: element.x, y: element.y + element.height * 0.25 },
          { x: element.x, y: element.y + element.height * 0.75 },
          { x: element.x + element.width, y: centerY }
        ];
      case 'ground':
        return [
          { x: centerX, y: element.y }
        ];
      default:
        return [];
    }
  };

  const handleCanvasClick = () => {
    setWireStart(null);
    onSelectElement(null);
  };

  const handleMouseMove = (e) => {
    if (wireStart) {
      const rect = canvasRef.current.getBoundingClientRect();
      setTempWire({
        x1: wireStart.point.x,
        y1: wireStart.point.y,
        x2: e.clientX - rect.left,
        y2: e.clientY - rect.top
      });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Delete' && selectedElement) {
      onDeleteElement(selectedElement.id);
    }
  };

  return (
    <div
      ref={canvasRef}
      className="canvas-container"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={handleCanvasClick}
      onMouseMove={handleMouseMove}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <svg className="canvas" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {wires.map((wire) => (
          <line
            key={wire.id}
            className="wire"
            x1={wire.fromPoint.x}
            y1={wire.fromPoint.y}
            x2={wire.toPoint.x}
            y2={wire.toPoint.y}
          />
        ))}
        {tempWire && (
          <line
            className="wire"
            style={{ stroke: '#2196f3', strokeDasharray: '5,5' }}
            x1={tempWire.x1}
            y1={tempWire.y1}
            x2={tempWire.x2}
            y2={tempWire.y2}
          />
        )}
      </svg>

      {elements.map((element) => (
        <CircuitElement
          key={element.id}
          element={element}
          isSelected={selectedElement?.id === element.id}
          onSelect={() => onSelectElement(element)}
          onDrag={handleElementDrag}
          onPointClick={handlePointClick}
          points={getElementPoints(element)}
        />
      ))}
    </div>
  );
}

export default CircuitEditor;
