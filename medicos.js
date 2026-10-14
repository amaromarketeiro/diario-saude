'use strict';
// Cadastro de médicos: nome, especialidade, registro profissional (CRM, CRO...), telefone e local de atendimento.

// "Dra. Alessandra", "dra alessandra" e "Alessandra" são considerados o mesmo médico
const normalizar = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^(dra?|dr\(a\))\.?\s+/, '').replace(/\s+/g, ' ');
const acharMedico = (medicos, nome) => { const n = normalizar(nome); return n ? medicos.find((m) => normalizar(m.nome) === n) : null; };

// Garante que todo médico usado em consultas/exames esteja no cadastro
async function registrarMedico(nome, dados = {}, medicos = null) {
  if (!normalizar(nome)) return;
  medicos = medicos || await DB.todos('medicos');
  const m = acharMedico(medicos, nome);
  if (m) {
    let mudou = false;
    for (const k of ['especialidade', 'local']) if (!m[k] && dados[k]) { m[k] = dados[k]; mudou = true; }
    if (mudou) await DB.salvar('medicos', m);
    return;
  }
  const novo = { id: novoId(), nome: nome.trim(), especialidade: dados.especialidade || '', local: dados.local || '',
    registro: '', telefone: '', criadoEm: Date.now(), atualizadoEm: Date.now() };
  medicos.push(novo);
  await DB.salvar('medicos', novo);
}

async function sincronizarMedicos() {
  const [cs, es, ms] = await Promise.all([DB.todos('consultas'), DB.todos('exames'), DB.todos('medicos')]);
  for (const c of cs) await registrarMedico(c.medico, c, ms);
  for (const e of es) await registrarMedico(e.medico, { especialidade: e.especialidade }, ms);
}

// Ao escolher o médico no formulário, preenche a especialidade (e o local, se estiver vazio)
async function ligarAutoMedico(form, comLocal = false) {
  const medicos = await DB.todos('medicos');
  const campoMed = form.elements.medico;
  campoMed.addEventListener('input', () => {
    const m = acharMedico(medicos, campoMed.value);
    if (!m) return;
    if (m.especialidade) form.elements.especialidade.value = m.especialidade;
    if (comLocal && m.local && !form.elements.local.value) form.elements.local.value = m.local;
  });
}

const cardMedico = (m, detalhe = '') => `<a class="card" href="#/medico/${m.id}">
  <div class="card-ic">👩‍⚕️</div>
  <div class="card-corpo"><strong>${esc(m.nome)}</strong>
    <small>${esc([m.especialidade, m.registro].filter(Boolean).join(' · ') || 'Especialidade não informada')}</small>
    ${detalhe ? `<small>${detalhe}</small>` : ''}</div>
  <span class="seta">›</span></a>`;

async function telaMedicos() {
  const ms = (await DB.todos('medicos')).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  let html = ms.length
    ? '<p class="mudo">Ao escolher um destes médicos numa consulta ou exame, a especialidade é preenchida sozinha.</p>'
    : vazio('Nenhum médico cadastrado', 'Cadastre os médicos que você consulta. Médicos digitados nas consultas também entram aqui sozinhos.', '#/medico/novo', '+ Cadastrar médico');
  html += ms.map((m) => cardMedico(m)).join('');
  html += botaoFlutuante('#/medico/novo', '+ Médico');
  render(html, 'Médicos', true);
}

