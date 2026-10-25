const BASE='https://v1.basketball.api-sports.io';
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=120, stale-while-revalidate=300');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Método não permitido.'});}
  const key=process.env.APISPORTS_BASKETBALL_KEY||process.env.APIFOOTBALL_KEY;
  if(!key)return res.status(503).json({error:'Não foi encontrada uma chave de API. Configura APISPORTS_BASKETBALL_KEY na Vercel.',configured:false});
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({error:'Data inválida. Usa AAAA-MM-DD.'});
  try{
    const upstream=await fetch(BASE+'/games?date='+encodeURIComponent(date),{headers:{'x-apisports-key':key}});
    const body=await upstream.json().catch(()=>({}));
    if(!upstream.ok)return res.status(upstream.status===401||upstream.status===403?502:upstream.status).json({error:'A API de basquetebol respondeu com HTTP '+upstream.status+'. Confirma se a chave tem acesso a API-Basketball.',configured:true,source:'API-Basketball'});
    if(body.errors&&Object.keys(body.errors).length)return res.status(502).json({error:'A API devolveu um erro: '+JSON.stringify(body.errors),configured:true,source:'API-Basketball'});
    const games=Array.isArray(body.response)?body.response:[];
    return res.status(200).json({games,source:'API-Basketball (API-Sports)',configured:true,results:body.results??games.length,message:'A chave foi aceite pela API. A cobertura de NBA e EuroLeague depende do plano e da disponibilidade da competição.'});
  }catch(e){return res.status(502).json({error:'Falha de ligação à API de basquetebol.',configured:true});}
};