'use strict';
// Núcleo do app: regras de negócio sem telas (migração, pendências, retornos, jornadas, backup).
// Fica separado das telas para poder ser testado em testes.html.

const VERSAO_ESQUEMA = 3;

// ===================== Utilidades básicas =====================
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = (n) => String(n).padStart(2, '0');
const paraISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => paraISO(new Date());
function lerData(s) { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); }
const dataBR = (s) => (s ? s.split('-').reverse().join('/') : '');

// ===================== Familiares =====================
const CORES_FAMILIA = ['#0f766e', '#2563eb', '#c026d3', '#ea580c', '#16a34a', '#dc2626', '#7c3aed', '#0891b2'];
const VINCULOS = ['Titular', 'Cônjuge', 'Filho(a)', 'Mãe', 'Pai', 'Irmão(ã)', 'Avó / Avô', 'Neto(a)', 'Outro'];

function criarFamiliar(d = {}, agora = Date.now()) {
  return { id: novoId(), nome: d.nome || 'Eu', apelido: d.apelido || '', vinculo: d.vinculo || '', nascimento: d.nascimento || '',
    cor: d.cor || CORES_FAMILIA[0], principal: !!d.principal, status: 'ativo', criadoEm: agora, atualizadoEm: agora };
}

// ===================== Conversão / migração de dados =====================
// Recebe os dados de qualquer versão (1, 2 ou 3) e devolve dados no formato da versão 3.
// - Não apaga nenhum registro.
// - Idempotente: aplicada sobre dados já convertidos, não muda nada.
// - Os avisos citam apenas ids, nunca conteúdo médico.
function converterDados(entrada, agora = Date.now()) {
  const rel = { familiarCriado: false, consultasVinculadas: 0, examesVinculados: 0, examesCorrigidos: 0,
    vinculosRemovidos: 0, origensDefinidas: 0, anexosSemDono: 0, avisos: [] };
  const familiares = (entrada.familiares || []).map((f) => ({ ...f }));
  const consultas = (entrada.consultas || []).map((c) => ({ ...c, retornoDe: Array.isArray(c.retornoDe) ? [...c.retornoDe] : [] }));
  const exames = (entrada.exames || []).map((e) => ({ ...e }));
  const medicos = (entrada.medicos || []).map((m) => ({ ...m }));
  const anexos = (entrada.anexos || []).map((a) => ({ ...a }));

  // 1. Perfil principal (exatamente um)
  let principal = familiares.find((f) => f.principal);
  if (!principal && familiares.length) {
    principal = familiares.find((f) => f.status !== 'arquivado') || familiares[0];
    principal.principal = true;
    rel.avisos.push(`Familiar ${principal.id} definido como perfil principal`);
  }
  if (!principal) {
    principal = criarFamiliar({ nome: 'Eu', vinculo: 'Titular', principal: true }, agora);
    familiares.push(principal);
    rel.familiarCriado = true;
  }
  familiares.forEach((f, i) => {
    if (f !== principal && f.principal) f.principal = false;
    if (f === principal && f.status === 'arquivado') f.status = 'ativo';
    f.status = f.status || 'ativo';
    f.cor = f.cor || CORES_FAMILIA[i % CORES_FAMILIA.length];
    f.criadoEm = f.criadoEm || agora;
    f.atualizadoEm = f.atualizadoEm || f.criadoEm;
  });
  const idsFamiliares = new Set(familiares.map((f) => f.id));

  // 2. Consultas sem familiar válido → perfil principal
  for (const c of consultas) {
    if (!idsFamiliares.has(c.pacienteId)) { c.pacienteId = principal.id; rel.consultasVinculadas++; }
  }
  const consultaPorId = new Map(consultas.map((c) => [c.id, c]));

  // 3. Exames: a consulta que pediu o exame define o familiar
  for (const e of exames) {
    if (e.consultaId && !consultaPorId.has(e.consultaId)) {
      rel.avisos.push(`Exame ${e.id}: consulta de origem ${e.consultaId} não existe; vínculo removido`);
      e.consultaId = null;
      rel.vinculosRemovidos++;
    }
    const origem = e.consultaId ? consultaPorId.get(e.consultaId) : null;
    if (origem) {
      if (e.pacienteId !== origem.pacienteId) {
        if (idsFamiliares.has(e.pacienteId)) {
          rel.examesCorrigidos++;
          rel.avisos.push(`Exame ${e.id}: familiar ajustado para o mesmo da consulta ${origem.id}`);
        } else rel.examesVinculados++;
        e.pacienteId = origem.pacienteId;
      }
    } else if (!idsFamiliares.has(e.pacienteId)) {
      e.pacienteId = principal.id;
      rel.examesVinculados++;
    }
  }
  const examePorId = new Map(exames.map((e) => [e.id, e]));

  // 4. Retornos: só exames do mesmo familiar; liga o retorno à consulta original
  for (const c of consultas) {
    const antes = c.retornoDe.length;
    c.retornoDe = c.retornoDe.filter((id) => examePorId.get(id)?.pacienteId === c.pacienteId);
    if (c.retornoDe.length !== antes) {
      rel.vinculosRemovidos += antes - c.retornoDe.length;
      rel.avisos.push(`Consulta ${c.id}: ${antes - c.retornoDe.length} vínculo(s) de retorno inválido(s) removido(s)`);
    }
    if (c.consultaOrigemId) {
      const o = consultaPorId.get(c.consultaOrigemId);
      if (!o || o.id === c.id || o.pacienteId !== c.pacienteId) {
        rel.avisos.push(`Consulta ${c.id}: consulta de origem inválida; vínculo removido`);
        c.consultaOrigemId = null;
        rel.vinculosRemovidos++;
      }
    }
    if (!c.consultaOrigemId && c.retornoDe.length) {
      const o = consultaPorId.get(examePorId.get(c.retornoDe[0]).consultaId);
      if (o && o.id !== c.id && o.pacienteId === c.pacienteId) { c.consultaOrigemId = o.id; rel.origensDefinidas++; }
    }
    if (!c.consultaOrigemId) c.consultaOrigemId = null;
  }

  // 5. Anexos sem dono são mantidos e sinalizados (nunca apagados)
  for (const a of anexos) {
    const existe = a.tipoDono === 'consulta' ? consultaPorId.has(a.idDono) : examePorId.has(a.idDono);
    if (!existe && !a.semDono) { a.semDono = true; rel.anexosSemDono++; rel.avisos.push(`Anexo ${a.id}: sem consulta/exame correspondente`); }
    if (existe && a.semDono) delete a.semDono;
  }

  return { dados: { familiares, consultas, exames, medicos, anexos }, relatorio: rel, principalId: principal.id };
}