async function telaMedico(id) {
  const m = await DB.pegar('medicos', id);
  if (!m) return naoEncontrado();
  const [cs, es] = await Promise.all([DB.todos('consultas'), DB.todos('exames')]);
  const n = normalizar(m.nome);
  // Respeita o filtro de familiar: médicos são da família toda, o histórico é de cada um
  const consultas = doFiltro(cs).filter((c) => normalizar(c.medico) === n);
  const exames = doFiltro(es).filter((e) => normalizar(e.medico) === n);
  const realizadas = consultas.filter((c) => c.status === 'realizada');
  const proxima = consultas.filter((c) => c.status === 'agendada' && c.data >= hoje()).sort((a, b) => a.data.localeCompare(b.data))[0];

  render(`${seletorFamilia()}<div class="detalhe">
    <div class="cabeca">
      <h2>${esc(m.nome)}</h2>
      <p>${esc(m.especialidade || 'Especialidade não informada')}</p>
      ${m.registro ? `<p class="mudo">Registro: ${esc(m.registro)}</p>` : ''}
      ${m.telefone ? `<p>📞 <a class="link" href="tel:${esc(m.telefone)}">${esc(m.telefone)}</a></p>` : ''}
      ${m.local ? `<p>📍 ${esc(m.local)}</p>` : ''}
    </div>
    <div class="numeros">
      ${numero(realizadas.length, 'consultas realizadas')}
      ${numero(exames.length, 'exames pedidos')}
    </div>
    ${proxima ? `<div class="bloco"><h3>Próxima consulta</h3>${cardConsulta(proxima)}</div>` : ''}
    <div class="acoes"><a class="btn primario" href="#/consulta/nova?medico=${id}">📅 Agendar consulta</a></div>
    <div class="bloco"><h3>Histórico com este médico${filtroAtual() !== 'todos' ? ' · ' + esc(nomeFamiliar(filtroAtual())) : ''}</h3>${listaLinhaDoTempo(linhaDoTempo(consultas, exames))}</div>
    <div class="acoes rodape">
      <a class="btn" href="#/medico/${id}/editar">✏️ Editar</a>
      <button class="btn perigo" id="excluir">🗑️ Excluir</button>
    </div>
  </div>`, 'Médico', true);

  $('#excluir').onclick = async () => {
    if (!confirm('Excluir o cadastro deste médico? As consultas e exames dele continuam salvos.')) return;
    await DB.apagar('medicos', id);
    toast('Médico excluído');
    location.hash = '#/medicos';
  };
}

async function telaFormMedico(id) {
  const m = id ? await DB.pegar('medicos', id) : {};
  if (id && !m) return naoEncontrado();

  render(`<form id="form" class="form">
    ${campo('Nome do médico', 'nome', m.nome, { obrigatorio: true, dica: 'Nome completo do profissional' })}
    ${campo('Especialidade', 'especialidade', m.especialidade, { lista: 'dl-esp', dica: 'Área de atuação do médico' })}
    ${campo('Registro profissional (opcional)', 'registro', m.registro, { dica: 'CRM, CRO, CRP... com estado e número' })}
    ${campo('Telefone (opcional)', 'telefone', m.telefone, { tipo: 'tel', dica: 'Telefone do consultório' })}
    ${campo('Local de atendimento (opcional)', 'local', m.local, { lista: 'dl-locais', dica: 'Clínica, posto ou hospital onde atende' })}
    <div class="acoes"><button class="btn primario" type="submit">Salvar</button>
      <button class="btn" type="button" onclick="history.back()">Cancelar</button></div>
    ${await sugestoes()}
  </form>`, id ? 'Editar médico' : 'Novo médico', true);

  $('#form').onsubmit = async (ev) => {
    ev.preventDefault();
    const dados = lerForm(ev.target);
    const outro = acharMedico(await DB.todos('medicos'), dados.nome);
    if (outro && outro.id !== id) return toast('Já existe um médico cadastrado com esse nome');
    const novo = { ...m, ...dados, id: m.id || novoId(), criadoEm: m.criadoEm || Date.now() };
    await DB.salvar('medicos', novo);
    // Se o nome mudou, atualiza nas consultas e exames
    if (id && normalizar(m.nome) !== normalizar(novo.nome)) {
      for (const t of ['consultas', 'exames']) {
        for (const x of await DB.todos(t)) {
          if (normalizar(x.medico) === normalizar(m.nome)) { x.medico = novo.nome; await DB.salvar(t, x); }
        }
      }
    }
    toast('Médico salvo ✓');
    location.hash = '#/medico/' + novo.id;
  };
}
