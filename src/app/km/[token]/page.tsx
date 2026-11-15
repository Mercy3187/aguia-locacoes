import { prisma } from "@/lib/prisma";
import { DriverForm } from "./DriverForm";
import { EMPRESA } from "@/lib/empresa";

export const dynamic = "force-dynamic";

/** O link é pessoal e temporário — não pode acabar em índice de buscador. */
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold">
          {EMPRESA.nome}
        </h1>
        <p className="text-sm text-muted">Informe a quilometragem do veículo</p>
      </div>
      {children}
    </main>
  );
}

function Message({ emoji, title, text }: { emoji: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 text-center">
      <p className="text-3xl">{emoji}</p>
      <h2 className="mt-2 text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
  );
}

export default async function DriverKmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const request = await prisma.kmRequest.findUnique({
    where: { token },
    include: { vehicle: true },
  });

  if (!request || request.status === "CANCELADO") {
    return (
      <Wrapper>
        <Message
          emoji="🔒"
          title="Link inválido"
          text="Este link não é válido. Verifique com a locadora."
        />
      </Wrapper>
    );
  }

  if (request.usedAt || request.status === "RESPONDIDO") {
    return (
      <Wrapper>
        <Message
          emoji="✅"
          title="KM já enviada"
          text="Esta solicitação já foi respondida. Obrigado!"
        />
      </Wrapper>
    );
  }

  if (!request.expiresAt || request.expiresAt < new Date()) {
    return (
      <Wrapper>
        <Message
          emoji="⏰"
          title="Link expirado"
          text="Este link expirou. Solicite um novo à locadora."
        />
      </Wrapper>
    );
  }

  const vehicleLabel = [request.vehicle.brand, request.vehicle.model]
    .filter(Boolean)
    .join(" ") || "Veículo";

  return (
    <Wrapper>
      <DriverForm token={token} vehicleLabel={vehicleLabel} plate={request.vehicle.plate} />
    </Wrapper>
  );
}
