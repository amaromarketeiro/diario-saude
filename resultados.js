'use strict';
// Resultados dos exames: itens medidos (glicose, colesterol, frequência cardíaca, fração de ejeção…),
// leitura do texto do laudo (com aviso do que não foi entendido), tabela e gráficos de evolução.
// Cada exame guarda seus itens em exame.itens = [{ id, cod, nome, valor, texto, unidade, refMin, refMax, duvida }].
// Comparações são SEMPRE de uma única pessoa: nunca misturam familiares.

// ===================== Catálogo de itens =====================
// cod: identificador estável · sin: nomes como aparecem nos laudos · tipo 'texto' = resultado descritivo
const ANALITOS = [
  // Hemograma
  { cod: 'hemacias', nome: 'Hemácias', grupo: 'Hemograma', unid: 'milhões/mm³', sin: ['hemacias', 'eritrocitos', 'globulos vermelhos', 'rbc'] },
  { cod: 'hemoglobina', nome: 'Hemoglobina', grupo: 'Hemograma', unid: 'g/dL', sin: ['hemoglobina', 'hb', 'hgb'] },
  { cod: 'hematocrito', nome: 'Hematócrito', grupo: 'Hemograma', unid: '%', sin: ['hematocrito', 'ht', 'hct'] },
  { cod: 'vcm', nome: 'VCM', grupo: 'Hemograma', unid: 'fL', sin: ['vcm', 'volume corpuscular medio'] },
  { cod: 'hcm', nome: 'HCM', grupo: 'Hemograma', unid: 'pg', sin: ['hcm', 'hemoglobina corpuscular media'] },
  { cod: 'chcm', nome: 'CHCM', grupo: 'Hemograma', unid: 'g/dL', sin: ['chcm', 'concentracao de hemoglobina corpuscular media'] },
  { cod: 'rdw', nome: 'RDW', grupo: 'Hemograma', unid: '%', sin: ['rdw'] },
  { cod: 'leucocitos', nome: 'Leucócitos', grupo: 'Hemograma', unid: '/mm³', sin: ['leucocitos', 'globulos brancos', 'wbc', 'leucocitos totais'] },
  { cod: 'neutrofilos', nome: 'Neutrófilos', grupo: 'Hemograma', unid: '%', sin: ['neutrofilos', 'segmentados', 'neutrofilos segmentados'] },
  { cod: 'linfocitos', nome: 'Linfócitos', grupo: 'Hemograma', unid: '%', sin: ['linfocitos', 'linfocitos tipicos'] },
  { cod: 'monocitos', nome: 'Monócitos', grupo: 'Hemograma', unid: '%', sin: ['monocitos'] },
  { cod: 'eosinofilos', nome: 'Eosinófilos', grupo: 'Hemograma', unid: '%', sin: ['eosinofilos'] },
  { cod: 'basofilos', nome: 'Basófilos', grupo: 'Hemograma', unid: '%', sin: ['basofilos'] },
  { cod: 'plaquetas', nome: 'Plaquetas', grupo: 'Hemograma', unid: '/mm³', sin: ['plaquetas', 'contagem de plaquetas', 'plt'] },
  // Glicemia
  { cod: 'glicose', nome: 'Glicose', grupo: 'Glicemia', unid: 'mg/dL', sin: ['glicose', 'glicemia', 'glicemia de jejum', 'glicose de jejum', 'glicose em jejum', 'glicemia em jejum'] },
  { cod: 'hba1c', nome: 'Hemoglobina glicada', grupo: 'Glicemia', unid: '%', sin: ['hemoglobina glicada', 'hemoglobina glicosilada', 'hba1c', 'a1c', 'hb glicada'] },
  // Colesterol e triglicerídeos
  { cod: 'colesterol_total', nome: 'Colesterol total', grupo: 'Colesterol e gorduras', unid: 'mg/dL', sin: ['colesterol total', 'colesterol'] },
  { cod: 'hdl', nome: 'HDL', grupo: 'Colesterol e gorduras', unid: 'mg/dL', sin: ['hdl', 'hdl colesterol', 'colesterol hdl', 'hdl-colesterol'] },
  { cod: 'ldl', nome: 'LDL', grupo: 'Colesterol e gorduras', unid: 'mg/dL', sin: ['ldl', 'ldl colesterol', 'colesterol ldl', 'ldl-colesterol'] },
  { cod: 'vldl', nome: 'VLDL', grupo: 'Colesterol e gorduras', unid: 'mg/dL', sin: ['vldl', 'vldl colesterol', 'colesterol vldl'] },
  { cod: 'nao_hdl', nome: 'Colesterol não-HDL', grupo: 'Colesterol e gorduras', unid: 'mg/dL', sin: ['nao hdl', 'nao-hdl', 'colesterol nao hdl', 'colesterol nao-hdl'] },
  { cod: 'triglicerideos', nome: 'Triglicerídeos', grupo: 'Colesterol e gorduras', unid: 'mg/dL', sin: ['triglicerideos', 'triglicerides', 'triglicerideo', 'tg'] },
  // Rins, fígado, minerais
  { cod: 'ureia', nome: 'Ureia', grupo: 'Rins', unid: 'mg/dL', sin: ['ureia'] },
  { cod: 'creatinina', nome: 'Creatinina', grupo: 'Rins', unid: 'mg/dL', sin: ['creatinina'] },
  { cod: 'acido_urico', nome: 'Ácido úrico', grupo: 'Rins', unid: 'mg/dL', sin: ['acido urico'] },
  { cod: 'tgo', nome: 'TGO (AST)', grupo: 'Fígado', unid: 'U/L', sin: ['tgo', 'ast', 'aspartato aminotransferase', 'tgo ast'] },
  { cod: 'tgp', nome: 'TGP (ALT)', grupo: 'Fígado', unid: 'U/L', sin: ['tgp', 'alt', 'alanina aminotransferase', 'tgp alt'] },
  { cod: 'ggt', nome: 'Gama GT', grupo: 'Fígado', unid: 'U/L', sin: ['gama gt', 'gama-gt', 'ggt', 'gama glutamil transferase'] },
  { cod: 'sodio', nome: 'Sódio', grupo: 'Minerais e vitaminas', unid: 'mEq/L', sin: ['sodio'] },
  { cod: 'potassio', nome: 'Potássio', grupo: 'Minerais e vitaminas', unid: 'mEq/L', sin: ['potassio'] },
  { cod: 'ferritina', nome: 'Ferritina', grupo: 'Minerais e vitaminas', unid: 'ng/mL', sin: ['ferritina'] },
  { cod: 'vitamina_d', nome: 'Vitamina D', grupo: 'Minerais e vitaminas', unid: 'ng/mL', sin: ['vitamina d', '25-hidroxivitamina d', '25 oh vitamina d', '25(oh) vitamina d'] },
  { cod: 'vitamina_b12', nome: 'Vitamina B12', grupo: 'Minerais e vitaminas', unid: 'pg/mL', sin: ['vitamina b12', 'b12', 'cianocobalamina'] },
  // Tireoide e outros
  { cod: 'tsh', nome: 'TSH', grupo: 'Tireoide', unid: 'µUI/mL', sin: ['tsh', 'hormonio tireoestimulante'] },
  { cod: 't4_livre', nome: 'T4 livre', grupo: 'Tireoide', unid: 'ng/dL', sin: ['t4 livre', 't4l', 'tiroxina livre'] },
  { cod: 'psa', nome: 'PSA total', grupo: 'Outros', unid: 'ng/mL', sin: ['psa', 'psa total', 'antigeno prostatico especifico'] },
  { cod: 'pcr', nome: 'Proteína C reativa', grupo: 'Outros', unid: 'mg/L', sin: ['proteina c reativa', 'pcr'] },
  // Eletrocardiograma
  { cod: 'ecg_fc', nome: 'Frequência cardíaca', grupo: 'Eletrocardiograma', unid: 'bpm', sin: ['frequencia cardiaca', 'fc'] },
  { cod: 'ecg_pr', nome: 'Intervalo PR', grupo: 'Eletrocardiograma', unid: 'ms', sin: ['intervalo pr', 'pr'] },
  { cod: 'ecg_qrs', nome: 'Duração do QRS', grupo: 'Eletrocardiograma', unid: 'ms', sin: ['qrs', 'duracao do qrs', 'duracao qrs'] },
  { cod: 'ecg_qtc', nome: 'QTc', grupo: 'Eletrocardiograma', unid: 'ms', sin: ['qtc', 'qt corrigido'] },
  { cod: 'ecg_ritmo', nome: 'Ritmo', grupo: 'Eletrocardiograma', tipo: 'texto', sin: ['ritmo'] },
  // Ecocardiograma
  { cod: 'eco_fe', nome: 'Fração de ejeção', grupo: 'Ecocardiograma', unid: '%', sin: ['fracao de ejecao', 'fe', 'fevi', 'fracao de ejecao do ve'] },
  { cod: 'eco_ae', nome: 'Átrio esquerdo', grupo: 'Ecocardiograma', unid: 'mm', sin: ['atrio esquerdo', 'ae'] },
  { cod: 'eco_ddve', nome: 'Diâmetro diastólico do VE', grupo: 'Ecocardiograma', unid: 'mm', sin: ['diametro diastolico do ve', 'diametro diastolico', 'ddve', 'dd ve'] },
  { cod: 'eco_septo', nome: 'Septo', grupo: 'Ecocardiograma', unid: 'mm', sin: ['septo', 'septo interventricular', 'siv'] },
  { cod: 'eco_pp', nome: 'Parede posterior', grupo: 'Ecocardiograma', unid: 'mm', sin: ['parede posterior', 'ppve', 'parede posterior do ve'] },
  // Laudos de imagem (raio-X, ultrassom, ressonância, tomografia…)
  { cod: 'conclusao', nome: 'Conclusão do laudo', grupo: 'Laudo', tipo: 'texto', sin: ['conclusao', 'impressao diagnostica', 'impressao', 'opiniao'] },
];
const ANALITO_POR_COD = new Map(ANALITOS.map((a) => [a.cod, a]));

