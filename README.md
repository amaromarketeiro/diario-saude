# Diário de Saúde

Aplicativo para organizar a saúde da família: consultas, pedidos de exame, resultados, receitas,
retornos e pendências — tudo num só lugar, no celular.

## Privacidade

- **Os dados ficam somente no aparelho** de quem usa (banco de dados do navegador).
  Este repositório contém apenas o código do app — nenhum dado de saúde.
- O app funciona sem conta e sem internet depois de aberto a primeira vez.
- Faça backups pelo próprio app (Mais → Backup) e guarde o arquivo em local seguro.

## Como usar

Abra o endereço publicado no Chrome do celular e use **Mais → Instalar o app**
(ou menu ⋮ → "Instalar app").

## Para desenvolvedores

- HTML, CSS e JavaScript puros, sem dependências nem etapa de build.
- Rodar localmente: `python -m http.server 8650` dentro desta pasta e abrir `http://localhost:8650`.
- Banco de teste separado: `http://localhost:8650/?db=teste` (nunca toca nos dados reais).
- Testes automáticos: abrir `testes.html`.
- Ao alterar arquivos, aumente o número `?v=` no `index.html` e a `VERSAO` no `sw.js`.

| Arquivo | Função |
|---|---|
| `db.js` | Banco de dados local (IndexedDB) |
| `nucleo.js` | Regras: migração, pendências, retornos, jornadas, backup |
| `familia.js` | Familiares e filtro |
| `medicos.js` | Cadastro de médicos |
| `relatorios.js` | Relatórios |
| `app.js` | Telas e navegação |
| `sw.js` | Funcionamento offline |
