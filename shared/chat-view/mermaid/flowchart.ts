/**
 * A parser for the Mermaid flowchart subset that actually shows up in agent
 * output and documentation. Pure and dependency-free: Mermaid itself needs a DOM
 * and cannot run in a Paseo client bundle, and the transformer must stay
 * synchronous, so the grammar is walked by hand.
 *
 * Anything it fails to recognise is reported rather than guessed at, and the
 * renderer falls back to showing the source.
 */

export type Direction = "TD" | "TB" | "BT" | "LR" | "RL";
export type NodeShape =
  | "rect"
  | "round"
  | "stadium"
  | "subroutine"
  | "diamond"
  | "circle"
  | "asymmetric";
export type EdgeStyle = "solid" | "dotted" | "thick";

export interface FlowNode {
  id: string;
  label: string;
  shape: NodeShape;
}

export interface FlowEdge {
  from: string;
  to: string;
  label: string | null;
  style: EdgeStyle;
  arrow: boolean;
}

/** A `subgraph` block: the box the renderer draws around its member nodes. */
export interface FlowSubgraph {
  /** Mermaid's id when given, synthesized otherwise; edges never target it. */
  id: string;
  title: string;
  members: string[];
}

export interface Flowchart {
  direction: Direction;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Top-level `subgraph` blocks only; a nested one folds into its ancestor. */
  subgraphs: FlowSubgraph[];
  /** Lines the parser chose not to interpret, so the UI can say so. */
  skipped: string[];
}

const HEADER = /^\s*(?:flowchart|graph)(?:\s+(TD|TB|BT|LR|RL))?\s*$/i;

/** Longest first: `-.->` must win over `-.-`. */
const OPERATORS: { token: string; style: EdgeStyle; arrow: boolean }[] = [
  { token: "-.->", style: "dotted", arrow: true },
  { token: "==>", style: "thick", arrow: true },
  { token: "-->", style: "solid", arrow: true },
  { token: "-.-", style: "dotted", arrow: false },
  { token: "===", style: "thick", arrow: false },
  { token: "---", style: "solid", arrow: false },
];

const OPENERS: { open: string; close: string; shape: NodeShape }[] = [
  { open: "([", close: "])", shape: "stadium" },
  { open: "[[", close: "]]", shape: "subroutine" },
  { open: "((", close: "))", shape: "circle" },
  { open: "{{", close: "}}", shape: "diamond" },
  { open: "[", close: "]", shape: "rect" },
  { open: "(", close: ")", shape: "round" },
  { open: "{", close: "}", shape: "diamond" },
  { open: ">", close: "]", shape: "asymmetric" },
];

/**
 * Mermaid writes an edge label two ways. Rewriting `A -- yes --> B` into
 * `A -->|yes| B` lets the splitter handle one form.
 */
export function normalizeEdgeLabels(line: string): string {
  return line
    .replace(/--\s+([^->|]+?)\s+-->/g, "-->|$1|")
    .replace(/-\.\s+([^.|>]+?)\s+\.->/g, "-.->|$1|")
    .replace(/==\s+([^=|>]+?)\s+==>/g, "==>|$1|");
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  const quoted = /^"(.*)"$/s.exec(trimmed) ?? /^'(.*)'$/s.exec(trimmed);
  return (quoted ? quoted[1] : trimmed).replace(/<br\s*\/?>/gi, "\n").trim();
}

/** Reads `id`, `id[Label]`, `id{Decision}`, `id((Circle))` and friends. */
export function parseNodeExpression(raw: string): FlowNode | null {
  const text = raw.trim();
  if (text.length === 0) return null;

  for (const { open, close, shape } of OPENERS) {
    const start = text.indexOf(open);
    if (start <= 0) continue;
    if (!text.endsWith(close)) continue;
    const id = text.slice(0, start).trim();
    if (!/^[\w.-]+$/.test(id)) continue;
    const label = stripQuotes(text.slice(start + open.length, text.length - close.length));
    return { id, label: label.length > 0 ? label : id, shape };
  }

  if (!/^[\w.-]+$/.test(text)) return null;
  return { id: text, label: text, shape: "rect" };
}

interface Split {
  parts: string[];
  operators: { style: EdgeStyle; arrow: boolean; label: string | null }[];
}

