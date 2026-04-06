import React, { useState, useEffect } from "react";
import ReactFlow, { Background, Controls, useNodesState, useEdgesState, Handle, Position, MarkerType } from "reactflow";
import dagre from "dagre";
import "reactflow/dist/style.css";

const TableNode = ({ data }) => (
  <div style={{ background: '#fff', border: '1px solid #475569', borderRadius: '4px', minWidth: '180px', fontSize: '12px', boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
    <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
    <div style={{ background: data.layer === 'Bronze' ? '#ffedd5' : data.layer === 'Silver' ? '#f1f5f9' : data.layer === 'Gold' ? '#fef08a' : '#f8fafc', padding: '6px', fontWeight: 'bold', borderBottom: '1px solid #cbd5e1' }}>
      {data.label} <span style={{ fontSize: '10px', float: 'right' }}>{data.layer}</span>
    </div>
    <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
  </div>
);

const NotebookNode = ({ data }) => (
  <div style={{ background: '#f0f9ff', border: '1px solid #0284c7', borderRadius: '15px', padding: '6px 12px', fontSize: '11px', fontWeight: "bold", color: '#0369a1' }}>
    <Handle type="target" position={Position.Left} style={{ opacity: 0 }} /> ⚙️ {data.label} <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
  </div>
);

const nodeTypes = { table: TableNode, notebook: NotebookNode };

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hudData, setHudData] = useState(null);

  // Your correct API URL
  const API_BASE = "https://lineageapp-efgpewgbbsazfbbn.centralindia-01.azurewebsites.net/";

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/nodes`).then(res => res.json()),
      fetch(`${API_BASE}/edges`).then(res => res.json())
    ]).then(([fetchedNodes, fetchedEdges]) => {
      
      const dagreGraph = new dagre.graphlib.Graph();
      dagreGraph.setDefaultEdgeLabel(() => ({}));
      dagreGraph.setGraph({ rankdir: 'LR', ranksep: 150, nodesep: 50 });
      
      fetchedNodes.forEach(n => dagreGraph.setNode(n.id, { width: 180, height: 50 }));
      fetchedEdges.forEach(e => dagreGraph.setEdge(e.source, e.target));
      dagre.layout(dagreGraph);

      // THE FIX: Properly wrapping n.label and n.layer into the data object ReactFlow requires
      setNodes(fetchedNodes.map(n => ({
        id: n.id, 
        type: n.type, 
        data: { label: n.label, layer: n.layer }, 
        position: { x: dagreGraph.node(n.id).x, y: dagreGraph.node(n.id).y }
      })));
      
      setEdges(fetchedEdges.map(e => ({
        id: e.id, source: e.source, target: e.target, animated: true, markerEnd: { type: MarkerType.ArrowClosed }
      })));
    }).catch(err => console.error("Database connection failed:", err));
  }, []);

  const onNodeClick = (_, node) => {
    setSelectedNode(node);
    fetch(`${API_BASE}/details/${node.id}`).then(res => res.json()).then(data => setHudData(data));
  };

  return (
    <div style={{ display: "flex", width: "100%", height: "100vh", fontFamily: "sans-serif" }}>
      <div style={{ flexGrow: 1, background: "#f8fafc" }}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={onNodeClick} fitView>
          <Background color="#cbd5e1" gap={20} />
          <Controls />
        </ReactFlow>
      </div>

      <div style={{ width: "350px", background: "#fff", borderLeft: "1px solid #cbd5e1", padding: "15px", overflowY: "auto" }}>
        <h3 style={{ background: '#0f172a', color: '#fff', padding: '10px', borderRadius: '4px' }}>Lineage HUD</h3>
        
        {!selectedNode ? <p>Click a node to load its metadata from the database.</p> : (
          <div>
            <h4 style={{ color: '#0284c7' }}>Inspecting: {selectedNode.data.label}</h4>
            
            {!hudData ? <p>Loading database records...</p> : (
              <div style={{ fontSize: '12px' }}>
                
                {hudData.summary && (
                  <div style={{ background: '#f8fafc', padding: '8px', border: '1px solid #e2e8f0', marginBottom: '10px' }}>
                    <strong>Summary (Table: meta_table_lineage_summary)</strong><br/>
                    Workspace: {hudData.summary.workspace}<br/>
                    Depth: {hudData.summary.up_depth} Up / {hudData.summary.down_depth} Down
                  </div>
                )}

                {hudData.direct && (
                  <div style={{ background: '#f8fafc', padding: '8px', border: '1px solid #e2e8f0', marginBottom: '10px' }}>
                    <strong>Execution (Table: meta_table_direct_lineage)</strong><br/>
                    Run ID: {hudData.direct.runs}<br/>
                    <pre style={{ background: '#1e293b', color: '#fff', padding: '5px', marginTop: '5px', overflowX: 'auto' }}>{hudData.direct.code}</pre>
                    {hudData.direct.col_map.map((m, i) => <div key={i}>{m.source} ➔ {m.target}</div>)}
                  </div>
                )}

                {hudData.traceback && (
                  <div style={{ background: '#f0f9ff', padding: '8px', borderLeft: '3px solid #0284c7', marginBottom: '10px' }}>
                    <strong>Root Cause Path (meta_table_traceback)</strong><br/>{hudData.traceback.path}
                  </div>
                )}
                
                {hudData.downstream && (
                  <div style={{ background: '#fffbeb', padding: '8px', borderLeft: '3px solid #d97706', marginBottom: '10px' }}>
                    <strong>Impact Path (meta_table_downstream)</strong><br/>{hudData.downstream.path}
                  </div>
                )}

              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
