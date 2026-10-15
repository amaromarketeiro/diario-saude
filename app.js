'use strict';

// ===================== Listas de apoio =====================
const ESPECIALIDADES = ['Clínico geral', 'Médico da família', 'Cardiologia', 'Dermatologia', 'Endocrinologia',
  'Gastroenterologia', 'Ginecologia', 'Neurologia', 'Oftalmologia', 'Ortopedia', 'Otorrinolaringologia',
  'Pediatria', 'Psiquiatria', 'Reumatologia', 'Urologia', 'Odontologia', 'Fisioterapia', 'Nutrição', 'Psicologia'];
const EXAMES_COMUNS = ['Hemograma completo', 'Exame de sangue', 'Glicemia em jejum', 'Colesterol total e frações',
  'Urina tipo 1', 'Raio-X', 'Ultrassom', 'Ressonância magnética', 'Tomografia', 'Eletrocardiograma', 'Mamografia'];
const TIPOS_DOC = { receita: 'Receita', encaminhamento: 'Encaminhamento', atestado: 'Atestado',
  pedido: 'Pedido de exame', resultado: 'Resultado / Laudo', outro: 'Outro' };
const STATUS_CONSULTA = { agendada: 'Agendada', realizada: 'Realizada', cancelada: 'Cancelada' };
const PASSOS = ['solicitado', 'marcado', 'realizado', 'resultado'];
const STATUS_EXAME = { solicitado: 'Sem data marcada', marcado: 'Marcado', realizado: 'Aguardando resultado', resultado: 'Concluído' };
const NOME_PASSO = { solicitado: 'Pedido', marcado: 'Marcado', realizado: 'Feito', resultado: 'Resultado' };
const ICONE = { consulta: '🩺', exame: '🧪', resultado: '📄' };

// ===================== Utilidades de tela =====================
// (novoId, hoje, lerData, paraISO, pad e dataBR ficam em nucleo.js)
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function quando(data, hora) {
  const d = lerData(data);
  const [h, m] = (hora || '08:00').split(':').map(Number);
  d.setHours(h, m);
  return d;
}
const fmtData = (s) => s ? lerData(s).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtCurta = (s) => s ? lerData(s).toLocaleDateString('pt-BR') : '—';
function relativo(s) {
  const dias = Math.round((lerData(s) - lerData(hoje())) / 86400000);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  if (dias === -1) return 'Ontem';
  return dias > 1 ? `Em ${dias} dias` : `Há ${-dias} dias`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 3500);
}

// Caixa de confirmação do próprio app. Substitui confirm()/alert() do navegador,
// que alguns navegadores e apps bloqueiam (respondem "não" sem mostrar nada).
function confirmar(mensagem, { titulo = 'Confirmar', sim = 'Confirmar', nao = 'Cancelar', perigo = false } = {}) {
  return new Promise((responder) => {
    const m = $('#modal');
    m.innerHTML = `<div class="modal-fundo" data-resp="nao"></div>
      <div class="dialogo" role="alertdialog" aria-modal="true" aria-labelledby="dlg-titulo" aria-describedby="dlg-texto">
        <h3 id="dlg-titulo">${esc(titulo)}</h3>
        <p id="dlg-texto" class="texto">${esc(mensagem)}</p>
        <div class="acoes">
          ${nao ? `<button class="btn" data-resp="nao">${esc(nao)}</button>` : ''}
          <button class="btn ${perigo ? 'perigo-cheio' : 'primario'}" data-resp="sim">${esc(sim)}</button>
        </div></div>`;
    m.hidden = false;
    const fechar = (r) => { m.hidden = true; m.innerHTML = ''; m.onclick = null; document.removeEventListener('keydown', tecla); responder(r); };
    const tecla = (ev) => { if (ev.key === 'Escape') fechar(false); };
    document.addEventListener('keydown', tecla);
    m.onclick = (ev) => { const b = ev.target.closest('[data-resp]'); if (b) fechar(b.dataset.resp === 'sim'); };
    m.querySelector(nao ? '[data-resp="nao"]' : '[data-resp="sim"]').focus();
  });
}
const avisar = (mensagem, titulo = 'Aviso') => confirmar(mensagem, { titulo, sim: 'Entendi', nao: '' });

// Erros no console sem conteúdo médico: só o tipo e a mensagem técnica
const registrarErro = (onde, err) => console.error(`[Diário] ${onde}:`, err?.name || 'Erro', err?.message || '');

// Endereços temporários das miniaturas das fotos (liberados ao trocar de tela)
let urlsAtivas = [], urlsNovas = [];
function urlDe(blob) { const u = URL.createObjectURL(blob); urlsNovas.push(u); return u; }

function render(html, titulo, comVoltar = false) {
  urlsAtivas.forEach(URL.revokeObjectURL);
  urlsAtivas = urlsNovas;
  urlsNovas = [];
  $('#app').innerHTML = html;
  $('#titulo').textContent = titulo || 'Diário de Saúde';
  $('#voltar').hidden = !comVoltar;
  window.scrollTo(0, 0);
  ligarSeletor();
}

function lerForm(form) {
  const dados = {};
  for (const [k, v] of new FormData(form)) if (typeof v === 'string' && !k.startsWith('_')) dados[k] = v.trim();
  return dados;
}

function campo(rotulo, nome, valor = '', { tipo = 'text', obrigatorio = false, lista = '', dica = '', linhas = 0 } = {}) {
  const attrs = `name="${nome}" ${obrigatorio ? 'required' : ''} ${lista ? `list="${lista}"` : ''} placeholder="${esc(dica)}"`;
  const entrada = linhas
    ? `<textarea ${attrs} rows="${linhas}">${esc(valor)}</textarea>`
    : `<input type="${tipo}" ${attrs} value="${esc(valor)}">`;
  return `<label class="campo"><span>${rotulo}${obrigatorio ? ' *' : ''}</span>${entrada}</label>`;
}

