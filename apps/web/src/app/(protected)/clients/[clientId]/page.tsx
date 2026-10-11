import { ClientDetail } from "@/features/clients/components/client-detail";

export default async function ClientProfilePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <div className="mx-auto max-w-5xl"><ClientDetail clientId={clientId} /></div>;
}
