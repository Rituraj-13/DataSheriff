import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useEffect } from 'react'
import './LineageGraph.css'

// ─── Custom Node ──────────────────────────────────────────────────────────────

function LineageNode({ data }) {
  const statusClass = data.status === 'failing'
    ? 'lineage-node--failing'
    : data.status === 'healthy'
      ? 'lineage-node--healthy'
      : 'lineage-node--unknown'

  return (
    <div className={`lineage-node ${statusClass}`}>
      <div className="lineage-node__type">{data.type}</div>
      <div className="lineage-node__name">{data.label}</div>
      {data.status === 'failing' && (
        <div className="lineage-node__badge">⚠ FAILING</div>
      )}
      {data.status === 'healthy' && (
        <div className="lineage-node__badge lineage-node__badge--ok">✓ OK</div>
      )}
    </div>
  )
}

const nodeTypes = { lineageNode: LineageNode }

// ─── Layout helper (auto-position nodes left→right) ──────────────────────────

function buildGraph(lineageData, failingFqns = []) {
  if (!lineageData) return { nodes: [], edges: [] }

  const { nodes: rawNodes = [], edges: rawEdges = [] } = lineageData

  // Determine status
  const getStatus = (node) => {
    if (failingFqns.some(fqn => fqn === node.fqn)) return 'failing'
    if (node.is_root) return 'root'
    return 'unknown'
  }

  // Simple left-to-right layout
  const rfNodes = rawNodes.map((node, i) => ({
    id: node.id || String(i),
    type: 'lineageNode',
    position: { x: (i % 4) * 220, y: Math.floor(i / 4) * 120 },
    data: {
      label: node.name || node.fqn?.split('.').pop() || 'Unknown',
      type: node.type || 'table',
      status: getStatus(node),
      fqn: node.fqn,
    },
  }))

  const rfEdges = rawEdges.map((edge, i) => ({
    id: `e-${i}`,
    source: edge.from_id,
    target: edge.to_id,
    animated: true,
    style: { stroke: '#7c6cfa', strokeWidth: 2 },
  }))

  return { nodes: rfNodes, edges: rfEdges }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LineageGraph({ lineageData, failingFqns = [] }) {
  const { nodes: initNodes, edges: initEdges } = buildGraph(lineageData, failingFqns)
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges)

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(lineageData, failingFqns)
    setNodes(n)
    setEdges(e)
  }, [lineageData, failingFqns])

  if (!lineageData || !lineageData.nodes?.length) return null

  return (
    <div className="lineage-graph">
      <div className="lineage-graph__header">
        <span>🕸️</span>
        <h2>Lineage Graph</h2>
        <div className="lineage-graph__legend">
          <span className="legend-item legend-item--failing">⚠ Failing</span>
          <span className="legend-item legend-item--healthy">✓ Healthy</span>
          <span className="legend-item legend-item--unknown">? Unchecked</span>
        </div>
      </div>
      <div className="lineage-graph__canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#2a2a3f" gap={20} />
          <Controls
            style={{ background: '#1a1a27', border: '1px solid #2a2a3f', borderRadius: 8 }}
          />
          <MiniMap
            style={{ background: '#13131c', border: '1px solid #2a2a3f' }}
            nodeColor={(node) =>
              node.data?.status === 'failing' ? '#f87171' :
                node.data?.status === 'healthy' ? '#34d399' : '#9898b8'
            }
          />
        </ReactFlow>
      </div>
    </div>
  )
}
