"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Field, FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  PERIODOS,
  PERIODO_LABEL,
  PERIODO_SINGULAR,
  FATURAMENTO,
  FATURAMENTO_LABEL,
  CLASSIFICACOES,
  UNIDADES_FATURAMENTO,
  CONTRATACAO_ENTREGA,
  NIVEIS_COMBUSTIVEL,
  TIPOS_RECEBIMENTO,
  SUGESTOES_FRANQUIA,
  INFORMACOES_ADICIONAIS_PADRAO,
  INFORMACOES_ADICIONAIS_MAX,
  cronogramaFaturas,
  type Periodo,
  type Faturamento,
} from "@/lib/contrato-gerar";
import { gerarContrato, type GerarContratoState } from "./actions";
import { SelectBusca, type OpcaoBusca } from "./SelectBusca";
import { NovoClienteModal } from "./NovoClienteModal";

export type VeiculoOpcao = OpcaoBusca & { km: number };

type Item = {
  chave: number;
  inicio: string;
  fim: string;
  descricao: string;
  valor: string;
  ativo: boolean;
};

const INICIAL: GerarContratoState = {};

/** "1.234,56" → 1234.56 (o mesmo critério da server action). */
function lerDinheiro(v: string): number {
  const t = v.trim();
  if (!t) return 0;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** Data de calendário do input → meia-noite local (sem escorregar de dia). */
function lerData(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [a, m, d] = v.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-brand">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Campo de dinheiro com o "R$" grudado à esquerda. */
function CampoReais({
  id,
  name,
  valor,
  onChange,
  required,
}: {
  id: string;
  name: string;
  valor: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="flex">
      <span className="grid place-items-center rounded-l-xl border border-r-0 border-border bg-surface-3 px-3 text-sm text-muted">
        R$
      </span>
      <input
        id={id}
        name={name}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        required={required}
        className={cn(inputClass, "rounded-l-none")}
      />
    </div>
  );
}

export function GerarContratoForm({
  clientes: clientesIniciais,
  veiculos,
  promotores,
}: {
  clientes: OpcaoBusca[];
  veiculos: VeiculoOpcao[];
  promotores: OpcaoBusca[];
}) {
  const [state, formAction] = useActionState(gerarContrato, INICIAL);

  const [clientes, setClientes] = useState(clientesIniciais);
  const [clienteId, setClienteId] = useState("");
  const [modalCliente, setModalCliente] = useState(false);

  const [faturamento, setFaturamento] = useState<Faturamento | "">("");
  const [periodo, setPeriodo] = useState<Periodo>("SEMANAS");
  const [quantidade, setQuantidade] = useState("4");
  const [infoAdicional, setInfoAdicional] = useState(INFORMACOES_ADICIONAIS_PADRAO);

  const [veiculoId, setVeiculoId] = useState("");
  const [valorPeriodo, setValorPeriodo] = useState("0,00");
  const [odometro, setOdometro] = useState("");
  const [inicio, setInicio] = useState("");

  const [itens, setItens] = useState<Item[]>([]);
  const [proximaChave, setProximaChave] = useState(1);

  const [primeiroPago, setPrimeiroPago] = useState(false);
  const [caucao, setCaucao] = useState("0,00");

  const escolherVeiculo = (id: string) => {
    setVeiculoId(id);
    // Sugere a KM que o sistema já conhece; quem entrega confere no painel.
    const v = veiculos.find((x) => x.id === id);
    if (v && !odometro) setOdometro(String(v.km));
  };

  const faturas = useMemo(() => {
    const dataInicio = lerData(inicio);
    const qtd = Number(quantidade);
    const valor = lerDinheiro(valorPeriodo);
    if (!dataInicio || !faturamento || !Number.isInteger(qtd) || qtd < 1 || qtd > 104 || valor <= 0) {
      return [];
    }
    return cronogramaFaturas({
      inicio: dataInicio,
      periodo,
      quantidade: qtd,
      valorPeriodo: valor,
      faturamento,
      itens: itens.flatMap((it) => {
        const ini = lerData(it.inicio);
        return ini
          ? [{ inicio: ini, fim: lerData(it.fim), valor: lerDinheiro(it.valor), ativo: it.ativo }]
          : [];
      }),
    });
  }, [inicio, quantidade, valorPeriodo, faturamento, periodo, itens]);

  const totalFaturas = faturas.reduce((s, f) => s + f.valor, 0);

  const atualizarItem = (chave: number, campo: Partial<Item>) =>
    setItens((lista) => lista.map((it) => (it.chave === chave ? { ...it, ...campo } : it)));

  const itensParaEnvio = JSON.stringify(
    itens.map((it) => ({
      inicio: it.inicio,
      fim: it.fim,
      descricao: it.descricao,
      valor: it.valor,
      ativo: it.ativo,
    }))
  );

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state.error} />
      <input type="hidden" name="itens" value={itensParaEnvio} />

      {/* ── DADOS GERAIS ─────────────────────────────────────────────── */}
      <Secao titulo="DADOS GERAIS">
        <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="customerId" className="text-sm font-medium">
                Cliente:<span className="text-neon"> *</span>
              </label>
              <button
                type="button"
                onClick={() => setModalCliente(true)}
                className="text-xs font-medium text-success hover:underline"
              >
                ⊕ Novo Cliente
              </button>
            </div>
            <SelectBusca
              id="customerId"
              name="customerId"
              opcoes={clientes}
              valor={clienteId}
              onChange={setClienteId}
              vazio="Nenhum cliente. Use “Novo Cliente”."
            />
          </div>

          <Field label="Realizar o faturamento:" htmlFor="billingMode" required>
            <select
              id="billingMode"
              name="billingMode"
              value={faturamento}
              onChange={(e) => setFaturamento(e.target.value as Faturamento | "")}
              className={inputClass}
            >
              <option value="">Selecione...</option>
              {FATURAMENTO.map((f) => (
                <option key={f} value={f}>
                  {FATURAMENTO_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tipo de período do contrato:" htmlFor="periodType" required>
            <select
              id="periodType"
              name="periodType"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value as Periodo)}
              className={inputClass}
            >
              {PERIODOS.map((p) => (
                <option key={p} value={p}>
                  {PERIODO_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Quantidade de faturas:" htmlFor="invoiceCount" required>
            <input
              id="invoiceCount"
              name="invoiceCount"
              type="number"
              min={1}
              max={104}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Promotor:" htmlFor="promoterId">
            <select id="promoterId" name="promoterId" defaultValue="" className={inputClass}>
              <option value="">Selecione...</option>
              {promotores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="hidden md:block" />

          <Field label="Classificação do contrato:" htmlFor="classification">
            <select id="classification" name="classification" defaultValue="" className={inputClass}>
              <option value="">Selecione...</option>
              {CLASSIFICACOES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">Situação:</span>
            <div>
              <span className="inline-block rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-sm font-medium text-warning">
                Em Cadastro
              </span>
            </div>
          </div>

          <Field
            label="Unidade de faturamento:"
            htmlFor="billingUnit"
            required
            hint="Unidade da empresa em nome da qual as faturas são emitidas."
          >
            <select
              id="billingUnit"
              name="billingUnit"
              defaultValue={UNIDADES_FATURAMENTO[0]}
              className={inputClass}
            >
              {UNIDADES_FATURAMENTO.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Contratação e entrega:"
            htmlFor="hiringDelivery"
            hint="Onde o cliente recebe o veículo."
          >
            <select id="hiringDelivery" name="hiringDelivery" defaultValue="" className={inputClass}>
              <option value="">SELECIONE</option>
              {CONTRATACAO_ENTREGA.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="additionalInfo" className="text-sm font-medium">
              Informações adicionais:{" "}
              <span className="text-xs font-normal text-muted">
                {INFORMACOES_ADICIONAIS_MAX - infoAdicional.length}
              </span>
            </label>
            <textarea
              id="additionalInfo"
              name="additionalInfo"
              rows={6}
              maxLength={INFORMACOES_ADICIONAIS_MAX}
              value={infoAdicional}
              onChange={(e) => setInfoAdicional(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </Secao>

      {/* ── VEÍCULO ──────────────────────────────────────────────────── */}
      <Secao titulo="VEÍCULO">
        <div className="grid gap-x-8 gap-y-4 md:grid-cols-3">
          <Field label="Veículo:" htmlFor="vehicleId" required>
            <SelectBusca
              id="vehicleId"
              name="vehicleId"
              opcoes={veiculos}
              valor={veiculoId}
              onChange={escolherVeiculo}
              vazio="Nenhum veículo disponível."
            />
          </Field>

          {/* Texto livre com sugestões: aceita o que a equipe já usa, sem
              precisar cadastrar tabela antes de gerar o primeiro contrato. */}
          <Field label="Tabela de Preço:" htmlFor="priceTable">
            <input
              id="priceTable"
              name="priceTable"
              list="sugestoes-tabela"
              autoComplete="off"
              className={inputClass}
            />
            <datalist id="sugestoes-tabela">
              <option value="PADRÃO" />
            </datalist>
          </Field>

          <Field label="Franquia:" htmlFor="kmFranchise">
            <input
              id="kmFranchise"
              name="kmFranchise"
              list="sugestoes-franquia"
              autoComplete="off"
              className={inputClass}
            />
            <datalist id="sugestoes-franquia">
              {SUGESTOES_FRANQUIA.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>

          <Field
            label="Valor do Período:"
            htmlFor="periodValue"
            required
            hint={`Valor de 1 ${PERIODO_SINGULAR[periodo]}.`}
          >
            <CampoReais
              id="periodValue"
              name="periodValue"
              valor={valorPeriodo}
              onChange={setValorPeriodo}
              required
            />
          </Field>

          <Field label="Odômetro entrega:" htmlFor="deliveryOdometer" required>
            <input
              id="deliveryOdometer"
              name="deliveryOdometer"
              type="number"
              min={0}
              value={odometro}
              onChange={(e) => setOdometro(e.target.value)}
              required
              className={inputClass}
            />
          </Field>

          <Field label="Data de entrega:" htmlFor="deliveryAt" required>
            <input
              id="deliveryAt"
              name="deliveryAt"
              type="datetime-local"
              required
              className={inputClass}
            />
          </Field>

          <Field label="Nível combustível retirada:" htmlFor="deliveryFuel" required>
            <select id="deliveryFuel" name="deliveryFuel" defaultValue="" required className={inputClass}>
              <option value="">Selecione...</option>
              {NIVEIS_COMBUSTIVEL.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Data de início do contrato:" htmlFor="startDate" required>
            <input
              id="startDate"
              name="startDate"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              required
              className={inputClass}
            />
          </Field>
        </div>
      </Secao>

      {/* ── ITENS ADICIONAIS ─────────────────────────────────────────── */}
      <Secao
        titulo="ITENS ADICIONAIS"
        acao={
          <button
            type="button"
            onClick={() => {
              setItens((l) => [
                ...l,
                { chave: proximaChave, inicio: inicio, fim: "", descricao: "", valor: "0,00", ativo: true },
              ]);
              setProximaChave((c) => c + 1);
            }}
            className="text-sm font-medium text-success hover:underline"
          >
            ⊕ Adicionar Item
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-surface-2 text-left">
                <th className="px-3 py-2.5 font-semibold">Início</th>
                <th className="px-3 py-2.5 font-semibold">Término</th>
                <th className="px-3 py-2.5 font-semibold">Descrição</th>
                <th className="px-3 py-2.5 font-semibold">Valor</th>
                <th className="px-3 py-2.5 font-semibold">Ativo</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {itens.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-xs text-muted">
                    Nenhum item adicional.
                  </td>
                </tr>
              ) : (
                itens.map((it) => (
                  <tr key={it.chave}>
                    <td className="px-2 py-2">
                      <input
                        type="date"
                        aria-label="Início do item"
                        value={it.inicio}
                        onChange={(e) => atualizarItem(it.chave, { inicio: e.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="date"
                        aria-label="Término do item"
                        value={it.fim}
                        onChange={(e) => atualizarItem(it.chave, { fim: e.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        aria-label="Descrição do item"
                        value={it.descricao}
                        onChange={(e) => atualizarItem(it.chave, { descricao: e.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        aria-label="Valor do item"
                        inputMode="decimal"
                        value={it.valor}
                        onChange={(e) => atualizarItem(it.chave, { valor: e.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Item ativo"
                        checked={it.ativo}
                        onChange={(e) => atualizarItem(it.chave, { ativo: e.target.checked })}
                        className="size-4 accent-[var(--brand)]"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        aria-label="Remover item"
                        onClick={() => setItens((l) => l.filter((x) => x.chave !== it.chave))}
                        className="text-lg leading-none text-muted hover:text-danger"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Secao>

      {/* ── PAGAMENTO ────────────────────────────────────────────────── */}
      <Secao titulo="PAGAMENTO">
        <label className="mb-5 flex w-fit cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="firstPaymentReceived"
            checked={primeiroPago}
            onChange={(e) => setPrimeiroPago(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative h-5 w-9 rounded-full bg-surface-3 transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/50 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
          />
          Primeiro pagamento recebido?
        </label>

        <div className="grid gap-x-8 gap-y-4 md:grid-cols-3">
          <Field label="Valor Caução:" htmlFor="depositValue">
            <CampoReais id="depositValue" name="depositValue" valor={caucao} onChange={setCaucao} />
          </Field>
          <Field label="Data de Recebimento:" htmlFor="depositReceivedAt">
            <input id="depositReceivedAt" name="depositReceivedAt" type="date" className={inputClass} />
          </Field>
          <Field label="Tipo do Recebimento:" htmlFor="depositPaymentMethod">
            <select
              id="depositPaymentMethod"
              name="depositPaymentMethod"
              defaultValue=""
              className={inputClass}
            >
              <option value="">Selecione...</option>
              {TIPOS_RECEBIMENTO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Prévia do que vira boleto quando o Asaas estiver ligado. */}
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="text-sm font-semibold">Faturas do contrato</h3>
          {faturas.length === 0 ? (
            <p className="mt-1 text-xs text-muted">
              Preencha o faturamento, a quantidade, o valor do período e a data de início para
              ver as faturas.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">
                {faturas.length} fatura(s) · total {formatCurrency(totalFaturas)}
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {faturas.map((f) => (
                  <li
                    key={f.numero}
                    className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs"
                  >
                    <p className="flex justify-between font-semibold">
                      <span>{f.numero}ª fatura</span>
                      <span className="tabular-nums">{formatCurrency(f.valor)}</span>
                    </p>
                    <p className="mt-0.5 text-muted">vence {formatDate(f.vencimento)}</p>
                    <p className="text-muted">
                      {formatDate(f.inicio)} a {formatDate(f.fim)}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Secao>

      <div className="flex justify-end gap-3">
        <SubmitButton pendingLabel="Gerando...">Salvar</SubmitButton>
        <Link
          href="/contratos"
          className="rounded-xl border border-border px-6 py-2.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          Cancelar
        </Link>
      </div>

      {modalCliente && (
        <NovoClienteModal
          onFechar={() => setModalCliente(false)}
          onCriado={(c) => {
            setClientes((l) => [c, ...l]);
            setClienteId(c.id);
            setModalCliente(false);
          }}
        />
      )}
    </form>
  );
}