/** Splits `A -->|yes| B --> C` into its nodes and the operators between them. */
export function splitChain(line: string): Split | null {
  const parts: string[] = [];
  const operators: Split["operators"] = [];
  let rest = line;

  for (;;) {
    let best: { index: number; op: (typeof OPERATORS)[number] } | null = null;
    for (const op of OPERATORS) {
      const index = rest.indexOf(op.token);
      if (index < 0) continue;
      if (
        !best ||
        index < best.index ||
        (index === best.index && op.token.length > best.op.token.length)
      ) {
        best = { index, op };
      }
    }
    if (!best) break;

    parts.push(rest.slice(0, best.index));
    let after = rest.slice(best.index + best.op.token.length);

    let label: string | null = null;
    const labelled = /^\s*\|([^|]*)\|/.exec(after);
    if (labelled) {
      label = stripQuotes(labelled[1]);
      after = after.slice(labelled[0].length);
    }

    operators.push({ style: best.op.style, arrow: best.op.arrow, label });
    rest = after;
  }

  if (operators.length === 0) return null;
  parts.push(rest);
  return { parts, operators };
}

export function parseFlowchart(source: string): Flowchart | null {
  const lines = source.split("\n");
  let direction: Direction | null = null;
  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const subgraphs: FlowSubgraph[] = [];
  const skipped: string[] = [];
  /** Innermost-first stack of open blocks; only the bottom one is a drawn box. */
  const open: FlowSubgraph[] = [];
  /** Nested blocks open inside a drawn box; their ends must not pop the box. */
  let nested = 0;

  const remember = (node: FlowNode) => {
    const existing = nodes.get(node.id);
    // A later definition carrying a real label wins over a bare id mention.
    if (!existing || (existing.label === existing.id && node.label !== node.id)) {
      nodes.set(node.id, node);
    }
    if (open.length > 0) {
      const box = open[0] as FlowSubgraph;
      if (!box.members.includes(node.id)) box.members.push(node.id);
    }
  };

  for (const original of lines) {
    const line = original.replace(/%%.*$/, "").trim();
    if (line.length === 0) continue;

    const header = HEADER.exec(line);
    if (header) {
      direction = (header[1]?.toUpperCase() as Direction) ?? "TD";
      continue;
    }
    if (direction === null) {
      // Not a flowchart at all; let another parser have it.
      return null;
    }

    if (/^subgraph\b/i.test(line)) {
      // A nested block is not drawn as its own box: its members join the
      // enclosing one, and the inner header is reported like any other
      // uninterpreted line so nesting stays visible in the skipped list.
      if (open.length > 0) {
        nested += 1;
        skipped.push(original.trim());
      } else {
        const box = parseSubgraphHeader(line, subgraphs.length);
        if (box) {
          subgraphs.push(box);
          open.push(box);
        } else skipped.push(original.trim());
      }
      continue;
    }
    if (/^end$/i.test(line)) {
      if (nested > 0) nested -= 1;
      else if (open.length > 0) open.pop();
      else skipped.push(original.trim());
      continue;
    }
    if (/^(?:style|classDef|class|click|linkStyle)\b/i.test(line)) {
      skipped.push(original.trim());
      continue;
    }

    const chain = splitChain(normalizeEdgeLabels(line));
    if (!chain) {
      const single = parseNodeExpression(line.replace(/;$/, ""));
      if (single) remember(single);
      else skipped.push(original.trim());
      continue;
    }

    const parsed = chain.parts.map((part) => parseNodeExpression(part.replace(/;$/, "")));
    if (parsed.some((node) => node === null)) {
      skipped.push(original.trim());
      continue;
    }

    for (const node of parsed) remember(node as FlowNode);
    for (let index = 0; index < chain.operators.length; index += 1) {
      const operator = chain.operators[index];
      edges.push({
        from: (parsed[index] as FlowNode).id,
        to: (parsed[index + 1] as FlowNode).id,
        label: operator.label,
        style: operator.style,
        arrow: operator.arrow,
      });
    }
  }

  if (direction === null) return null;
  return { direction, nodes: [...nodes.values()], edges, subgraphs, skipped };
}

/**
 * Reads the text after `subgraph`: `id["Title"]`, bare `id`, or a free-form
 * (possibly quoted) title that gets a synthesized id because edges cannot
 * reach a name with spaces anyway.
 */
function parseSubgraphHeader(line: string, index: number): FlowSubgraph | null {
  const rest = line.replace(/^subgraph\b/i, "").trim();
  if (rest.length === 0) return null;

  const labelled = /^([\w.-]+)\s*[[(]\s*(.*?)\s*[\])]$/.exec(rest);
  if (labelled) {
    const id = labelled[1] as string;
    const title = stripQuotes(labelled[2] as string);
    return { id, title: title.length > 0 ? title : id, members: [] };
  }
  if (/^[\w.-]+$/.test(rest)) return { id: rest, title: rest, members: [] };
  return { id: `subgraph-${index}`, title: stripQuotes(rest), members: [] };
}
