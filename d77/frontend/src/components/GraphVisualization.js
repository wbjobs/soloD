import React, { useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const GraphVisualization = ({ nodes, links, highlightNodes = [] }) => {
  const fgRef = useRef();

  const handleNodeClick = useCallback((node) => {
    const distance = 40;
    const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z || 0);

    fgRef.current?.cameraPosition(
      { x: node.x * distRatio, y: node.y * distRatio, z: (node.z || 0) * distRatio },
      node,
      1000
    );
  }, []);

  const graphData = {
    nodes: nodes.map(n => ({
      id: n.id,
      name: n.name,
      avatar: n.avatar,
      val: highlightNodes.includes(n.id) ? 2 : 1,
      highlighted: highlightNodes.includes(n.id)
    })),
    links: links.map(l => ({
      source: l.from.id,
      target: l.to.id,
      value: 1
    }))
  };

  return (
    <div className="w-full h-full bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeLabel="name"
        nodeAutoColorBy="group"
        nodeVal="val"
        onNodeClick={handleNodeClick}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.25}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const label = node.name;
          const fontSize = 12 / globalScale;
          ctx.font = `${fontSize}px Sans-Serif`;
          const textWidth = ctx.measureText(label).width;
          const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

          ctx.fillStyle = node.highlighted ? 'rgba(255, 200, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)';
          ctx.fillRect(
            node.x - bckgDimensions[0] / 2,
            node.y - bckgDimensions[1] / 2,
            ...bckgDimensions
          );

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = node.highlighted ? '#8B4513' : 'darkslategray';
          ctx.fillText(label, node.x, node.y);

          if (node.highlighted) {
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.val * 4 + 5, 0, 2 * Math.PI);
            ctx.stroke();
          }
        }}
      />
    </div>
  );
};

export default GraphVisualization;
