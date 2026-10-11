import { Skeleton } from "@/components/ui/skeleton";

export default function KnowledgeGraphLoading() {
  return (
    <section
      aria-label="Loading Knowledge Graph"
      aria-busy="true"
      className="flex min-h-full w-full flex-1 flex-col bg-[#07080F]"
    >
      <div className="flex min-h-14 items-center justify-between gap-4 border-b border-[#2A2E45] px-4 sm:px-6">
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-cyan-300">Knowledge Graph</p>
          <p className="m-0 text-xs text-[#888]">Preparing the graph workspace</p>
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="relative min-h-[28rem] overflow-hidden">
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <Skeleton className="mx-auto size-16 rounded-full" />
              <p className="mb-0 mt-5 text-sm font-medium text-[#F3F5FF]">Initializing graph workspace</p>
              <p className="mb-0 mt-1 text-xs text-[#888]">Loading controls and the accessible graph surface.</p>
            </div>
          </div>
        </div>
        <aside aria-label="Loading graph directory" className="hidden border-l border-[#2A2E45] bg-[#0C1020]/70 p-4 md:block">
          <Skeleton className="h-8 w-full" />
          <div className="mt-5 grid gap-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        </aside>
      </div>
    </section>
  );
}
