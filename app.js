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

// ===================== Utilidades =====================
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = (n) => String(n).padStart(2, '0');
const paraISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => paraISO(new Date());
function lerData(s) { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); }
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
  toast.timer = setTimeout(() => (t.hidden = true), 3000);
}

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
}

function lerForm(form) {
  const dados = {};
  for (const [k, v] of new FormData(form)) if (typeof v === 'string') dados[k] = v.trim();
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
  const medicos = ms.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
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
        ${a.mime.startsWith('image/') ? `<img src="${urlDe(a.blob)}" alt="">` : '<span class="pdf">📄<br>PDF</span>'}
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
    if (!confirm('Remover este arquivo?')) return;
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
  if (!a.mime.startsWith('image/')) { window.open(url, '_blank'); return; }
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
    if (c.status === 'agendada' && c.data) ev.push({ chave: 'c-' + c.id, tipo: 'consulta', data: c.data, hora: c.hora,
      titulo: `Consulta${c.medico ? ' com ' + c.medico : ''}`, sub: [c.especialidade, c.local].filter(Boolean).join(' · '),
      local: c.local, descricao: c.assunto, link: '#/consulta/' + c.id });
  }
  for (const e of es) {
    if (e.status === 'marcado' && e.dataExame) ev.push({ chave: 'e-' + e.id, tipo: 'exame', data: e.dataExame, hora: e.horaExame,
      titulo: `Exame: ${e.nome}`, sub: e.localExame, local: e.localExame, descricao: `Pedido por ${e.medico || '—'}`, link: '#/exame/' + e.id });
    if (e.status === 'realizado' && e.dataResultado) ev.push({ chave: 'r-' + e.id, tipo: 'resultado', data: e.dataResultado, hora: e.horaResultado,
      titulo: `Buscar resultado: ${e.nome}`, sub: e.localResultado, local: e.localResultado, descricao: '', link: '#/exame/' + e.id });
  }
  ev.sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
  return { ev, cs, es };
}

function cardEvento(e, atrasado = false) {
  const dica = atrasado
    ? { consulta: 'Já passou — registre como foi', exame: 'Já passou — o exame foi feito?', resultado: 'O resultado já deve estar pronto' }[e.tipo]
    : e.sub;
  const prefixo = [atrasado ? fmtCurta(e.data) : '', e.hora].filter(Boolean).join(' · ');
  return `<a class="card ${e.tipo} ${atrasado ? 'atrasado' : ''}" href="${e.link}">
    <div class="card-ic">${ICONE[e.tipo]}</div>
    <div class="card-corpo"><strong>${esc(e.titulo)}</strong><small>${esc([prefixo, dica].filter(Boolean).join(' · '))}</small></div>
    <span class="seta">›</span></a>`;
}

async function telaAgenda() {
  const { ev, es } = await eventos();
  const h = hoje();
  const atrasados = ev.filter((e) => e.data < h);
  const proximos = ev.filter((e) => e.data >= h);
  const semData = es.filter((e) => e.status === 'solicitado');
  let html = '';

  if ('Notification' in window && Notification.permission === 'default') {
    html += `<div class="aviso">🔔 Quer receber avisos antes das consultas e exames?
      <button class="btn pequeno" id="ativar-avisos">Ativar avisos</button></div>`;
  }
  if (!ev.length && !semData.length) {
    html += vazio('Nada agendado ainda', 'Comece cadastrando sua próxima consulta.', '#/consulta/nova', '+ Nova consulta');
  }
  if (atrasados.length || semData.length) {
    html += '<h2 class="secao alerta">⚠️ Precisa da sua atenção</h2>';
    html += atrasados.map((e) => cardEvento(e, true)).join('');
    html += semData.map((e) => `<a class="card exame" href="#/exame/${e.id}"><div class="card-ic">🧪</div>
      <div class="card-corpo"><strong>${esc(e.nome)}</strong><small>Pedido por ${esc(e.medico || '—')} · ainda sem data marcada</small></div>
      <span class="seta">›</span></a>`).join('');
  }
  if (proximos.length) {
    html += '<h2 class="secao">Próximos compromissos</h2>';
    let dia = '';
    for (const e of proximos) {
      if (e.data !== dia) { dia = e.data; html += `<h3 class="dia">${relativo(e.data)} · ${fmtData(e.data)}</h3>`; }
      html += cardEvento(e);
    }
  }
  html += botaoFlutuante('#/consulta/nova', '+ Consulta');
  render(html, 'Agenda');
  const b = $('#ativar-avisos');
  if (b) b.onclick = async () => { await pedirPermissaoAvisos(); telaAgenda(); };
}

