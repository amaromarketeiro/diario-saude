'use strict';
// Relatórios: resumo, pendências, histórico por médico, por especialidade, exames ao longo do tempo,
// documentos e linha do tempo. Todos respeitam o filtro de familiar (individual) ou "Todos" (consolidado).

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
const quemNoRelatorio = () => filtroAtual() === 'todos' ? 'Todos os familiares' : FAMILIA.porId.get(filtroAtual())?.nome || '';
const cabecalhoImpressao = (titulo, q) => `<div class="so-impressao"><h1>${esc(titulo)} · ${esc(quemNoRelatorio())}</h1>
  <p>Diário de Saúde · ${PERIODOS[q.periodo || 'tudo']} · gerado em ${new Date().toLocaleDateString('pt-BR')}</p></div>`;
const barra = (valor, maximo) => `<div class="barra"><span style="width:${maximo ? Math.max(4, (valor / maximo) * 100) : 0}%"></span></div>`;
const topoRelatorio = (titulo, base, q) => `${cabecalhoImpressao(titulo, q)}<div class="nao-imprimir">${seletorFamilia()}</div>${chipsPeriodo(base, q)}`;

// Junta consultas e exames numa lista de acontecimentos (mais recentes primeiro)
function linhaDoTempo(cs, es) {
  const itens = [];
  for (const c of cs) {
    if (!c.data || c.status === 'cancelada') continue;
    const futura = c.status === 'agendada';
    itens.push({ data: c.data, hora: c.hora, icone: '🩺', futuro: futura, link: '#/consulta/' + c.id, pacienteId: c.pacienteId,
      titulo: `${futura ? 'Consulta agendada' : 'Consulta'} · ${c.medico || c.especialidade || 'médico não informado'}`,
      sub: [c.medico && c.especialidade, c.local].filter(Boolean).join(' · ') });
  }
  for (const e of es) {
    const base = { link: '#/exame/' + e.id, pacienteId: e.pacienteId };
    if (e.dataSolicitacao) itens.push({ ...base, data: e.dataSolicitacao, icone: '📝', titulo: `Pedido de exame: ${e.nome}`, sub: `Pedido por ${e.medico || '—'}` });
    if (e.status === 'marcado' && e.dataExame) itens.push({ ...base, data: e.dataExame, hora: e.horaExame, icone: '🧪', futuro: true, titulo: `Exame marcado: ${e.nome}`, sub: e.localExame || '' });
    if (['realizado', 'resultado'].includes(e.status) && e.dataExame) itens.push({ ...base, data: e.dataExame, hora: e.horaExame, icone: '🧪', titulo: `Exame feito: ${e.nome}`, sub: e.localExame || '' });
    // O resultado nunca vem antes do próprio exame
    const dataRes = [e.dataRecebido || e.dataResultado, e.dataExame].filter(Boolean).sort().pop();
    if (e.status === 'resultado') itens.push({ ...base, data: dataRes, icone: '📄', titulo: `Resultado: ${e.nome}`, sub: e.resumo || '' });
  }
  // Marca o que está arquivado (continua visível no histórico)
  const arquivados = new Set([...cs, ...es].filter((x) => x.arquivado).map((x) => x.id));
  for (const i of itens) i.arquivado = arquivados.has(i.link.split('/').pop());
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
      <span class="li-corpo">${tagFamiliar(i.pacienteId)}<strong>${esc(i.titulo)}</strong>
      <small>${fmtCurta(i.data)}${i.hora ? ' · ' + esc(i.hora) : ''}${i.sub ? ' · ' + esc(i.sub) : ''}${i.arquivado ? ' · 🗄️ arquivado' : ''}</small></span></a></li>`;
  }
  return html + '</ul>';
}

// Carrega os dados já filtrados pelo familiar e pelo período
async function carregarTudo(q) {
  const inicio = inicioPeriodo(q.periodo);
  const [todasC, todosE, ms] = await Promise.all([DB.todos('consultas'), DB.todos('exames'), DB.todos('medicos')]);
  // Arquivados ficam fora das contagens, mas aparecem no histórico (linha do tempo e documentos)
  const csTodos = doFiltro(todasC), esTodos = doFiltro(todosE);
  const cs = csTodos.filter(ativo), es = esTodos.filter(ativo);
  const cP = (c) => noPeriodo(c.data, inicio), eP = (e) => noPeriodo(dataDoExame(e), inicio);
  return { cs, es, ms, csP: cs.filter(cP), esP: es.filter(eP), csTodosP: csTodos.filter(cP), esTodosP: esTodos.filter(eP) };
}

// ---------- Tela principal de relatórios ----------
async function telaRelatorios(_, q = {}) {
  const { cs, es, csP, esP } = await carregarTudo(q);
  const h = hoje();
  const pend = calcularPendencias(cs, es);
  const porTipo = {};
  for (const p of pend) (porTipo[p.tipo] ??= []).push(p);
  const periodo = new URLSearchParams({ periodo: q.periodo || 'tudo' });
  const relatorio = (link, icone, titulo, texto) => `<a class="card" href="${link}?${periodo}"><div class="card-ic">${icone}</div>
    <div class="card-corpo"><strong>${titulo}</strong><small>${texto}</small></div><span class="seta">›</span></a>`;

  // Consolidado: um resumo por familiar
  const porFamiliar = filtroAtual() === 'todos' && FAMILIA.ativos.length > 1 ? `<div class="bloco"><h3>👨‍👩‍👧 Por familiar</h3>
    ${FAMILIA.ativos.map((f) => {
      const n = pend.filter((p) => p.pacienteId === f.id && p.atencao).length;
      const nc = csP.filter((c) => c.pacienteId === f.id && c.status === 'realizada').length;
      const ne = esP.filter((e) => e.pacienteId === f.id).length;
      return `<a class="card" href="#/familiar/${f.id}">${avatar(f)}<div class="card-corpo"><strong>${esc(f.nome)}</strong>
        <small>${nc} consulta(s) · ${ne} exame(s)${n ? ` · <b class="alerta-txt">${n} pendência(s)</b>` : ''}</small></div><span class="seta">›</span></a>`;
    }).join('')}</div>` : '';

  render(`${seletorFamilia()}${chipsPeriodo('#/relatorios', q)}
    <div class="numeros">
      ${numero(csP.filter((c) => c.status === 'realizada').length, 'consultas realizadas')}
      ${numero(esP.filter((e) => ['realizado', 'resultado'].includes(e.status)).length, 'exames feitos')}
      ${numero(new Set(csP.map((c) => normalizar(c.medico)).filter(Boolean)).size, 'médicos consultados')}
      ${numero(cs.filter((c) => c.status === 'agendada' && c.data >= h).length, 'consultas agendadas')}
    </div>
    <div class="bloco"><h3>📌 Pendências</h3>
      ${pend.length ? Object.entries(NOMES_PENDENCIA).filter(([t]) => porTipo[t]).map(([t, nome]) => `
        <details class="pend-grupo"><summary class="pend"><strong>${porTipo[t].length}</strong><span>${nome}</span></summary>
          ${porTipo[t].map((p) => cardPendencia(p)).join('')}</details>`).join('')
        : '<p class="mudo">Tudo em dia ✓</p>'}
    </div>
    ${porFamiliar}
    <h2 class="secao">Relatórios${filtroAtual() !== 'todos' ? ' de ' + esc(nomeFamiliar(filtroAtual())) : ''}</h2>
    ${relatorio('#/relatorios/medicos', '👩‍⚕️', 'Histórico por médico', 'Consultas e exames de cada médico')}
    ${relatorio('#/relatorios/especialidades', '🏥', 'Por especialidade', 'Quais áreas são mais acompanhadas')}
    ${relatorio('#/relatorios/exames', '🧪', 'Exames ao longo do tempo', 'Compare o mesmo exame da mesma pessoa')}
    ${relatorio('#/relatorios/documentos', '📎', 'Documentos', 'Receitas, pedidos, laudos e atestados')}
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
    const quem = mostrarNomes() ? [...new Set([...consultas, ...exames].map((x) => nomeFamiliar(x.pacienteId)))].join(', ') : '';
    return { m, consultas: consultas.length, exames: exames.length, ultima, quem };
  }).filter((l) => l.consultas || l.exames).sort((a, b) => (b.ultima || '').localeCompare(a.ultima || ''));
  const maximo = Math.max(0, ...linhas.map((l) => l.consultas));

  render(`${topoRelatorio('Histórico por médico', '#/relatorios/medicos', q)}
    ${linhas.length ? linhas.map((l) => `${cardMedico(l.m,
      `${l.consultas} consulta(s) · ${l.exames} exame(s) pedido(s)${l.ultima ? ' · última: ' + fmtCurta(l.ultima) : ''}${l.quem ? ' · ' + esc(l.quem) : ''}`)}
      ${barra(l.consultas, maximo)}`).join('') : '<p class="mudo centro">Nenhuma consulta ou exame neste período.</p>'}
    ${botaoImprimir}`, 'Por médico', true);
}

