import { notFound } from "next/navigation";
import { PlaceholderPage } from "@/components/placeholder-page";

const modules = {
  services: { title: "Services", description: "Operate service delivery systems and their connected workflows from one surface." },
} as const;

type ModuleKey = keyof typeof modules;

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (!(module in modules)) notFound();
  const definition = modules[module as ModuleKey];
  return <PlaceholderPage title={definition.title} description={definition.description} />;
}