const houveMudanca = (r) => r.familiarCriado || r.consultasVinculadas || r.examesVinculados || r.examesCorrigidos
  || r.vinculosRemovidos || r.origensDefinidas || r.anexosSemDono;

// Migra o banco do aparelho para a versão 3. Tudo numa única transação: ou migra tudo, ou nada.
// Antes, guarda uma cópia dos registros da v2 na tabela meta ("copia-v2").
async function migrarBanco() {
  const meta = await DB.pegar('meta', 'esquema');
  const brutos = Object.fromEntries(await Promise.all(TABELAS.map(async (t) => [t, await DB.todos(t)])));
  if (meta?.versao >= VERSAO_ESQUEMA && brutos.familiares.some((f) => f.principal)) return { jaMigrado: true };

  const { dados, relatorio } = converterDados(brutos);
  const temLegado = brutos.consultas.length || brutos.exames.length || brutos.medicos.length;
  const jaTemCopia = await DB.pegar('meta', 'copia-v2');
  await DB.lote([...TABELAS, 'meta'], (s) => {
    if (temLegado && !jaTemCopia) {
      s.meta.put({ id: 'copia-v2', criadoEm: Date.now(), versaoOrigem: meta?.versao || 2,
        consultas: brutos.consultas, exames: brutos.exames, medicos: brutos.medicos });
    }
    for (const t of ['familiares', 'consultas', 'exames', 'anexos']) for (const x of dados[t]) s[t].put(x);
    s.meta.put({ id: 'esquema', versao: VERSAO_ESQUEMA, migradoEm: Date.now(), versaoOrigem: meta?.versao || 2,
      resumo: { ...relatorio, avisos: relatorio.avisos.length } });
  });
  return { migrado: true, relatorio };
}

