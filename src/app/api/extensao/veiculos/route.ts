import { prisma } from "@/lib/prisma";
import { autorizarExtensao } from "@/lib/extensao-auth";

export const dynamic = "force-dynamic";

/**
 * Lista os carros da FROTA DE ALUGUEL pra extensão do Chrome saber, na tela
 * "Veículos da empresa" do DETRAN-PE, quais cartões clicar — o DETRAN-PE
 * mostra TODO carro no CNPJ da empresa, inclusive os que não são de aluguel
 * (pedido do usuário em 2026-10-24: "nem todos esses são de aluguel").
 *
 * A tabela "vehicles" JÁ É só a frota de aluguel — não precisa filtrar por
 * status além de excluir os vendidos (um carro vendido não é mais nosso
 * problema de multa).
 */
export async function GET(request: Request): Promise<Response> {
  const erro = autorizarExtensao(request);
  if (erro) return erro;

  const veiculos = await prisma.vehicle.findMany({
    where: { status: { not: "VENDIDO" } },
    select: { id: true, plate: true, renavam: true, ownerDocument: true },
    orderBy: { plate: "asc" },
  });

  return Response.json({ veiculos });
}