// ===================== Consultas =====================
const cardConsulta = (c) => `<a class="card consulta ${c.status}" href="#/consulta/${c.id}">
  <div class="card-ic">🩺</div>
  <div class="card-corpo"><strong>${esc(c.medico || 'Consulta')}</strong>
    <small>${fmtCurta(c.data)}${c.hora ? ' · ' + esc(c.hora) : ''}${c.especialidade ? ' · ' + esc(c.especialidade) : ''}</small></div>
  <span class="badge ${c.status}">${STATUS_CONSULTA[c.status]}</span></a>`;

async function telaConsultas() {
  const cs = await DB.todos('consultas');
  const ordem = (c) => (c.data || '') + (c.hora || '');
  const agendadas = cs.filter((c) => c.status === 'agendada').sort((a, b) => ordem(a).localeCompare(ordem(b)));
  const outras = cs.filter((c) => c.status !== 'agendada').sort((a, b) => ordem(b).localeCompare(ordem(a)));
  let html = '';
  if (!cs.length) html = vazio('Nenhuma consulta', 'Cadastre sua primeira consulta.', '#/consulta/nova', '+ Nova consulta');
  if (agendadas.length) html += '<h2 class="secao">Agendadas</h2>' + agendadas.map(cardConsulta).join('');
  if (outras.length) html += '<h2 class="secao">Histórico</h2>' + outras.map(cardConsulta).join('');
  html += botaoFlutuante('#/consulta/nova', '+ Consulta');
  render(html, 'Consultas');
}

async function telaConsulta(id) {
  const c = await DB.pegar('consultas', id);
  if (!c) return naoEncontrado();
  const anexos = await anexosDe('consulta', id);
  const todosExames = await DB.todos('exames');
  const exames = todosExames.filter((e) => e.consultaId === id);
  const retornoDe = todosExames.filter((e) => (c.retornoDe || []).includes(e.id));

  render(`<div class="detalhe">
    <div class="cabeca">
      <span class="badge ${c.status}">${STATUS_CONSULTA[c.status]}</span>
      <h2>${esc(c.medico || 'Consulta')}</h2>
      <p>${esc([c.especialidade, c.local].filter(Boolean).join(' · '))}</p>
      <p class="quando">📅 ${fmtData(c.data)}${c.hora ? ' às ' + esc(c.hora) : ''}</p>
    </div>

    ${c.status === 'agendada' ? `<div class="acoes">
      <button class="btn primario" id="realizada">✓ Consulta realizada</button>
      <button class="btn" id="ics">🔔 Lembrete no calendário</button></div>` : ''}

    ${c.assunto ? `<div class="bloco"><h3>O que falar / pedir</h3><p class="texto">${esc(c.assunto)}</p></div>` : ''}
    ${retornoDe.length ? `<div class="bloco"><h3>Retorno para mostrar os resultados de</h3>${retornoDe.map(cardExame).join('')}</div>` : ''}
    ${c.anotacoes ? `<div class="bloco"><h3>Anotações da consulta</h3><p class="texto">${esc(c.anotacoes)}</p></div>` : ''}

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
      <a class="btn" href="#/consulta/${id}/editar">✏️ Editar</a>
      <button class="btn perigo" id="excluir">🗑️ Excluir</button>
    </div>
  </div>`, 'Consulta', true);

  ligarAnexos(anexos, 'consulta', id, () => telaConsulta(id));
  const bReal = $('#realizada');
  if (bReal) bReal.onclick = async () => {
    c.status = 'realizada';
    await DB.salvar('consultas', c);
    toast('Consulta registrada! Agora anexe os pedidos de exame e receitas.');
    telaConsulta(id);
  };
  const bIcs = $('#ics');
  if (bIcs) bIcs.onclick = () => baixarICS({ chave: 'c-' + c.id, data: c.data, hora: c.hora,
    titulo: `Consulta${c.medico ? ' com ' + c.medico : ''}`, local: c.local, descricao: c.assunto });
  $('#excluir').onclick = async () => {
    if (!confirm('Excluir esta consulta e seus documentos? (Os exames pedidos nela serão mantidos.)')) return;
    for (const a of anexos) await DB.apagar('anexos', a.id);
    await DB.apagar('consultas', id);
    toast('Consulta excluída');
    location.hash = '#/consultas';
  };
}