// ===================== Arquivamento =====================
// Registro com vínculos é arquivado (nunca excluído), para não quebrar o histórico.
function vinculosDaConsulta(c, cs, es, anexos) {
  const v = {
    exames: es.filter((e) => e.consultaId === c.id).length,
    documentos: anexos.filter((a) => a.tipoDono === 'consulta' && a.idDono === c.id).length,
    retornos: cs.filter((x) => x.consultaOrigemId === c.id).length,
    resultadosLevados: (c.retornoDe || []).length,
  };
  v.total = v.exames + v.documentos + v.retornos + v.resultadosLevados;
  return v;
}

function vinculosDoExame(e, cs, anexos) {
  const v = {
    documentos: anexos.filter((a) => a.tipoDono === 'exame' && a.idDono === e.id).length,
    retornos: cs.filter((c) => (c.retornoDe || []).includes(e.id)).length,
  };
  v.total = v.documentos + v.retornos;
  return v;
}

function descreverVinculos(v) {
  const partes = [];
  if (v.exames) partes.push(`${v.exames} exame(s) pedido(s)`);
  if (v.documentos) partes.push(`${v.documentos} documento(s) anexado(s)`);
  if (v.retornos) partes.push(`${v.retornos} retorno(s) ligado(s)`);
  if (v.resultadosLevados) partes.push(`${v.resultadosLevados} resultado(s) de exame levado(s)`);
  if (v.consultas) partes.push(`${v.consultas} consulta(s)`);
  return partes.join(', ');
}

const ativo = (x) => !x.arquivado;

// ===================== Pendências (sempre calculadas, nunca guardadas) =====================
function calcularPendencias(cs, es, h = hoje()) {
  cs = cs.filter(ativo);
  es = es.filter(ativo);
  const p = [];
  const ativas = cs.filter((c) => c.status !== 'cancelada');
  const examesComRetorno = new Set(ativas.flatMap((c) => c.retornoDe || []));
  const consultasComRetorno = new Set(ativas.map((c) => c.consultaOrigemId).filter(Boolean));
  const item = (tipo, x, o) => ({ tipo, id: x.id, pacienteId: x.pacienteId, atencao: true, ...o });

  for (const c of cs) {
    const titulo = `Consulta${c.medico ? ' com ' + c.medico : ''}`;
    if (c.status === 'agendada' && c.data && c.data < h) {
      p.push(item('consulta_sem_registro', c, { data: c.data, link: '#/consulta/' + c.id, icone: '🩺', titulo,
        texto: `${dataBR(c.data)} já passou: registre se foi realizada` }));
    }
    if (c.status === 'realizada' && c.retornoNecessario && !consultasComRetorno.has(c.id)) {
      p.push(item('retorno_nao_agendado', c, { data: c.prazoRetorno || c.data, link: '#/consulta/' + c.id, icone: '↩️', titulo,
        texto: c.prazoRetorno ? `Retorno pedido para até ${dataBR(c.prazoRetorno)}: ainda não agendado` : 'Retorno pedido: ainda não agendado' }));
    }
  }
  for (const e of es) {
    const titulo = e.nome || 'Exame';
    const link = '#/exame/' + e.id;
    if (e.status === 'solicitado') {
      p.push(item('exame_sem_data', e, { data: e.dataSolicitacao, link, icone: '🧪', titulo, texto: 'Pedido ainda sem data marcada' }));
    } else if (e.status === 'marcado' && e.dataExame && e.dataExame < h) {
      p.push(item('exame_nao_confirmado', e, { data: e.dataExame, link, icone: '🧪', titulo, texto: `Marcado para ${dataBR(e.dataExame)}: confirme se foi feito` }));
    } else if (e.status === 'realizado') {
      const pronto = !e.dataResultado || e.dataResultado <= h;
      p.push(item('aguardando_resultado', e, { data: e.dataResultado || e.dataExame, link, icone: '⏳', titulo, atencao: pronto,
        texto: e.dataResultado ? (pronto ? 'O resultado já deve estar pronto' : `Resultado previsto para ${dataBR(e.dataResultado)}`) : 'Aguardando resultado' }));
    } else if (e.status === 'resultado' && !examesComRetorno.has(e.id) && !e.resultadoApresentado) {
      p.push(item('resultado_nao_apresentado', e, { data: e.dataRecebido || e.dataExame, link, icone: '📄', titulo, texto: 'Resultado ainda não mostrado ao médico' }));
    }
    // Organização (não urgente): exame cadastrado sem a consulta que o pediu
    if (!e.consultaId) {
      p.push(item('exame_sem_consulta', e, { data: e.dataSolicitacao, link, icone: '🧩', titulo, atencao: false,
        texto: 'Solto: associe à consulta que pediu' }));
    }
  }
  return p.sort((a, b) => (a.data || '').localeCompare(b.data || ''));
}

