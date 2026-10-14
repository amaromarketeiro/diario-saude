// Banco de dados local (IndexedDB): os dados ficam salvos no próprio aparelho.
// Tabelas de dados: consultas, exames, anexos (fotos/PDFs), médicos e familiares.
// Tabela "meta": controle interno (versão do esquema, cópia de segurança da migração).
//
// Versões do banco:
//   1 → consultas, exames, anexos
//   2 → + medicos
//   3 → + familiares, meta  (registros ganham pacienteId; ver migrarBanco em nucleo.js)
//
// Modo de teste: abrir o app com ?db=teste usa um banco separado, sem tocar nos dados reais.
const MODO_TESTE = new URLSearchParams(location.search).get('db') === 'teste';
const DB_NOME = window.DB_NOME_FORCADO || (MODO_TESTE ? 'diario-saude-teste' : 'diario-saude');
const DB_VERSAO = 3;
const TABELAS = ['consultas', 'exames', 'anexos', 'medicos', 'familiares'];
const TABELAS_INTERNAS = ['meta'];
const COM_DATA_ATUALIZACAO = new Set(TABELAS);

let conexao;
function abrirDB() {
  if (conexao) return conexao;
  conexao = new Promise((ok, erro) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const t of [...TABELAS, ...TABELAS_INTERNAS]) {
        if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Outra aba abriu uma versão mais nova do app: fecha e recarrega para não travar a atualização
      db.onversionchange = () => { db.close(); location.reload(); };
      ok(db);
    };
    req.onerror = () => { conexao = null; erro(req.error); };
    // Uma aba antiga do app está aberta e impede a atualização do banco
    req.onblocked = () => window.aoBloquearBanco?.();
  });
  return conexao;
}

async function fecharDB() {
  if (!conexao) return;
  (await conexao).close();
  conexao = null;
}

async function transacao(tabela, modo, acao) {
  const db = await abrirDB();
  return new Promise((ok, erro) => {
    const t = db.transaction(tabela, modo);
    const req = acao(t.objectStore(tabela));
    t.oncomplete = () => ok(req ? req.result : undefined);
    t.onerror = () => erro(t.error);
    t.onabort = () => erro(t.error || new Error('Operação cancelada'));
  });
}

// Várias gravações em várias tabelas de uma vez: ou tudo é salvo, ou nada é salvo.
// A função "acao" recebe as tabelas e deve apenas chamar put/delete/clear (sem await dentro).
async function lote(tabelas, acao) {
  const db = await abrirDB();
  return new Promise((ok, erro) => {
    const t = db.transaction(tabelas, 'readwrite');
    t.oncomplete = () => ok();
    t.onerror = () => erro(t.error);
    t.onabort = () => erro(t.error || new Error('Operação cancelada'));
    try {
      acao(Object.fromEntries(tabelas.map((n) => [n, t.objectStore(n)])));
    } catch (e) {
      t.abort();
      erro(e);
    }
  });
}

const DB = {
  todos: (tabela) => transacao(tabela, 'readonly', (s) => s.getAll()),
  pegar: (tabela, id) => transacao(tabela, 'readonly', (s) => s.get(id)),
  salvar: (tabela, obj) => {
    if (COM_DATA_ATUALIZACAO.has(tabela)) obj.atualizadoEm = Date.now();
    return transacao(tabela, 'readwrite', (s) => s.put(obj));
  },
  apagar: (tabela, id) => transacao(tabela, 'readwrite', (s) => s.delete(id)),
  limpar: (tabela) => transacao(tabela, 'readwrite', (s) => s.clear()),
  lote,
};
