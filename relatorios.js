'use strict';
// Relatórios: resumo, pendências, histórico por médico, por especialidade,
// exames ao longo do tempo e linha do tempo completa.

const PERIODOS = { tudo: 'Tudo', '12m': 'Últimos 12 meses', ano: 'Este ano' };

function inicioPeriodo(p) {
  const d = new Date();
  if (p === '12m') { d.setFullYear(d.getFullYear() - 1); return paraISO(d); }
  if (p === 'ano') return `${d.getFullYear()}-01-01`;
  return '';
}
const noPeriodo = (data, inicio) => !inicio || (data && data >= inicio);
const dataDoExame = (e) => e.dataExame || e.dataSolicitacao || '';

function chipsPeriodo(base, q) {
  const atual = q.periodo || 'tudo';
  return `<div class="chips">${Object.entries(PERIODOS).map(([k, v]) => {
    const p = new URLSearchParams({ ...q, periodo: k });
    return `<a class="chip ${k === atual ? 'ativo' : ''}" href="${base}?${p}">${v}</a>`;
  }).join('')}</div>`;
}

const numero = (n, rotulo) => `<div class="numero"><strong>${n}</strong><span>${rotulo}</span></div>`;
const botaoImprimir = '<div class="acoes nao-imprimir"><button class="btn" onclick="window.print()">🖨️ Imprimir ou salvar em PDF</button></div>';
const cabecalhoImpressao = (titulo, q) => `<div class="so-impressao"><h1>${esc(titulo)}</h1>
  <p>Diário de Saúde · ${PERIODOS[q.periodo || 'tudo']} · gerado em ${new Date().toLocaleDateString('pt-BR')}</p></div>`;
const barra = (valor, maximo) => `<div class="barra"><span style="width:${maximo ? Math.max(4, (valor / maximo) * 100) : 0}%"></span></div>`;

// Junta consultas e exames numa lista de acontecimentos (mais recentes primeiro)
function linhaDoTempo(cs, es) {
  const itens = [];
  for (const c of cs) {
    if (!c.data || c.status === 'cancelada') continue;
    const futura = c.status === 'agendada';
    itens.push({ data: c.data, hora: c.hora, icone: '🩺', futuro: futura, link: '#/consulta/' + c.id,
      titulo: `${futura ? 'Consulta agendada' : 'Consulta'} · ${c.medico || 'médico não informado'}`,
      sub: [c.especialidade, c.local].filter(Boolean).join(' · ') });
  }
  for (const e of es) {
    const link = '#/exame/' + e.id;
    if (e.dataSolicitacao) itens.push({ data: e.dataSolicitacao, icone: '📝', link, titulo: `Pedido de exame: ${e.nome}`, sub: `Pedido por ${e.medico || '—'}` });
    if (e.status === 'marcado' && e.dataExame) itens.push({ data: e.dataExame, hora: e.horaExame, icone: '🧪', futuro: true, link, titulo: `Exame marcado: ${e.nome}`, sub: e.localExame || '' });
    if (['realizado', 'resultado'].includes(e.status) && e.dataExame) itens.push({ data: e.dataExame, hora: e.horaExame, icone: '🧪', link, titulo: `Exame feito: ${e.nome}`, sub: e.localExame || '' });
    // O resultado nunca vem antes do próprio exame
    const dataRes = [e.dataRecebido || e.dataResultado, e.dataExame].filter(Boolean).sort().pop();
    if (e.status === 'resultado') itens.push({ data: dataRes, icone: '📄', link, titulo: `Resultado: ${e.nome}`, sub: e.resumo || '' });
  }
  return itens.filter((i) => i.data).sort((a, b) => (b.data + (b.hora || '')).localeCompare(a.data + (a.hora || '')));
}