// ---------- Por especialidade ----------
async function telaRelEspecialidades(_, q = {}) {
  const { csP, esP } = await carregarTudo(q);
  const grupos = {};
  const grupo = (nome) => (grupos[nome || 'Não informada'] ??= { consultas: 0, exames: 0, medicos: new Set(), pessoas: new Set(), ultima: '' });
  for (const c of csP.filter((c) => c.status === 'realizada')) {
    const g = grupo(c.especialidade);
    g.consultas++;
    if (c.medico) g.medicos.add(c.medico);
    g.pessoas.add(nomeFamiliar(c.pacienteId));
    if (c.data > g.ultima) g.ultima = c.data;
  }
  for (const e of esP) { const g = grupo(e.especialidade); g.exames++; g.pessoas.add(nomeFamiliar(e.pacienteId)); }
  const lista = Object.entries(grupos).sort((a, b) => b[1].consultas - a[1].consultas || b[1].exames - a[1].exames);
  const maximo = Math.max(0, ...lista.map(([, g]) => g.consultas));

  render(`${topoRelatorio('Por especialidade', '#/relatorios/especialidades', q)}
    ${lista.length ? lista.map(([nome, g]) => `<div class="bloco compacto">
      <h3>${esc(nome)}</h3>
      <p class="mudo">${g.consultas} consulta(s) · ${g.exames} exame(s)${g.ultima ? ' · última consulta: ' + fmtCurta(g.ultima) : ''}</p>
      ${g.medicos.size ? `<p class="mudo">Médicos: ${esc([...g.medicos].join(', '))}</p>` : ''}
      ${mostrarNomes() ? `<p class="mudo">Familiares: ${esc([...g.pessoas].join(', '))}</p>` : ''}
      ${barra(g.consultas, maximo)}</div>`).join('') : '<p class="mudo centro">Nenhuma consulta ou exame neste período.</p>'}
    ${botaoImprimir}`, 'Por especialidade', true);
}

