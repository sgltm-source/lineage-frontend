import React, { useState, useEffect } from "react";
import ReactFlow, { Background, Controls, useNodesState, useEdgesState, Handle, Position, MarkerType, ReactFlowProvider, useReactFlow } from "reactflow";
import dagre from "dagre";
import "reactflow/dist/style.css";

// ============================================================================
// 1. CUSTOM UI COMPONENTS
// ============================================================================
const TableNode = ({ data }) => (
  <div style={{ background: '#fff', border: '1px solid #475569', borderRadius: '4px', minWidth: '180px', boxShadow: "0 2px 4px rgba(0,0,0,0.1)", fontSize: '12px' }}>
    <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
    <div style={{ background: data.layer === 'Bronze' ? '#ffedd5' : data.layer === 'Silver' ? '#f1f5f9' : data.layer === 'Gold' ? '#fef08a' : '#dcfce7', padding: '6px', fontWeight: 'bold', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between' }}>
      <span>{data.label}</span><span style={{ fontSize: '10px', color: '#475569' }}>{data.layer}</span>
    </div>
    <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
  </div>
);

const NotebookNode = ({ data }) => (
  <div style={{ background: '#f0f9ff', border: '1px solid #0284c7', borderRadius: '15px', padding: '6px 12px', fontSize: '11px', fontWeight: "bold", color: '#0369a1' }}>
    <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
    ⚙️ {data.label}
    <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
  </div>
);

const nodeTypes = { table: TableNode, notebook: NotebookNode };

// ============================================================================
// 2. INNER APPLICATION (Wrapped for Auto-Arrange)
// ============================================================================
function FlowApp() {
  // Global Database State
  const [globalNodes, setGlobalNodes] = useState([]);
  const [globalEdges, setGlobalEdges] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Traversal & UI State
  const [centerTable, setCenterTable] = useState("");
  const [upHops, setUpHops] = useState(1);
  const [downHops, setDownHops] = useState(1);
  const [hudOpen, setHudOpen] = useState(true);
  
  // React Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hudData, setHudData] = useState(null);

  const { fitView } = useReactFlow();

  // YOUR LIVE BACKEND
  const API_BASE = "https://lineageapp-efgpewgbbsazfbbn.centralindia-01.azurewebsites.net/api";

  // FETCH ENTIRE UNIVERSE ON LOAD
  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/nodes`).then(res => res.json()),
      fetch(`${API_BASE}/edges`).then(res => res.json())
    ]).then(([fetchedNodes, fetchedEdges]) => {
      setGlobalNodes(fetchedNodes);
      setGlobalEdges(fetchedEdges);
      // Auto-select the first table we find as the starting point
      const firstTable = fetchedNodes.find(n => n.type === 'table');
      if (firstTable) setCenterTable(firstTable.id);
      setIsLoaded(true);
    }).catch(err => console.error("API Fetch Error:", err));
  }, []);

  // CALCULATE PROGRESSIVE HOPS WHENEVER CONTROLS CHANGE
  useEffect(() => {
    if (!isLoaded || !centerTable || globalNodes.length === 0) return;

    // Traversal Engine
    let visibleNodes = new Set([centerTable]);
    let visibleEdges = new Set();

    let currentUp = [centerTable];
    for (let i = 0; i < upHops; i++) {
      let nextUp = [];
      currentUp.forEach(node => {
        globalEdges.filter(e => e.target === node).forEach(e => {
          visibleNodes.add(e.source); visibleEdges.add(e.id); nextUp.push(e.source);
        });
      });
      currentUp = nextUp;
    }

    let currentDown = [centerTable];
    for (let i = 0; i < downHops; i++) {
      let nextDown = [];
      currentDown.forEach(node => {
        globalEdges.filter(e => e.source === node).forEach(e => {
          visibleNodes.add(e.target); visibleEdges.add(e.id); nextDown.push(e.target);
        });
      });
      currentDown = nextDown;
    }

    const vNodes = globalNodes.filter(n => visibleNodes.has(n.id));
    const vEdges = globalEdges.filter(e => visibleEdges.has(e.id));

    // Layout Engine
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: 'LR', ranksep: 150, nodesep: 50 });
    
    vNodes.forEach(n => dagreGraph.setNode(n.id, { width: 180, height: n.type === 'table' ? 100 : 40 }));
    vEdges.forEach(e => dagreGraph.setEdge(e.source, e.target));
    dagre.layout(dagreGraph);

    // MAPPING FIX APPLIED HERE
    setNodes(vNodes.map(n => ({
      id: n.id, type: n.type, 
      data: { label: n.label, layer: n.layer }, 
      position: { x: dagreGraph.node(n.id).x - 90, y: dagreGraph.node(n.id).y - 30 },
      style: n.id === centerTable ? { boxShadow: "0 0 0 4px #3b82f6" } : {}
    })));
    
    setEdges(vEdges.map(e => ({ 
      id: e.id, source: e.source, target: e.target, animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#94a3b8' } 
    })));

    setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 50);
  }, [centerTable, upHops, downHops, isLoaded, globalNodes, globalEdges, fitView]);

  // FETCH METADATA HUD ON CLICK
  const onNodeClick = (_, node) => {
    setSelectedNode(node);
    setHudOpen(true);
    setHudData(null); // clear old data while loading
    fetch(`${API_BASE}/details/${node.id}`)
      .then(res => res.json())
      .then(data => setHudData(data))
      .catch(err => console.error(err));
  };

  return (
    <div style={{ display: "flex", width: "100%", height: "100vh", fontFamily: "Segoe UI, Tahoma, sans-serif", position: 'relative' }}>
      
      {/* CANVAS */}
      <div style={{ flexGrow: 1, background: "#f8fafc" }}>
        {!isLoaded ? (
          <div style={{ padding: '20px', color: '#64748b' }}>Loading Enterprise Architecture...</div>
        ) : (
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={onNodeClick}>
            <Background color="#cbd5e1" gap={20} />
            <Controls />
          </ReactFlow>
        )}
      </div>

      {/* FLOATING CONTROLS (Dropdown, Progressive Hops, Reset, Auto-Arrange) */}
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: 'rgba(255,255,255,0.95)', padding: '15px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', border: '1px solid #cbd5e1', width: '320px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '5px' }}>Select Focus Table:</label>
          <select value={centerTable} onChange={(e) => { setCenterTable(e.target.value); setUpHops(0); setDownHops(0); }} style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
            {globalNodes.filter(n => n.type === 'table').map(t => <option key={t.id} value={t.id}>{t.label} ({t.layer})</option>)}
          </select>
        </div>
        
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center', marginBottom: '15px', justifyContent: 'space-between' }}>
          <button onClick={() => setUpHops(h => h + 1)} style={{ padding: '6px 8px', background: '#e2e8f0', border: 'none', cursor: 'pointer', fontSize: '11px', borderRadius: '4px', flex: 1 }}>⬅️ + Up</button>
          <button onClick={() => { setUpHops(0); setDownHops(0); }} style={{ padding: '6px 8px', background: '#fee2e2', color: '#991b1b', border: 'none', cursor: 'pointer', fontSize: '11px', borderRadius: '4px', fontWeight: 'bold' }}>Collapse All</button>
          <button onClick={() => setDownHops(h => h + 1)} style={{ padding: '6px 8px', background: '#e2e8f0', border: 'none', cursor: 'pointer', fontSize: '11px', borderRadius: '4px', flex: 1 }}>+ Down ➡️</button>
        </div>

        <button onClick={() => fitView({ padding: 0.2, duration: 800 })} style={{ width: '100%', padding: '8px', background: '#0f172a', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', borderRadius: '4px', fontWeight: 'bold' }}>
          🎯 Auto-Arrange & Fit Screen
        </button>
      </div>

      {/* COLLAPSIBLE ENTERPRISE HUD */}
      <div style={{ position: 'absolute', right: hudOpen ? 20 : -420, top: 20, width: '380px', maxHeight: '90vh', background: '#fff', transition: 'right 0.3s ease', borderRadius: '8px', boxShadow: '-5px 5px 20px rgba(0,0,0,0.15)', border: '1px solid #94a3b8', zIndex: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '15px', background: '#0f172a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px' }}>Lineage HUD</h3>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{selectedNode ? selectedNode.data.label : "Awaiting Selection"}</span>
          </div>
          <button onClick={() => setHudOpen(false)} style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✖</button>
        </div>

        <div style={{ padding: '15px', overflowY: 'auto', fontSize: '12px', color: '#334155', flexGrow: 1 }}>
          {!selectedNode ? <p style={{ fontStyle: 'italic', color: '#94a3b8' }}>Please click a node on the canvas to inspect live metadata.</p> : (
            <>
              {!hudData ? <p>Fetching from Azure SQL...</p> : (
                <>
                  {hudData.summary && (
                    <div style={{ marginBottom: '15px' }}>
                      <strong style={{ color: '#0284c7', textTransform: 'uppercase', fontSize: '10px' }}>Table Summary</strong>
                      <div style={{ background: '#f8fafc', padding: '10px', marginTop: '5px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <span><strong>Workspace:</strong> {hudData.summary.workspace}</span>
                          <span><strong>Up Depth:</strong> {hudData.summary.up_depth}</span>
                          <span><strong>Down Depth:</strong> {hudData.summary.down_depth}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {hudData.traceback && (
                    <div style={{ marginBottom: '15px' }}>
                      <strong style={{ color: '#0284c7', textTransform: 'uppercase', fontSize: '10px' }}>Root Cause Path</strong>
                      <div style={{ padding: '10px', background: '#f0f9ff', marginTop: '5px', fontSize: '11px', borderLeft: '3px solid #0284c7', borderRadius: '0 4px 4px 0' }}>
                        <span style={{ fontFamily: 'monospace' }}>{hudData.traceback.path}</span>
                      </div>
                    </div>
                  )}

                  {hudData.downstream && (
                    <div style={{ marginBottom: '15px' }}>
                      <strong style={{ color: '#0284c7', textTransform: 'uppercase', fontSize: '10px' }}>Impact Path</strong>
                      <div style={{ padding: '10px', background: '#fffbeb', marginTop: '5px', fontSize: '11px', borderLeft: '3px solid #d97706', borderRadius: '0 4px 4px 0' }}>
                        <span style={{ fontFamily: 'monospace' }}>{hudData.downstream.path}</span>
                      </div>
                    </div>
                  )}

                  {hudData.direct && (
                    <div style={{ marginBottom: '15px' }}>
                      <strong style={{ color: '#059669', textTransform: 'uppercase', fontSize: '10px' }}>Execution Logic</strong>
                      <div style={{ marginTop: '5px' }}>
                        <p style={{ margin: '0 0 5px 0' }}><strong>Run IDs:</strong> {hudData.direct.runs}</p>
                        <strong>Code Snippet:</strong>
                        <pre style={{ background: '#1e293b', color: '#f8fafc', padding: '10px', borderRadius: '4px', overflowX: 'auto', fontSize: '11px', marginTop: '5px', fontFamily: "monospace" }}>
                          {hudData.direct.code}
                        </pre>
                        <strong style={{ display: 'block', marginTop: '15px' }}>Column Mapping JSON:</strong>
                        {hudData.direct.col_map.map((m, i) => (
                          <div key={i} style={{ background: '#f8fafc', padding: '8px', border: '1px solid #e2e8f0', marginTop: '5px', fontSize: '11px', borderRadius: '4px' }}>
                            <span style={{ color: '#d97706', fontWeight: 'bold' }}>{m.source}</span> ➔ <span style={{ color: '#059669', fontWeight: 'bold' }}>{m.target}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {!hudOpen && (
        <button onClick={() => setHudOpen(true)} style={{ position: 'absolute', right: 0, top: 20, background: '#0f172a', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px 0 0 8px', cursor: 'pointer', zIndex: 10, boxShadow: '-2px 2px 5px rgba(0,0,0,0.2)', fontWeight: 'bold' }}>
          ◀ Open HUD
        </button>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <FlowApp />
    </ReactFlowProvider>
  );
}
