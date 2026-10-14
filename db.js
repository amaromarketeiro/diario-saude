// Banco de dados local (IndexedDB): os dados ficam salvos no próprio aparelho.
// Tabelas: consultas, exames, anexos (fotos/PDFs) e médicos.
const DB_NOME = 'diario-saude';
const DB_VERSAO = 2;
const TABELAS = ['consultas', 'exames', 'anexos', 'medicos'];

let conexao;
function abrirDB() {
  if (conexao) return conexao;
  conexao = new Promise((ok, erro) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const t of TABELAS) {
        if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
  return conexao;
}

async function transacao(tabela, modo, acao) {
  const db = await abrirDB();
  return new Promise((ok, erro) => {
    const t = db.transaction(tabela, modo);
    const req = acao(t.objectStore(tabela));
    t.oncomplete = () => ok(req ? req.result : undefined);
    t.onerror = () => erro(t.error);
  });
}

const DB = {
  todos: (tabela) => transacao(tabela, 'readonly', (s) => s.getAll()),
  pegar: (tabela, id) => transacao(tabela, 'readonly', (s) => s.get(id)),
  salvar: (tabela, obj) => transacao(tabela, 'readwrite', (s) => s.put(obj)),
  apagar: (tabela, id) => transacao(tabela, 'readwrite', (s) => s.delete(id)),
  limpar: (tabela) => transacao(tabela, 'readwrite', (s) => s.clear()),
};