function listaLinhaDoTempo(itens) {
  if (!itens.length) return '<p class="mudo">Nada registrado neste período.</p>';
  let html = '<ul class="linha">', mes = '';
  for (const i of itens) {
    if (i.data.slice(0, 7) !== mes) {
      mes = i.data.slice(0, 7);
      const nomeMes = lerData(mes + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      html += `<li class="mes">${nomeMes[0].toUpperCase() + nomeMes.slice(1)}</li>`;
    }
    html += `<li><a href="${i.link}" class="${i.futuro ? 'futuro' : ''}"><span class="li-ic">${i.icone}</span>
      <span class="li-corpo"><strong>${esc(i.titulo)}</strong>
      <small>${fmtCurta(i.data)}${i.hora ? ' · ' + esc(i.hora) : ''}${i.sub ? ' · ' + esc(i.sub) : ''}</small></span></a></li>`;
  }
  return html + '</ul>';
}

async function carregarTudo(q) {
  const inicio = inicioPeriodo(q.periodo);
  const [cs, es, ms] = await Promise.all([DB.todos('consultas'), DB.todos('exames'), DB.todos('medicos')]);
  return { cs, es, ms, csP: cs.filter((c) => noPeriodo(c.data, inicio)), esP: es.filter((e) => noPeriodo(dataDoExame(e), inicio)) };
}

// ---------- Tela principal de relatórios ----------
async function telaRelatorios(_, q = {}) {
  const { cs, es, csP, esP } = await carregarTudo(q);
  const h = hoje();
  const comRetorno = new Set(cs.flatMap((c) => c.retornoDe || []));
  const semData = es.filter((e) => e.status === 'solicitado');
  const aguardando = es.filter((e) => e.status === 'realizado');
  const semRetorno = es.filter((e) => e.status === 'resultado' && !comRetorno.has(e.id));
  const atrasadas = cs.filter((c) => c.status === 'agendada' && c.data < h);
  const pendencia = (n, texto, link) => n ? `<a class="pend" href="${link}"><strong>${n}</strong><span>${texto}</span><span class="seta">›</span></a>` : '';
  const pendencias = pendencia(semData.length, 'exame(s) sem data marcada', '#/exames?filtro=solicitado')
    + pendencia(aguardando.length, 'exame(s) aguardando resultado', '#/exames?filtro=realizado')
    + pendencia(atrasadas.length, 'consulta(s) que já passaram sem registro', '#/agenda');
  const periodo = new URLSearchParams({ periodo: q.periodo || 'tudo' });
  const relatorio = (link, icone, titulo, texto) => `<a class="card" href="${link}?${periodo}"><div class="card-ic">${icone}</div>
    <div class="card-corpo"><strong>${titulo}</strong><small>${texto}</small></div><span class="seta">›</span></a>`;

  render(`${chipsPeriodo('#/relatorios', q)}
    <div class="numeros">
      ${numero(csP.filter((c) => c.status === 'realizada').length, 'consultas realizadas')}
      ${numero(esP.filter((e) => ['realizado', 'resultado'].includes(e.status)).length, 'exames feitos')}
      ${numero(new Set(csP.map((c) => normalizar(c.medico)).filter(Boolean)).size, 'médicos consultados')}
      ${numero(cs.filter((c) => c.status === 'agendada' && c.data >= h).length, 'consultas agendadas')}
    </div>
    <div class="bloco"><h3>📌 Pendências</h3>
      ${pendencias || (semRetorno.length ? '' : '<p class="mudo">Tudo em dia ✓</p>')}
      ${semRetorno.length ? `<p class="mudo">Resultados que ainda não foram mostrados ao médico:</p>${semRetorno.map(cardExame).join('')}` : ''}
    </div>
    <h2 class="secao">Relatórios</h2>
    ${relatorio('#/relatorios/medicos', '👩‍⚕️', 'Histórico por médico', 'Consultas e exames de cada médico')}
    ${relatorio('#/relatorios/especialidades', '🏥', 'Por especialidade', 'Quais áreas você mais acompanha')}
    ${relatorio('#/relatorios/exames', '🧪', 'Exames ao longo do tempo', 'Compare o mesmo exame em datas diferentes')}
    ${relatorio('#/relatorios/linha', '🗓️', 'Linha do tempo', 'Tudo o que aconteceu, em ordem, com filtros')}`, 'Relatórios');
}

// ---------- Por médico ----------
async function telaRelMedicos(_, q = {}) {
  const { ms, csP, esP } = await carregarTudo(q);
  const linhas = ms.map((m) => {
    const n = normalizar(m.nome);
    const consultas = csP.filter((c) => normalizar(c.medico) === n && c.status === 'realizada');
    const exames = esP.filter((e) => normalizar(e.medico) === n);
    const ultima = consultas.map((c) => c.data).sort().pop();
    return { m, consultas: consultas.length, exames: exames.length, ultima };
  }).filter((l) => l.consultas || l.exames).sort((a, b) => (b.ultima || '').localeCompare(a.ultima || ''));
  const maximo = Math.max(0, ...linhas.map((l) => l.consultas));

  render(`${cabecalhoImpressao('Histórico por médico', q)}${chipsPeriodo('#/relatorios/medicos', q)}
    ${linhas.length ? linhas.map((l) => `${cardMedico(l.m,
      `${l.consultas} consulta(s) · ${l.exames} exame(s) pedido(s)${l.ultima ? ' · última: ' + fmtCurta(l.ultima) : ''}`)}
      ${barra(l.consultas, maximo)}`).join('') : '<p class="mudo centro">Nenhuma consulta ou exame neste período.</p>'}
    ${botaoImprimir}`, 'Por médico', true);
}

// ---------- Por especialidade ----------
async function telaRelEspecialidades(_, q = {}) {
  const { csP, esP } = await carregarTudo(q);
  const grupos = {};
  const grupo = (nome) => (grupos[nome || 'Não informada'] ??= { consultas: 0, exames: 0, medicos: new Set(), ultima: '' });
  for (const c of csP.filter((c) => c.status === 'realizada')) {
    const g = grupo(c.especialidade);
    g.consultas++;
    if (c.medico) g.medicos.add(c.medico);
    if (c.data > g.ultima) g.ultima = c.data;
  }
  for (const e of esP) grupo(e.especialidade).exames++;
  const lista = Object.entries(grupos).sort((a, b) => b[1].consultas - a[1].consultas || b[1].exames - a[1].exames);
  const maximo = Math.max(0, ...lista.map(([, g]) => g.consultas));

  render(`${cabecalhoImpressao('Por especialidade', q)}${chipsPeriodo('#/relatorios/especialidades', q)}
    ${lista.length ? lista.map(([nome, g]) => `<div class="bloco compacto">
      <h3>${esc(nome)}</h3>
      <p class="mudo">${g.consultas} consulta(s) · ${g.exames} exame(s)${g.ultima ? ' · última consulta: ' + fmtCurta(g.ultima) : ''}</p>
      ${g.medicos.size ? `<p class="mudo">Médicos: ${esc([...g.medicos].join(', '))}</p>` : ''}
      ${barra(g.consultas, maximo)}</div>`).join('') : '<p class="mudo centro">Nenhuma consulta ou exame neste período.</p>'}
    ${botaoImprimir}`, 'Por especialidade', true);
}

// ---------- Exames ao longo do tempo ----------
async function telaRelExames(_, q = {}) {
  const { esP } = await carregarTudo(q);
  const grupos = {};
  for (const e of esP) (grupos[normalizar(e.nome)] ??= []).push(e);
  const lista = Object.values(grupos)
    .map((g) => g.sort((a, b) => dataDoExame(a).localeCompare(dataDoExame(b))))
    .sort((a, b) => b.length - a.length || a[0].nome.localeCompare(b[0].nome, 'pt-BR'));

  render(`${cabecalhoImpressao('Exames ao longo do tempo', q)}${chipsPeriodo('#/relatorios/exames', q)}
    <p class="mudo">Exames com o mesmo nome aparecem juntos, em ordem de data, para você comparar os resultados.
      Em breve: gráficos com os valores de cada exame.</p>
    ${lista.length ? lista.map((g) => `<div class="bloco compacto">
      <h3>${esc(g[0].nome)} <span class="mudo">(${g.length}x)</span></h3>
      <ul class="tabela">${g.map((e) => `<li><a href="#/exame/${e.id}">
        <span class="t-data">${fmtCurta(dataDoExame(e))}</span>
        <span class="t-corpo"><span class="badge ${e.status}">${STATUS_EXAME[e.status]}</span>
          <small>Pedido por ${esc(e.medico || '—')}</small>
          ${e.resumo ? `<span class="texto">${esc(e.resumo)}</span>` : ''}</span></a></li>`).join('')}</ul>
      </div>`).join('') : '<p class="mudo centro">Nenhum exame neste período.</p>'}
    ${botaoImprimir}`, 'Exames no tempo', true);
}

// ---------- Linha do tempo com filtros ----------
async function telaRelLinha(_, q = {}) {
  const { cs, es, ms, csP, esP } = await carregarTudo(q);
  const filtrar = (x) => (!q.medico || normalizar(x.medico) === q.medico) && (!q.esp || (x.especialidade || '') === q.esp);
  const especialidades = [...new Set([...cs, ...es].map((x) => x.especialidade).filter(Boolean))].sort();
  const opcoes = (lista, atual) => lista.map(([v, t]) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(t)}</option>`).join('');

  render(`${cabecalhoImpressao('Linha do tempo', q)}${chipsPeriodo('#/relatorios/linha', q)}
    <div class="filtros nao-imprimir">
      <select id="f-medico"><option value="">Todos os médicos</option>${opcoes(ms.map((m) => [normalizar(m.nome), m.nome]).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), q.medico)}</select>
      <select id="f-esp"><option value="">Todas as especialidades</option>${opcoes(especialidades.map((x) => [x, x]), q.esp)}</select>
    </div>
    ${listaLinhaDoTempo(linhaDoTempo(csP.filter(filtrar), esP.filter(filtrar)))}
    ${botaoImprimir}`, 'Linha do tempo', true);

  const aplicar = () => {
    const p = new URLSearchParams({ periodo: q.periodo || 'tudo' });
    if ($('#f-medico').value) p.set('medico', $('#f-medico').value);
    if ($('#f-esp').value) p.set('esp', $('#f-esp').value);
    location.hash = '#/relatorios/linha?' + p;
  };
  $('#f-medico').onchange = aplicar;
  $('#f-esp').onchange = aplicar;
}
