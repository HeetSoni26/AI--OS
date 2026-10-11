import {
  edgeDataSchema,
  graphNodeDetailSchema,
  graphNodeTypeSchema,
  nodeDataSchema,
  type EdgeData,
  type GraphNodeDetail,
  type GraphNodeType,
  type NodeData,
} from "@aios/contracts";

export interface GraphProjectionContext {
  generatedAt: string;
}

export interface GraphProjectionResult {
  nodes: readonly NodeData[];
  edges: readonly EdgeData[];
}

export interface GraphProjection<TSource = unknown> {
  key: string;
  project(source: TSource, context: GraphProjectionContext): GraphProjectionResult;
}

function assertExtensionKey(key: string): void {
  if (!/^[a-z][a-z0-9._-]{1,99}$/.test(key)) throw new Error("Extension keys must be stable lowercase identifiers between 2 and 100 characters.");
}

/** Domain modules register projections without importing or changing renderer code. */
export class ProjectionRegistry {
  readonly #projections = new Map<string, GraphProjection<unknown>>();

  register<TSource>(projection: GraphProjection<TSource>): () => void {
    assertExtensionKey(projection.key);
    if (this.#projections.has(projection.key)) throw new Error(`Projection '${projection.key}' is already registered.`);
    this.#projections.set(projection.key, projection as GraphProjection<unknown>);
    return () => this.unregister(projection.key);
  }

  unregister(key: string): boolean {
    return this.#projections.delete(key);
  }

  has(key: string): boolean {
    return this.#projections.has(key);
  }

  keys(): string[] {
    return [...this.#projections.keys()];
  }

  project<TSource>(key: string, source: TSource, context: GraphProjectionContext): GraphProjectionResult {
    const projection = this.#projections.get(key);
    if (!projection) throw new Error(`Projection '${key}' is not registered.`);
    const output = projection.project(source, context);
    const nodes = output.nodes.map((node) => nodeDataSchema.parse(node));
    const edges = output.edges.map((edge) => {
      const parsed = edgeDataSchema.parse(edge);
      if (parsed.origin !== "projection" || parsed.projectionKey !== key) {
        throw new Error(`Projection '${key}' emitted an edge without its projection ownership.`);
      }
      return parsed;
    });
    return { nodes, edges };
  }
}

export interface DetailResolverContext {
  getNodeDetail(nodeId: string): GraphNodeDetail | undefined;
}

export interface NodeDetailResolver<TResult = unknown> {
  key: string;
  nodeType: GraphNodeType;
  resolve(detail: GraphNodeDetail, context: DetailResolverContext): TResult;
}

export class DetailRegistry {
  readonly #resolvers = new Map<GraphNodeType, NodeDetailResolver<unknown>>();

  register<TResult>(resolver: NodeDetailResolver<TResult>): () => void {
    assertExtensionKey(resolver.key);
    graphNodeTypeSchema.parse(resolver.nodeType);
    if (this.#resolvers.has(resolver.nodeType)) throw new Error(`A detail resolver for '${resolver.nodeType}' is already registered.`);
    this.#resolvers.set(resolver.nodeType, resolver as NodeDetailResolver<unknown>);
    return () => this.unregister(resolver.nodeType, resolver.key);
  }

  unregister(nodeType: GraphNodeType, expectedKey?: string): boolean {
    const resolver = this.#resolvers.get(nodeType);
    if (!resolver || (expectedKey !== undefined && resolver.key !== expectedKey)) return false;
    return this.#resolvers.delete(nodeType);
  }

  has(nodeType: GraphNodeType): boolean {
    return this.#resolvers.has(nodeType);
  }

  resolve(detailInput: GraphNodeDetail, context: DetailResolverContext): unknown {
    const detail = graphNodeDetailSchema.parse(detailInput);
    const resolver = this.#resolvers.get(detail.node.type);
    if (!resolver) return undefined;
    return resolver.resolve(detail, context);
  }
}