// ---------- Exames ao longo do tempo (nunca mistura familiares diferentes) ----------
async function telaRelExames(_, q = {}) {
  const { esP } = await carregarTudo(q);
  const grupos = {};
  for (const e of esP) (grupos[e.pacienteId + '|' + normalizar(e.nome)] ??= []).push(e);
  const lista = Object.values(grupos)
    .map((g) => g.sort((a, b) => dataDoExame(a).localeCompare(dataDoExame(b))))
    .sort((a, b) => nomeFamiliar(a[0].pacienteId).localeCompare(nomeFamiliar(b[0].pacienteId), 'pt-BR')
      || b.length - a.length || a[0].nome.localeCompare(b[0].nome, 'pt-BR'));

  render(`${topoRelatorio('Exames ao longo do tempo', '#/relatorios/exames', q)}
    <p class="mudo">Exames com o mesmo nome <strong>da mesma pessoa</strong> aparecem juntos, em ordem de data, para comparar os resultados.
      Exames de familiares diferentes nunca são comparados entre si.</p>
    ${lista.length ? lista.map((g) => `<div class="bloco compacto">
      ${FAMILIA.lista.length > 1 ? tagFamiliar(g[0].pacienteId, true) : ''}
      <h3>${esc(g[0].nome)} <span class="mudo">(${g.length}x)</span></h3>
      <ul class="tabela">${g.map((e) => `<li><a href="#/exame/${e.id}">
        <span class="t-data">${fmtCurta(dataDoExame(e))}</span>
        <span class="t-corpo"><span class="badge ${e.status}">${STATUS_EXAME[e.status]}</span>
          <small>Pedido por ${esc(e.medico || '—')}</small>
          ${e.resumo ? `<span class="texto">${esc(e.resumo)}</span>` : ''}</span></a></li>`).join('')}</ul>
      </div>`).join('') : '<p class="mudo centro">Nenhum exame neste período.</p>'}
    ${botaoImprimir}`, 'Exames no tempo', true);
}