// Modelos: quais itens sugerir ao digitar, conforme o tipo de exame
const MODELOS_RESULTADO = {
  hemograma: { nome: 'Hemograma', grupos: ['Hemograma'] },
  sangue: { nome: 'Exame de sangue (bioquímica)', grupos: ['Glicemia', 'Colesterol e gorduras', 'Rins', 'Fígado', 'Minerais e vitaminas', 'Tireoide'] },
  glicemia: { nome: 'Glicose / glicada', grupos: ['Glicemia'] },
  lipidios: { nome: 'Colesterol e triglicerídeos', grupos: ['Colesterol e gorduras'] },
  tireoide: { nome: 'Tireoide', grupos: ['Tireoide'] },
  ecg: { nome: 'Eletrocardiograma', grupos: ['Eletrocardiograma'] },
  eco: { nome: 'Ecocardiograma', grupos: ['Ecocardiograma'] },
  imagem: { nome: 'Laudo de imagem (raio-X, ultrassom, ressonância…)', grupos: ['Laudo'] },
  outro: { nome: 'Outro (itens livres)', grupos: [] },
};

const normTexto = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Sugere o modelo pelo nome do exame
function modeloDoExame(nome) {
  const n = normTexto(nome);
  if (/hemograma/.test(n)) return 'hemograma';
  if (/eletrocardio|\becg\b/.test(n)) return 'ecg';
  if (/ecocardio|\beco\b/.test(n)) return 'eco';
  if (/raio|\brx\b|ultrass|\busg\b|resson|tomogra|mamogra|densitometr|imagem/.test(n)) return 'imagem';
  if (/colest|lipid|triglic/.test(n)) return 'lipidios';
  if (/glic|hba1c/.test(n)) return 'glicemia';
  if (/tsh|t4|tireo/.test(n)) return 'tireoide';
  if (/sangue|bioquim|check|rotina|laborat/.test(n)) return 'sangue';
  return 'outro';
}