const NOMES_PENDENCIA = {
  consulta_sem_registro: 'Consultas passadas sem registro',
  exame_sem_data: 'Pedidos de exame sem data',
  exame_nao_confirmado: 'Exames marcados não confirmados',
  aguardando_resultado: 'Exames aguardando resultado',
  resultado_nao_apresentado: 'Resultados não mostrados ao médico',
  retorno_nao_agendado: 'Retornos pedidos e não agendados',
  exame_sem_consulta: 'Exames soltos (sem consulta associada)',
};

// Associa um exame já cadastrado à consulta que o pediu. A consulta define quem pediu:
// o médico/especialidade dela prevalecem (os do exame só ficam se a consulta não tiver),
// e a data da consulta vira a data da solicitação. Retorna { exame } ou { erro }.
function associarExame(e, consulta, cs) {
  if (!consulta) return { erro: 'Consulta não encontrada.' };
  const novo = { ...e, consultaId: consulta.id,
    medico: consulta.medico || e.medico || '', especialidade: consulta.especialidade || e.especialidade || '',
    dataSolicitacao: consulta.data || e.dataSolicitacao };
  const erro = validarExame(novo, cs);
  return erro ? { erro } : { exame: novo };
}

// ===================== Retornos =====================
// Monta os dados iniciais de uma consulta de retorno. Junta os exames da mesma consulta de origem
// que já têm resultado e ainda não têm retorno, SEMPRE do mesmo familiar.
function prepararRetorno({ exameId, consultaOrigemId }, cs, es) {
  const jaTemRetorno = new Set(cs.filter((c) => c.status !== 'cancelada' && ativo(c)).flatMap((c) => c.retornoDe || []));
  es = es.filter((e) => ativo(e) || e.id === exameId);
  const exame = exameId ? es.find((e) => e.id === exameId) : null;
  let origem = consultaOrigemId ? cs.find((c) => c.id === consultaOrigemId) : null;
  if (!origem && exame?.consultaId) origem = cs.find((c) => c.id === exame.consultaId);
  const pacienteId = exame?.pacienteId || origem?.pacienteId;
  if (!pacienteId || (origem && exame && origem.pacienteId !== exame.pacienteId)) return null;

  const grupo = es.filter((e) => e.pacienteId === pacienteId && e.status === 'resultado' && !jaTemRetorno.has(e.id)
    && ((origem && e.consultaId === origem.id) || (exame && e.id === exame.id)));
  return {
    pacienteId,
    medico: exame?.medico || origem?.medico || '',
    especialidade: exame?.especialidade || origem?.especialidade || '',
    local: origem?.local || '',
    consultaOrigemId: origem?.id || null,
    retornoDe: grupo.map((e) => e.id),
    assunto: grupo.length ? `Retorno: mostrar resultado de ${grupo.map((e) => e.nome).join(', ')}` : 'Retorno',
  };
}

// ===================== Validações de vínculos (nunca misturar familiares) =====================
function validarConsulta(c, cs, es) {
  for (const id of c.retornoDe || []) {
    const e = es.find((x) => x.id === id);
    if (e && e.pacienteId !== c.pacienteId) return 'Não é possível juntar exames de familiares diferentes no mesmo retorno.';
  }
  if (c.consultaOrigemId) {
    const o = cs.find((x) => x.id === c.consultaOrigemId);
    if (o && o.pacienteId !== c.pacienteId) return 'A consulta de origem é de outro familiar.';
  }
  const retornos = cs.filter((x) => x.id !== c.id && x.consultaOrigemId === c.id && x.pacienteId !== c.pacienteId);
  if (retornos.length) return 'Esta consulta tem retornos ligados a ela. Troque o familiar dos retornos primeiro.';
  return null;
}