function selecao(rotulo, nome, opcoes, valor) {
  return `<label class="campo"><span>${rotulo}</span><select name="${nome}">${Object.entries(opcoes)
    .map(([k, v]) => `<option value="${k}" ${k === valor ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
}

// Sugestões de preenchimento (médicos, locais e exames já usados antes)
async function sugestoes() {
  const [cs, es, ms] = await Promise.all([DB.todos('consultas'), DB.todos('exames'), DB.todos('medicos')]);
  const unicos = (arr) => [...new Set(arr.filter(Boolean))];
  const lista = (id, itens) => `<datalist id="${id}">${itens.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const medicos = ms.filter((m) => !m.arquivado).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((m) => `<option value="${esc(m.nome)}" label="${esc(m.especialidade || '')}">`).join('');
  return `<datalist id="dl-medicos">${medicos}</datalist>`
    + lista('dl-esp', unicos([...ESPECIALIDADES, ...cs.map((c) => c.especialidade), ...es.map((e) => e.especialidade)]))
    + lista('dl-locais', unicos([...cs.map((c) => c.local), ...es.flatMap((e) => [e.localExame, e.localResultado])]).sort())
    + lista('dl-exames', unicos([...EXAMES_COMUNS, ...es.map((e) => e.nome)]));
}

function vazio(titulo, texto, link, botao) {
  return `<div class="vazio"><div class="vazio-ic">🗂️</div><h2>${titulo}</h2><p>${texto}</p>
    ${link ? `<a class="btn primario" href="${link}">${botao}</a>` : ''}</div>`;
}

const botaoFlutuante = (link, texto) => `<a class="fab" href="${link}">${texto}</a>`;

// Menu de criação rápida (Agenda).
// "Todos": consulta, exame e novo familiar. Um familiar no filtro: só consulta e exame para ele.
function abrirMenuNovo() {
  const m = $('#modal');
  const f = filtroAtual() !== 'todos' ? FAMILIA.porId.get(filtroAtual()) : null;
  const p = f ? `?paciente=${f.id}` : '';
  const para = f ? ` para ${esc(nomeExibicao(f))}` : '';
  m.innerHTML = `<div class="modal-fundo" data-fechar></div>
    <div class="folha" role="dialog" aria-label="Criar novo">
      <h3>${f ? `${avatar(f, 'mini')} Cadastrar para ${esc(nomeExibicao(f))}` : 'O que você quer cadastrar?'}</h3>
      <a class="opcao" href="#/consulta/nova${p}" data-fechar><span>🩺</span><span><strong>Nova consulta${para}</strong><small>${f ? 'Médico, data e hora' : 'Familiar, médico, data e hora'}</small></span></a>
      <a class="opcao" href="#/exame/novo${p}" data-fechar><span>🧪</span><span><strong>Novo exame${para}</strong><small>Pedido de exame, com ou sem data</small></span></a>
      ${f ? '<p class="mudo centro">Para cadastrar um familiar, selecione “Todos” no topo.</p>'
        : '<a class="opcao" href="#/familiar/novo" data-fechar><span>👨‍👩‍👧</span><span><strong>Novo familiar</strong><small>Cadastrar uma pessoa da família</small></span></a>'}
      <button class="btn" data-fechar>Cancelar</button>
    </div>`;
  m.hidden = false;
  m.onclick = (ev) => { if (ev.target.closest('[data-fechar]')) { m.hidden = true; m.innerHTML = ''; } };
}

// ===================== Anexos (fotos e PDFs) =====================
async function anexosDe(tipoDono, idDono) {
  return (await DB.todos('anexos'))
    .filter((a) => a.tipoDono === tipoDono && a.idDono === idDono)
    .sort((a, b) => a.criadoEm - b.criadoEm);
}

async function salvarArquivos(arquivos, tipoDono, idDono, tipoDoc) {
  for (const arq of arquivos) {
    await DB.salvar('anexos', { id: novoId(), tipoDono, idDono, tipoDoc, nome: arq.name, mime: arq.type, blob: arq, criadoEm: Date.now() });
  }
}

function gradeAnexos(lista) {
  if (!lista.length) return '<p class="mudo">Nenhum arquivo anexado ainda.</p>';
  return `<div class="grade">${lista.map((a) => `
    <div class="anexo">
      <button class="anexo-ver" data-ver="${a.id}">
        ${a.mime?.startsWith('image/') ? `<img src="${urlDe(a.blob)}" alt="">` : '<span class="pdf">📄<br>PDF</span>'}
      </button>
      <small>${esc(TIPOS_DOC[a.tipoDoc] || 'Documento')}</small>
      <button class="anexo-del" data-del="${a.id}" aria-label="Remover">×</button>
    </div>`).join('')}</div>`;
}

function blocoUpload(tipos, padrao) {
  return `<div class="upload">
    <select id="up-tipo">${tipos.map((t) => `<option value="${t}" ${t === padrao ? 'selected' : ''}>${TIPOS_DOC[t]}</option>`).join('')}</select>
    <label class="btn">📎 Anexar foto ou PDF<input type="file" id="up-arq" accept="image/*,application/pdf" multiple hidden></label>
  </div>`;
}

function ligarAnexos(lista, tipoDono, idDono, recarregar) {
  document.querySelectorAll('[data-ver]').forEach((b) => b.onclick = () => abrirAnexo(lista.find((a) => a.id === b.dataset.ver)));
  document.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!(await confirmar('O arquivo será apagado deste aparelho. Esta ação não pode ser desfeita.', { titulo: 'Remover arquivo?', sim: 'Remover', perigo: true }))) return;
    await DB.apagar('anexos', b.dataset.del);
    recarregar();
  });
  const arq = $('#up-arq');
  if (arq) arq.onchange = async () => {
    if (!arq.files.length) return;
    await salvarArquivos(arq.files, tipoDono, idDono, $('#up-tipo').value);
    toast('Arquivo anexado ✓');
    recarregar();
  };
}

function abrirAnexo(a) {
  const url = URL.createObjectURL(a.blob);
  if (!a.mime?.startsWith('image/')) { window.open(url, '_blank'); return; }
  const m = $('#modal');
  m.innerHTML = `<div class="modal-fundo" data-fechar></div><div class="modal-caixa">
    <img src="${url}" alt="">
    <div class="acoes"><a class="btn" href="${url}" download="${esc(a.nome)}">⬇️ Baixar</a><button class="btn" data-fechar>Fechar</button></div></div>`;
  m.hidden = false;
  m.onclick = (ev) => {
    if (!ev.target.hasAttribute('data-fechar')) return;
    m.hidden = true; m.innerHTML = ''; URL.revokeObjectURL(url);
  };
}

// ===================== Agenda (eventos a partir das consultas e exames) =====================
async function eventos() {
  const [cs, es] = await Promise.all([DB.todos('consultas'), DB.todos('exames')]);
  const ev = [];
  for (const c of cs) {
    if (c.status === 'agendada' && c.data && !c.arquivado) ev.push({ chave: 'c-' + c.id, tipo: 'consulta', pacienteId: c.pacienteId, data: c.data, hora: c.hora,
      titulo: `Consulta${c.medico ? ' com ' + c.medico : ''}`, sub: [c.especialidade, c.local].filter(Boolean).join(' · '),
      local: c.local, descricao: c.assunto, link: '#/consulta/' + c.id });
  }
  for (const e of es) {
    if (e.arquivado) continue;
    if (e.status === 'marcado' && e.dataExame) ev.push({ chave: 'e-' + e.id, tipo: 'exame', pacienteId: e.pacienteId, data: e.dataExame, hora: e.horaExame,
      titulo: `Exame: ${e.nome}`, sub: e.localExame, local: e.localExame, descricao: `Pedido por ${e.medico || '—'}`, link: '#/exame/' + e.id });
    if (e.status === 'realizado' && e.dataResultado) ev.push({ chave: 'r-' + e.id, tipo: 'resultado', pacienteId: e.pacienteId, data: e.dataResultado, hora: e.horaResultado,
      titulo: `Buscar resultado: ${e.nome}`, sub: e.localResultado, local: e.localResultado, descricao: '', link: '#/exame/' + e.id });
  }
  ev.sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
  return { ev, cs, es };
}

function cardEvento(e) {
  return `<a class="card ${e.tipo}" href="${e.link}">
    <div class="card-ic">${ICONE[e.tipo]}</div>
    <div class="card-corpo">${tagFamiliar(e.pacienteId)}<strong>${esc(e.titulo)}</strong>
      <small>${esc([e.hora, e.sub].filter(Boolean).join(' · '))}</small></div>
    <span class="seta">›</span></a>`;
}

function cardPendencia(p, semNome = false) {
  return `<a class="card ${p.atencao ? 'atrasado' : ''}" href="${p.link}">
    <div class="card-ic">${p.icone}</div>
    <div class="card-corpo">${semNome ? '' : tagFamiliar(p.pacienteId)}<strong>${esc(p.titulo)}</strong><small>${esc(p.texto)}</small></div>
    <span class="seta">›</span></a>`;
}

async function telaAgenda() {
  const { ev, cs, es } = await eventos();
  const h = hoje();
  const proximos = doFiltro(ev).filter((e) => e.data >= h);
  const pendencias = calcularPendencias(doFiltro(cs), doFiltro(es)).filter((p) => p.atencao);
  let html = seletorFamilia();

  if (await backupVencido()) html += avisoBackup();
  if (FAMILIA.principal?.nome === 'Eu') {
    html += `<div class="aviso">👤 Personalize o perfil principal e cadastre seus familiares.
      <a class="btn pequeno" href="#/familiar/${FAMILIA.principal.id}/editar">Editar perfil</a></div>`;
  }
  if ('Notification' in window && Notification.permission === 'default') {
    html += `<div class="aviso">🔔 Quer receber avisos antes das consultas e exames?
      <button class="btn pequeno" id="ativar-avisos">Ativar avisos</button></div>`;
  }
  if (!proximos.length && !pendencias.length) {
    html += `<div class="vazio"><div class="vazio-ic">🗓️</div><h2>Nada agendado${filtroAtual() !== 'todos' ? ' para ' + esc(nomeFamiliar(filtroAtual())) : ''}</h2>
      <p>Toque em “+ Novo” para cadastrar uma consulta ou um exame.</p></div>`;
  }
  if (pendencias.length) {
    html += `<h2 class="secao alerta">⚠️ Precisa da sua atenção (${pendencias.length})</h2>`;
    html += pendencias.map((p) => cardPendencia(p)).join('');
  }
  if (proximos.length) {
    html += '<h2 class="secao">Próximos compromissos</h2>';
    let dia = '';
    for (const e of proximos) {
      if (e.data !== dia) { dia = e.data; html += `<h3 class="dia">${relativo(e.data)} · ${fmtData(e.data)}</h3>`; }
      html += cardEvento(e);
    }
  }
  html += '<button class="fab" id="novo">+ Novo</button>';
  render(html, 'Agenda');
  $('#novo').onclick = abrirMenuNovo;
  ligarAvisoBackup(telaAgenda);
  if ($('[data-backup="enviar"]')) prepararBackupAntecipado();
  const b = $('#ativar-avisos');
  if (b) b.onclick = async () => { await pedirPermissaoAvisos(); telaAgenda(); };
}

// ===================== Consultas =====================
// Texto usado pela caixa de busca (sem acentos, minúsculo)
const paraBusca = (...partes) => partes.filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const seloArquivado = (x, feminino) => x.arquivado ? `<span class="badge arquivado">🗄️ Arquivad${feminino ? 'a' : 'o'}</span>` : '';

const cardConsulta = (c) => `<a class="card consulta ${c.status} ${c.arquivado ? 'esmaecido' : ''}" href="#/consulta/${c.id}"
  data-busca="${esc(paraBusca(c.medico, c.especialidade, c.local, c.assunto, nomeFamiliar(c.pacienteId), fmtCurta(c.data)))}">
  <div class="card-ic">🩺</div>
  <div class="card-corpo">${tagFamiliar(c.pacienteId)}<strong>${esc(c.medico || c.especialidade || 'Consulta')}</strong>
    <small>${fmtCurta(c.data)}${c.hora ? ' · ' + esc(c.hora) : ''}${c.especialidade && c.medico ? ' · ' + esc(c.especialidade) : ''}</small></div>
  ${seloArquivado(c, true) || `<span class="badge ${c.status}">${STATUS_CONSULTA[c.status]}</span>`}</a>`;

const caixaBusca = (dica) => `<label class="busca"><span aria-hidden="true">🔎</span>
  <input type="search" id="busca" placeholder="${esc(dica)}" aria-label="Pesquisar"></label><p class="mudo centro" id="sem-resultado" hidden>Nada encontrado.</p>`;
function ligarBusca() {
  const campoBusca = $('#busca');
  if (!campoBusca) return;
  campoBusca.oninput = () => {
    const termo = paraBusca(campoBusca.value.trim());
    let visiveis = 0;
    document.querySelectorAll('[data-busca]').forEach((el) => {
      const ok = !termo || el.dataset.busca.includes(termo);
      el.hidden = !ok;
      if (ok) visiveis++;
    });
    document.querySelectorAll('.secao[data-grupo]').forEach((h) => {
      h.hidden = !document.querySelector(`[data-busca][data-grupo="${h.dataset.grupo}"]:not([hidden])`);
    });
    $('#sem-resultado').hidden = visiveis > 0;
  };
}
const comGrupo = (html, grupo) => html.replace('<a class="card', `<a data-grupo="${grupo}" class="card`);

async function telaConsultas(_, q = {}) {
  const verArquivadas = q.ver === 'arquivadas';
  const todas = doFiltro(await DB.todos('consultas'));
  const cs = todas.filter((c) => !!c.arquivado === verArquivadas);
  const nArquivadas = todas.filter((c) => c.arquivado).length;
  const ordem = (c) => (c.data || '') + (c.hora || '');
  const agendadas = cs.filter((c) => c.status === 'agendada').sort((a, b) => ordem(a).localeCompare(ordem(b)));
  const outras = cs.filter((c) => c.status !== 'agendada').sort((a, b) => ordem(b).localeCompare(ordem(a)));
  let html = seletorFamilia() + `<div class="chips">
    <a class="chip ${verArquivadas ? '' : 'ativo'}" href="#/consultas">Ativas</a>
    <a class="chip ${verArquivadas ? 'ativo' : ''}" href="#/consultas?ver=arquivadas">🗄️ Arquivadas (${nArquivadas})</a></div>`;
  if (cs.length) html += caixaBusca('Buscar por médico, especialidade, local…');
  if (!cs.length) html += verArquivadas ? '<p class="mudo centro">Nenhuma consulta arquivada.</p>'
    : vazio('Nenhuma consulta', 'Cadastre a primeira consulta.', '#/consulta/nova', '+ Nova consulta');
  if (agendadas.length) html += '<h2 class="secao" data-grupo="ag">Agendadas</h2>' + agendadas.map((c) => comGrupo(cardConsulta(c), 'ag')).join('');
  if (outras.length) html += '<h2 class="secao" data-grupo="hi">Histórico</h2>' + outras.map((c) => comGrupo(cardConsulta(c), 'hi')).join('');
  html += botaoFlutuante('#/consulta/nova', '+ Consulta');
  render(html, 'Consultas');
  ligarBusca();
}

async function telaConsulta(id) {
  const c = await DB.pegar('consultas', id);
  if (!c) return naoEncontrado();
  const [anexos, todosExames, todasConsultas] = await Promise.all([anexosDe('consulta', id), DB.todos('exames'), DB.todos('consultas')]);
  const exames = todosExames.filter((e) => e.consultaId === id);
  const retornoDe = todosExames.filter((e) => (c.retornoDe || []).includes(e.id));
  const origem = c.consultaOrigemId ? todasConsultas.find((x) => x.id === c.consultaOrigemId) : null;
  const retornos = todasConsultas.filter((x) => x.consultaOrigemId === id && x.status !== 'cancelada');
  const f = FAMILIA.porId.get(c.pacienteId);

  let blocoRetorno = '';
  if (c.status === 'realizada') {
    blocoRetorno = `<div class="bloco"><h3>↩️ Retorno</h3>${retornos.length
      ? retornos.map(cardConsulta).join('')
      : c.retornoNecessario
        ? `<p>O médico pediu retorno${c.prazoRetorno ? ` até <strong>${fmtCurta(c.prazoRetorno)}</strong>` : ''}.</p>
           <div class="acoes"><a class="btn primario" href="#/consulta/nova?origem=${id}">📅 Agendar retorno</a>
           <button class="btn" id="sem-retorno">Não precisa mais</button></div>`
        : `<p class="mudo">O médico pediu para voltar? Registre aqui para não esquecer.</p>
           <form id="f-retorno" class="linha-form">
             ${campo('Voltar até (opcional)', 'prazoRetorno', '', { tipo: 'date' })}
             <button class="btn" type="submit">Sim, pediu retorno</button></form>`}</div>`;
  }

  render(`<div class="detalhe">
    ${c.arquivado ? `<div class="aviso">🗄️ Esta consulta está arquivada: não aparece na agenda nem nas pendências.
      <button class="btn pequeno" id="desarquivar">Desarquivar</button></div>` : ''}
    <div class="cabeca">
      ${f ? `<a class="familiar-linha" href="#/familiar/${f.id}">${avatar(f, 'mini')}${esc(f.nome)}</a>` : ''}
      <span class="badge ${c.status}">${STATUS_CONSULTA[c.status]}</span>
      <h2>${esc(c.medico || c.especialidade || 'Consulta')}</h2>
      <p>${esc([c.medico && c.especialidade, c.local].filter(Boolean).join(' · '))}</p>
      <p class="quando">📅 ${fmtData(c.data)}${c.hora ? ' às ' + esc(c.hora) : ''}</p>
      ${origem ? `<a class="link" href="#/consulta/${origem.id}">↩️ Retorno da consulta de ${fmtCurta(origem.data)}</a><br>` : ''}
      <a class="link" href="#/jornada/${id}">🧭 Ver jornada completa</a>
    </div>

    ${c.status === 'agendada' ? `<div class="acoes">
      <button class="btn primario" id="realizada">✓ Consulta realizada</button>
      <button class="btn" id="ics">🔔 Lembrete no calendário</button></div>` : ''}

    ${c.assunto ? `<div class="bloco"><h3>O que falar / pedir</h3><p class="texto">${esc(c.assunto)}</p></div>` : ''}
    ${retornoDe.length ? `<div class="bloco"><h3>Retorno para mostrar os resultados de</h3>${retornoDe.map(cardExame).join('')}</div>` : ''}
    ${c.anotacoes ? `<div class="bloco"><h3>Anotações da consulta</h3><p class="texto">${esc(c.anotacoes)}</p></div>` : ''}
    ${blocoRetorno}

    <div class="bloco">
      <h3>Pedidos de exame desta consulta</h3>
      ${exames.length ? exames.map(cardExame).join('') : '<p class="mudo">Nenhum pedido de exame registrado.</p>'}
      <a class="btn" href="#/exame/novo?consulta=${id}">+ Adicionar pedido de exame</a>
    </div>

    <div class="bloco">
      <h3>Receitas e outros documentos</h3>
      ${gradeAnexos(anexos)}
      ${blocoUpload(['receita', 'encaminhamento', 'atestado', 'outro'], 'receita')}
    </div>

    <div class="acoes rodape">
      <a class="btn" href="#/consulta/${id}/editar">✏️ Editar / remarcar</a>
      <button class="btn perigo" id="excluir">🗑️ Excluir</button>
    </div>
  </div>`, 'Consulta', true);

  ligarAnexos(anexos, 'consulta', id, () => telaConsulta(id));
  const bReal = $('#realizada');
  if (bReal) bReal.onclick = async () => {
    c.status = 'realizada';
    await DB.salvar('consultas', c);
    toast('Consulta registrada! Anexe pedidos, receitas e registre se há retorno.');
    telaConsulta(id);
  };
  const fRet = $('#f-retorno');
  if (fRet) fRet.onsubmit = async (ev) => {
    ev.preventDefault();
    await DB.salvar('consultas', { ...c, retornoNecessario: true, prazoRetorno: lerForm(fRet).prazoRetorno || '' });
    toast('Retorno registrado ✓ Vai aparecer nas pendências até ser agendado.');
    telaConsulta(id);
  };
  const bSem = $('#sem-retorno');
  if (bSem) bSem.onclick = async () => {
    await DB.salvar('consultas', { ...c, retornoNecessario: false, prazoRetorno: '' });
    telaConsulta(id);
  };
  const bIcs = $('#ics');
  if (bIcs) bIcs.onclick = () => baixarICS({ chave: 'c-' + c.id, data: c.data, hora: c.hora,
    titulo: `Consulta${c.medico ? ' com ' + c.medico : ''}${mostrarNomesCalendario() ? ' (' + nomeFamiliar(c.pacienteId) + ')' : ''}`,
    local: c.local, descricao: c.assunto });
  const bDesarq = $('#desarquivar');
  if (bDesarq) bDesarq.onclick = async () => {
    await DB.salvar('consultas', { ...c, arquivado: false, arquivadoEm: null });
    toast('Consulta desarquivada ✓');
    telaConsulta(id);
  };
  $('#excluir').onclick = async () => {
    const v = vinculosDaConsulta(c, todasConsultas, todosExames, anexos);
    // Com vínculos: arquiva em vez de excluir, para não quebrar o histórico
    if (v.total) {
      if (c.arquivado) return avisar(`Esta consulta tem ${descreverVinculos(v)}. Ela já está arquivada e não pode ser excluída, para manter o histórico completo.`, 'Consulta arquivada');
      if (!(await confirmar(`Esta consulta tem ${descreverVinculos(v)}.\n\nPara não perder o histórico, em vez de excluir ela será ARQUIVADA: sai da agenda e das pendências, mas continua em "Arquivadas", no histórico e na jornada. Você pode desarquivar quando quiser.`,
        { titulo: 'Arquivar em vez de excluir', sim: '🗄️ Arquivar' }))) return;
      await DB.salvar('consultas', { ...c, arquivado: true, arquivadoEm: Date.now() });
      toast('Consulta arquivada ✓');
      return telaConsulta(id);
    }
    if (!(await confirmar('Esta consulta não tem exames, documentos nem retornos ligados a ela. Esta ação não pode ser desfeita.',
      { titulo: 'Excluir consulta?', sim: '🗑️ Excluir', perigo: true }))) return;
    await DB.apagar('consultas', id);
    toast('Consulta excluída');
    location.hash = '#/consultas';
  };
}

const mostrarNomesCalendario = () => FAMILIA.ativos.length > 1;

async function telaFormConsulta(id, q = {}) {
  let c = id ? await DB.pegar('consultas', id) : { status: 'agendada', data: hoje(), pacienteId: familiarPadrao(q.paciente) };
  if (id && !c) return naoEncontrado();
  const [cs, es] = await Promise.all([DB.todos('consultas'), DB.todos('exames')]);
  let travaFamiliar = '';

  if (!id && q.medico) {
    const m = await DB.pegar('medicos', q.medico);
    if (m) c = { ...c, data: '', medico: m.nome, especialidade: m.especialidade, local: m.local };
  }
  // Retorno (a partir de um exame ou de uma consulta): mesmo familiar, exames do mesmo familiar
  if (!id && (q.retorno || q.origem)) {
    const r = prepararRetorno({ exameId: q.retorno, consultaOrigemId: q.origem }, cs, es);
    if (r) {
      c = { ...c, data: '', ...r };
      travaFamiliar = 'O retorno é sempre do mesmo familiar da consulta e dos exames.';
    }
  }
  const temDetalhes = id || c.local || c.assunto;

  render(`<form id="form" class="form">
    ${campoFamiliar(c.pacienteId, { travado: !!travaFamiliar, motivo: travaFamiliar })}
    ${campo('Médico(a)', 'medico', c.medico, { lista: 'dl-medicos', dica: 'Nome do médico que fará a consulta' })}
    ${campo('Especialidade', 'especialidade', c.especialidade, { lista: 'dl-esp', dica: 'Preenchida ao escolher um médico cadastrado' })}
    <div class="dupla">
      ${campo('Data', 'data', c.data, { tipo: 'date', obrigatorio: true })}
      ${campo('Hora', 'hora', c.hora, { tipo: 'time' })}
    </div>
    <details class="mais-campos" ${temDetalhes ? 'open' : ''}><summary>Mais detalhes (opcional)</summary>
      ${campo('Local', 'local', c.local, { lista: 'dl-locais', dica: 'Onde será a consulta (clínica, posto, hospital)' })}
      ${campo('O que falar / pedir na consulta', 'assunto', c.assunto, { linhas: 3, dica: 'Sintomas, dúvidas e pedidos para levar à consulta' })}
      ${id ? selecao('Situação', 'status', STATUS_CONSULTA, c.status) : ''}
      ${id ? campo('Anotações (o que o médico disse)', 'anotacoes', c.anotacoes, { linhas: 3 }) : ''}
    </details>
    ${c.retornoDe?.length ? `<p class="mudo">↩️ Este retorno vai levar ${c.retornoDe.length} resultado(s) de exame.</p>` : ''}
    <div class="acoes"><button class="btn primario" type="submit">Salvar</button>
      <button class="btn" type="button" onclick="history.back()">Cancelar</button></div>
    ${await sugestoes()}
  </form>`, id ? 'Editar consulta' : travaFamiliar ? 'Agendar retorno' : 'Nova consulta', true);

  await ligarAutoMedico($('#form'), true);
  $('#form').onsubmit = async (ev) => {
    ev.preventDefault();
    const dados = lerForm(ev.target);
    if (!dados.medico && !dados.especialidade) return toast('Informe o médico ou a especialidade.');
    const novo = { ...c, ...dados, id: c.id || novoId(), criadoEm: c.criadoEm || Date.now() };
    const erro = validarConsulta(novo, cs, es);
    if (erro) return toast(erro);

    // Trocar o familiar de uma consulta leva junto os exames pedidos nela
    const ligados = id && c.pacienteId !== novo.pacienteId ? es.filter((e) => e.consultaId === id) : [];
    if (ligados.length) {
      for (const e of ligados) {
        const erroEx = validarExame({ ...e, pacienteId: novo.pacienteId }, cs.map((x) => (x.id === id ? novo : x)));
        if (erroEx) return toast('Não foi possível trocar o familiar: ' + erroEx);
      }
      if (!(await confirmar(`Os ${ligados.length} exame(s) pedidos nesta consulta também passarão para ${nomeFamiliar(novo.pacienteId)}.`,
        { titulo: 'Trocar o familiar?', sim: 'Trocar' }))) return;
    }
    const agora = Date.now();
    await DB.lote(['consultas', 'exames'], (s) => {
      s.consultas.put({ ...novo, atualizadoEm: agora });
      for (const e of ligados) s.exames.put({ ...e, pacienteId: novo.pacienteId, atualizadoEm: agora });
    });
    await registrarMedico(novo.medico, novo);
    toast('Consulta salva ✓');
    if (!id && 'Notification' in window && Notification.permission === 'default') pedirPermissaoAvisos();
    location.hash = '#/consulta/' + novo.id;
  };
}

// ===================== Exames =====================
function cardExame(e) {
  return `<a class="card exame ${e.arquivado ? 'esmaecido' : ''}" href="#/exame/${e.id}"
    data-busca="${esc(paraBusca(e.nome, e.medico, e.especialidade, e.localExame, e.resumo, nomeFamiliar(e.pacienteId)))}">
    <div class="card-ic">🧪</div>
    <div class="card-corpo">${tagFamiliar(e.pacienteId)}<strong>${esc(e.nome)}</strong>
      <small>${esc([e.medico, e.especialidade].filter(Boolean).join(' · ') || '—')}</small></div>
    ${seloArquivado(e) || `<span class="badge ${e.status}">${STATUS_EXAME[e.status]}</span>`}</a>`;
}

async function telaExames(_, q = {}) {
  const filtro = q.filtro || 'todos';
  const todos = doFiltro(await DB.todos('exames')).sort((a, b) => (b.dataSolicitacao || '').localeCompare(a.dataSolicitacao || ''));
  const es = todos.filter((e) => !e.arquivado);
  const filtros = { todos: 'Todos', solicitado: 'Sem data', marcado: 'Marcados', realizado: 'Aguardando', resultado: 'Concluídos',
    arquivados: `🗄️ Arquivados (${todos.length - es.length})` };
  const lista = filtro === 'arquivados' ? todos.filter((e) => e.arquivado) : filtro === 'todos' ? es : es.filter((e) => e.status === filtro);
  let html = seletorFamilia() + `<div class="chips">${Object.entries(filtros).map(([k, v]) =>
    `<a class="chip ${k === filtro ? 'ativo' : ''}" href="#/exames?filtro=${k}">${v}</a>`).join('')}</div>`;
  if (lista.length) html += caixaBusca('Buscar por exame, médico, local…');
  if (!todos.length) html += vazio('Nenhum exame', 'Os pedidos de exame ficam ligados à consulta em que foram pedidos. Você também pode cadastrar um avulso.', '#/exame/novo', '+ Novo exame');
  else if (!lista.length) html += '<p class="mudo centro">Nenhum exame nesta situação.</p>';
  html += lista.map(cardExame).join('');
  html += botaoFlutuante('#/exame/novo', '+ Exame');
  render(html, 'Exames');
  ligarBusca();
}

async function telaExame(id) {
  const e = await DB.pegar('exames', id);
  if (!e) return naoEncontrado();
  const anexos = await anexosDe('exame', id);
  const origem = e.consultaId ? await DB.pegar('consultas', e.consultaId) : null;
  const retornos = (await DB.todos('consultas')).filter((c) => (c.retornoDe || []).includes(id) && c.status !== 'cancelada');
  const passo = PASSOS.indexOf(e.status);
  const f = FAMILIA.porId.get(e.pacienteId);
  const salvarEtapa = async (dados, msg) => { Object.assign(e, dados); await DB.salvar('exames', e); toast(msg); telaExame(id); };

  let painel = '';
  if (e.status === 'solicitado') {
    painel = `<form id="etapa" class="painel">
      <h3>📅 Marcar o exame</h3><p class="mudo">Quando conseguir marcar, preencha a data e o local.</p>
      ${campo('Data do exame', 'dataExame', e.dataExame, { tipo: 'date', obrigatorio: true })}
      ${campo('Hora', 'horaExame', e.horaExame, { tipo: 'time' })}
      ${campo('Local', 'localExame', e.localExame, { lista: 'dl-locais', dica: 'Laboratório ou clínica onde será feito' })}
      <button class="btn primario" type="submit">Salvar marcação</button></form>`;
  } else if (e.status === 'marcado') {
    painel = `<div class="painel">
      <h3>🧪 Exame marcado</h3>
      <p>${fmtData(e.dataExame)}${e.horaExame ? ' às ' + esc(e.horaExame) : ''}${e.localExame ? '<br>📍 ' + esc(e.localExame) : ''}</p>
      <div class="acoes"><button class="btn" id="ics" type="button">🔔 Lembrete no calendário</button>
      <a class="btn" href="#/exame/${id}/editar">📅 Remarcar</a></div></div>
      <form id="etapa" class="painel">
      <h3>✓ Já fiz o exame</h3><p class="mudo">Quando devo buscar o resultado?</p>
      ${campo('Data para buscar o resultado', 'dataResultado', e.dataResultado, { tipo: 'date' })}
      ${campo('Hora', 'horaResultado', e.horaResultado, { tipo: 'time' })}
      ${campo('Local para buscar', 'localResultado', e.localResultado || e.localExame, { lista: 'dl-locais' })}
      <button class="btn primario" type="submit">Marcar como feito</button></form>`;
  } else if (e.status === 'realizado') {
    painel = `<div class="painel">
      <h3>⏳ Aguardando resultado</h3>
      <p>${e.dataResultado ? `Buscar em ${fmtData(e.dataResultado)}${e.horaResultado ? ' às ' + esc(e.horaResultado) : ''}` : 'Sem data para buscar o resultado.'}
      ${e.localResultado ? '<br>📍 ' + esc(e.localResultado) : ''}</p>
      ${e.dataResultado ? '<button class="btn" id="ics" type="button">🔔 Lembrete no calendário</button>' : ''}</div>
      <form id="etapa" class="painel">
      <h3>📄 Chegou o resultado</h3>
      <label class="btn">📎 Anexar foto ou PDF do laudo<input type="file" name="laudo" id="laudo" accept="image/*,application/pdf" multiple hidden></label>
      <p class="mudo" id="laudo-nome"></p>
      ${campo('Resumo do resultado (opcional)', 'resumo', e.resumo, { linhas: 3, dica: 'Principais pontos do laudo, com suas palavras' })}
      <button class="btn primario" type="submit">Resultado recebido</button></form>`;
  } else {
    painel = `<div class="painel ok">
      <h3>✅ Resultado recebido</h3>
      ${e.resumo ? `<p class="texto">${esc(e.resumo)}</p>` : ''}
      ${retornos.length
        ? `<p>Retorno agendado:</p>${retornos.map(cardConsulta).join('')}`
        : e.resultadoApresentado
          ? `<p>✔ Marcado como já mostrado ao médico / sem retorno.</p><button class="btn" id="apresentado">Desfazer</button>`
          : `<p>Próximo passo: levar o resultado para ${esc(e.medico || 'o médico que pediu')}.</p>
             <div class="acoes"><a class="btn primario" href="#/consulta/nova?retorno=${id}">📅 Agendar retorno</a>
             <button class="btn" id="apresentado">Já mostrei / não precisa</button></div>`}
    </div>`;
  }

  render(`<div class="detalhe">
    ${e.arquivado ? `<div class="aviso">🗄️ Este exame está arquivado: não aparece na agenda nem nas pendências.
      <button class="btn pequeno" id="desarquivar">Desarquivar</button></div>` : ''}
    <div class="cabeca">
      ${f ? `<a class="familiar-linha" href="#/familiar/${f.id}">${avatar(f, 'mini')}${esc(f.nome)}</a>` : ''}
      <span class="badge ${e.status}">${STATUS_EXAME[e.status]}</span>
      <h2>${esc(e.nome)}</h2>
      <p>Pedido por ${esc(e.medico || '—')}${e.especialidade ? ' · ' + esc(e.especialidade) : ''}</p>
      <p class="mudo">Solicitado em ${fmtCurta(e.dataSolicitacao)}</p>
      ${origem ? `<a class="link" href="#/consulta/${origem.id}">Ver consulta de origem (${fmtCurta(origem.data)})</a><br>
        <a class="link" href="#/jornada/${origem.id}">🧭 Ver jornada completa</a>` : ''}
    </div>
    <ol class="passos">${PASSOS.map((p, i) => `<li class="${i < passo || e.status === 'resultado' ? 'feito' : i === passo ? 'atual' : ''}">${NOME_PASSO[p]}</li>`).join('')}</ol>
    ${painel}
    ${e.observacoes ? `<div class="bloco"><h3>Observações</h3><p class="texto">${esc(e.observacoes)}</p></div>` : ''}
    <div class="bloco"><h3>Arquivos (pedido e resultado)</h3>
      ${gradeAnexos(anexos)}
      ${blocoUpload(['pedido', 'resultado', 'outro'], e.status === 'realizado' || e.status === 'resultado' ? 'resultado' : 'pedido')}
    </div>
    <div class="acoes rodape">
      <a class="btn" href="#/exame/${id}/editar">✏️ Editar</a>
      <button class="btn perigo" id="excluir">🗑️ Excluir</button>
    </div>
    ${await sugestoes()}
  </div>`, 'Exame', true);

  ligarAnexos(anexos, 'exame', id, () => telaExame(id));

  const laudo = $('#laudo');
  if (laudo) laudo.onchange = () => ($('#laudo-nome').textContent = [...laudo.files].map((x) => x.name).join(', '));

  const nomeCal = mostrarNomesCalendario() ? ` (${nomeFamiliar(e.pacienteId)})` : '';
  const bIcs = $('#ics');
  if (bIcs) bIcs.onclick = () => baixarICS(e.status === 'marcado'
    ? { chave: 'e-' + id, data: e.dataExame, hora: e.horaExame, titulo: `Exame: ${e.nome}${nomeCal}`, local: e.localExame, descricao: `Pedido por ${e.medico || ''}` }
    : { chave: 'r-' + id, data: e.dataResultado, hora: e.horaResultado, titulo: `Buscar resultado: ${e.nome}${nomeCal}`, local: e.localResultado, descricao: '' });

  const bApres = $('#apresentado');
  if (bApres) bApres.onclick = () => salvarEtapa({ resultadoApresentado: !e.resultadoApresentado },
    e.resultadoApresentado ? 'Desfeito' : 'Anotado ✓ Saiu das pendências.');

  const etapa = $('#etapa');
  if (etapa) etapa.onsubmit = async (ev) => {
    ev.preventDefault();
    const dados = lerForm(etapa);
    if (e.status === 'solicitado') return salvarEtapa({ ...dados, status: 'marcado' }, 'Exame marcado ✓ Vai aparecer na agenda.');
    if (e.status === 'marcado') return salvarEtapa({ ...dados, status: 'realizado' }, 'Exame feito ✓');
    if (e.status === 'realizado') {
      if (laudo.files.length) await salvarArquivos(laudo.files, 'exame', id, 'resultado');
      return salvarEtapa({ ...dados, status: 'resultado', dataRecebido: hoje() }, 'Resultado salvo ✓');
    }
  };

  const bDesarq = $('#desarquivar');
  if (bDesarq) bDesarq.onclick = () => salvarEtapa({ arquivado: false, arquivadoEm: null }, 'Exame desarquivado ✓');
  $('#excluir').onclick = async () => {
    const v = vinculosDoExame(e, await DB.todos('consultas'), anexos);
    // Com laudo/pedido anexado ou já levado a um retorno: arquiva em vez de excluir
    if (v.total) {
      if (e.arquivado) return avisar(`Este exame tem ${descreverVinculos(v)}. Ele já está arquivado e não pode ser excluído, para manter o histórico completo.`, 'Exame arquivado');
      if (!(await confirmar(`Este exame tem ${descreverVinculos(v)}.\n\nPara não perder o histórico, em vez de excluir ele será ARQUIVADO: sai da agenda e das pendências, mas continua em "Arquivados", no histórico e na jornada. Você pode desarquivar quando quiser.`,
        { titulo: 'Arquivar em vez de excluir', sim: '🗄️ Arquivar' }))) return;
      return salvarEtapa({ arquivado: true, arquivadoEm: Date.now() }, 'Exame arquivado ✓');
    }
    if (!(await confirmar('Este exame não tem documentos anexados nem está ligado a um retorno. Esta ação não pode ser desfeita.',
      { titulo: 'Excluir exame?', sim: '🗑️ Excluir', perigo: true }))) return;
    await DB.apagar('exames', id);
    toast('Exame excluído');
    location.hash = e.consultaId ? '#/consulta/' + e.consultaId : '#/exames';
  };
}

async function telaFormExame(id, q = {}) {
  let e = id ? await DB.pegar('exames', id) : { status: 'solicitado', dataSolicitacao: hoje(), pacienteId: familiarPadrao(q.paciente) };
  if (id && !e) return naoEncontrado();
  const cs = await DB.todos('consultas');
  if (!id && q.consulta) {
    const c = cs.find((x) => x.id === q.consulta);
    if (c) e = { ...e, consultaId: c.id, pacienteId: c.pacienteId, medico: c.medico, especialidade: c.especialidade, dataSolicitacao: c.data };
  }
  const travado = !id && !!q.consulta;
  const opcoesConsulta = (pacienteId, sel) => '<option value="">Nenhuma (exame avulso)</option>' + cs
    .filter((c) => c.pacienteId === pacienteId && c.status !== 'cancelada')
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
    .map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${fmtCurta(c.data)} · ${esc(c.medico || c.especialidade || 'Consulta')}</option>`).join('');

  render(`<form id="form" class="form">
    ${campoFamiliar(e.pacienteId, { travado, motivo: travado ? 'O exame é do mesmo familiar da consulta que o pediu.' : '' })}
    ${campo('Qual exame?', 'nome', e.nome, { obrigatorio: true, lista: 'dl-exames', dica: 'Nome do exame como está no pedido' })}
    ${!id ? `<div class="dupla">
      ${campo('Data do exame (se já marcado)', 'dataExame', e.dataExame, { tipo: 'date' })}
      ${campo('Hora', 'horaExame', e.horaExame, { tipo: 'time' })}</div>` : ''}
    ${!id ? `<label class="btn">📷 Foto ou PDF do pedido<input type="file" id="pedido" accept="image/*,application/pdf" multiple hidden></label>
      <p class="mudo" id="pedido-nome"></p>` : ''}
    <details class="mais-campos" ${id || e.consultaId ? 'open' : ''}><summary>Quem pediu (opcional)</summary>
      <label class="campo"><span>Consulta em que foi pedido</span>
        <select name="consultaId" id="sel-consulta" ${travado ? 'disabled' : ''}>${opcoesConsulta(e.pacienteId, e.consultaId)}</select>
        ${travado ? `<input type="hidden" name="consultaId" value="${esc(e.consultaId)}">` : ''}</label>
      ${campo('Médico(a) que pediu', 'medico', e.medico, { lista: 'dl-medicos', dica: 'Nome do médico que solicitou o exame' })}
      ${campo('Especialidade', 'especialidade', e.especialidade, { lista: 'dl-esp', dica: 'Preenchida ao escolher um médico cadastrado' })}
      ${campo('Data da solicitação', 'dataSolicitacao', e.dataSolicitacao, { tipo: 'date' })}
    </details>
    <details class="mais-campos" ${id ? 'open' : ''}><summary>${id ? 'Situação, datas e resultado' : 'Local e observações (opcional)'}</summary>
      ${id ? `
        ${selecao('Situação', 'status', STATUS_EXAME, e.status)}
        ${campo('Data do exame', 'dataExame', e.dataExame, { tipo: 'date' })}
        ${campo('Hora do exame', 'horaExame', e.horaExame, { tipo: 'time' })}` : ''}
      ${campo('Local do exame', 'localExame', e.localExame, { lista: 'dl-locais', dica: 'Laboratório ou clínica' })}
      ${id ? `
        ${campo('Data para buscar resultado', 'dataResultado', e.dataResultado, { tipo: 'date' })}
        ${campo('Hora', 'horaResultado', e.horaResultado, { tipo: 'time' })}
        ${campo('Local para buscar resultado', 'localResultado', e.localResultado, { lista: 'dl-locais' })}
        ${campo('Resumo do resultado', 'resumo', e.resumo, { linhas: 3 })}` : ''}
      ${campo('Observações', 'observacoes', e.observacoes, { linhas: 2, dica: 'Preparo e cuidados (jejum, suspender remédio...)' })}
    </details>
    <div class="acoes"><button class="btn primario" type="submit">Salvar</button>
      <button class="btn" type="button" onclick="history.back()">Cancelar</button></div>
    ${await sugestoes()}
  </form>`, id ? 'Editar exame' : 'Novo exame', true);

  const form = $('#form');
  const pedido = $('#pedido');
  if (pedido) pedido.onchange = () => ($('#pedido-nome').textContent = [...pedido.files].map((x) => x.name).join(', '));
  // Trocar o familiar atualiza a lista de consultas (só as dele)
  const selFam = form.elements.pacienteId;
  if (selFam?.tagName === 'SELECT') selFam.onchange = () => { $('#sel-consulta').innerHTML = opcoesConsulta(selFam.value, ''); };
  // Escolher a consulta preenche médico, especialidade e data da solicitação
  $('#sel-consulta').onchange = (ev) => {
    const c = cs.find((x) => x.id === ev.target.value);
    if (!c) return;
    if (c.medico) form.elements.medico.value = c.medico;
    if (c.especialidade) form.elements.especialidade.value = c.especialidade;
    if (c.data) form.elements.dataSolicitacao.value = c.data;
  };

  await ligarAutoMedico(form);
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const dados = lerForm(ev.target);
    const novo = { ...e, ...dados, consultaId: dados.consultaId || null, id: e.id || novoId(), criadoEm: e.criadoEm || Date.now() };
    const erro = validarExame(novo, cs);
    if (erro) return toast(erro);
    if (!id && novo.dataExame) novo.status = 'marcado';
    await DB.salvar('exames', novo);
    await registrarMedico(novo.medico, { especialidade: novo.especialidade });
    if (pedido?.files.length) await salvarArquivos(pedido.files, 'exame', novo.id, 'pedido');
    toast(id ? 'Exame salvo ✓' : 'Pedido de exame salvo ✓');
    // Vindo de uma consulta, volta para ela (facilita cadastrar vários pedidos seguidos)
    location.hash = !id && q.consulta ? '#/consulta/' + q.consulta : '#/exame/' + novo.id;
  };
}

// ===================== Jornada de atendimento =====================
async function telaJornada(id) {
  const [cs, es, an] = await Promise.all([DB.todos('consultas'), DB.todos('exames'), DB.todos('anexos')]);
  const raiz = raizJornada(id, cs);
  if (!raiz) return naoEncontrado();
  const j = montarJornada(raiz.id, cs, es, an);
  const pend = calcularPendencias(cs.filter((c) => c.pacienteId === raiz.pacienteId), es.filter((e) => e.pacienteId === raiz.pacienteId));
  const pendDe = (tipo, x) => pend.find((p) => p.id === x.id && (!tipo || p.tipo.startsWith(tipo)));
  const docs = (lista) => lista.length ? `<div class="j-docs">${lista.map((a) =>
    `<span class="j-doc">📎 ${esc(TIPOS_DOC[a.tipoDoc] || 'Documento')}</span>`).join('')}</div>` : '';
  const passoExame = (e) => {
    const datas = [e.dataSolicitacao && `pedido ${fmtCurta(e.dataSolicitacao)}`, e.dataExame && `exame ${fmtCurta(e.dataExame)}`,
      e.status === 'resultado' && `resultado ${fmtCurta(e.dataRecebido || e.dataResultado || e.dataExame)}`].filter(Boolean).join(' · ');
    return datas;
  };
  const no = (n, nivel) => {
    const c = n.consulta, p = pendDe('', c);
    return `<div class="j-no ${nivel ? 'j-retorno' : ''}">
      <a class="j-cab" href="#/consulta/${c.id}">
        <span class="j-ic">${nivel ? '↩️' : '🩺'}</span>
        <span><strong>${nivel ? 'Retorno' : 'Consulta'} · ${esc(c.medico || c.especialidade || '')}</strong>
        <small>${fmtCurta(c.data)} · ${STATUS_CONSULTA[c.status]}${c.arquivado ? ' · 🗄️ arquivada' : ''}</small></span></a>
      ${p ? `<p class="j-pend">⚠️ ${esc(p.texto)}</p>` : ''}
      ${n.levouResultados.length ? `<p class="mudo">Levou os resultados de: ${esc(n.levouResultados.map((e) => e.nome).join(', '))}</p>` : ''}
      ${docs(n.documentos)}
      ${n.exames.map(({ exame: e, anexos }) => {
        const pe = pendDe('', e);
        return `<a class="j-exame" href="#/exame/${e.id}">
          ${seloArquivado(e) || `<span class="badge ${e.status}">${STATUS_EXAME[e.status]}</span>`}
          <strong>🧪 ${esc(e.nome)}</strong><small>${passoExame(e)}</small>
          ${pe ? `<small class="j-pend">⚠️ ${esc(pe.texto)}</small>` : ''}${docs(anexos)}</a>`;
      }).join('')}
      ${n.retornos.map((r) => no(r, nivel + 1)).join('')}
    </div>`;
  };
  render(`${tagFamiliar(raiz.pacienteId, true)}
    <p class="mudo">Tudo o que aconteceu a partir da consulta de ${fmtCurta(raiz.data)}: pedidos, exames, resultados, documentos e retornos.</p>
    <div class="jornada">${no(j, 0)}</div>
    ${botaoImprimir}`, 'Jornada', true);
}

// ===================== Lembretes =====================
function baixarICS(ev) {
  if (!ev.data) return toast('Defina uma data primeiro');
  const limpa = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const ini = quando(ev.data, ev.hora);
  const fim = new Date(ini.getTime() + 60 * 60000);
  const f = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const agora = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const alarme = (gatilho, txt) => ['BEGIN:VALARM', `TRIGGER:${gatilho}`, 'ACTION:DISPLAY', `DESCRIPTION:${limpa(txt)}`, 'END:VALARM'];
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Diario de Saude//PT-BR', 'BEGIN:VEVENT',
    `UID:${ev.chave}-${ev.data}@diario-saude`, `DTSTAMP:${agora}`, `DTSTART:${f(ini)}`, `DTEND:${f(fim)}`,
    `SUMMARY:${limpa(ev.titulo)}`, `LOCATION:${limpa(ev.local)}`, `DESCRIPTION:${limpa(ev.descricao)}`,
    ...alarme('-P1D', 'Amanhã: ' + ev.titulo), ...alarme('-PT2H', 'Em 2 horas: ' + ev.titulo),
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = ev.titulo.replace(/[^\wÀ-ú -]/g, '').slice(0, 40) + '.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Abra o arquivo para adicionar ao calendário (com alarme 1 dia e 2 horas antes)');
}

async function pedirPermissaoAvisos() {
  if (!('Notification' in window)) return toast('Este navegador não suporta avisos');
  const r = await Notification.requestPermission();
  toast(r === 'granted' ? 'Avisos ativados ✓' : 'Avisos não foram permitidos');
  if (r === 'granted') verificarLembretes();
}

async function mostrarAviso(titulo, corpo) {
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
  if (reg) reg.showNotification(titulo, { body: corpo, icon: 'icon-192.png', badge: 'icon-192.png' });
  else new Notification(titulo, { body: corpo, icon: 'icon-192.png' });
}

// Avisa 1 dia e 2 horas antes (enquanto o app estiver aberto ou em segundo plano). Todos os familiares ativos.
async function verificarLembretes() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const { ev } = await eventos();
  const chave = (MODO_TESTE ? 'teste:' : '') + 'avisados';
  let avisados = {};
  try { avisados = JSON.parse(localStorage.getItem(chave) || '{}'); } catch { }
  const agora = Date.now();
  for (const e of doFiltro(ev, 'todos')) {
    const falta = quando(e.data, e.hora).getTime() - agora;
    if (falta <= 0) continue;
    const janela = falta <= 2 * 3600000 ? '2h' : falta <= 24 * 3600000 ? '1d' : null;
    const k = `${e.chave}|${e.data}|${e.hora || ''}|${janela}`;
    if (!janela || avisados[k]) continue;
    avisados[k] = 1;
    const quem = mostrarNomesCalendario() ? nomeFamiliar(e.pacienteId) + ': ' : '';
    mostrarAviso(quem + e.titulo, `${relativo(e.data)}${e.hora ? ' às ' + e.hora : ''}${e.local ? ' · ' + e.local : ''}`);
  }
  try { localStorage.setItem(chave, JSON.stringify(avisados)); } catch { }
}

// ===================== Mais (família, backup, armazenamento, avisos) =====================
function baixarArquivo(conteudo, nome, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Backup com intervalo (lembrete) ----------
// Um site não pode gravar arquivos sozinho no celular; por isso, quando vence o prazo escolhido,
// a Agenda mostra um aviso e o backup é feito com um toque (salvar no aparelho ou enviar ao Drive).
const INTERVALOS_BACKUP = new Map([['1', 'Todo dia'], ['3', 'A cada 3 dias'], ['7', 'Toda semana'], ['0', 'Desligado']]);
const chaveLocal = (k) => (MODO_TESTE ? 'teste:' : '') + k;
const lerLocal = (k, padrao = null) => { try { return localStorage.getItem(chaveLocal(k)) ?? padrao; } catch { return padrao; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(chaveLocal(k), v); } catch { } };
const intervaloBackup = () => Number(lerLocal('intervaloBackup', '1'));
// O Chrome do Android só compartilha alguns tipos de arquivo (imagens, PDF, texto…) — .json não está na lista.
// Por isso o backup é enviado como .txt (o conteúdo é o mesmo JSON; a restauração aceita os dois).
const arquivoParaEnviar = (conteudo, nome) => new File([conteudo], nome.replace(/\.json$/, '.txt'), { type: 'text/plain' });
const podeCompartilhar = () => !!navigator.canShare?.({ files: [arquivoParaEnviar('x', 'teste.json')] });

async function backupVencido() {
  const dias = intervaloBackup();
  if (!dias) return false;
  if (Number(lerLocal('backupAdiadoAte', '0')) > Date.now()) return false;
  const [cs, es] = await Promise.all([DB.todos('consultas'), DB.todos('exames')]);
  if (!cs.length && !es.length && FAMILIA.lista.length < 2) return false; // nada para guardar ainda
  const ultimo = lerLocal('ultimoBackup');
  return !ultimo || Date.now() - new Date(ultimo).getTime() >= dias * 86400000 - 3600000;
}

// O Android só abre o "Compartilhar" logo após o toque. Por isso o backup é montado ANTES,
// quando a tela com o botão aparece; no toque, ele já está pronto.
let backupPreparado = null;
function prepararBackupAntecipado() {
  backupPreparado = montarBackup().then((p) => JSON.stringify(p)).catch(() => null);
}

// modo: 'baixar' (salva no aparelho) ou 'enviar' (Drive, WhatsApp, e-mail…)
async function exportarBackup(modo = 'baixar') {
  try {
    const json = (backupPreparado && (await backupPreparado)) || JSON.stringify(await montarBackup());
    backupPreparado = null;
    const nome = `backup-diario-saude-${hoje()}.json`;
    let mensagem = '📥 Backup salvo na pasta Downloads do aparelho.' + (podeCompartilhar() ? ' Para guardar no Drive, use “☁️ Enviar ao Drive”.' : '');
    if (modo === 'enviar' && podeCompartilhar()) {
      try {
        await navigator.share({ files: [arquivoParaEnviar(json, nome)], title: 'Backup do Diário de Saúde' });
        mensagem = '☁️ Backup enviado ✓ Confira no Drive o arquivo ' + nome.replace('.json', '.txt');
      } catch (err) {
        if (err.name === 'AbortError') { prepararBackupAntecipado(); return false; } // desistiu de enviar
        baixarArquivo(json, nome, 'application/json');
        await avisar('Não foi possível abrir o envio agora, então o backup foi salvo na pasta Downloads do aparelho. Você pode enviá-lo ao Drive pelo app do Google Drive (+ → Fazer upload).', 'Backup salvo no aparelho');
        mensagem = '';
      }
    } else {
      baixarArquivo(json, nome, 'application/json');
    }
    gravarLocal('ultimoBackup', new Date().toISOString());
    gravarLocal('backupAdiadoAte', '0');
    if (mensagem) toast(mensagem);
    return true;
  } catch (err) {
    registrarErro('backup', err);
    toast('Não foi possível gerar o backup: ' + err.message);
    return false;
  }
}

function avisoBackup() {
  const ultimo = lerLocal('ultimoBackup');
  return `<div class="aviso aviso-backup">
    <span>💾 <strong>Hora do backup.</strong> Último: ${ultimo ? new Date(ultimo).toLocaleDateString('pt-BR') : 'nunca'}.</span>
    <div class="acoes">
      ${podeCompartilhar() ? '<button class="btn pequeno primario" data-backup="enviar">☁️ Enviar ao Drive…</button>' : ''}
      <button class="btn pequeno ${podeCompartilhar() ? '' : 'primario'}" data-backup="baixar">⬇️ Salvar no aparelho</button>
      <button class="btn pequeno" data-backup="adiar">Amanhã</button>
    </div></div>`;
}
function ligarAvisoBackup(recarregar) {
  document.querySelectorAll('[data-backup]').forEach((b) => b.onclick = async () => {
    if (b.dataset.backup === 'adiar') {
      gravarLocal('backupAdiadoAte', String(Date.now() + 20 * 3600000));
      toast('Ok, lembro amanhã.');
    } else await exportarBackup(b.dataset.backup);
    recarregar();
  });
}

async function importarBackup(arquivo) {
  let pacote;
  try { pacote = JSON.parse(await arquivo.text()); } catch { return toast('Arquivo inválido: não é um backup legível.'); }
  let preparado;
  try { preparado = await prepararRestauracao(pacote); } catch (err) { return avisar(err.message, 'Backup não restaurado'); }
  const d = preparado.dados;
  const resumo = `Familiares: ${d.familiares.length}\nConsultas: ${d.consultas.length}\nExames: ${d.exames.length}\nMédicos: ${d.medicos.length}\nArquivos: ${d.anexos.length}`
    + (preparado.relatorio.familiarCriado ? '\n\n(Backup de versão antiga: os registros serão ligados ao perfil principal.)' : '');
  if (!(await confirmar(`${resumo}\n\nIsso vai SUBSTITUIR todos os dados atuais deste aparelho.`, { titulo: 'Restaurar este backup?', sim: 'Restaurar', perigo: true }))) return;
  if (await confirmar('Antes de restaurar, quer gerar um backup dos dados atuais por segurança?', { titulo: 'Backup de segurança', sim: 'Sim, gerar (recomendado)', nao: 'Não' })) {
    if (!(await exportarBackup())) return;
  }
  try {
    await restaurarDados(d);
  } catch (err) {
    registrarErro('restauração', err);
    return avisar('Nada foi alterado.\n\n' + err.message, 'A restauração falhou');
  }
  await sincronizarMedicos();
  definirFiltro('todos');
  toast('Backup restaurado ✓');
  location.hash = '#/agenda';
  navegar();
}

const fmtBytes = (b) => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB';

async function telaMais() {
  const perm = 'Notification' in window ? Notification.permission : 'indisponivel';
  const txtPerm = { granted: '✅ Ativados', denied: '🚫 Bloqueados (libere nas configurações do navegador)', default: 'Desativados', indisponivel: 'Não suportado neste navegador' }[perm];
  const [nMedicos, copiaV2, arm] = await Promise.all([DB.todos('medicos').then((m) => m.length), DB.pegar('meta', 'copia-v2'), estadoArmazenamento()]);
  const ultimo = lerLocal('ultimoBackup');
  render(`${MODO_TESTE ? '<div class="aviso">🧪 Modo de teste: banco separado, dados fictícios.</div>' : ''}
    <a class="card" href="#/familia"><div class="card-ic">👨‍👩‍👧</div>
      <div class="card-corpo"><strong>Família</strong><small>${FAMILIA.ativos.length} familiar(es) ativo(s) · cadastrar, editar, arquivar</small></div>
      <span class="seta">›</span></a>
    <a class="card" href="#/medicos"><div class="card-ic">👩‍⚕️</div>
      <div class="card-corpo"><strong>Médicos</strong><small>${nMedicos} cadastrado(s) · nome, especialidade e registro</small></div>
      <span class="seta">›</span></a>
    <div class="bloco"><h3>💾 Backup</h3>
      <p class="mudo">Os dados ficam <strong>somente neste aparelho</strong>. Se o navegador for limpo ou o celular trocado, eles se perdem.
        Faça backup com frequência e guarde o arquivo num local seguro (o arquivo contém dados de saúde).</p>
      <p>Último backup: <strong>${ultimo ? new Date(ultimo).toLocaleDateString('pt-BR') : 'nunca'}</strong></p>
      <label class="campo"><span>Lembrar de fazer backup</span><select id="intervalo-backup">
        ${[...INTERVALOS_BACKUP].map(([v, t]) => `<option value="${v}" ${Number(v) === intervaloBackup() ? 'selected' : ''}>${t}</option>`).join('')}
      </select></label>
      <p class="mudo">Quando chegar a hora, a Agenda mostra um aviso para fazer o backup com um toque.</p>
      <div class="acoes">
        ${podeCompartilhar() ? '<button class="btn primario" id="enviar-backup">☁️ Enviar ao Drive…</button>' : ''}
        <button class="btn ${podeCompartilhar() ? '' : 'primario'}" id="exportar">⬇️ Salvar no aparelho</button>
        <label class="btn">⬆️ Restaurar backup<input type="file" id="importar" accept="application/json,.json,text/plain,.txt" hidden></label></div>
      ${podeCompartilhar() ? '<p class="mudo">“Enviar ao Drive” abre as opções do celular: escolha Google Drive para guardar fora do aparelho.</p>' : ''}
      <p class="mudo">O backup inclui familiares, médicos, consultas, exames, arquivos e todos os vínculos, com verificação de integridade.</p>
      ${copiaV2 ? `<p class="mudo">Há uma cópia de segurança dos registros de antes da atualização para a versão 3
        (${new Date(copiaV2.criadoEm).toLocaleDateString('pt-BR')}). <button class="btn pequeno" id="copia-v2">Baixar cópia</button></p>` : ''}</div>
    <div class="bloco"><h3>🛡️ Armazenamento</h3>
      ${arm.suportado ? `<p>Proteção contra limpeza automática: <strong>${arm.persistente ? '✅ ativada' : 'desativada'}</strong></p>
        ${arm.cota ? `<p class="mudo">Usando ${fmtBytes(arm.usado)} de ${fmtBytes(arm.cota)} disponíveis.</p>` : ''}
        ${arm.persistente ? '' : '<button class="btn" id="proteger">Pedir proteção do armazenamento</button>'}
        <p class="mudo">Mesmo protegido, o armazenamento é local: o backup continua sendo essencial.</p>`
        : '<p class="mudo">Este navegador não informa o estado do armazenamento.</p>'}</div>
    <div class="bloco"><h3>🔔 Avisos</h3><p>Situação: ${txtPerm}</p>
      ${perm === 'default' ? '<button class="btn primario" id="ativar">Ativar avisos</button>' : ''}
      <p class="mudo">Dica: para ter certeza de que será lembrado, use o botão "Lembrete no calendário" em cada consulta ou exame.</p></div>
    <div class="bloco"><h3>📱 Instalar no celular</h3>
      ${matchMedia('(display-mode: standalone)').matches ? '<p>✅ O app já está instalado.</p>'
        : `${pedidoInstalacao ? '<button class="btn primario" id="instalar">📲 Instalar o app</button>' : ''}
          <p class="mudo">No Android (Chrome): menu ⋮ → "Instalar app" ou "Adicionar à tela inicial".
          No iPhone (Safari): botão Compartilhar → "Adicionar à Tela de Início".</p>`}</div>
    <div class="bloco"><h3>🚧 Em breve</h3><ul class="mudo">
      <li>Backup protegido por senha (criptografado)</li>
      <li>Sincronização entre aparelhos</li>
      <li>Leitura automática dos pedidos e laudos</li>
      <li>Gráficos da evolução dos valores dos exames</li></ul></div>
    <p class="mudo centro">Diário de Saúde · versão 3</p>`, 'Mais');
  const b = $('#ativar');
  if (b) b.onclick = async () => { await pedirPermissaoAvisos(); telaMais(); };
  const bp = $('#proteger');
  if (bp) bp.onclick = async () => {
    const ok = await navigator.storage.persist?.();
    toast(ok ? 'Armazenamento protegido ✓' : 'O navegador não concedeu a proteção agora. Instalar o app costuma ajudar.');
    telaMais();
  };
  const bi = $('#instalar');
  if (bi) bi.onclick = async () => {
    pedidoInstalacao.prompt();
    const { outcome } = await pedidoInstalacao.userChoice;
    pedidoInstalacao = null;
    toast(outcome === 'accepted' ? 'App instalado ✓ Ele aparece na tela inicial.' : 'Instalação cancelada');
    telaMais();
  };
  const bc = $('#copia-v2');
  if (bc) bc.onclick = () => baixarArquivo(JSON.stringify({ app: 'diario-saude', versao: 2, ...copiaV2, anexos: [] }),
    `copia-antes-v3-${hoje()}.json`, 'application/json');
  if (podeCompartilhar()) prepararBackupAntecipado();
  $('#exportar').onclick = async () => { await exportarBackup('baixar'); telaMais(); };
  const be = $('#enviar-backup');
  if (be) be.onclick = async () => { await exportarBackup('enviar'); telaMais(); };
  $('#intervalo-backup').onchange = (ev) => {
    gravarLocal('intervaloBackup', ev.target.value);
    toast(Number(ev.target.value) ? `Lembrete de backup: ${INTERVALOS_BACKUP.get(ev.target.value).toLowerCase()} ✓` : 'Lembrete de backup desligado');
  };
  $('#importar').onchange = (ev) => ev.target.files[0] && importarBackup(ev.target.files[0]);
}

function naoEncontrado() {
  render(vazio('Não encontrado', 'Este item não existe mais.', '#/agenda', 'Ir para a agenda'), 'Ops');
}

// ===================== Navegação =====================
const ROTAS = [
  [/^#\/agenda$/, telaAgenda],
  [/^#\/consultas$/, telaConsultas],
  [/^#\/consulta\/nova$/, (_, q) => telaFormConsulta(null, q)],
  [/^#\/consulta\/(\w+)\/editar$/, (id) => telaFormConsulta(id)],
  [/^#\/consulta\/(\w+)$/, telaConsulta],
  [/^#\/jornada\/(\w+)$/, telaJornada],
  [/^#\/exames$/, telaExames],
  [/^#\/exame\/novo$/, (_, q) => telaFormExame(null, q)],
  [/^#\/exame\/(\w+)\/editar$/, (id) => telaFormExame(id)],
  [/^#\/exame\/(\w+)$/, telaExame],
  [/^#\/familia$/, telaFamilia],
  [/^#\/familiar\/novo$/, () => telaFormFamiliar(null)],
  [/^#\/familiar\/(\w+)\/editar$/, (id) => telaFormFamiliar(id)],
  [/^#\/familiar\/(\w+)$/, telaFamiliar],
  [/^#\/medicos$/, telaMedicos],
  [/^#\/medico\/novo$/, () => telaFormMedico(null)],
  [/^#\/medico\/(\w+)\/editar$/, (id) => telaFormMedico(id)],
  [/^#\/medico\/(\w+)$/, telaMedico],
  [/^#\/relatorios$/, telaRelatorios],
  [/^#\/relatorios\/medicos$/, telaRelMedicos],
  [/^#\/relatorios\/especialidades$/, telaRelEspecialidades],
  [/^#\/relatorios\/exames$/, telaRelExames],
  [/^#\/relatorios\/documentos$/, telaRelDocumentos],
  [/^#\/relatorios\/linha$/, telaRelLinha],
  [/^#\/mais$/, telaMais],
];
const ABA_DA_ROTA = { consulta: 'consultas', jornada: 'consultas', exame: 'exames', medico: 'mais', medicos: 'mais', familia: 'mais', familiar: 'mais' };

async function navegar() {
  const [caminho, busca] = (location.hash || '#/agenda').split('?');
  const q = Object.fromEntries(new URLSearchParams(busca || ''));
  const parte = caminho.split('/')[1];
  document.querySelectorAll('.abas a').forEach((a) => a.classList.toggle('ativa', a.dataset.aba === (ABA_DA_ROTA[parte] || parte)));
  for (const [regra, tela] of ROTAS) {
    const m = caminho.match(regra);
    if (!m) continue;
    const carregando = setTimeout(() => { $('#app').innerHTML = '<div class="carregando" role="status">Carregando…</div>'; }, 250);
    try {
      await carregarFamilia();
      await tela(m[1], q);
    } catch (err) {
      registrarErro('tela ' + parte, err);
      render(`<div class="vazio"><div class="vazio-ic">⚠️</div><h2>Algo deu errado</h2>
        <p>${esc(err.message)}</p><button class="btn primario" onclick="navegar()">Tentar de novo</button></div>`, 'Erro');
    } finally { clearTimeout(carregando); }
    return;
  }
  location.hash = '#/agenda';
}

// ===================== Início do app =====================
window.aoBloquearBanco = () => {
  $('#app').innerHTML = `<div class="vazio"><div class="vazio-ic">🔄</div><h2>Atualizando o app</h2>
    <p>Feche as outras abas ou janelas do Diário de Saúde para concluir a atualização.</p></div>`;
};

async function iniciar() {
  $('#app').innerHTML = '<div class="carregando" role="status">Carregando…</div>';
  try {
    const r = await migrarBanco();
    if (r.migrado && r.relatorio && (r.relatorio.consultasVinculadas || r.relatorio.examesVinculados)) {
      toast('App atualizado para a versão 3 ✓ Seus registros foram ligados ao perfil principal.');
    }
  } catch (err) {
    registrarErro('migração', err);
    render(`<div class="vazio"><div class="vazio-ic">⚠️</div><h2>Não foi possível atualizar os dados</h2>
      <p>Nada foi alterado: seus registros continuam como estavam. Gere um backup e tente novamente.</p>
      <div class="acoes"><button class="btn primario" id="bk">⬇️ Gerar backup</button>
      <button class="btn" onclick="location.reload()">Tentar de novo</button></div>
      <p class="mudo">Detalhe técnico: ${esc(err.message)}</p></div>`, 'Erro');
    $('#bk').onclick = () => exportarBackup('baixar');
    return;
  }
  await sincronizarMedicos().catch((e) => registrarErro('médicos', e));
  window.addEventListener('hashchange', navegar);
  await navegar();
  verificarLembretes();
  setInterval(verificarLembretes, 5 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) verificarLembretes(); });
}

// Android/Chrome: guarda o pedido de instalação para oferecer o botão "Instalar o app" em Mais
let pedidoInstalacao = null;
window.addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); pedidoInstalacao = ev; });

$('#voltar').onclick = () => history.back();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
iniciar();