// ===================== Leitura de números e do laudo =====================
// "13,5" → 13.5 · "4.500" → 4500 (milhar) · "250.000" → 250000 · "1.234,5" → 1234.5 · "0.8" → 0.8
function lerNumeroBR(txt) {
  let s = String(txt || '').trim();
  if (!/\d/.test(s)) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/\.(?=\d{3}(\D|$))(?=.*,)/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const NUM = '(\\d[\\d.,]*)';
const UNIDADES = ['milhoes/mm3', 'milhoes/mm³', 'milhoes/ul', 'mil/mm3', 'mil/mm³', '/mm3', '/mm³', '/ul', 'mg/dl', 'g/dl', 'mmol/l', 'meq/l',
  'ng/ml', 'pg/ml', 'ng/dl', 'mui/ml', 'uui/ml', 'µui/ml', 'miu/l', 'mg/l', 'u/l', 'ui/l', '%', 'fl', 'pg', 'bpm', 'ms', 'mm/h', 'mm', 'cm'];

// Grafia correta das unidades (o texto é comparado sem maiúsculas)
const UNIDADE_BONITA = { 'milhoes/mm3': 'milhões/mm³', 'milhoes/mm³': 'milhões/mm³', 'milhoes/ul': 'milhões/µL', 'mil/mm3': 'mil/mm³', 'mil/mm³': 'mil/mm³',
  '/mm3': '/mm³', '/ul': '/µL', 'mg/dl': 'mg/dL', 'g/dl': 'g/dL', 'mmol/l': 'mmol/L', 'meq/l': 'mEq/L', 'ng/ml': 'ng/mL', 'pg/ml': 'pg/mL',
  'ng/dl': 'ng/dL', 'mui/ml': 'µUI/mL', 'uui/ml': 'µUI/mL', 'µui/ml': 'µUI/mL', 'miu/l': 'mUI/L', 'mg/l': 'mg/L', 'u/l': 'U/L', 'ui/l': 'UI/L', 'fl': 'fL' };

function acharUnidade(texto) {
  const t = normTexto(texto).replace(/\s+/g, '');
  const u = UNIDADES.find((x) => t.startsWith(x)) || '';
  return u ? UNIDADE_BONITA[u] || u : '';
}

// Procura a faixa de referência num pedaço de texto: "70 a 99", "70 - 99", "< 200", "até 200", "> 40", "superior a 40"
function lerReferencia(texto) {
  const t = normTexto(texto);
  let m = t.match(new RegExp(`${NUM}\\s*(?:a|ate|-|–)\\s*${NUM}`));
  if (m) return { refMin: lerNumeroBR(m[1]), refMax: lerNumeroBR(m[2]) };
  // "< 150" / "inferior a 150" / "menor que 150" não incluem o próprio limite; "até" e "≤" incluem
  m = t.match(new RegExp(`(menor ou igual a|≤|<=|ate|<|inferior a|menor que)\\s*${NUM}`));
  if (m) return { refMin: null, refMax: lerNumeroBR(m[2]), refExclusiva: /^(<|inferior a|menor que)$/.test(m[1]) };
  m = t.match(new RegExp(`(maior ou igual a|≥|>=|>|superior a|maior que|acima de)\\s*${NUM}`));
  if (m) return { refMin: lerNumeroBR(m[2]), refMax: null, refExclusiva: /^(>|superior a|maior que|acima de)$/.test(m[1]) };
  return { refMin: null, refMax: null };
}

// Sinônimos do maior para o menor ("colesterol total" antes de "colesterol", "hemoglobina glicada" antes de "hemoglobina")
const SINONIMOS = ANALITOS.flatMap((a) => a.sin.map((s) => ({ s: normTexto(s), a }))).sort((x, y) => y.s.length - x.s.length);

// Siglas curtas ("PR", "FC", "TG") e itens de texto ("Conclusão", "Ritmo") só valem no COMEÇO da linha,
// para não confundir com endereço do laboratório ("Curitiba - PR"), "Data de impressão" etc.
function acharAnalito(linhaNorm) {
  for (const { s, a } of SINONIMOS) {
    const termo = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const soNoInicio = s.length <= 3 || a.tipo === 'texto';
    const re = soNoInicio ? new RegExp(`^[^a-z0-9]*(${termo})([^a-z0-9]|$)`) : new RegExp(`(^|[^a-z0-9])(${termo})([^a-z0-9]|$)`);
    const m = linhaNorm.match(re);
    if (m) return { a, fim: m.index + m[0].indexOf(m[soNoInicio ? 1 : 2]) + s.length };
  }
  return null;
}

// Item do catálogo pelo nome exato ou por um dos sinônimos (usado ao digitar)
const analitoPorNome = (nome) => { const n = normTexto(nome); return ANALITOS.find((x) => normTexto(x.nome) === n || x.sin.some((s) => normTexto(s) === n)); };

// Lê o texto colado de um laudo. Devolve os itens encontrados, as dúvidas e as linhas que não entendeu.
function interpretarLaudo(texto) {
  const linhas = String(texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const itens = [], naoEntendidas = [];
  for (let i = 0; i < linhas.length; i++) {
    const linhaN = normTexto(linhas[i]);
    const achado = acharAnalito(linhaN);
    if (!achado) {
      // Linha com número e unidade, mas sem item conhecido: avisa para conferir
      if (/\d/.test(linhaN) && UNIDADES.some((u) => linhaN.replace(/\s+/g, '').includes(u)) && !/referencia|valores?\s+de/.test(linhaN)) {
        naoEntendidas.push(linhas[i]);
      }
      continue;
    }
    const { a, fim } = achado;
    let resto = linhaN.slice(fim).replace(/^[\s:.\-–=]+/, '');
    if (a.tipo === 'texto') {
      // Resultado descritivo: o texto depois do nome (ou a linha seguinte)
      let txt = linhas[i].slice(linhas[i].length - resto.length).trim();
      if (!txt && linhas[i + 1] && !acharAnalito(normTexto(linhas[i + 1]))) txt = linhas[++i];
      itens.push({ cod: a.cod, nome: a.nome, valor: null, texto: txt, unidade: '', refMin: null, refMax: null,
        duvida: txt ? '' : `Encontrei “${a.nome}”, mas não o texto do resultado.` });
      continue;
    }
    // Valor numérico: o primeiro número depois do nome (pode estar na linha seguinte)
    let m = resto.match(new RegExp(`^(<|>|≤|≥|inferior a|superior a)?\\s*${NUM}`)) || resto.match(new RegExp(`(<|>|≤|≥)?\\s*${NUM}`));
    if (!m && linhas[i + 1] && /^\s*[<>≤≥]?\s*\d/.test(linhas[i + 1])) { resto = normTexto(linhas[++i]); m = resto.match(new RegExp(`(<|>|≤|≥)?\\s*${NUM}`)); }
    if (!m) {
      itens.push({ cod: a.cod, nome: a.nome, valor: null, texto: '', unidade: a.unid || '', refMin: null, refMax: null,
        duvida: `Encontrei “${a.nome}”, mas não consegui ler o valor.` });
      continue;
    }
    const valor = lerNumeroBR(m[2]);
    const depois = resto.slice(resto.indexOf(m[0]) + m[0].length).trimStart();
    const unidade = acharUnidade(depois) || '';
    // Referência: no restante da linha (depois da unidade) ou numa linha seguinte que fale de referência
    const posUnidade = unidade ? depois.search(/\s|$/) : 0;
    let ref = lerReferencia(depois.slice(posUnidade));
    if (ref.refMin == null && ref.refMax == null && linhas[i + 1] && /referencia|\bvr\b/.test(normTexto(linhas[i + 1]))) ref = lerReferencia(linhas[i + 1]);
    const duvidas = [];
    if (m[1]) duvidas.push(`Valor com sinal “${m[1]}” (aproximado).`);
    if (valor == null) duvidas.push('Número em formato que não reconheci.');
    if (unidade && a.unid && normTexto(unidade).replace('³', '3') !== normTexto(a.unid).replace('³', '3') && !(a.unid.includes('mm') && unidade.includes('mm')))
      duvidas.push(`Unidade “${unidade}” diferente da usual (${a.unid}).`);
    const repetido = itens.find((x) => x.cod === a.cod && x.valor !== valor);
    if (repetido) duvidas.push(`“${a.nome}” aparece mais de uma vez no laudo com valores diferentes.`);
    itens.push({ cod: a.cod, nome: a.nome, valor, texto: '', unidade: unidade || a.unid || '', ...ref, duvida: duvidas.join(' ') });
  }
  return { itens, naoEntendidas };
}

// ===================== Avaliação e séries =====================
// refExclusiva: o limite não faz parte da faixa ("< 150": 150 já está acima)
const foraDaReferencia = (it) => {
  if (it.valor == null || (it.refMin == null && it.refMax == null)) return null;
  if (it.refMax != null && (it.valor > it.refMax || (it.refExclusiva && it.valor === it.refMax))) return 'acima';
  if (it.refMin != null && (it.valor < it.refMin || (it.refExclusiva && it.valor === it.refMin))) return 'abaixo';
  return 'dentro';
};
const dataDoResultado = (e) => e.dataExame || e.dataRecebido || e.dataResultado || e.dataSolicitacao || '';
const chaveItem = (it) => it.cod || 'n:' + normTexto(it.nome);
const nomeDaChave = (k, padrao) => ANALITO_POR_COD.get(k)?.nome || padrao;

// Séries de UMA pessoa: { chave: { nome, grupo, tipo, pontos: [{ data, valor, texto, unidade, refMin, refMax, exameId, duvida }] } }
function seriesDoPaciente(exames, pacienteId) {
  const series = {};
  for (const e of exames) {
    if (e.pacienteId !== pacienteId || e.arquivado || !e.itens?.length) continue;
    for (const it of e.itens) {
      const k = chaveItem(it);
      const a = ANALITO_POR_COD.get(it.cod);
      const s = (series[k] ??= { chave: k, nome: a?.nome || it.nome, grupo: a?.grupo || 'Outros itens', tipo: a?.tipo || (it.valor == null ? 'texto' : 'numero'), pontos: [] });
      s.pontos.push({ data: dataDoResultado(e), valor: it.valor, texto: it.texto, unidade: it.unidade, refMin: it.refMin, refMax: it.refMax, refExclusiva: it.refExclusiva, exameId: e.id, duvida: it.duvida });
    }
  }
  for (const s of Object.values(series)) s.pontos.sort((p, q) => (p.data || '').localeCompare(q.data || ''));
  return series;
}

// Pontos para o gráfico: só os numéricos na unidade mais usada (não mistura mg/dL com mmol/L)
function pontosDoGrafico(serie) {
  const numericos = serie.pontos.filter((p) => p.valor != null && p.data);
  const contagem = {};
  for (const p of numericos) contagem[normTexto(p.unidade)] = (contagem[normTexto(p.unidade)] || 0) + 1;
  const unidade = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const pontos = numericos.filter((p) => normTexto(p.unidade) === unidade);
  return { pontos, foraDaUnidade: numericos.length - pontos.length };
}

function variacao(pontos) {
  if (pontos.length < 2) return null;
  const a = pontos[pontos.length - 2].valor, b = pontos[pontos.length - 1].valor;
  return { delta: b - a, pct: a ? ((b - a) / Math.abs(a)) * 100 : null };
}

const fmtNum = (n) => n == null ? '' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtRef = (it) => it.refMin != null && it.refMax != null ? `${fmtNum(it.refMin)} a ${fmtNum(it.refMax)}`
  : it.refMax != null ? `${it.refExclusiva ? 'menor que' : 'até'} ${fmtNum(it.refMax)}`
    : it.refMin != null ? `${it.refExclusiva ? 'maior que' : 'a partir de'} ${fmtNum(it.refMin)}` : '';

function seloReferencia(it) {
  const f = foraDaReferencia(it);
  if (f === 'acima') return '<span class="ref-selo acima">▲ Acima da ref.</span>';
  if (f === 'abaixo') return '<span class="ref-selo abaixo">▼ Abaixo da ref.</span>';
  if (f === 'dentro') return '<span class="ref-selo dentro">✓ Na referência</span>';
  return '';
}

function textoVariacao(v, unidade) {
  if (!v) return '';
  if (Math.abs(v.delta) < 1e-9) return '<span class="var igual">= igual ao anterior</span>';
  const sinal = v.delta > 0 ? '▲ subiu' : '▼ caiu';
  const pct = v.pct != null ? Math.abs(v.pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : null;
  return `<span class="var ${v.delta > 0 ? 'sobe' : 'desce'}">${sinal} ${fmtNum(Math.abs(v.delta))}${unidade ? ' ' + esc(unidade) : ''}${pct != null ? ` (${pct}%)` : ''}</span>`;
}

// ===================== Gráficos (SVG próprio, funciona sem internet) =====================
function graficoLinha(pontos, { unidade = '', alto = 210 } = {}) {
  const L = 340, P = { e: 44, d: 22, t: 18, b: 30 };
  const ref = pontos[pontos.length - 1];
  const vals = pontos.map((p) => p.valor).concat([ref.refMin, ref.refMax].filter((x) => x != null));
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= Math.abs(min) * 0.1 || 1; max += Math.abs(max) * 0.1 || 1; }
  const folga = (max - min) * 0.12; min -= folga; max += folga;
  const tempos = pontos.map((p) => lerData(p.data).getTime());
  const t0 = Math.min(...tempos), t1 = Math.max(...tempos);
  const x = (t) => (t1 === t0 ? (P.e + L - P.d) / 2 : P.e + ((t - t0) / (t1 - t0)) * (L - P.e - P.d));
  const y = (v) => P.t + (1 - (v - min) / (max - min)) * (alto - P.t - P.b);
  // Marcas do eixo em números redondos (1, 2, 2,5 ou 5 × potência de 10)
  const bruto = (max - min) / 4, pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= bruto);
  const grade = [];
  for (let v = Math.ceil(min / passo) * passo; v <= max + 1e-9; v += passo) grade.push(Math.round(v / passo) * passo);
  const faixa = ref.refMin != null || ref.refMax != null
    ? `<rect class="g-faixa" x="${P.e}" width="${L - P.e - P.d}" y="${y(ref.refMax ?? max)}" height="${Math.max(0, y(ref.refMin ?? min) - y(ref.refMax ?? max))}"/>
       <text class="g-faixa-txt" x="${L - P.d - 4}" y="${y(ref.refMax ?? max) + 12}" text-anchor="end">referência</text>` : '';
  const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(tempos[i]).toFixed(1)} ${y(p.valor).toFixed(1)}`).join(' ');
  const ultimo = pontos[pontos.length - 1];
  const rotulosX = [...new Set([0, Math.floor((pontos.length - 1) / 2), pontos.length - 1])]
    .map((i) => `<text class="g-eixo" x="${x(tempos[i])}" y="${alto - 8}" text-anchor="middle">${dataBR(pontos[i].data).slice(0, 5)}/${pontos[i].data.slice(2, 4)}</text>`).join('');
  return `<svg class="grafico" viewBox="0 0 ${L} ${alto}" role="img" aria-label="Evolução: ${pontos.length} resultado(s)">
    ${grade.map((v) => `<line class="g-grade" x1="${P.e}" x2="${L - P.d}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="g-eixo" x="${P.e - 6}" y="${y(v) + 4}" text-anchor="end">${fmtNum(v)}</text>`).join('')}
    ${faixa}
    ${pontos.length > 1 ? `<path class="g-linha" d="${linha}"/>` : ''}
    ${pontos.map((p, i) => {
      const f = foraDaReferencia(p);
      return `<g class="g-ponto" data-i="${i}" tabindex="0">
        <circle class="g-alvo" cx="${x(tempos[i])}" cy="${y(p.valor)}" r="16"/>
        <circle class="g-marca ${f === 'acima' || f === 'abaixo' ? 'fora' : ''}" cx="${x(tempos[i])}" cy="${y(p.valor)}" r="5"/>
        <title>${dataBR(p.data)}: ${fmtNum(p.valor)} ${esc(p.unidade || '')}</title></g>`;
    }).join('')}
    <text class="g-rotulo" x="${Math.min(x(tempos[tempos.length - 1]), L - P.d - 2)}" y="${y(ultimo.valor) - 11}" text-anchor="${pontos.length > 1 ? 'end' : 'middle'}">${fmtNum(ultimo.valor)}${unidade ? ' ' + esc(unidade) : ''}</text>
    ${rotulosX}
  </svg>`;
}

function minigrafico(pontos) {
  if (pontos.length < 2) return '';
  const L = 84, A = 28, vals = pontos.map((p) => p.valor);
  const min = Math.min(...vals), max = Math.max(...vals), amp = max - min || 1;
  const pts = pontos.map((p, i) => `${(2 + (i / (pontos.length - 1)) * (L - 4)).toFixed(1)},${(A - 3 - ((p.valor - min) / amp) * (A - 6)).toFixed(1)}`);
  return `<svg class="mini" viewBox="0 0 ${L} ${A}" aria-hidden="true"><polyline points="${pts.join(' ')}"/>
    <circle cx="${pts[pts.length - 1].split(',')[0]}" cy="${pts[pts.length - 1].split(',')[1]}" r="3"/></svg>`;
}

// ===================== Bloco de itens na tela do exame =====================
function blocoItensExame(e, todosExames) {
  const itens = e.itens || [];
  const series = seriesDoPaciente(todosExames, e.pacienteId);
  const linhas = itens.map((it) => {
    const s = series[chaveItem(it)];
    const idx = s ? s.pontos.findIndex((p) => p.exameId === e.id) : -1;
    const anterior = idx > 0 ? s.pontos.slice(0, idx).reverse().find((p) => p.valor != null && normTexto(p.unidade) === normTexto(it.unidade)) : null;
    const v = anterior && it.valor != null ? { delta: it.valor - anterior.valor, pct: anterior.valor ? ((it.valor - anterior.valor) / Math.abs(anterior.valor)) * 100 : null } : null;
    return `<a class="item-res" href="#/evolucao/${encodeURIComponent(chaveItem(it))}?paciente=${e.pacienteId}">
      <span class="ir-nome">${esc(it.nome)}${it.duvida ? ' <span class="duvida-selo" title="' + esc(it.duvida) + '">⚠️ conferir</span>' : ''}</span>
      <span class="ir-valor">${it.valor != null ? `<strong>${fmtNum(it.valor)}</strong> ${esc(it.unidade || '')}` : `<span class="texto">${esc(it.texto || '—')}</span>`}</span>
      <span class="ir-extra">${seloReferencia(it)}${fmtRef(it) ? `<small>ref. ${fmtRef(it)}</small>` : ''}${v ? textoVariacao(v, it.unidade) : ''}</span></a>`;
  }).join('');
  const duvidas = itens.filter((it) => it.duvida).length;
  return `<div class="bloco"><h3>📊 Itens do resultado</h3>
    ${itens.length ? `${duvidas ? `<p class="aviso-duvida">⚠️ ${duvidas} item(ns) precisam ser conferidos com o laudo.</p>` : ''}
      <div class="itens-res">${linhas}</div>
      <p class="mudo">Toque num item para ver a evolução dele nos exames de ${esc(nomeFamiliar(e.pacienteId))}.</p>`
      : `<p class="mudo">${e.status === 'resultado' || e.status === 'realizado'
        ? 'Registre os valores do laudo para acompanhar a evolução (glicose, colesterol, frequência cardíaca…).'
        : 'Quando o resultado chegar, registre aqui os valores do laudo.'}</p>`}
    <div class="acoes">
      <a class="btn" href="#/exame/${e.id}/itens?modo=colar">📋 Ler texto do laudo</a>
      <a class="btn" href="#/exame/${e.id}/itens">✍️ ${itens.length ? 'Editar itens' : 'Digitar valores'}</a>
    </div></div>`;
}

// ===================== Tela de digitação / leitura do laudo =====================
async function telaItensExame(id, q = {}) {
  const e = await DB.pegar('exames', id);
  if (!e) return naoEncontrado();
  let modelo = q.modelo || modeloDoExame(e.nome);
  let linhas = (e.itens || []).map((it) => ({ ...it }));
  let naoEntendidas = [];
  let lido = false;

  const linhasDoModelo = (m) => ANALITOS.filter((a) => MODELOS_RESULTADO[m].grupos.includes(a.grupo))
    .map((a) => ({ cod: a.cod, nome: a.nome, valor: null, texto: '', unidade: a.unid || '', refMin: null, refMax: null, duvida: '' }));
  if (!linhas.length && q.modo !== 'colar') linhas = linhasDoModelo(modelo);

  const desenhar = () => {
    render(`<div class="detalhe">
      <div class="cabeca"><h2>${esc(e.nome)}</h2>
        <p class="mudo">${esc(nomeFamiliar(e.pacienteId))} · ${fmtCurta(dataDoResultado(e))}</p></div>

      <div class="bloco"><h3>📋 Ler o texto do laudo</h3>
        <p class="mudo">Copie o texto do laudo e cole abaixo. No PDF: selecione tudo e copie. No papel: tire foto e use o
          <strong>Google Lens → Texto → Copiar</strong>. A leitura acontece só neste aparelho.</p>
        <textarea id="texto-laudo" rows="${q.modo === 'colar' && !lido ? 8 : 3}" placeholder="Cole aqui o texto do laudo…"></textarea>
        <button class="btn ${q.modo === 'colar' && !lido ? 'primario' : ''}" id="interpretar">🔎 Ler e preencher os itens</button>
      </div>

      ${lido ? `<div class="bloco resumo-leitura">
        <h3>🔎 Resultado da leitura</h3>
        <p>✅ ${linhas.filter((l) => !l.duvida).length} item(ns) lidos sem dúvida
          ${linhas.some((l) => l.duvida) ? `<br>⚠️ <strong>${linhas.filter((l) => l.duvida).length} item(ns) com dúvida</strong>: confira com o laudo` : ''}
          ${naoEntendidas.length ? `<br>❓ <strong>${naoEntendidas.length} linha(s) que não entendi</strong>` : ''}</p>
        ${naoEntendidas.length ? `<details open><summary>Linhas que não consegui interpretar</summary>
          <ul class="nao-entendidas">${naoEntendidas.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
          <p class="mudo">Se alguma delas for importante, adicione como item abaixo (“+ Outro item”).</p></details>` : ''}
        ${!linhas.length ? '<p>Não encontrei nenhum item conhecido no texto. Confira se colou o laudo inteiro, ou digite os valores.</p>' : ''}
      </div>` : ''}

      <div class="bloco"><h3>✍️ Itens</h3>
        <label class="campo"><span>Tipo de exame (sugere os itens)</span><select id="modelo">
          ${Object.entries(MODELOS_RESULTADO).map(([k, m]) => `<option value="${k}" ${k === modelo ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}
        </select></label>
        <p class="mudo">Preencha só o que estiver no laudo; itens vazios são ignorados. A referência é a do <strong>seu laboratório</strong> (vem no laudo).</p>
        <div id="linhas">${linhas.map((l, i) => linhaItem(l, i)).join('')}</div>
        <button class="btn" id="mais-item">＋ Outro item</button>
      </div>
      <div class="acoes"><button class="btn primario" id="salvar-itens">💾 Salvar itens</button>
        <a class="btn" href="#/exame/${id}">Cancelar</a></div>
      <datalist id="dl-analitos">${ANALITOS.map((a) => `<option value="${esc(a.nome)}">`).join('')}</datalist>
    </div>`, 'Resultado do exame', true);
    ligar();
  };

  const linhaItem = (l, i) => `<div class="linha-item ${l.duvida ? 'com-duvida' : ''}" data-i="${i}">
    <div class="li-topo"><input class="li-nome" value="${esc(l.nome)}" list="dl-analitos" placeholder="Nome do item" aria-label="Item">
      <button class="btn pequeno li-del" data-del="${i}" aria-label="Remover item">✕</button></div>
    ${l.duvida ? `<p class="li-duvida">⚠️ ${esc(l.duvida)} <button class="btn pequeno" data-ok="${i}">✓ Conferido</button></p>` : ''}
    <div class="li-campos">
      <label><span>Resultado</span><input class="li-valor" value="${esc(l.valor != null ? fmtNum(l.valor) : l.texto || '')}" placeholder="${ANALITO_POR_COD.get(l.cod)?.tipo === 'texto' ? 'texto do laudo' : 'valor'}"></label>
      <label><span>Unidade</span><input class="li-unid" value="${esc(l.unidade || '')}"></label>
      <label><span>Ref. mín.</span><input class="li-min" inputmode="decimal" value="${l.refMin != null ? fmtNum(l.refMin) : ''}"></label>
      <label><span>Ref. máx.</span><input class="li-max" inputmode="decimal" value="${l.refMax != null ? fmtNum(l.refMax) : ''}"></label>
    </div></div>`;

  // Lê o que está digitado na tela de volta para "linhas"
  const coletar = () => {
    document.querySelectorAll('.linha-item').forEach((el) => {
      const l = linhas[Number(el.dataset.i)];
      const nome = el.querySelector('.li-nome').value.trim();
      const bruto = el.querySelector('.li-valor').value.trim();
      const a = analitoPorNome(nome);
      const num = a?.tipo === 'texto' ? null : /^[<>≤≥]?\s*\d[\d.,]*$/.test(bruto) ? lerNumeroBR(bruto.replace(/^[<>≤≥]\s*/, '')) : null;
      Object.assign(l, { nome, cod: a?.cod || null, valor: num, texto: num == null ? bruto : '',
        unidade: el.querySelector('.li-unid').value.trim(),
        refMin: lerNumeroBR(el.querySelector('.li-min').value), refMax: lerNumeroBR(el.querySelector('.li-max').value) });
    });
  };

  const ligar = () => {
    $('#modelo').onchange = (ev) => {
      coletar();
      modelo = ev.target.value;
      const preenchidas = linhas.filter((l) => l.valor != null || l.texto);
      const jaTem = new Set(preenchidas.map((l) => l.cod).filter(Boolean));
      linhas = [...preenchidas, ...linhasDoModelo(modelo).filter((l) => !jaTem.has(l.cod))];
      desenhar();
    };
    $('#interpretar').onclick = () => {
      const texto = $('#texto-laudo').value;
      if (!texto.trim()) return toast('Cole o texto do laudo primeiro.');
      coletar();
      const r = interpretarLaudo(texto);
      const preenchidas = linhas.filter((l) => l.valor != null || l.texto);
      const lidos = new Set(r.itens.map((x) => x.cod));
      linhas = [...r.itens, ...preenchidas.filter((l) => !lidos.has(l.cod))];
      naoEntendidas = r.naoEntendidas;
      lido = true;
      desenhar();
      $('.resumo-leitura')?.scrollIntoView({ behavior: 'smooth' });
    };
    $('#mais-item').onclick = () => { coletar(); linhas.push({ cod: null, nome: '', valor: null, texto: '', unidade: '', refMin: null, refMax: null, duvida: '' }); desenhar(); };
    document.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { coletar(); linhas.splice(Number(b.dataset.del), 1); desenhar(); });
    document.querySelectorAll('[data-ok]').forEach((b) => b.onclick = () => { coletar(); linhas[Number(b.dataset.ok)].duvida = ''; desenhar(); });
    $('#salvar-itens').onclick = async () => {
      coletar();
      const validos = linhas.filter((l) => l.nome && (l.valor != null || l.texto));
      const semNome = linhas.filter((l) => !l.nome && (l.valor != null || l.texto)).length;
      if (semNome) return avisar(`${semNome} item(ns) têm resultado mas estão sem nome. Preencha o nome ou remova.`, 'Falta o nome do item');
      const comDuvida = validos.filter((l) => l.duvida).length;
      if (comDuvida && !(await confirmar(`${comDuvida} item(ns) ainda estão marcados para conferir. Salvar assim mesmo? Eles ficam sinalizados com ⚠️ até você conferir.`,
        { titulo: 'Itens com dúvida', sim: 'Salvar assim', nao: 'Voltar e conferir' }))) return;
      const ehNovoResultado = !e.itens?.length && validos.length;
      await DB.salvar('exames', { ...e, itens: validos.map((l) => ({ ...l, id: l.id || novoId() })) });
      toast(`📊 ${validos.length} item(ns) salvo(s) ✓`);
      location.hash = '#/exame/' + id;
      if (ehNovoResultado && e.status !== 'resultado') toast('📊 Itens salvos ✓ Lembre de marcar o exame como “Resultado recebido”.');
    };
  };
  desenhar();
}