function validarExame(e, cs) {
  if (e.consultaId) {
    const c = cs.find((x) => x.id === e.consultaId);
    if (c && c.pacienteId !== e.pacienteId) return 'O exame precisa ser do mesmo familiar da consulta que o pediu.';
  }
  const retorno = cs.find((c) => (c.retornoDe || []).includes(e.id) && c.pacienteId !== e.pacienteId);
  if (retorno) return 'Este exame já está num retorno de outro familiar.';
  return null;
}

// ===================== Jornadas de atendimento (derivadas, sem tabela própria) =====================
function raizJornada(consultaId, cs) {
  const porId = new Map(cs.map((c) => [c.id, c]));
  let atual = porId.get(consultaId);
  const vistos = new Set();
  while (atual?.consultaOrigemId && porId.has(atual.consultaOrigemId) && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    atual = porId.get(atual.consultaOrigemId);
  }
  return atual || null;
}

function montarJornada(raizId, cs, es, anexos, vistos = new Set()) {
  const c = cs.find((x) => x.id === raizId);
  if (!c || vistos.has(c.id)) return null;
  vistos.add(c.id);
  const anexosDe = (tipo, id) => anexos.filter((a) => a.tipoDono === tipo && a.idDono === id);
  return {
    consulta: c,
    documentos: anexosDe('consulta', c.id),
    exames: es.filter((e) => e.consultaId === c.id).map((e) => ({ exame: e, anexos: anexosDe('exame', e.id) })),
    levouResultados: es.filter((e) => (c.retornoDe || []).includes(e.id)),
    retornos: cs.filter((x) => x.consultaOrigemId === c.id).sort((a, b) => (a.data || '').localeCompare(b.data || ''))
      .map((x) => montarJornada(x.id, cs, es, anexos, vistos)).filter(Boolean),
  };
}

// ===================== Backup =====================
async function sha256(texto) {
  if (!globalThis.crypto?.subtle) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const blobParaTexto = (blob) => new Promise((ok, erro) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => erro(new Error('Não foi possível ler um anexo'));
  r.readAsDataURL(blob);
});

