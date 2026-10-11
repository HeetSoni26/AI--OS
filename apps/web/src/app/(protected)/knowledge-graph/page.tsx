import { Suspense } from "react";
import { GraphWorkspace } from "@/features/graph/components/graph-workspace";
import KnowledgeGraphLoading from "./loading";

export default function KnowledgeGraphPage() {
  return (
    <Suspense fallback={<KnowledgeGraphLoading />}>
      <GraphWorkspace />
    </Suspense>
  );
}
