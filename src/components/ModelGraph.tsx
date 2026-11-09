import { useMemo } from "react";
import { ArrowDown, GitBranch } from "lucide-react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { TypeDefinition, Userset } from "@openfga/sdk";
import type { OpenFgaModel } from "../types";

interface RelationNodeData extends Record<string, unknown> {
  title: string;
  typeName: string;
  expression: string;
  directTypes: string[];
  tone: string;
}

function RelationCard({ data }: NodeProps<Node<RelationNodeData, "relation">>) {
  return (
    <div className={`relation-node relation-node-${data.tone}`}>
      <Handle className="relation-handle" position={Position.Left} type="target" />
      <div className="relation-node-heading">
        <span className={`relation-type-tag relation-type-${data.tone}`}>{data.typeName}</span>
        <strong>{data.title}</strong>
      </div>
      <div className="relation-node-expression">{data.expression}</div>
      {data.directTypes.length > 0 && <div className="relation-node-direct">direct: {data.directTypes.join(", ")}</div>}
      <Handle className="relation-handle" position={Position.Right} type="source" />
    </div>
  );
}

const nodeTypes = { relation: RelationCard };

function rewriteLabel(userset?: Userset): string {
  if (!userset) return "No rewrite";
  if (userset.this !== undefined) return "direct assignment";
  if (userset.computedUserset) return `computed → ${userset.computedUserset.relation ?? "?"}`;
  if (userset.tupleToUserset) return `through ${userset.tupleToUserset.tupleset.relation} → ${userset.tupleToUserset.computedUserset.relation}`;
  if (userset.union) return `union · ${userset.union.child.length} paths`;
  if (userset.intersection) return `intersection · ${userset.intersection.child.length} paths`;
  if (userset.difference) return "difference";
  return "relationship rewrite";
}

function collectEdges(
  expression: Userset | undefined,
  sourceType: string,
  sourceRelation: string,
  definitions: TypeDefinition[],
  edges: Edge[],
  edgeIds: Set<string>,
) {
  if (!expression) return;
  const destination = `${sourceType}#${sourceRelation}`;
  const addEdge = (from: string, label?: string) => {
    const id = `${from}->${destination}:${label ?? "computed"}`;
    if (edgeIds.has(id) || from === destination) return;
    edgeIds.add(id);
    edges.push({
      id,
      source: from,
      target: destination,
      label,
      type: "smoothstep",
      animated: false,
      style: { stroke: "#5c6e8d", strokeWidth: 1.4 },
      labelStyle: { fill: "#96a4bb", fontSize: 10 },
      labelBgStyle: { fill: "#101726", fillOpacity: 0.94 },
      markerEnd: { type: "arrowclosed", color: "#7385a4", width: 15, height: 15 },
    });
  };

  if (expression.computedUserset?.relation) {
    addEdge(`${sourceType}#${expression.computedUserset.relation}`);
  }

  const tupleToUserset = expression.tupleToUserset;
  if (tupleToUserset?.tupleset?.relation && tupleToUserset.computedUserset?.relation) {
    const parentType = definitions
      .find((definition) => definition.type === sourceType)
      ?.metadata?.relations?.[tupleToUserset.tupleset.relation]
      ?.directly_related_user_types?.find((reference) => reference.type !== "user")?.type;
    if (parentType) {
      addEdge(`${parentType}#${tupleToUserset.computedUserset.relation}`, `via ${tupleToUserset.tupleset.relation}`);
    }
  }

  expression.union?.child.forEach((child) => collectEdges(child, sourceType, sourceRelation, definitions, edges, edgeIds));
  expression.intersection?.child.forEach((child) => collectEdges(child, sourceType, sourceRelation, definitions, edges, edgeIds));
  if (expression.difference) {
    collectEdges(expression.difference.base, sourceType, sourceRelation, definitions, edges, edgeIds);
    collectEdges(expression.difference.subtract, sourceType, sourceRelation, definitions, edges, edgeIds);
  }
}

export function ModelGraph({ model }: { model?: OpenFgaModel }) {
  const { nodes, edges } = useMemo(() => {
    const definitions = model?.type_definitions ?? [];
    const graphNodes: Node<RelationNodeData, "relation">[] = [];
    const graphEdges: Edge[] = [];
    const edgeIds = new Set<string>();
    const typeOrder = ["workspace", "document", "user"];
    const orderedDefinitions = [...definitions].sort((a, b) => {
      const ai = typeOrder.indexOf(a.type);
      const bi = typeOrder.indexOf(b.type);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });

    orderedDefinitions.forEach((definition, typeIndex) => {
      const relationEntries = Object.entries(definition.relations ?? {});
      if (relationEntries.length === 0) {
        graphNodes.push({
          id: `${definition.type}#type`,
          type: "relation",
          position: { x: typeIndex * 330, y: 0 },
          data: {
            title: definition.type,
            typeName: "type",
            expression: "Principal identity type",
            directTypes: [],
            tone: definition.type === "user" ? "teal" : "blue",
          },
          style: { width: 248, minHeight: 88, border: "none", background: "transparent", padding: 0, boxShadow: "none" },
        });
      }
      relationEntries.forEach(([relation, userset], relationIndex) => {
        const directTypes = definition.metadata?.relations?.[relation]?.directly_related_user_types?.map((item) => item.type) ?? [];
        graphNodes.push({
          id: `${definition.type}#${relation}`,
          type: "relation",
          position: { x: typeIndex * 330, y: relationIndex * 118 },
          data: {
            title: relation,
            typeName: definition.type,
            expression: rewriteLabel(userset),
            directTypes,
            tone: definition.type === "workspace" ? "violet" : definition.type === "document" ? "blue" : "teal",
          },
          style: {
            width: 248,
            minHeight: 88,
            borderRadius: 13,
            border: "1px solid #2b3549",
            background: "#121a29",
            color: "#e8eef9",
            padding: 0,
            boxShadow: "0 12px 30px #0307123d",
          },
        });
        collectEdges(userset, definition.type, relation, definitions, graphEdges, edgeIds);
      });
    });

    return { nodes: graphNodes, edges: graphEdges };
  }, [model]);

  if (!model) {
    return <div className="graph-empty"><GitBranch size={21} /><span>Load an authorization model to visualize its relationship rewrites.</span></div>;
  }

  if (!nodes.length) {
    return <div className="graph-empty"><GitBranch size={21} /><span>This model has no relation definitions to display.</span></div>;
  }

  return (
    <div className="model-flow-wrap">
      <div className="graph-key"><span><i className="graph-key-dot graph-key-violet" /> Workspace</span><span><i className="graph-key-dot graph-key-blue" /> Document</span><span><i className="graph-key-dot graph-key-teal" /> User</span></div>
      <ReactFlow
        fitView
        fitViewOptions={{ padding: 0.22, maxZoom: 1.1 }}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesConnectable={false}
        nodesDraggable
        elementsSelectable
        minZoom={0.25}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#283247" gap={22} size={1} />
        <Controls showInteractive={false} />
        <MiniMap maskColor="#090e18bb" nodeColor={(node) => {
          const tone = (node.data as RelationNodeData).tone;
          return tone === "violet" ? "#9b8cff" : tone === "teal" ? "#59d6bd" : "#6aa8ff";
        }} />
      </ReactFlow>
      {edges.length === 0 && <div className="graph-no-edges"><ArrowDown size={13} /> Directly assigned relationships have no inheritance edge.</div>}
    </div>
  );
}