async function telaFormConsulta(id, q = {}) {
  let c = id ? await DB.pegar('consultas', id) : { status: 'agendada', data: hoje() };
  if (id && !c) return naoEncontrado();

  // Vindo da tela de um médico: já preenche os dados dele
  if (!id && q.medico) {
    const m = await DB.pegar('medicos', q.medico);
    if (m) c = { ...c, data: '', medico: m.nome, especialidade: m.especialidade, local: m.local };
  }

  // Retorno: preenche com o médico que pediu o exame e junta os exames da mesma consulta já com resultado
  if (!id && q.retorno) {
    const e = await DB.pegar('exames', q.retorno);
    if (e) {
      const consultas = await DB.todos('consultas');
      const jaTemRetorno = new Set(consultas.flatMap((x) => x.retornoDe || []));
      const irmaos = e.consultaId
        ? (await DB.todos('exames')).filter((x) => x.consultaId === e.consultaId && x.status === 'resultado' && !jaTemRetorno.has(x.id))
        : [];
      const lista = irmaos.some((x) => x.id === e.id) ? irmaos : [e, ...irmaos];
      const origem = e.consultaId ? consultas.find((x) => x.id === e.consultaId) : null;
      c = { ...c, data: '', medico: e.medico, especialidade: e.especialidade, local: origem?.local || '',
        assunto: `Retorno: mostrar resultado de ${lista.map((x) => x.nome).join(', ')}`, retornoDe: lista.map((x) => x.id) };
    }
  }

  render(`<form id="form" class="form">
    ${campo('Data', 'data', c.data, { tipo: 'date', obrigatorio: true })}
    ${campo('Hora', 'hora', c.hora, { tipo: 'time' })}
    ${campo('Médico(a)', 'medico', c.medico, { lista: 'dl-medicos', dica: 'Nome do médico que fará a consulta' })}
    ${campo('Especialidade', 'especialidade', c.especialidade, { lista: 'dl-esp', dica: 'Preenchida ao escolher um médico cadastrado' })}
    ${campo('Local', 'local', c.local, { lista: 'dl-locais', dica: 'Onde será a consulta (clínica, posto, hospital)' })}
    ${campo('O que falar / pedir na consulta', 'assunto', c.assunto, { linhas: 4, dica: 'Sintomas, dúvidas e pedidos para levar à consulta' })}
    ${id ? selecao('Situação', 'status', STATUS_CONSULTA, c.status) : ''}
    ${id ? campo('Anotações (o que o médico disse)', 'anotacoes', c.anotacoes, { linhas: 4 }) : ''}
    <div class="acoes"><button class="btn primario" type="submit">Salvar</button>
      <button class="btn" type="button" onclick="history.back()">Cancelar</button></div>
    ${await sugestoes()}
  </form>`, id ? 'Editar consulta' : 'Nova consulta', true);

  await ligarAutoMedico($('#form'), true);
  $('#form').onsubmit = async (ev) => {
    ev.preventDefault();
    const dados = lerForm(ev.target);
    const novo = { ...c, ...dados, id: c.id || novoId(), criadoEm: c.criadoEm || Date.now() };
    await DB.salvar('consultas', novo);
    await registrarMedico(novo.medico, novo);
    toast('Consulta salva ✓');
    if (!id && 'Notification' in window && Notification.permission === 'default') pedirPermissaoAvisos();
    location.hash = '#/consulta/' + novo.id;
  };
}