// ---------- Documentos (receitas, pedidos, laudos...) ----------
async function telaRelDocumentos(_, q = {}) {
  const { csTodosP: csP, esTodosP: esP } = await carregarTudo(q);
  const an = await DB.todos('anexos');
  const donos = new Map([...csP.map((c) => ['consulta:' + c.id, { tipo: 'consulta', x: c, data: c.data }]),
    ...esP.map((e) => ['exame:' + e.id, { tipo: 'exame', x: e, data: dataDoExame(e) }])]);
  const docs = an.map((a) => ({ a, dono: donos.get(a.tipoDono + ':' + a.idDono) })).filter((d) => d.dono)
    .sort((a, b) => (b.dono.data || '').localeCompare(a.dono.data || ''));
  const semDono = filtroAtual() === 'todos' ? an.filter((a) => a.semDono) : [];
  const grupos = {};
  for (const d of docs) (grupos[d.a.tipoDoc] ??= []).push(d);

  render(`${topoRelatorio('Documentos', '#/relatorios/documentos', q)}
    ${docs.length ? Object.entries(TIPOS_DOC).filter(([t]) => grupos[t]).map(([t, nome]) => `<div class="bloco compacto">
      <h3>📎 ${nome} <span class="mudo">(${grupos[t].length})</span></h3>
      ${grupos[t].map(({ a, dono }) => `<a class="card" href="#/${dono.tipo}/${dono.x.id}">
        <div class="card-ic">${a.mime?.startsWith('image/') ? '🖼️' : '📄'}</div>
        <div class="card-corpo">${tagFamiliar(dono.x.pacienteId)}<strong>${esc(dono.tipo === 'exame' ? dono.x.nome : 'Consulta · ' + (dono.x.medico || dono.x.especialidade || ''))}</strong>
          <small>${fmtCurta(dono.data)} · ${esc(a.nome || '')}</small></div><span class="seta">›</span></a>`).join('')}
      </div>`).join('') : '<p class="mudo centro">Nenhum documento neste período.</p>'}
    ${semDono.length ? `<div class="bloco"><h3>⚠️ Documentos sem vínculo (${semDono.length})</h3>
      <p class="mudo">Arquivos cuja consulta ou exame não existe mais. Foram mantidos por segurança.</p></div>` : ''}
    ${botaoImprimir}`, 'Documentos', true);
}

// ---------- Linha do tempo com filtros ----------
async function telaRelLinha(_, q = {}) {
  const { cs, es, ms, csTodosP: csP, esTodosP: esP } = await carregarTudo(q);
  const filtrar =(x) => (!q.medico || normalizar(x.medico) === q.medico) && (!q.esp || (x.especialidade || '') === q.esp);
  const especialidades = [...new Set([...cs, ...es].map((x) => x.especialidade).filter(Boolean))].sort();
  const opcoes = (lista, atual) => lista.map(([v, t]) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(t)}</option>`).join('');

  render(`${topoRelatorio('Linha do tempo', '#/relatorios/linha', q)}
    <div class="filtros nao-imprimir">
      <select id="f-medico" aria-label="Médico"><option value="">Todos os médicos</option>${opcoes(ms.map((m) => [normalizar(m.nome), m.nome]).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), q.medico)}</select>
      <select id="f-esp" aria-label="Especialidade"><option value="">Todas as especialidades</option>${opcoes(especialidades.map((x) => [x, x]), q.esp)}</select>
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
