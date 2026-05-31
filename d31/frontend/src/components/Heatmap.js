import React from 'react';

function Heatmap({ residues, analysis, heatmapType, onCellHover, onCellClick }) {
  if (!residues || !analysis) return null;

  const values = heatmapType === 'hydrophobicity' 
    ? analysis.hydrophobicity.values 
    : analysis.electrostatic.values;
  
  const min = heatmapType === 'hydrophobicity' 
    ? analysis.hydrophobicity.min 
    : analysis.electrostatic.min;
  
  const max = heatmapType === 'hydrophobicity' 
    ? analysis.hydrophobicity.max 
    : analysis.electrostatic.max;

  const getColor = (value) => {
    if (heatmapType === 'hydrophobicity') {
      if (value > 2) return '#ff4444';
      if (value > 0) return '#ffaa00';
      if (value > -2) return '#00aaff';
      return '#0044ff';
    } else {
      if (value > 0) return '#ff0000';
      if (value < 0) return '#0000ff';
      return '#888888';
    }
  };

  const gradientStyle = heatmapType === 'hydrophobicity'
    ? 'linear-gradient(to right, #0044ff, #00aaff, #ffaa00, #ff4444)'
    : 'linear-gradient(to right, #0000ff, #888888, #ff0000)';

  return (
    <div className="heatmap-container">
      <div className="heatmap-title">
        {heatmapType === 'hydrophobicity' ? 'Hydrophobicity Heatmap' : 'Electrostatic Charge Heatmap'}
      </div>
      <div className="heatmap-grid">
        {values.map((value, index) => (
          <div
            key={index}
            className="heatmap-cell"
            style={{ backgroundColor: getColor(value) }}
            title={`${residues[index]?.name || '?'} ${residues[index]?.id || index + 1}: ${value.toFixed(2)}`}
            onMouseEnter={() => onCellHover && onCellHover(residues[index]?.id)}
            onClick={() => onCellClick && onCellClick(residues[index]?.id)}
          />
        ))}
      </div>
      <div className="legend">
        <div className="legend-gradient" style={{ background: gradientStyle }} />
      </div>
      <div className="legend-labels">
        <span>{min.toFixed(2)}</span>
        <span>{max.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default Heatmap;