// ===================== Exames =====================
function cardExame(e) {
  return `<a class="card exame" href="#/exame/${e.id}">
    <div class="card-ic">🧪</div>
    <div class="card-corpo"><strong>${esc(e.nome)}</strong>
      <small>${esc([e.medico, e.especialidade].filter(Boolean).join(' · ') || '—')}</small></div>
    <span class="badge ${e.status}">${STATUS_EXAME[e.status]}</span></a>`;
}

async function telaExames(_, q = {}) {
  const filtro = q.filtro || 'todos';
  const es = (await DB.todos('exames')).sort((a, b) => (b.dataSolicitacao || '').localeCompare(a.dataSolicitacao || ''));
  const filtros = { todos: 'Todos', solicitado: 'Sem data', marcado: 'Marcados', realizado: 'Aguardando', resultado: 'Concluídos' };
  const lista = filtro === 'todos' ? es : es.filter((e) => e.status === filtro);
  let html = `<div class="chips">${Object.entries(filtros).map(([k, v]) =>
    `<a class="chip ${k === filtro ? 'ativo' : ''}" href="#/exames?filtro=${k}">${v}</a>`).join('')}</div>`;
  if (!es.length) html += vazio('Nenhum exame', 'Os pedidos de exame ficam ligados à consulta em que foram pedidos. Você também pode cadastrar um avulso.', '#/exame/novo', '+ Novo pedido de exame');
  else if (!lista.length) html += '<p class="mudo centro">Nenhum exame nesta situação.</p>';
  html += lista.map(cardExame).join('');
  html += botaoFlutuante('#/exame/novo', '+ Exame');
  render(html, 'Exames');
}

async function telaExame(id) {
  const e = await DB.pegar('exames', id);
  if (!e) return naoEncontrado();
  const anexos = await anexosDe('exame', id);
  const origem = e.consultaId ? await DB.pegar('consultas', e.consultaId) : null;
  const retornos = (await DB.todos('consultas')).filter((c) => (c.retornoDe || []).includes(id));
  const passo = PASSOS.indexOf(e.status);
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
      <button class="btn" id="ics" type="button">🔔 Lembrete no calendário</button></div>
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
        : `<p>Próximo passo: levar o resultado para ${esc(e.medico || 'o médico que pediu')}.</p>
           <a class="btn primario" href="#/consulta/nova?retorno=${id}">📅 Agendar retorno</a>`}
    </div>`;
  }

  render(`<div class="detalhe">
    <div class="cabeca">
      <span class="badge ${e.status}">${STATUS_EXAME[e.status]}</span>
      <h2>${esc(e.nome)}</h2>
      <p>Pedido por ${esc(e.medico || '—')}${e.especialidade ? ' · ' + esc(e.especialidade) : ''}</p>
      <p class="mudo">Solicitado em ${fmtCurta(e.dataSolicitacao)}</p>
      ${origem ? `<a class="link" href="#/consulta/${origem.id}">Ver consulta de origem (${fmtCurta(origem.data)})</a>` : ''}
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
  if (laudo) laudo.onchange = () => ($('#laudo-nome').textContent = [...laudo.files].map((f) => f.name).join(', '));

  const bIcs = $('#ics');
  if (bIcs) bIcs.onclick = () => baixarICS(e.status === 'marcado'
    ? { chave: 'e-' + id, data: e.dataExame, hora: e.horaExame, titulo: `Exame: ${e.nome}`, local: e.localExame, descricao: `Pedido por ${e.medico || ''}` }
    : { chave: 'r-' + id, data: e.dataResultado, hora: e.horaResultado, titulo: `Buscar resultado: ${e.nome}`, local: e.localResultado, descricao: '' });

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

  $('#excluir').onclick = async () => {
    if (!confirm('Excluir este exame e seus arquivos?')) return;
    for (const a of anexos) await DB.apagar('anexos', a.id);
    await DB.apagar('exames', id);
    toast('Exame excluído');
    history.back();
  };
}

