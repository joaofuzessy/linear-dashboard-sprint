# Changelog

Registro das mudanças relevantes do projeto. As datas seguem o formato AAAA-MM-DD.

## [Não versionado] — 2026-07-03

### Alterado — Separação de responsabilidades (HTML / CSS / JS)
- Dividido o arquivo HTML standalone monolítico em três arquivos, visando legibilidade e manutenção:
  - `index.html` — apenas a estrutura HTML (tela de setup + shell do dashboard).
  - `styles.css` — toda a folha de estilos.
  - `app.js` — toda a lógica (cliente GraphQL, render, tempo por status, histórico de bloqueios).
- Removidos os estilos inline do HTML estático (logo e ações do header viraram as classes `.setup-logo-txt` e `.header-actions`).
- Atualizado o `README.md` para apontar para `index.html`.

### Removido
- Excluído o arquivo HTML standalone original, agora substituído pelos três arquivos acima.

### Segurança — Escape de dados injetados via `innerHTML`
- Adicionado o helper `esc()`, que escapa strings não confiáveis (títulos de issues, nomes de status, nome do time, mensagens de erro da API) antes de injetá-las no DOM, mitigando XSS.
- Criados helpers de render que centralizam markup e escape, eliminando duplicação entre as tabelas:
  - `idLink(iss)` — link do ID da issue.
  - `statePill(name)` — pílula de status (resolve cor + escape).
  - `classBadge(iss)` — badge CAPEX/OPEX.
- Mensagens de erro passaram a usar `textContent` (no `connect`) ou `esc()` (em `init`/`loadCycle`).

### Alterado — Paleta de cores centralizada
- CSS: bloco `:root` com tokens de design (`--brand`, `--green`, `--ink-*`, `--track`, etc.); todos os valores hex do arquivo agora referenciam variáveis.
- JS: objeto `COLORS` como fonte única para os estilos calculados em runtime, e `STATE_STYLES` para as pílulas de status. As funções `stateStyle`, `barColor`, `compColor`, `ctCard`, a legenda e os KPIs deixaram de conter cores hardcoded.
- Observação: a paleta vive em dois lugares por natureza — `:root` (CSS estático) e `COLORS` (estilos inline dinâmicos do JS); ambos devem ser mantidos em sincronia.

### Removido — Código morto
- Removida a função `isBlocked`, que não era mais utilizada (o cálculo de bloqueio real usa o histórico de estados).
