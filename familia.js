'use strict';
// Familiares: estado do filtro, seletor, etiquetas e telas de cadastro.

let FAMILIA = { lista: [], porId: new Map(), ativos: [], principal: null };
const CHAVE_FILTRO = (MODO_TESTE ? 'teste:' : '') + 'filtroFamiliar';

async function carregarFamilia() {
  const lista = (await DB.todos('familiares')).sort((a, b) =>
    (b.principal - a.principal) || (a.apelido || a.nome).localeCompare(b.apelido || b.nome, 'pt-BR'));
  FAMILIA = { lista, porId: new Map(lista.map((f) => [f.id, f])), ativos: lista.filter((f) => f.status !== 'arquivado'),
    principal: lista.find((f) => f.principal) || null };
}

function filtroAtual() {
  let v = 'todos';
  try { v = localStorage.getItem(CHAVE_FILTRO) || 'todos'; } catch { }
  return v !== 'todos' && FAMILIA.porId.has(v) ? v : 'todos';
}
function definirFiltro(v) { try { localStorage.setItem(CHAVE_FILTRO, v); } catch { } }

// Aplica o filtro de familiar. "Todos" = familiares ativos (arquivados ficam de fora).
function doFiltro(lista, filtro = filtroAtual()) {
  if (filtro !== 'todos') return lista.filter((x) => x.pacienteId === filtro);
  const ativos = new Set(FAMILIA.ativos.map((f) => f.id));
  return lista.filter((x) => ativos.has(x.pacienteId));
}