async function telaFormExame(id, q = {}) {
  let e = id ? await DB.pegar('exames', id) : { status: 'solicitado', dataSolicitacao: hoje() };
  if (id && !e) return naoEncontrado();
  if (!id && q.consulta) {
    const c = await DB.pegar('consultas', q.consulta);
    if (c) e = { ...e, consultaId: c.id, medico: c.medico, especialidade: c.especialidade, dataSolicitacao: c.data };
  }

  render(`<form id="form" class="form">
    ${!id ? '<p class="mudo">Dica: tire uma foto do pedido. Os dados do médico já vêm da consulta.</p>' : ''}
    ${campo('Qual exame?', 'nome', e.nome, { obrigatorio: true, lista: 'dl-exames', dica: 'Nome do exame como está no pedido' })}
    ${campo('Médico(a) que pediu', 'medico', e.medico, { lista: 'dl-medicos', dica: 'Nome do médico que solicitou o exame' })}
    ${campo('Especialidade', 'especialidade', e.especialidade, { lista: 'dl-esp', dica: 'Preenchida ao escolher um médico cadastrado' })}
    ${campo('Data da solicitação', 'dataSolicitacao', e.dataSolicitacao, { tipo: 'date' })}
    ${!id ? `<label class="btn">📷 Foto ou PDF do pedido<input type="file" id="pedido" accept="image/*,application/pdf" multiple hidden></label>
      <p class="mudo" id="pedido-nome"></p>` : ''}
    ${!id ? `<details class="mais-campos"><summary>Já marquei o exame</summary>
      ${campo('Data do exame', 'dataExame', e.dataExame, { tipo: 'date' })}
      ${campo('Hora', 'horaExame', e.horaExame, { tipo: 'time' })}
      ${campo('Local', 'localExame', e.localExame, { lista: 'dl-locais' })}</details>` : ''}
    ${id ? `
      ${selecao('Situação', 'status', STATUS_EXAME, e.status)}
      ${campo('Data do exame', 'dataExame', e.dataExame, { tipo: 'date' })}
      ${campo('Hora do exame', 'horaExame', e.horaExame, { tipo: 'time' })}
      ${campo('Local do exame', 'localExame', e.localExame, { lista: 'dl-locais' })}
      ${campo('Data para buscar resultado', 'dataResultado', e.dataResultado, { tipo: 'date' })}
      ${campo('Hora', 'horaResultado', e.horaResultado, { tipo: 'time' })}
      ${campo('Local para buscar resultado', 'localResultado', e.localResultado, { lista: 'dl-locais' })}
      ${campo('Resumo do resultado', 'resumo', e.resumo, { linhas: 3 })}` : ''}
    ${campo('Observações', 'observacoes', e.observacoes, { linhas: 2, dica: 'Preparo e cuidados (jejum, suspender remédio...)' })}
    <div class="acoes"><button class="btn primario" type="submit">Salvar</button>
      <button class="btn" type="button" onclick="history.back()">Cancelar</button></div>
    ${await sugestoes()}
  </form>`, id ? 'Editar exame' : 'Novo pedido de exame', true);

  const pedido = $('#pedido');
  if (pedido) pedido.onchange = () => ($('#pedido-nome').textContent = [...pedido.files].map((f) => f.name).join(', '));

  await ligarAutoMedico($('#form'));
  $('#form').onsubmit = async (ev) => {
    ev.preventDefault();
    const dados = lerForm(ev.target);
    const novo = { ...e, ...dados, id: e.id || novoId(), criadoEm: e.criadoEm || Date.now() };
    if (!id && novo.dataExame) novo.status = 'marcado';
    await DB.salvar('exames', novo);
    await registrarMedico(novo.medico, { especialidade: novo.especialidade });
    if (pedido?.files.length) await salvarArquivos(pedido.files, 'exame', novo.id, 'pedido');
    toast('Pedido de exame salvo ✓');
    // Vindo de uma consulta, volta para ela (facilita cadastrar vários pedidos seguidos)
    location.hash = !id && q.consulta ? '#/consulta/' + q.consulta : '#/exame/' + novo.id;
  };
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
  if (reg) reg.showNotification(titulo, { body: corpo, icon: 'icon.svg' });
  else new Notification(titulo, { body: corpo, icon: 'icon.svg' });
}

