const BASE='https://v1.basketball.api-sports.io';
const cache = new Map();
const TTL = 6 * 60 * 60 * 1000;
async function getJson(url,key){
  const r=await fetch(url,{headers:{'x-apisports-key':key}});
  const b=await r.json().catch(()=>({}));
  if(!r.ok || (b.errors && Object.keys(b.errors).length)) throw new Error('A API não disponibilizou todos os dados necessários.');
  return Array.isArray(b.response)?b.response:[];
}
function totals(g){const h=g.scores?.home?.total,a=g.scores?.away?.total;if(typeof h!=='number'||typeof a!=='number')return null;return {home:h,away:a};}
async function teamForm(teamId,leagueId,season,key){
  const k=[teamId,leagueId,season].join(':'); const old=cache.get(k);
  if(old&&Date.now()-old.at<TTL)return old.games;
  // Algumas competições/épocas rejeitam a combinação league+season. Tentar a forma
  // mais simples por equipa permite usar os jogos recentes que a API disponibiliza.
  let games;
  try {
    games=await getJson(BASE+'/games?team='+encodeURIComponent(teamId)+'&league='+encodeURIComponent(leagueId)+'&season='+encodeURIComponent(season),key);
  } catch (firstError) {
    console.error('[predictions] Histórico com liga/época falhou:', firstError.message);
    games=[];
  }
  // A API pode responder com response=[] sem erro HTTP; também é preciso fallback.
  if(!games.length){
    try { games=await getJson(BASE+'/games?team='+encodeURIComponent(teamId)+'&last=20',key); }
    catch (fallbackError) { console.error('[predictions] Fallback de histórico falhou:', fallbackError.message); throw fallbackError; }
  }
  const finished=games.filter(g=>['FT','AOT','AWD','FTOT','AP'].includes(g.status?.short)&&totals(g))
    .filter(g=>!leagueId||String(g.league?.id)===String(leagueId))
    .sort((a,b)=>(b.timestamp||Date.parse(b.date)||0)-(a.timestamp||Date.parse(a.date)||0)).slice(0,5);
  cache.set(k,{at:Date.now(),games:finished}); return finished;
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
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Método não permitido.'});}
  const key=process.env.APISPORTS_BASKETBALL_KEY||process.env.APIFOOTBALL_KEY;
  if(!key)return res.status(503).json({error:'Não foi encontrada uma chave API-Basketball.'});
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({error:'Data inválida.'});
  const ck='date:'+date; const old=cache.get(ck);
  if(req.query.refresh!=='1'&&old&&Date.now()-old.at<TTL)return res.status(200).json(old.value);
  try{
    const games=await getJson(BASE+'/games?date='+encodeURIComponent(date),key);
    const candidates=games.filter(g=>g.teams?.home?.id&&g.teams?.away?.id&&g.league?.id&&g.league?.season&&['NS','Q1','Q2','Q3','Q4','OT','HT','BT'].includes(g.status?.short)).slice(0,4);
    const predictions={};
    for(const g of candidates){
      try{
        const [hf,af]=await Promise.all([teamForm(g.teams.home.id,g.league.id,g.league.season,key),teamForm(g.teams.away.id,g.league.id,g.league.season,key)]);
        predictions[g.id]=predict(g,hf,af);
      }catch(e){console.error('[predictions] Falha no jogo '+g.id+':',e.message);predictions[g.id]={available:false,reason:'Histórico indisponível. Verifica os registos da API na Vercel.'};}
    }
    const value={games, predictions,source:'API-Basketball (API-Sports)',configured:true,message:'Prognósticos estimados a partir dos últimos jogos disponíveis. Até 4 jogos analisados por consulta; os dados são guardados em cache por 6 horas.'};
    cache.set(ck,{at:Date.now(),value});
    return res.status(200).json(value);
  }catch(e){return res.status(502).json({error:e.message||'Falha de ligação à API de basquetebol.'});}
};