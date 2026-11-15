/**
 * Datas do ÚLTIMO dia de calendário de cada mês (meio-dia de Brasília, pra
 * não escorregar de dia na formatação) que caem dentro de [inicioIso, fimIso]
 * — strings "aaaa-mm-dd". Usado pelo desconto mensal automático por grupo de
 * veículos (ex.: R$500 no fim de cada mês, por carro do grupo).
 */
export function fimsDeMesNoPeriodo(inicioIso: string, fimIso: string): Date[] {
  const [anoIni, mesIni] = inicioIso.split("-").map(Number);
  const [anoFim, mesFim] = fimIso.split("-").map(Number);

  const iniLimite = new Date(`${inicioIso}T00:00:00-03:00`);
  const fimLimite = new Date(`${fimIso}T23:59:59-03:00`);

  const resultado: Date[] = [];
  let ano = anoIni;
  let mes = mesIni;
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // dia 0 do mês seguinte = último dia deste mês
    const mesStr = String(mes).padStart(2, "0");
    const diaStr = String(ultimoDia).padStart(2, "0");
    const dataFimDoMes = new Date(`${ano}-${mesStr}-${diaStr}T12:00:00-03:00`);
    if (dataFimDoMes >= iniLimite && dataFimDoMes <= fimLimite) resultado.push(dataFimDoMes);

    mes++;
    if (mes > 12) {
      mes = 1;
      ano++;
    }
  }
  return resultado;
}