// Avisa 1 dia e 2 horas antes (enquanto o app estiver aberto ou em segundo plano)
async function verificarLembretes() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const { ev } = await eventos();
  let avisados = {};
  try { avisados = JSON.parse(localStorage.getItem('avisados') || '{}'); } catch { }
  const agora = Date.now();
  for (const e of ev) {
    const falta = quando(e.data, e.hora).getTime() - agora;
    if (falta <= 0) continue;
    const janela = falta <= 2 * 3600000 ? '2h' : falta <= 24 * 3600000 ? '1d' : null;
    const k = `${e.chave}|${e.data}|${e.hora || ''}|${janela}`;
    if (!janela || avisados[k]) continue;
    avisados[k] = 1;
    mostrarAviso(e.titulo, `${relativo(e.data)}${e.hora ? ' às ' + e.hora : ''}${e.local ? ' · ' + e.local : ''}`);
  }
  try { localStorage.setItem('avisados', JSON.stringify(avisados)); } catch { }
}

// ===================== Mais (backup, avisos, sobre) =====================
const blobParaTexto = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });

async function exportarBackup() {
  const [consultas, exames, anexos, medicos] = await Promise.all(['consultas', 'exames', 'anexos', 'medicos'].map((t) => DB.todos(t)));
  const anexosTexto = await Promise.all(anexos.map(async ({ blob, ...a }) => ({ ...a, dados: await blobParaTexto(blob) })));
  const json = JSON.stringify({ app: 'diario-saude', versao: 2, criadoEm: new Date().toISOString(), consultas, exames, medicos, anexos: anexosTexto });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `backup-diario-saude-${hoje()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup gerado ✓ Guarde o arquivo em local seguro.');
}

async function importarBackup(arquivo) {
  let dados;
  try { dados = JSON.parse(await arquivo.text()); } catch { return toast('Arquivo inválido'); }
  if (dados.app !== 'diario-saude') return toast('Este arquivo não é um backup do Diário de Saúde');
  if (!confirm('Restaurar o backup vai SUBSTITUIR todos os dados atuais. Continuar?')) return;
  for (const t of TABELAS) await DB.limpar(t);
  for (const c of dados.consultas || []) await DB.salvar('consultas', c);
  for (const e of dados.exames || []) await DB.salvar('exames', e);
  for (const m of dados.medicos || []) await DB.salvar('medicos', m);
  for (const { dados: d, ...a } of dados.anexos || []) await DB.salvar('anexos', { ...a, blob: await (await fetch(d)).blob() });
  await sincronizarMedicos();
  toast('Backup restaurado ✓');
  location.hash = '#/agenda';
}

async function telaMais() {
  const perm = 'Notification' in window ? Notification.permission : 'indisponivel';
  const txtPerm = { granted: '✅ Ativados', denied: '🚫 Bloqueados (libere nas configurações do navegador)', default: 'Desativados', indisponivel: 'Não suportado neste navegador' }[perm];
  const nMedicos = (await DB.todos('medicos')).length;
  render(`<a class="card" href="#/medicos"><div class="card-ic">👩‍⚕️</div>
      <div class="card-corpo"><strong>Médicos</strong><small>${nMedicos} cadastrado(s) · nome, especialidade e registro</small></div>
      <span class="seta">›</span></a>
    <div class="bloco"><h3>🔔 Avisos</h3><p>Situação: ${txtPerm}</p>
      ${perm === 'default' ? '<button class="btn primario" id="ativar">Ativar avisos</button>' : ''}
      <p class="mudo">Dica: para ter certeza de que será lembrado, use o botão "Lembrete no calendário" em cada consulta ou exame.</p></div>
    <div class="bloco"><h3>💾 Backup</h3>
      <p class="mudo">Seus dados ficam salvos somente neste aparelho. Faça backup de vez em quando.</p>
      <div class="acoes"><button class="btn primario" id="exportar">⬇️ Gerar backup</button>
      <label class="btn">⬆️ Restaurar backup<input type="file" id="importar" accept="application/json,.json" hidden></label></div></div>
    <div class="bloco"><h3>📱 Instalar no celular</h3>
      <p class="mudo">Abra o app no navegador do celular e use "Adicionar à tela inicial" (Chrome: menu ⋮; iPhone: botão Compartilhar).</p></div>
    <div class="bloco"><h3>🚧 Em breve</h3><ul class="mudo">
      <li>Leitura automática dos pedidos e laudos (preenche os campos sozinho)</li>
      <li>Gráficos da evolução dos valores dos exames de sangue</li>
      <li>Remédios em uso e horários</li></ul></div>`, 'Mais');
  const b = $('#ativar');
  if (b) b.onclick = async () => { await pedirPermissaoAvisos(); telaMais(); };
  $('#exportar').onclick = exportarBackup;
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
  [/^#\/exames$/, telaExames],
  [/^#\/exame\/novo$/, (_, q) => telaFormExame(null, q)],
  [/^#\/exame\/(\w+)\/editar$/, (id) => telaFormExame(id)],
  [/^#\/exame\/(\w+)$/, telaExame],
  [/^#\/medicos$/, telaMedicos],
  [/^#\/medico\/novo$/, () => telaFormMedico(null)],
  [/^#\/medico\/(\w+)\/editar$/, (id) => telaFormMedico(id)],
  [/^#\/medico\/(\w+)$/, telaMedico],
  [/^#\/relatorios$/, telaRelatorios],
  [/^#\/relatorios\/medicos$/, telaRelMedicos],
  [/^#\/relatorios\/especialidades$/, telaRelEspecialidades],
  [/^#\/relatorios\/exames$/, telaRelExames],
  [/^#\/relatorios\/linha$/, telaRelLinha],
  [/^#\/mais$/, telaMais],
];

async function navegar() {
  const [caminho, busca] = (location.hash || '#/agenda').split('?');
  const q = Object.fromEntries(new URLSearchParams(busca || ''));
  const aba = { consulta: 'consultas', exame: 'exames', medico: 'mais', medicos: 'mais' }[caminho.split('/')[1]] || caminho.split('/')[1];
  document.querySelectorAll('.abas a').forEach((a) => a.classList.toggle('ativa', a.dataset.aba === aba));
  for (const [regra, tela] of ROTAS) {
    const m = caminho.match(regra);
    if (!m) continue;
    try { await tela(m[1], q); } catch (err) {
      console.error(err);
      render(`<p class="erro">Ops, algo deu errado: ${esc(err.message)}</p>`, 'Erro');
    }
    return;
  }
  location.hash = '#/agenda';
}

$('#voltar').onclick = () => history.back();
window.addEventListener('hashchange', navegar);
sincronizarMedicos().catch(console.error).finally(navegar);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
verificarLembretes();
setInterval(verificarLembretes, 5 * 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) verificarLembretes(); });
