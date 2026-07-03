# Como usar:

1 - Abrir o arquivo `index.html` no navegador
2 - Inserir a API Key pessoal do Linear (Settings → API → Personal API keys → Create key)
3 - Informar o Team Key do seu time no Linear (ex: ENG) e clicar em Conectar

O dashboard tem as funcionalidades: seletor de ciclo, CAPEX/OPEX, cycle time, tempo por status, histórico de bloqueios e exportar PDF.

Uma ressalva: alguns navegadores bloqueiam requisições de rede quando o arquivo é aberto direto do disco (file://). Se isso acontecer, basta rodar um servidor local na pasta do arquivo:

`python3 -m http.server`

e acessar http://localhost:8000