const nomeCurto = (f) => (f ? f.apelido || f.nome : '—');
// Nome para botões e etiquetas: apelido, ou primeiro nome (com o segundo, se houver outro familiar com o mesmo primeiro nome)
function nomeExibicao(f) {
  if (!f) return '—';
  if (f.apelido) return f.apelido;
  const partes = (f.nome || '').trim().split(/\s+/);
  const repetido = FAMILIA.lista.some((x) => x.id !== f.id && !x.apelido && (x.nome || '').trim().split(/\s+/)[0] === partes[0]);
  return repetido ? partes.slice(0, 2).join(' ') : partes[0];
}
const nomeFamiliar = (id) => nomeCurto(FAMILIA.porId.get(id));
const mostrarNomes = () => filtroAtual() === 'todos' && FAMILIA.lista.length > 1;
const iniciais = (f) => (f.apelido || f.nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

function avatar(f, classe = '') {
  return f ? `<span class="avatar ${classe}" style="--cor:${esc(f.cor)}" aria-hidden="true">${esc(iniciais(f))}</span>` : '';
}
function tagFamiliar(id, sempre = false) {
  if (!sempre && !mostrarNomes()) return '';
  const f = FAMILIA.porId.get(id);
  return f ? `<span class="tag-fam" style="--cor:${esc(f.cor)}" title="${esc(f.nome)}">${esc(nomeExibicao(f))}</span>` : '';
}

function idade(nascimento) {
  if (!nascimento) return '';
  const n = lerData(nascimento), h = new Date();
  let anos = h.getFullYear() - n.getFullYear();
  if (h < new Date(h.getFullYear(), n.getMonth(), n.getDate())) anos--;
  return anos >= 0 ? `${anos} ano${anos === 1 ? '' : 's'}` : '';
}

// Seletor no topo das telas: Todos · cada familiar · +
function seletorFamilia() {
  const atual = filtroAtual();
  const visiveis = [...FAMILIA.ativos];
  if (atual !== 'todos' && !visiveis.some((f) => f.id === atual)) visiveis.push(FAMILIA.porId.get(atual));
  return `<div class="seletor-fam" role="group" aria-label="Filtrar por familiar">
    <button class="chip-fam ${atual === 'todos' ? 'ativo' : ''}" data-filtro="todos">👨‍👩‍👧 Todos</button>
    ${visiveis.map((f) => `<button class="chip-fam ${atual === f.id ? 'ativo' : ''}" data-filtro="${f.id}" title="${esc(f.nome)}">
      ${avatar(f, 'mini')}${esc(nomeExibicao(f))}${f.status === 'arquivado' ? ' (arquivado)' : ''}</button>`).join('')}
    <a class="chip-fam mais" href="#/familiar/novo" aria-label="Cadastrar familiar">＋</a>
  </div>`;
}
function ligarSeletor() {
  document.querySelectorAll('[data-filtro]').forEach((b) => b.onclick = () => { definirFiltro(b.dataset.filtro); navegar(); });
}

// Campo de escolha do familiar nos formulários
function campoFamiliar(valor, { travado = false, motivo = '' } = {}) {
  const opcoes = FAMILIA.lista.filter((f) => f.status !== 'arquivado' || f.id === valor);
  return `<label class="campo"><span>Familiar *</span>
    <select name="${travado ? '_pacienteId' : 'pacienteId'}" required ${travado ? 'disabled' : ''}>
      ${opcoes.map((f) => `<option value="${f.id}" ${f.id === valor ? 'selected' : ''}>${esc(f.nome)}${f.vinculo ? ' · ' + esc(f.vinculo) : ''}</option>`).join('')}
    </select>${travado ? `<input type="hidden" name="pacienteId" value="${esc(valor)}"><small class="mudo">${esc(motivo)}</small>` : ''}</label>`;
}
// Familiar sugerido para um novo registro: o do filtro, senão o principal
const familiarPadrao = (pedido) => (pedido && FAMILIA.porId.has(pedido) ? pedido : filtroAtual() !== 'todos' ? filtroAtual() : FAMILIA.principal?.id);

// ===================== Telas =====================
async function telaFamilia() {
  await carregarFamilia();
  const [cs, es] = await Promise.all([DB.todos('consultas'), DB.todos('exames')]);
  const pend = calcularPendencias(cs, es);
  const card = (f) => {
    const n = pend.filter((p) => p.pacienteId === f.id && p.atencao).length;
    return `<a class="card" href="#/familiar/${f.id}">${avatar(f)}
      <div class="card-corpo"><strong>${esc(f.nome)}${f.principal ? ' <span class="mudo">(principal)</span>' : ''}</strong>
        <small>${esc([f.vinculo, idade(f.nascimento)].filter(Boolean).join(' · ') || 'Sem detalhes')}</small></div>
      ${n ? `<span class="badge solicitado">${n} pendência${n > 1 ? 's' : ''}</span>` : '<span class="seta">›</span>'}</a>`;
  };
  const arquivados = FAMILIA.lista.filter((f) => f.status === 'arquivado');
  render(`<p class="mudo">Cadastre as pessoas da família cujas consultas e exames você acompanha.</p>
    ${FAMILIA.ativos.map(card).join('')}
    ${arquivados.length ? `<h2 class="secao">Arquivados</h2>${arquivados.map(card).join('')}` : ''}
    ${botaoFlutuante('#/familiar/novo', '+ Familiar')}`, 'Família', true);
}

async function telaFamiliar(id) {
  await carregarFamilia();
  const f = FAMILIA.porId.get(id);
  if (!f) return naoEncontrado();
  const [cs, es] = await Promise.all([DB.todos('consultas'), DB.todos('exames')]);
  const consultas = cs.filter((c) => c.pacienteId === id);
  const exames = es.filter((e) => e.pacienteId === id);
  const pend = calcularPendencias(consultas, exames);
  const proximas = consultas.filter((c) => c.status === 'agendada' && !c.arquivado && c.data >= hoje()).sort((a, b) => a.data.localeCompare(b.data));
  const temRegistros = consultas.length + exames.length > 0;
  const outros = FAMILIA.ativos.filter((x) => x.id !== id);

  render(`<div class="detalhe">
    <div class="cabeca com-avatar">${avatar(f, 'grande')}
      <div><h2>${esc(f.nome)}</h2>
        <p>${esc([f.apelido && `"${f.apelido}"`, f.vinculo, idade(f.nascimento)].filter(Boolean).join(' · '))}</p>
        ${f.principal ? '<span class="badge realizada">Perfil principal</span>' : ''}
        ${f.status === 'arquivado' ? '<span class="badge">Arquivado</span>' : ''}</div>
    </div>
    <div class="numeros">
      ${numero(consultas.filter((c) => c.status === 'realizada').length, 'consultas realizadas')}
      ${numero(exames.length, 'exames')}
      ${numero(pend.filter((p) => p.atencao).length, 'pendências')}
    </div>
    <div class="acoes">
      <button class="btn primario" id="ver-agenda">📅 Ver agenda de ${esc(nomeCurto(f))}</button>
      <a class="btn" href="#/consulta/nova?paciente=${id}">+ Consulta</a>
      <a class="btn" href="#/exame/novo?paciente=${id}">+ Exame</a>
    </div>
    ${pend.length ? `<div class="bloco"><h3>📌 Pendências</h3>${pend.map((p) => cardPendencia(p, true)).join('')}</div>` : ''}
    ${proximas.length ? `<div class="bloco"><h3>Próximas consultas</h3>${proximas.map(cardConsulta).join('')}</div>` : ''}
    <div class="bloco"><h3>Histórico</h3>${listaLinhaDoTempo(linhaDoTempo(consultas, exames))}</div>

    <div class="acoes rodape">
      <a class="btn" href="#/familiar/${id}/editar">✏️ Editar</a>
      ${!f.principal && f.status !== 'arquivado' ? '<button class="btn" id="tornar-principal">⭐ Tornar principal</button>' : ''}
      ${!f.principal ? `<button class="btn" id="arquivar">${f.status === 'arquivado' ? '📤 Reativar' : '🗄️ Arquivar'}</button>` : ''}
      ${!f.principal ? '<button class="btn perigo" id="excluir">🗑️ Excluir</button>' : ''}
    </div>
    ${!f.principal && temRegistros ? `<div class="bloco nao-imprimir" id="painel-excluir" hidden>
      <h3>Em vez de excluir, arquive</h3>
      <p>${esc(nomeCurto(f))} tem <strong>${consultas.length} consulta(s)</strong> e <strong>${exames.length} exame(s)</strong>.
        Para não perder o histórico, o familiar é <strong>arquivado</strong>: sai do seletor, da agenda e das pendências,
        mas tudo continua guardado e pode ser reativado.</p>
      ${f.status !== 'arquivado' ? '<button class="btn primario" id="arquivar-painel">🗄️ Arquivar (recomendado)</button>' : '<p class="mudo">✔ Este familiar já está arquivado.</p>'}
      <p class="mudo">Se os registros foram cadastrados no familiar errado, você pode passá-los para outra pessoa e então excluir este cadastro:</p>
      ${outros.length ? `<label class="campo"><span>Transferir os registros para</span><select id="destino">
        ${outros.map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</select></label>
        <button class="btn perigo" id="transferir">Transferir registros e excluir</button>` : '<p class="mudo">Para excluir, cadastre antes outro familiar para receber os registros.</p>'}
    </div>` : ''}
  </div>`, nomeCurto(f), true);

  $('#ver-agenda').onclick = () => { definirFiltro(id); location.hash = '#/agenda'; };
  const bPrincipal = $('#tornar-principal');
  if (bPrincipal) bPrincipal.onclick = async () => {
    if (!(await confirmar(`${f.nome} passará a ser o perfil principal (o titular do app).`, { titulo: 'Trocar o perfil principal?', sim: 'Tornar principal' }))) return;
    const agora = Date.now();
    await DB.lote(['familiares'], (s) => {
      for (const x of FAMILIA.lista) if (x.principal || x.id === id) s.familiares.put({ ...x, principal: x.id === id, atualizadoEm: agora });
    });
    toast('Perfil principal alterado ✓');
    telaFamiliar(id);
  };
  const arquivarFamiliar = async () => {
    const arquivar = f.status !== 'arquivado';
    if (arquivar && !(await confirmar(`${f.nome} sai do seletor, da agenda e das pendências. Todo o histórico continua guardado e pode ser reativado depois.`,
      { titulo: 'Arquivar familiar?', sim: '🗄️ Arquivar' }))) return;
    await DB.salvar('familiares', { ...f, status: arquivar ? 'arquivado' : 'ativo' });
    if (arquivar && filtroAtual() === id) definirFiltro('todos');
    toast(arquivar ? 'Familiar arquivado' : 'Familiar reativado ✓');
    telaFamiliar(id);
  };
  const bArquivar = $('#arquivar');
  if (bArquivar) bArquivar.onclick = arquivarFamiliar;
  const bArqPainel = $('#arquivar-painel');
  if (bArqPainel) bArqPainel.onclick = arquivarFamiliar;
  const bExcluir = $('#excluir');
  if (bExcluir) bExcluir.onclick = async () => {
    if (temRegistros) { $('#painel-excluir').hidden = false; $('#painel-excluir').scrollIntoView({ behavior: 'smooth' }); return; }
    if (!(await confirmar(`Não há consultas nem exames ligados a ${f.nome}. Esta ação não pode ser desfeita.`,
      { titulo: 'Excluir familiar?', sim: '🗑️ Excluir', perigo: true }))) return;
    await DB.apagar('familiares', id);
    if (filtroAtual() === id) definirFiltro('todos');
    toast('Familiar excluído');
    location.hash = '#/familia';
  };
  const bTransf = $('#transferir');
  if (bTransf) bTransf.onclick = async () => {
    const destino = FAMILIA.porId.get($('#destino').value);
    if (!(await confirmar(`${consultas.length} consulta(s) e ${exames.length} exame(s) passarão para ${destino.nome}, e o cadastro de ${f.nome} será excluído. Esta ação não pode ser desfeita.`,
      { titulo: 'Transferir e excluir?', sim: 'Transferir e excluir', perigo: true }))) return;
    const agora = Date.now();
    // Tudo junto: consultas, exames e retornos passam para o mesmo familiar, mantendo os vínculos
    await DB.lote(['consultas', 'exames', 'familiares'], (s) => {
      for (const c of consultas) s.consultas.put({ ...c, pacienteId: destino.id, atualizadoEm: agora });
      for (const e of exames) s.exames.put({ ...e, pacienteId: destino.id, atualizadoEm: agora });
      s.familiares.delete(id);
    });
    if (filtroAtual() === id) definirFiltro('todos');
    toast(`Registros transferidos para ${nomeCurto(destino)} ✓`);
    location.hash = '#/familiar/' + destino.id;
  };
}

async function telaFormFamiliar(id) {
  await carregarFamilia();
  const f = id ? FAMILIA.porId.get(id) : { cor: CORES_FAMILIA[FAMILIA.lista.length % CORES_FAMILIA.length] };
  if (id && !f) return naoEncontrado();
  render(`<form id="form" class="form">
    ${campo('Nome', 'nome', f.nome === 'Eu' && f.principal ? '' : f.nome, { obrigatorio: true, dica: 'Nome completo do familiar' })}
    ${campo('Apelido (opcional)', 'apelido', f.apelido, { dica: 'Como aparece nas listas, ex.: Vó, Júnior' })}
    <label class="campo"><span>Vínculo</span><select name="vinculo">
      <option value="">Escolha…</option>
      ${VINCULOS.map((v) => `<option ${v === f.vinculo ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    ${campo('Data de nascimento (opcional)', 'nascimento', f.nascimento, { tipo: 'date' })}
    <fieldset class="campo cores"><span>Cor de identificação</span><div>
      ${CORES_FAMILIA.map((c) => `<label class="cor" style="--cor:${c}"><input type="radio" name="cor" value="${c}" ${c === f.cor ? 'checked' : ''}><span></span></label>`).join('')}
    </div></fieldset>
    <div class="acoes"><button class="btn primario" type="submit">Salvar</button>
      <button class="btn" type="button" onclick="history.back()">Cancelar</button></div>
  </form>`, id ? 'Editar familiar' : 'Novo familiar', true);

  $('#form').onsubmit = async (ev) => {
    ev.preventDefault();
    const dados = lerForm(ev.target);
    if (!CORES_FAMILIA.includes(dados.cor)) dados.cor = CORES_FAMILIA[0];
    const novo = id ? { ...f, ...dados } : criarFamiliar(dados);
    await DB.salvar('familiares', novo);
    toast('Familiar salvo ✓');
    location.hash = '#/familiar/' + novo.id;
  };
}
