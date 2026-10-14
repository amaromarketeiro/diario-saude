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

// ===================== Pendências (sempre calculadas, nunca guardadas) =====================
function calcularPendencias(cs, es, h = hoje()) {
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
};

// ===================== Retornos =====================
// Monta os dados iniciais de uma consulta de retorno. Junta os exames da mesma consulta de origem
// que já têm resultado e ainda não têm retorno, SEMPRE do mesmo familiar.
function prepararRetorno({ exameId, consultaOrigemId }, cs, es) {
  const jaTemRetorno = new Set(cs.filter((c) => c.status !== 'cancelada').flatMap((c) => c.retornoDe || []));
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

// ===================== Armazenamento persistente =====================
async function estadoArmazenamento() {
  const st = navigator.storage;
  if (!st) return { suportado: false };
  const [persistente, estimativa] = await Promise.all([st.persisted ? st.persisted() : false, st.estimate ? st.estimate() : null]);
  return { suportado: true, persistente, usado: estimativa?.usage || 0, cota: estimativa?.quota || 0 };
}