function textoParaBlob(dataURL) {
  const [cabecalho, base64] = dataURL.split(',');
  const mime = (cabecalho.match(/^data:([^;,]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(base64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Pacote de backup v3: dados + contagem + hash SHA-256 para verificar integridade
async function montarBackup() {
  const dados = Object.fromEntries(await Promise.all(TABELAS.map(async (t) => [t, await DB.todos(t)])));
  dados.anexos = await Promise.all(dados.anexos.map(async ({ blob, ...a }) => ({ ...a, dados: await blobParaTexto(blob) })));
  const contagem = Object.fromEntries(TABELAS.map((t) => [t, dados[t].length]));
  const hash = await sha256(JSON.stringify(dados));
  return { app: 'diario-saude', formato: 3, versaoEsquema: VERSAO_ESQUEMA, criadoEm: new Date().toISOString(),
    contagem, integridade: hash ? { algoritmo: 'SHA-256', hash } : null, dados };
}

// Valida e converte um backup de qualquer versão. Lança Error com mensagem clara se houver problema.
async function prepararRestauracao(pacote) {
  if (!pacote || typeof pacote !== 'object' || pacote.app !== 'diario-saude') {
    throw new Error('Este arquivo não é um backup do Diário de Saúde.');
  }
  let brutos;
  if (pacote.formato === 3) {
    if (!pacote.dados || typeof pacote.dados !== 'object') throw new Error('O backup está incompleto (sem dados).');
    if (pacote.integridade?.hash) {
      const h = await sha256(JSON.stringify(pacote.dados));
      if (h && h !== pacote.integridade.hash) throw new Error('O backup está corrompido ou foi alterado: a verificação de integridade falhou.');
    }
    for (const [t, n] of Object.entries(pacote.contagem || {})) {
      if ((pacote.dados[t] || []).length !== n) throw new Error(`O backup está incompleto: faltam registros em "${t}".`);
    }
    brutos = pacote.dados;
  } else if (!pacote.formato && (pacote.versao || 1) <= 2) {
    brutos = { consultas: pacote.consultas, exames: pacote.exames, medicos: pacote.medicos, anexos: pacote.anexos, familiares: [] };
  } else {
    throw new Error('Este backup é de uma versão mais nova do app. Atualize o aplicativo antes de restaurar.');
  }
  for (const t of TABELAS) {
    if (brutos[t] !== undefined && !Array.isArray(brutos[t])) throw new Error(`O backup está danificado ("${t}" inválido).`);
    for (const x of brutos[t] || []) if (!x || typeof x.id !== 'string' || !x.id) throw new Error(`O backup tem um registro sem identificação em "${t}".`);
  }
  const anexos = (brutos.anexos || []).map(({ dados: d, ...a }) => {
    if (typeof d !== 'string' || !d.startsWith('data:')) throw new Error('Um anexo do backup está danificado.');
    return { ...a, blob: textoParaBlob(d) };
  });
  return converterDados({ ...brutos, anexos });
}

// Substitui todos os dados do aparelho pelos do backup, numa única transação
async function restaurarDados(dados) {
  await DB.lote([...TABELAS, 'meta'], (s) => {
    for (const t of TABELAS) {
      s[t].clear();
      for (const x of dados[t] || []) s[t].put(x);
    }
    s.meta.put({ id: 'esquema', versao: VERSAO_ESQUEMA, restauradoEm: Date.now() });
  });
}

// ===================== Dados de exemplo (um registro em cada etapa) =====================
// Cria um familiar fictício "Exemplo (teste)" com consultas, exames, resultados e retornos em todas as situações.
// Todos os registros levam exemplo: true, para poderem ser removidos sem tocar nos dados reais.
// imagem (opcional): Blob usado como foto de documento anexado.
function gerarExemplos(hojeISO = hoje(), imagem = null) {
  const dia = (n) => { const x = lerData(hojeISO); x.setDate(x.getDate() + n); return paraISO(x); };
  const agora = Date.now();
  const marca = { exemplo: true, criadoEm: agora, atualizadoEm: agora };
  const id = () => 'ex' + novoId();
  const fam = { ...criarFamiliar({ nome: 'Exemplo (teste)', apelido: 'Exemplo', vinculo: 'Outro', cor: '#7c3aed' }, agora), ...marca };
  const P = fam.id;
  const MED = { cli: ['Dra. Exemplo Clínica', 'Clínico geral', 'UBS Exemplo'], orto: ['Dr. Exemplo Ortopedista', 'Ortopedia', 'Policlínica Exemplo'],
    card: ['Dra. Exemplo Cardiologista', 'Cardiologia', 'Hospital Exemplo'] };
  const medicos = Object.values(MED).map(([nome, especialidade, local]) => ({ id: id(), nome, especialidade, local, registro: '', telefone: '', ...marca }));
  const C = (m, o) => ({ id: id(), pacienteId: P, status: 'agendada', hora: '09:00', medico: MED[m][0], especialidade: MED[m][1], local: MED[m][2],
    retornoDe: [], consultaOrigemId: null, ...marca, ...o });
  const E = (o) => ({ id: id(), pacienteId: P, status: 'solicitado', consultaId: null, ...marca, ...o });
  const it = (cod, valor, unidade, refMin = null, refMax = null, extra = {}) => ({ id: id(), cod, nome: ANALITO_NOME[cod] || cod, valor, texto: '', unidade, refMin, refMax, duvida: '', ...extra });
  const ANALITO_NOME = { glicose: 'Glicose', colesterol_total: 'Colesterol total', hdl: 'HDL', triglicerideos: 'Triglicerídeos', hemoglobina: 'Hemoglobina',
    creatinina: 'Creatinina', ecg_fc: 'Frequência cardíaca', ecg_pr: 'Intervalo PR', ecg_qrs: 'Duração do QRS', ecg_qtc: 'QTc', ecg_ritmo: 'Ritmo', conclusao: 'Conclusão do laudo' };
  const sangue = (g, col, hdl, tg, hb, extra = []) => [it('glicose', g, 'mg/dL', 70, 99), it('colesterol_total', col, 'mg/dL', null, 190, { refExclusiva: true }),
    it('hdl', hdl, 'mg/dL', 40, null, { refExclusiva: true }), it('triglicerideos', tg, 'mg/dL', null, 150, { refExclusiva: true }), it('hemoglobina', hb, 'g/dL', 13.5, 17.5), ...extra];
  const res = (dataExame, extra = {}) => ({ status: 'resultado', dataExame, horaExame: '07:30', localExame: 'Laboratório Exemplo', dataRecebido: dataExame, ...extra });

  // Jornada 1 (check-up antigo): consulta → sangue + eletro → retorno realizado
  const c1 = C('cli', { data: dia(-200), status: 'realizada', assunto: 'Check-up anual (exemplo)', anotacoes: 'Pediu exames de sangue e eletrocardiograma.' });
  const s1 = E({ nome: 'Exame de sangue', consultaId: c1.id, medico: MED.cli[0], especialidade: MED.cli[1], dataSolicitacao: c1.data, ...res(dia(-190)), itens: sangue(92, 228, 41, 205, 14.1) });
  const ecg = E({ nome: 'Eletrocardiograma', consultaId: c1.id, medico: MED.cli[0], especialidade: MED.cli[1], dataSolicitacao: c1.data, ...res(dia(-185)),
    itens: [it('ecg_fc', 74, 'bpm'), it('ecg_pr', 158, 'ms'), it('ecg_qrs', 92, 'ms'), it('ecg_qtc', 418, 'ms'), { ...it('ecg_ritmo', null, ''), texto: 'Sinusal (exemplo)' }] });
  const r1 = C('cli', { data: dia(-175), status: 'realizada', consultaOrigemId: c1.id, retornoDe: [s1.id, ecg.id], assunto: 'Retorno: mostrar resultados (exemplo)' });
  // Jornada 2: consulta → sangue → retorno realizado
  const c2 = C('cli', { data: dia(-110), status: 'realizada', assunto: 'Acompanhamento do colesterol (exemplo)' });
  const s2 = E({ nome: 'Exame de sangue', consultaId: c2.id, medico: MED.cli[0], especialidade: MED.cli[1], dataSolicitacao: c2.data, ...res(dia(-100)), itens: sangue(99, 214, 44, 178, 13.8) });
  const r2 = C('cli', { data: dia(-90), status: 'realizada', consultaOrigemId: c2.id, retornoDe: [s2.id] });
  // Jornada 3 (em andamento): consulta com vários exames em etapas diferentes + retorno pedido e ainda não agendado
  const c3 = C('cli', { data: dia(-25), status: 'realizada', retornoNecessario: true, prazoRetorno: dia(30), assunto: 'Dor no joelho e exames de rotina (exemplo)' });
  const pedido = (nome, o = {}) => E({ nome, consultaId: c3.id, medico: MED.cli[0], especialidade: MED.cli[1], dataSolicitacao: c3.data, ...o });
  const s3 = pedido('Exame de sangue', { ...res(dia(-8)), itens: sangue(106, 201, 47, 152, 13.6, [it('creatinina', 1.1, 'mg/dL', 0.7, 1.3, { duvida: 'Exemplo de item marcado para conferir com o laudo.' })]) });
  const rx = pedido('Raio-X do joelho', { status: 'realizado', dataExame: dia(-4), localExame: 'Clínica de Imagem Exemplo', dataResultado: dia(5), horaResultado: '14:00', localResultado: 'Clínica de Imagem Exemplo' });
  const us = pedido('Ultrassom de abdome', { status: 'marcado', dataExame: dia(12), horaExame: '10:00', localExame: 'Clínica de Imagem Exemplo', observacoes: 'Jejum de 8 horas (exemplo)' });
  const eco = pedido('Ecocardiograma', { status: 'marcado', dataExame: dia(-3), horaExame: '08:00', localExame: 'Hospital Exemplo' });
  const urina = pedido('Urina tipo 1');
  // Jornada 4 (especialista): ortopedista → ressonância → retorno agendado levando o resultado
  const c4 = C('orto', { data: dia(-60), status: 'realizada', assunto: 'Encaminhado pela clínica (exemplo)' });
  const rm = E({ nome: 'Ressonância do joelho', consultaId: c4.id, medico: MED.orto[0], especialidade: MED.orto[1], dataSolicitacao: c4.data, ...res(dia(-40), { localExame: 'Clínica de Imagem Exemplo' }),
    itens: [{ ...it('conclusao', null, ''), texto: 'Texto de exemplo: alteração no menisco medial.' }] });
  const r4 = C('orto', { data: dia(10), hora: '15:30', consultaOrigemId: c4.id, retornoDe: [rm.id], assunto: 'Retorno: mostrar resultado de Ressonância do joelho' });
  // Outras situações
  const futura = C('card', { data: dia(3), hora: '11:00', assunto: 'Avaliação cardiológica (exemplo)' });
  const passada = C('cli', { data: dia(-2), hora: '08:30', assunto: 'Consulta que já passou e não foi registrada (exemplo)' });
  const arquivada = C('cli', { data: dia(-300), status: 'realizada', arquivado: true, arquivadoEm: agora, assunto: 'Consulta antiga arquivada (exemplo)' });
  const solto = E({ nome: 'Glicemia de jejum', dataSolicitacao: dia(-6), observacoes: 'Pedido cadastrado sem a consulta (exemplo de exame solto).' });

  const anexos = imagem ? [
    { id: id(), tipoDono: 'exame', idDono: rx.id, tipoDoc: 'pedido', nome: 'pedido-exemplo.png', mime: imagem.type || 'image/png', blob: imagem, ...marca },
    { id: id(), tipoDono: 'exame', idDono: s3.id, tipoDoc: 'resultado', nome: 'laudo-exemplo.png', mime: imagem.type || 'image/png', blob: imagem, ...marca },
    { id: id(), tipoDono: 'consulta', idDono: c3.id, tipoDoc: 'receita', nome: 'receita-exemplo.png', mime: imagem.type || 'image/png', blob: imagem, ...marca },
  ] : [];
  return { familiares: [fam], medicos, anexos,
    consultas: [c1, r1, c2, r2, c3, c4, r4, futura, passada, arquivada],
    exames: [s1, ecg, s2, s3, rx, us, eco, urina, rm, solto] };
}

async function existemExemplos() {
  return (await DB.todos('familiares')).some((f) => f.exemplo);
}

async function criarExemplos(imagem) {
  const d = gerarExemplos(hoje(), imagem);
  await DB.lote(TABELAS, (s) => { for (const t of TABELAS) for (const x of d[t] || []) s[t].put(x); });
  return d;
}

// Remove só o que é exemplo. Se houver registros reais cadastrados no familiar de exemplo, passam ao perfil principal.
async function removerExemplos() {
  const dados = Object.fromEntries(await Promise.all(TABELAS.map(async (t) => [t, await DB.todos(t)])));
  const famEx = new Set(dados.familiares.filter((f) => f.exemplo).map((f) => f.id));
  const principal = dados.familiares.find((f) => f.principal && !f.exemplo);
  const idsEx = new Set([...dados.consultas, ...dados.exames].filter((x) => x.exemplo).map((x) => x.id));
  const reais = { consultas: dados.consultas.filter((x) => !x.exemplo && famEx.has(x.pacienteId)),
    exames: dados.exames.filter((x) => !x.exemplo && famEx.has(x.pacienteId)) };
  let removidos = 0;
  await DB.lote(TABELAS, (s) => {
    for (const t of TABELAS) for (const x of dados[t]) {
      if (x.exemplo || (t === 'anexos' && idsEx.has(x.idDono))) { s[t].delete(x.id); removidos++; }
    }
    for (const t of ['consultas', 'exames']) for (const x of reais[t]) s[t].put({ ...x, pacienteId: principal?.id, atualizadoEm: Date.now() });
  });
  return { removidos, movidos: reais.consultas.length + reais.exames.length };
}

// ===================== Armazenamento persistente =====================
async function estadoArmazenamento() {
  const st = navigator.storage;
  if (!st) return { suportado: false };
  const [persistente, estimativa] = await Promise.all([st.persisted ? st.persisted() : false, st.estimate ? st.estimate() : null]);
  return { suportado: true, persistente, usado: estimativa?.usage || 0, cota: estimativa?.quota || 0 };
}