// ===================== Evolução (relatório) =====================
function escolherPacienteEvolucao(q) {
  const id = q.paciente && FAMILIA.porId.has(q.paciente) ? q.paciente : filtroAtual() !== 'todos' ? filtroAtual() : FAMILIA.ativos.length === 1 ? FAMILIA.ativos[0].id : null;
  return id;
}

async function telaEvolucao(_, q = {}) {
  const pacienteId = escolherPacienteEvolucao(q);
  if (!pacienteId) {
    return render(`${seletorFamilia()}<div class="vazio"><div class="vazio-ic">📈</div><h2>Escolha um familiar</h2>
      <p>A evolução dos exames é sempre de uma pessoa, para nunca misturar resultados. Toque num nome acima.</p></div>`, 'Evolução', true);
  }
  const series = Object.values(seriesDoPaciente(await DB.todos('exames'), pacienteId));
  const grupos = {};
  for (const s of series) (grupos[s.grupo] ??= []).push(s);
  const ordemGrupos = [...new Set(ANALITOS.map((a) => a.grupo)), 'Outros itens'];
  const cartao = (s) => {
    const { pontos } = pontosDoGrafico(s);
    const ult = s.pontos[s.pontos.length - 1];
    return `<a class="card evo" href="#/evolucao/${encodeURIComponent(s.chave)}?paciente=${pacienteId}">
      <div class="card-corpo"><strong>${esc(s.nome)}</strong>
        <small>${ult.valor != null ? `${fmtNum(ult.valor)} ${esc(ult.unidade || '')}` : esc((ult.texto || '').slice(0, 60))} · ${fmtCurta(ult.data)} · ${s.pontos.length} resultado(s)</small>
        <span class="evo-selos">${seloReferencia(ult)}${textoVariacao(variacao(pontos), ult.unidade)}${s.pontos.some((p) => p.duvida) ? '<span class="duvida-selo">⚠️ conferir</span>' : ''}</span></div>
      ${minigrafico(pontos)}<span class="seta">›</span></a>`;
  };
  render(`<div class="nao-imprimir">${seletorFamilia()}</div>
    ${cabecalhoImpressao('Evolução dos resultados', { periodo: 'tudo' })}
    <p class="mudo">Resultados de <strong>${esc(FAMILIA.porId.get(pacienteId)?.nome || '')}</strong>. Cada item reúne os valores de todos os exames, em ordem de data.
      O gráfico serve para acompanhar a evolução; quem interpreta é o médico.</p>
    ${series.length ? ordemGrupos.filter((g) => grupos[g]).map((g) => `<h2 class="secao">${esc(g)}</h2>${grupos[g].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(cartao).join('')}`).join('')
      : `<div class="vazio"><div class="vazio-ic">📊</div><h2>Nenhum resultado registrado</h2>
          <p>Abra um exame com resultado e toque em “📋 Ler texto do laudo” ou “✍️ Digitar valores”.</p>
          <a class="btn primario" href="#/exames">Ir para Exames</a></div>`}
    ${series.length ? botaoImprimir : ''}`, 'Evolução', true);
}

