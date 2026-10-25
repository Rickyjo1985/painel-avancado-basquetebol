# Painel Avançado Basquetebol

Painel independente do projeto de futebol, focado em NBA e EuroLeague.

## Estado atual

Primeira versão funcional da interface e do adaptador serverless. A API consulta os jogos por data através da API-Basketball (API-Sports). A resposta e a cobertura real dependem da chave/plano configurados. Ainda não há motor de previsões nem odds integradas; estes só devem ser adicionados com dados confirmados.

## Deployment na Vercel

1. Importar este repositório na Vercel.
2. Definir a variável de ambiente `APISPORTS_BASKETBALL_KEY` (Production, Preview e Development conforme necessário).
3. Fazer deploy e abrir o URL atribuído pela Vercel.
4. Testar uma data com jogos conhecidos da NBA e outra durante a época da EuroLeague.

Por conveniência, o endpoint também tenta a variável existente `APIFOOTBALL_KEY` se `APISPORTS_BASKETBALL_KEY` não estiver definida. **Isto é apenas um teste de compatibilidade**, não significa que uma chave de futebol dê acesso ao produto Basketball. Se receber erro de autenticação/acesso, é necessária uma chave ou subscrição com acesso a API-Basketball.

A chave é lida apenas no servidor e não é enviada para o browser.

## API

- `GET /api/basketball?date=AAAA-MM-DD`
- `GET /api/basketball?date=AAAA-MM-DD&league=NBA` (o filtro da interface é aplicado no cliente)

## Próximos passos

- Confirmar os identificadores e a cobertura de NBA e EuroLeague no plano contratado.
- Adicionar resultados históricos, forma recente, ratings de equipa e métricas de eficiência com fontes verificáveis.
- Integrar odds/spread/totais apenas através de uma fonte de odds licenciada e com cobertura confirmada.
- Implementar histórico de previsões e calibração por competição, mercado e fonte.
- Adicionar testes automatizados e estados de erro/limite de API.

As análises desportivas são probabilísticas; não há garantia de resultados.
