const BASE='https://v1.basketball.api-sports.io';
const cache = new Map();
const TTL = 6 * 60 * 60 * 1000;
async function getJson(url,key){
  const r=await fetch(url,{headers:{'x-apisports-key':key}});
  const b=await r.json().catch(()=>({}));
  if(!r.ok || (b.errors && Object.keys(b.errors).length)) {
    const detail = b.errors && Object.keys(b.errors).length ? JSON.stringify(b.errors) : ('HTTP '+r.status);
    // Registar URL, estado e resposta da API (nunca a chave de autenticação).
    console.error('[predictions] API-Basketball respondeu com erro:', JSON.stringify({url, status:r.status, statusText:r.statusText, errors:b.errors || null, message:b.message || null, results:b.results ?? null}));
    throw new Error('API-Basketball: '+detail);
  }
  if (!Array.isArray(b.response)) {
    console.error('[predictions] Resposta inesperada da API-Basketball:', JSON.stringify({url, status:r.status, keys:Object.keys(b), message:b.message || null, errors:b.errors || null, results:b.results ?? null}));
  }
  return Array.isArray(b.response)?b.response:[];
}
function totals(g){const rawH=g.scores?.home?.total,rawA=g.scores?.away?.total;const h=Number(rawH),a=Number(rawA);if(rawH==null||rawA==null||!Number.isFinite(h)||!Number.isFinite(a))return null;return {home:h,away:a};}
function isFinished(g){const status=String(g.status?.short||'').toUpperCase();if(['FT','AOT','AWD','FTOT','AP','END','FINISHED','FINAL'].includes(status))return true;const score=totals(g);const date=Date.parse(g.date||'');return Boolean(score&&Number.isFinite(date)&&date<Date.now()-3*60*60*1000&&!['NS','TBD','PST','CANC','ABD','SUSP','INT','LIVE','Q1','Q2','Q3','Q4','OT','HT','BT'].includes(status));}
async function teamForm(teamId,leagueId,season,key){
  // Uma única consulta por liga/época, reutilizada para ambas as equipas e todos os jogos.
  // Isto reduz drasticamente o consumo do limite de 10 pedidos/minuto.
  const seasonText=String(season||'');
  const seasonMatch=seasonText.match(/^(\d{4})/);
  const seasonYear=seasonMatch?Number(seasonMatch[1]):NaN;
  const historySeason=Number.isFinite(seasonYear)?String(Math.min(2024,Math.max(2022,seasonYear))):'2024';
  const leagueCacheKey=['league-history',leagueId,historySeason].join(':');
  let record=cache.get(leagueCacheKey);
  if(!record||Date.now()-record.at>=TTL){
    const url=BASE+'/games?league='+encodeURIComponent(leagueId)+'&season='+encodeURIComponent(historySeason);
    const games=await getJson(url,key);
    record={at:Date.now(),games};
    cache.set(leagueCacheKey,record);
  }
  const finished=record.games.filter(g=>
    (String(g.teams?.home?.id)===String(teamId)||String(g.teams?.away?.id)===String(teamId)) &&
    isFinished(g)&&totals(g)
  ).sort((a,b)=>(b.timestamp||Date.parse(b.date)||0)-(a.timestamp||Date.parse(a.date)||0));
  return finished.slice(0,5);
}
function stats(form,teamId){
  const rows=form.map(g=>{const s=totals(g);const isHome=String(g.teams?.home?.id)===String(teamId);return {pf:isHome?s.home:s.away,pa:isHome?s.away:s.home};});
  if(!rows.length)return null;
  return {n:rows.length,pf:rows.reduce((s,x)=>s+x.pf,0)/rows.length,pa:rows.reduce((s,x)=>s+x.pa,0)/rows.length,w:rows.filter(x=>x.pf>x.pa).length};
}
function predict(game,homeForm,awayForm){
  const h=stats(homeForm,game.teams.home.id),a=stats(awayForm,game.teams.away.id);
  if(!h||!a)return {available:false,reason:'Histórico insuficiente para estimar este jogo.'};
  const hp=(h.pf+a.pa)/2+2, ap=(a.pf+h.pa)/2;
  const diff=hp-ap; const pHome=Math.max(0.08,Math.min(0.92,1/(1+Math.exp(-diff/8))));
  return {available:true,homeWin:Math.round(pHome*100),awayWin:Math.round((1-pHome)*100),homePoints:Math.round(hp),awayPoints:Math.round(ap),totalPoints:Math.round(hp+ap),homeForm:{games:h.n,pointsFor:+h.pf.toFixed(1),pointsAgainst:+h.pa.toFixed(1),wins:h.w},awayForm:{games:a.n,pointsFor:+a.pf.toFixed(1),pointsAgainst:+a.pa.toFixed(1),wins:a.w},confidence:Math.min(h.n,a.n)>=5?'Moderada':'Baixa',method:'Médias dos últimos jogos + ajuste caseiro',note:'Estimativa estatística simples; não é um modelo validado nem uma garantia.'};
}
module.exports=async function handler(req,res){
  // Cache partilhada na edge da Vercel: a cache em memória do processo não é partilhada entre instâncias.
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Método não permitido.'});}
  const key=process.env.APISPORTS_BASKETBALL_KEY||process.env.APIFOOTBALL_KEY;
  if(!key)return res.status(503).json({error:'Não foi encontrada uma chave API-Basketball.'});
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({error:'Data inválida.'});
  const ck='date:'+date; const old=cache.get(ck);
  if(req.query.refresh!=='1'&&old&&Date.now()-old.at<TTL)return res.status(200).json(old.value);
  try{
    const games=await getJson(BASE+'/games?date='+encodeURIComponent(date),key);
    console.log('[predictions] Jogos recebidos:', JSON.stringify({date,count:games.length}));
    const candidates=games.filter(g=>g.teams?.home?.id&&g.teams?.away?.id&&g.league?.id&&g.league?.season&&['NS','Q1','Q2','Q3','Q4','OT','HT','BT'].includes(g.status?.short)).slice(0,4);
    console.log('[predictions] Jogos candidatos:', JSON.stringify({date,count:candidates.length,ids:candidates.map(g=>g.id),leagues:candidates.map(g=>({id:g.league?.id,season:g.league?.season,status:g.status?.short}))}));
    const predictions={};
    let rateLimited=false;
    for(const g of candidates){
      if(rateLimited){
        predictions[g.id]={available:false,reason:'Previsão temporariamente indisponível: limite de pedidos da API atingido. Tenta novamente após 60 segundos.'};
        continue;
      }
      try{
        // Pedidos sequenciais; parar o lote inteiro assim que a API aplicar rate limit.
        const hf=await teamForm(g.teams.home.id,g.league.id,g.league.season,key);
        const af=await teamForm(g.teams.away.id,g.league.id,g.league.season,key);
        predictions[g.id]=predict(g,hf,af);
      }catch(e){
        console.error('[predictions] Falha no jogo '+g.id+':',e.message);
        if(/rateLimit|Too many requests|rate limit/i.test(String(e.message))) rateLimited=true;
        predictions[g.id]={available:false,reason:rateLimited?'Limite de pedidos da API atingido. Aguarda pelo menos 60 segundos antes de tentar novamente.':'Histórico indisponível. Verifica os registos da API na Vercel.'};
      }
    }
    const value={games, predictions,source:'API-Basketball (API-Sports)',configured:true,message:'Prognósticos estimados a partir dos últimos jogos disponíveis. Até 4 jogos analisados por consulta; os dados são guardados em cache por 6 horas.'};
    console.log('[predictions] Resumo final:', JSON.stringify({date,games:games.length,candidates:candidates.length,available:Object.values(predictions).filter(p=>p.available).length,unavailable:Object.values(predictions).filter(p=>!p.available).length,rateLimited}));
    cache.set(ck,{at:Date.now(),value});
    // Não repetir chamadas à API por cada visita. Resultados incompletos por rate limit ficam em cache só 60 s.
    res.setHeader('Cache-Control', rateLimited
      ? 'public, s-maxage=60, stale-while-revalidate=120'
      : 'public, s-maxage=21600, stale-while-revalidate=3600');
    return res.status(200).json(value);
  }catch(e){return res.status(502).json({error:e.message||'Falha de ligação à API de basquetebol.'});}
};