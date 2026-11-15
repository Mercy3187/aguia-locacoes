/**
 * Ícones do sistema — SVG desenhado à mão, sem biblioteca externa.
 *
 * Todos herdam a cor do texto (`currentColor`) e o traço tem a mesma espessura,
 * para o menu inteiro parecer um conjunto só. São componentes puros, então
 * funcionam tanto no servidor quanto dentro de componentes client.
 */

export type IconName =
  | "dashboard"
  | "alerta"
  | "motorista"
  | "carro"
  | "cliente"
  | "contrato"
  | "km"
  | "oleo"
  | "correia"
  | "multa"
  | "chave"
  | "cobranca"
  | "acerto"
  | "inadimplencia"
  | "divida"
  | "caucao"
  | "fechamento"
  | "relatorio"
  | "usuarios"
  | "auditoria"
  | "integracao"
  | "grupo"
  | "retirada"
  | "carteira"
  | "seta-direita"
  | "sair";

type Props = {
  name: IconName;
  className?: string;
};

const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="5" rx="2" />
      <rect x="3" y="14" width="7.5" height="7" rx="2" />
      <rect x="13.5" y="11" width="7.5" height="10" rx="2" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 3a6 6 0 0 0-6 6c0 3.5-1 5-2 6.2-.4.5 0 1.3.7 1.3h14.6c.7 0 1.1-.8.7-1.3-1-1.2-2-2.7-2-6.2a6 6 0 0 0-6-6Z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  motorista: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 3v5.6M4.2 16.5l4.8-2.8M19.8 16.5l-4.8-2.8" />
    </>
  ),
  carro: (
    <>
      <path d="M4 16.5V19a1 1 0 0 0 1 1h1.6a1 1 0 0 0 1-1v-1.5M16.4 17.5V19a1 1 0 0 0 1 1H19a1 1 0 0 0 1-1v-2.5" />
      <path d="M3.4 16.5h17.2a.9.9 0 0 0 .9-1l-.5-3.3a2 2 0 0 0-1.3-1.6l-1.4-.5-1.7-3.3A2.4 2.4 0 0 0 14.4 5H9.6a2.4 2.4 0 0 0-2.2 1.3L5.7 9.6l-1.4.5a2 2 0 0 0-1.3 1.6l-.5 3.3a.9.9 0 0 0 .9 1Z" />
      <path d="M6 13h1.8M16.2 13H18" />
    </>
  ),
  cliente: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20.2a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  contrato: (
    <>
      <path d="M6 3h8.5L19 7.5V21H6z" />
      <path d="M14 3v5h5" />
      <path d="M9 12.5h6M9 16.5h4" />
    </>
  ),
  km: (
    <>
      <path d="M3.5 18a9 9 0 1 1 17 0" />
      <path d="m12 14 4-4.5" />
      <circle cx="12" cy="14.5" r="1.6" />
      <path d="M5.5 13.2h1.2M17.3 13.2h1.2M12 6.5v1.2" />
    </>
  ),
  oleo: (
    <>
      <path d="M12 3.5S6 10.2 6 14a6 6 0 0 0 12 0c0-3.8-6-10.5-6-10.5Z" />
      <path d="M9.6 14.6a2.6 2.6 0 0 0 2.6 2.6" />
    </>
  ),
  // Placa de trânsito com exclamação — a infração, não o boleto dela.
  multa: (
    <>
      <path d="M12 3.2 20.4 18a1 1 0 0 1-.87 1.5H4.47A1 1 0 0 1 3.6 18Z" />
      <path d="M12 9.6v3.6" />
      <circle cx="12" cy="16.2" r="0.9" />
    </>
  ),
  // Duas polias ligadas pela correia — a leitura mais direta da peça.
  correia: (
    <>
      <circle cx="7.6" cy="13.4" r="4.1" />
      <circle cx="16.8" cy="9.4" r="2.9" />
      <path d="M6.1 9.6A5.6 5.6 0 0 1 15.4 7M9.4 17.5a5.6 5.6 0 0 0 9.2-5.4" />
      <circle cx="7.6" cy="13.4" r="1.2" />
    </>
  ),
  chave: (
    <>
      <path d="M14.7 6.3a4.5 4.5 0 0 1 5.8 5.8l-3-3-2.8 2.8 3 3a4.5 4.5 0 0 1-5.8-5.8" />
      <path d="m11.9 9.1-7 7a2.1 2.1 0 0 0 3 3l7-7" />
    </>
  ),
  cobranca: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M2.5 10h19" />
      <path d="M6 14.5h3.5" />
    </>
  ),
  acerto: (
    <>
      <path d="M6.5 3.5h11a1.5 1.5 0 0 1 1.5 1.5v15.5l-2.4-1.6-2.3 1.6-2.3-1.6-2.3 1.6L5 18.5V5a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="m8.6 9.6 1.5 1.5 3-3.1M8.6 15.1l1.5 1.5 3-3.1" />
    </>
  ),
  inadimplencia: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.2M12 16.2v.6" />
    </>
  ),
  divida: (
    <>
      <path d="M5.5 3.5h13v17l-2.2-1.5-2.1 1.5-2.2-1.5-2.1 1.5-2.2-1.5-2.2 1.5z" />
      <path d="M9 8.5h6M9 12.5h6" />
    </>
  ),
  caucao: (
    <>
      <path d="M12 3 4.5 6v5.6c0 4.4 3.1 8.1 7.5 9.4 4.4-1.3 7.5-5 7.5-9.4V6z" />
      <path d="m9 12 2.2 2.2L15.4 10" />
    </>
  ),
  fechamento: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="m9.4 15.4 1.8 1.8 3.5-3.6" />
    </>
  ),
  relatorio: (
    <>
      <path d="M4 20.5h16" />
      <rect x="5" y="11" width="3.6" height="7" rx="1.2" />
      <rect x="10.2" y="6.5" width="3.6" height="11.5" rx="1.2" />
      <rect x="15.4" y="9" width="3.6" height="9" rx="1.2" />
    </>
  ),
  usuarios: (
    <>
      <circle cx="9.2" cy="8.5" r="3.4" />
      <path d="M2.8 19.5a6.5 6.5 0 0 1 12.8 0" />
      <path d="M16.2 5.6a3.4 3.4 0 0 1 0 6.5M17.6 14.2a5.6 5.6 0 0 1 3.6 5.3" />
    </>
  ),
  auditoria: (
    <>
      <path d="M3.6 12a8.4 8.4 0 1 0 2.6-6.1" />
      <path d="M3.5 4.2v4.4h4.4" />
      <path d="M12 8v4.4l3 1.8" />
    </>
  ),
  integracao: (
    <>
      <path d="M9.5 14.5 6.8 17.2a3.8 3.8 0 0 1-5.4-5.4l2.7-2.7" />
      <path d="m14.5 9.5 2.7-2.7a3.8 3.8 0 0 1 5.4 5.4l-2.7 2.7" />
      <path d="m9.6 14.4 4.8-4.8" />
    </>
  ),
  // Três carrinhos laçados por um contorno — o subgrupo dentro da frota.
  grupo: (
    <>
      <rect x="3" y="4.5" width="7" height="7" rx="1.8" />
      <rect x="13" y="4.5" width="8" height="7" rx="1.8" />
      <rect x="3" y="14.5" width="18" height="6" rx="1.8" />
    </>
  ),
  // Seta saindo de uma caixa — dinheiro retirado do caixa.
  retirada: (
    <>
      <rect x="3" y="12" width="18" height="8" rx="1.8" />
      <path d="M12 3v8.5" />
      <path d="m8.3 7.7 3.7-3.7 3.7 3.7" />
    </>
  ),
  // Carteira de habilitação — retângulo com foto (círculo) e linhas de texto.
  carteira: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.2" />
      <circle cx="8" cy="12" r="2.2" />
      <path d="M13.5 10h5M13.5 13h5M5.6 16.3a2.6 2.6 0 0 1 4.8 0" />
    </>
  ),
  "seta-direita": <path d="m9 5.5 7 6.5-7 6.5" />,
  sair: (
    <>
      <path d="M14.5 4.5H18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3.5" />
      <path d="M10 8.5 6.5 12 10 15.5M6.8 12H15" />
    </>
  ),
};

export function Icon({ name, className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