async function telaEvolucaoItem(chaveCod, q = {}) {
  const chave = decodeURIComponent(chaveCod);
  const pacienteId = escolherPacienteEvolucao(q);
  if (!pacienteId) return telaEvolucao(null, q);
  const s = seriesDoPaciente(await DB.todos('exames'), pacienteId)[chave];
  if (!s) return naoEncontrado();
  const { pontos, foraDaUnidade } = pontosDoGrafico(s);
  const unidade = pontos[0]?.unidade || '';
  const lista = [...s.pontos].reverse();
  render(`${cabecalhoImpressao(s.nome, { periodo: 'tudo' })}
    <div class="detalhe"><div class="cabeca">${tagFamiliar(pacienteId, true)}<h2>${esc(s.nome)}</h2>
      <p class="mudo">${esc(s.grupo)} · ${s.pontos.length} resultado(s)</p>
      <p class="evo-selos">${seloReferencia(s.pontos[s.pontos.length - 1])}${textoVariacao(variacao(pontos), unidade)}</p></div>
    ${pontos.length ? `<div class="bloco grafico-bloco">${graficoLinha(pontos, { unidade })}
      <p class="mudo" id="g-detalhe">Toque num ponto para ver a data e o valor.</p>
      ${foraDaUnidade ? `<p class="mudo">⚠️ ${foraDaUnidade} resultado(s) em outra unidade não entram no gráfico (veja a tabela).</p>` : ''}
      ${pontos.length === 1 ? '<p class="mudo">Com o próximo exame, o gráfico mostra se subiu ou caiu.</p>' : ''}</div>` : ''}
    <div class="bloco"><h3>Todos os resultados</h3>
      <div class="itens-res">${lista.map((p) => `<a class="item-res" href="#/exame/${p.exameId}">
        <span class="ir-nome">${fmtCurta(p.data)}${p.duvida ? ' <span class="duvida-selo">⚠️ conferir</span>' : ''}</span>
        <span class="ir-valor">${p.valor != null ? `<strong>${fmtNum(p.valor)}</strong> ${esc(p.unidade || '')}` : `<span class="texto">${esc(p.texto || '—')}</span>`}</span>
        <span class="ir-extra">${seloReferencia(p)}${fmtRef(p) ? `<small>ref. ${fmtRef(p)}</small>` : ''}</span></a>`).join('')}</div></div>
    ${botaoImprimir}</div>`, 'Evolução', true);

  // Toque/hover num ponto mostra data e valor
  document.querySelectorAll('.g-ponto').forEach((g) => {
    const mostrar = () => {
      const p = pontos[Number(g.dataset.i)];
      document.querySelectorAll('.g-ponto').forEach((x) => x.classList.toggle('ativo', x === g));
      $('#g-detalhe').innerHTML = `<strong>${dataBR(p.data)}</strong>: ${fmtNum(p.valor)} ${esc(p.unidade || '')} ${seloReferencia(p)}`;
    };
    g.onclick = mostrar; g.onmouseenter = mostrar; g.onfocus = mostrar;
  });
}
