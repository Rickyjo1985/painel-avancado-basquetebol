# Painel Avançado Basquetebol

Painel independente do projeto de futebol, focado em NBA e EuroLeague.

## Estado atual

A interface apresenta jogos e prognósticos experimentais. O endpoint `/api/predictions` consulta os jogos da data e, para até quatro jogos elegíveis por consulta, procura o histórico recente de cada equipa e calcula uma estimativa simples de pontos e probabilidade de vitória.

O cálculo usa os últimos cinco jogos concluídos disponíveis (ou menos, se não houver cinco), médias de pontos marcados/sofridos e um pequeno ajuste de casa. **Não é um modelo validado**, não incorpora lesões, descanso, alinhamentos, força do calendário nem odds de mercado. A probabilidade deve ser lida como estimativa experimental, não como previsão garantida. Quando falta histórico, o painel indica que não há dados suficientes.

## Consumo e cache

- A consulta inicial da lista de jogos usa um pedido à API.
- Para cada um dos quatro jogos no máximo que forem analisados, o endpoint pode pedir o histórico de cada uma das duas equipas (até oito pedidos adicionais).
- As respostas incluem cache HTTP de seis horas; o servidor também mantém cache em memória quando a instância é reutilizada. A cache em memória não é partilhada entre todas as instâncias Vercel, por isso o consumo real pode variar.
- O limite de quatro jogos por consulta é intencional para limitar o consumo da quota gratuita.

## Deployment na Vercel

1. Importar este repositório na Vercel.
2. Definir a variável de ambiente `APISPORTS_BASKETBALL_KEY` (Production, Preview e Development conforme necessário).
3. Fazer deploy e abrir o URL atribuído pela Vercel.
4. Testar datas com jogos concluídos recentes das equipas envolvidas.

Por conveniência, o endpoint também tenta a variável existente `APIFOOTBALL_KEY` se `APISPORTS_BASKETBALL_KEY` não estiver definida. Isto não significa que uma chave de futebol dê acesso ao produto Basketball. A chave é lida apenas no servidor e não é enviada para o browser.

## API

- `GET /api/basketball?date=AAAA-MM-DD` — lista de jogos.
- `GET /api/predictions?date=AAAA-MM-DD` — jogos com estimativas experimentais.

## Próximos passos

- Validar a resposta real do endpoint na Vercel e o consumo no painel API-Sports.
- Confirmar cobertura e histórico disponível para NBA e EuroLeague no plano contratado.
- Melhorar o modelo com métricas verificadas e avaliação retrospetiva antes de tratar as probabilidades como calibradas.
- Integrar odds apenas quando uma fonte válida as disponibilizar.

As análises desportivas são probabilísticas e não garantem resultados.
