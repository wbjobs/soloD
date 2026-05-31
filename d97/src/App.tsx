import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  Connection,
  NodeProps,
  Handle,
  Position,
  useReactFlow,
} from 'reactflow';
import { invoke } from '@tauri-apps/api/tauri';
import { v4 as uuidv4 } from 'uuid';
import ContextMenu from './components/ContextMenu';
import EditModal from './components/EditModal';
import { ContextMenuState, EditModalState, GraphNode, GraphEdge, NodeData } from './types';

interface CustomNodeData extends NodeData {
  isHighlighted?: boolean;
  searchKeyword?: string;
}

const highlightText = (text: string, keyword: string) => {
  if (!keyword) return text;
  const regex = new RegExp(`(${keyword})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, index) =>
    part.toLowerCase() === keyword.toLowerCase()
      ? <span key={index} className="bg-yellow-500 text-black px-1 rounded">{part}</span>
      : part
  );
};

const CustomNode = ({ data, selected }: NodeProps<CustomNodeData>) => {
  const isHighlighted = data.isHighlighted || false;
  return (
    <div
      className={`px-4 py-2 rounded-lg shadow-lg border-2 transition-all ${
        isHighlighted
          ? 'border-yellow-400 bg-yellow-900 scale-110 ring-4 ring-yellow-400 ring-opacity-50'
          : selected
          ? 'border-cyan-400 bg-cyan-900 scale-105'
          : 'border-slate-600 bg-slate-800 hover:border-cyan-500'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-cyan-400" />
      <div className="text-white font-medium text-sm">
        {highlightText(data.label, data.searchKeyword || '')}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-cyan-400" />
    </div>
  );
};

const GraphCanvas = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitBounds } = useReactFlow();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dbPath, setDbPath] = useState<string>('');
  const [status, setStatus] = useState<string>('正在连接...');
  const [editModal, setEditModal] = useState<EditModalState>({
    isOpen: false,
    type: 'node',
    currentLabel: '',
  });
  const [addNodeModal, setAddNodeModal] = useState<EditModalState>({
    isOpen: false,
    type: 'node',
    currentLabel: '',
  });
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const path = await invoke<string>('get_db_path');
      setDbPath(path);
      console.log('Database path:', path);

      const [loadedNodes, loadedEdges] = await Promise.all([
        invoke<any[]>('get_nodes'),
        invoke<any[]>('get_edges'),
      ]);

      console.log('Loaded nodes:', loadedNodes);
      console.log('Loaded edges:', loadedEdges);

      const graphNodes: GraphNode[] = loadedNodes.map((node) => ({
        id: node.id,
        position: { x: node.x, y: node.y },
        data: { label: node.label },
        type: 'custom',
      }));

      const graphEdges: GraphEdge[] = loadedEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        data: { label: edge.label },
        style: { stroke: '#06b6d4', strokeWidth: 2 },
        labelStyle: { fill: '#fff', fontSize: 12 },
        labelBgStyle: { fill: '#1e293b', fillOpacity: 0.8 },
      }));

      setNodes(graphNodes);
      setEdges(graphEdges);
      setStatus(`已连接 - ${loadedNodes.length} 个节点, ${loadedEdges.length} 个关系`);
    } catch (error) {
      console.error('Failed to load data:', error);
      setStatus(`连接失败: ${error}`);
    }
  };

  const handleSearch = useCallback(async (keyword: string) => {
    setSearchKeyword(keyword);
    if (!keyword.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: { ...node.data, isHighlighted: false, searchKeyword: '' },
        }))
      );
      return;
    }

    try {
      const results = await invoke<any[]>('search_nodes', { keyword });
      const resultIds = results.map((r) => r.id);
      setSearchResults(resultIds);
      setShowSearchResults(true);
      console.log('Search results:', results);

      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: {
            ...node.data,
            isHighlighted: resultIds.includes(node.id),
            searchKeyword: keyword,
          },
        }))
      );
    } catch (error) {
      console.error('Failed to search:', error);
    }
  }, [setNodes]);

  const focusOnNode = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (node && fitBounds) {
      const padding = 50;
      fitBounds(
        {
          x: node.position.x - padding,
          y: node.position.y - padding,
          width: padding * 2,
          height: padding * 2,
        },
        { duration: 800 }
      );
    }
    setShowSearchResults(false);
  }, [nodes, fitBounds]);

  const clearSearch = useCallback(() => {
    setSearchKeyword('');
    setSearchResults([]);
    setShowSearchResults(false);
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: { ...node.data, isHighlighted: false, searchKeyword: '' },
      }))
    );
  }, [setNodes]);

  const onConnect = useCallback(
    async (params: Connection) => {
      if (params.source && params.target) {
        const newEdge = {
          ...params,
          id: uuidv4(),
          label: '',
          data: { label: '' },
          style: { stroke: '#06b6d4', strokeWidth: 2 },
          labelStyle: { fill: '#fff', fontSize: 12 },
          labelBgStyle: { fill: '#1e293b', fillOpacity: 0.8 },
        };
        
        try {
          await invoke('add_edge', {
            source: params.source,
            target: params.target,
            label: '',
          });
          setEdges((eds) => addEdge(newEdge, eds));
        } catch (error) {
          console.error('Failed to add edge:', error);
        }
      }
    },
    [setEdges]
  );

  const handleCanvasContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        type: 'canvas',
      });
      
      (window as any).pendingNodePosition = position;
    },
    [screenToFlowPosition]
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: GraphNode) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        type: 'node',
        nodeId: node.id,
      });
    },
    []
  );

  const handleEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: GraphEdge) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        type: 'edge',
        edgeId: edge.id,
      });
    },
    []
  );

  const handleEdgeDoubleClick = useCallback(
    (_: React.MouseEvent, edge: GraphEdge) => {
      setEditModal({
        isOpen: true,
        type: 'edge',
        id: edge.id,
        currentLabel: edge.data?.label || '',
      });
      setContextMenu(null);
    },
    []
  );

  const handleAddNode = useCallback(() => {
    setAddNodeModal({
      isOpen: true,
      type: 'node',
      currentLabel: '',
    });
    setContextMenu(null);
  }, []);

  const handleEditNode = useCallback(() => {
    if (contextMenu?.nodeId) {
      const node = nodes.find((n) => n.id === contextMenu.nodeId);
      if (node) {
        setEditModal({
          isOpen: true,
          type: 'node',
          id: contextMenu.nodeId,
          currentLabel: node.data.label,
        });
      }
    }
    setContextMenu(null);
  }, [contextMenu, nodes]);

  const handleDeleteNode = useCallback(async () => {
    if (contextMenu?.nodeId) {
      try {
        await invoke('delete_node', { id: contextMenu.nodeId });
        setNodes((nds) => nds.filter((n) => n.id !== contextMenu.nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== contextMenu.nodeId && e.target !== contextMenu.nodeId));
      } catch (error) {
        console.error('Failed to delete node:', error);
      }
    }
    setContextMenu(null);
  }, [contextMenu, setNodes, setEdges]);

  const handleEditEdge = useCallback(() => {
    if (contextMenu?.edgeId) {
      const edge = edges.find((e) => e.id === contextMenu.edgeId);
      if (edge) {
        setEditModal({
          isOpen: true,
          type: 'edge',
          id: contextMenu.edgeId,
          currentLabel: edge.data?.label || '',
        });
      }
    }
    setContextMenu(null);
  }, [contextMenu, edges]);

  const handleDeleteEdge = useCallback(async () => {
    if (contextMenu?.edgeId) {
      try {
        await invoke('delete_edge', { id: contextMenu.edgeId });
        setEdges((eds) => eds.filter((e) => e.id !== contextMenu.edgeId));
      } catch (error) {
        console.error('Failed to delete edge:', error);
      }
    }
    setContextMenu(null);
  }, [contextMenu, setEdges]);

  const handleSaveNode = useCallback(async (label: string) => {
    const position = (window as any).pendingNodePosition || { x: 250, y: 250 };
    
    try {
      const newNode = await invoke<any>('add_node', {
        label,
        x: position.x,
        y: position.y,
      });

      const graphNode: GraphNode = {
        id: newNode.id,
        position: { x: newNode.x, y: newNode.y },
        data: { label: newNode.label },
        type: 'custom',
      };

      setNodes((nds) => [...nds, graphNode]);
    } catch (error) {
      console.error('Failed to add node:', error);
    }
    
    setAddNodeModal({ ...addNodeModal, isOpen: false });
  }, [addNodeModal, setNodes]);

  const handleSaveEdit = useCallback(async (label: string) => {
    if (editModal.type === 'node' && editModal.id) {
      try {
        await invoke('update_node', { id: editModal.id, label });
        setNodes((nds) =>
          nds.map((n) =>
            n.id === editModal.id ? { ...n, data: { ...n.data, label } } : n
          )
        );
      } catch (error) {
        console.error('Failed to update node:', error);
      }
    } else if (editModal.type === 'edge' && editModal.id) {
      try {
        await invoke('update_edge', { id: editModal.id, label });
        setEdges((eds) =>
          eds.map((e) =>
            e.id === editModal.id
              ? { ...e, label, data: { ...e.data, label } }
              : e
          )
        );
      } catch (error) {
        console.error('Failed to update edge:', error);
      }
    }
    
    setEditModal({ ...editModal, isOpen: false });
  }, [editModal, setNodes, setEdges]);

  const handleNodeDragStop = useCallback(async (_: React.MouseEvent, node: GraphNode) => {
    try {
      await invoke('update_node_position', {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
      });
    } catch (error) {
      console.error('Failed to update node position:', error);
    }
  }, []);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const nodeTypes = {
    custom: CustomNode,
  };

  return (
    <div className="w-full h-full bg-slate-900" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onContextMenu={handleCanvasContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        onEdgeDoubleClick={handleEdgeDoubleClick}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        className="bg-slate-900"
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#06b6d4', strokeWidth: 2 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#475569" />
        <Controls
          className="bg-slate-800 border-slate-600 rounded-lg overflow-hidden"
          position="bottom-right"
        />
      </ReactFlow>

      <ContextMenu
        menu={contextMenu}
        onAddNode={handleAddNode}
        onEditNode={handleEditNode}
        onDeleteNode={handleDeleteNode}
        onEditEdge={handleEditEdge}
        onDeleteEdge={handleDeleteEdge}
      />

      <EditModal
        modal={addNodeModal}
        onSave={handleSaveNode}
        onClose={() => setAddNodeModal({ ...addNodeModal, isOpen: false })}
      />

      <EditModal
        modal={editModal}
        onSave={handleSaveEdit}
        onClose={() => setEditModal({ ...editModal, isOpen: false })}
      />

      <div className="fixed top-4 left-4 right-4 flex gap-4 z-10">
        <div className="bg-slate-800 rounded-lg px-4 py-3 border border-slate-600 flex-1 max-w-md">
          <h1 className="text-white font-bold text-lg">知识图谱</h1>
          <p className="text-slate-400 text-xs mt-1">右键画布添加节点 · 拖拽连接节点 · 双击连线编辑关系</p>
          <div className="mt-2 pt-2 border-t border-slate-600">
            <p className="text-green-400 text-xs">{status}</p>
            {dbPath && <p className="text-slate-500 text-xs mt-1 truncate">数据库: {dbPath}</p>}
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg px-4 py-3 border border-slate-600 flex-1 max-w-md relative">
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchKeyword}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜索节点..."
              className="w-full px-4 py-2 pr-10 bg-slate-700 border border-slate-500 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
              onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
            />
            {searchKeyword && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            )}
          </div>
          
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute top-full left-4 right-4 mt-1 bg-slate-700 border border-slate-500 rounded-lg shadow-xl overflow-hidden z-50 max-h-60 overflow-y-auto">
              <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-600">
                找到 {searchResults.length} 个节点
              </div>
              {searchResults.map((nodeId) => {
                const node = nodes.find((n) => n.id === nodeId);
                return node ? (
                  <button
                    key={nodeId}
                    onClick={() => focusOnNode(nodeId)}
                    className="w-full px-3 py-2 text-left text-white hover:bg-cyan-600 transition-colors border-b border-slate-600 last:border-b-0"
                  >
                    <span className="text-sm">{highlightText(node.data.label, searchKeyword)}</span>
                  </button>
                ) : null;
              })}
            </div>
          )}
          
          {showSearchResults && searchKeyword && searchResults.length === 0 && (
            <div className="absolute top-full left-4 right-4 mt-1 bg-slate-700 border border-slate-500 rounded-lg shadow-xl overflow-hidden z-50">
              <div className="px-3 py-4 text-center text-slate-400 text-sm">
                未找到匹配的节点
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <ReactFlowProvider>
      <GraphCanvas />
    </ReactFlowProvider>
  );
}

export default App;
