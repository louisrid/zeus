require('../public/engine.js'); const E=globalThis.Engine;
let seed=1;function R(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
const pick=a=>a[Math.floor(R()*a.length)];
let stats={games:0,over:0,steps:0,busts:0,timed:0,errs:0};
for(let g=0;g<400;g++){
  const n=2+g%4, mode=g%3===0?'45':'classic', timer=g%2?60:0;
  let now=1e6; const ctx={get now(){return now},rand:R,die:()=>1+Math.floor(R()*6)};
  let s=E.newRoom('TEST',{mode,max:5,timer});
  for(let i=0;i<n;i++)s=E.join(s,'id'+i,'P'+i,'x');
  s=E.start(s,0,ctx); stats.games++;
  let steps=0;
  const go=(pi,a)=>{s=E.act(s,pi,a,ctx)};
  while(s.phase==='play'&&steps<6000){
    steps++; now+=20000;
    const c=E.cur(s),p=s.players[c];
    try{
      if(s.trade){ go(s.trade.to, {t:R()<.5?'accept':'reject'}); }
      else if(R()<.03&&s.deadline){ now=s.deadline+1; go(pick(s.order),{t:'auto'}); }
      else if(s.stage==='auction'){ const w=s.auc.who, pw=s.players[w], nx=Math.max(10,s.auc.bid+10)+(R()<.3?40:0); stats.auc=(stats.auc||0)+1; if(R()<.6&&nx<=pw.cash) go(w,{t:'bid',amt:nx}); else go(w,{t:'pass'}); }
      else if(s.stage==='roll'){
        const mine=E.props(s,c), b=mine.filter(i=>E.canBuild(s,c,i));
        if(b.length&&R()<.6) go(c,{t:'build',tile:pick(b)});
        else if(R()<.08&&s.order.length>1){ const to=pick(s.order.filter(i=>i!==c)); const gp=mine.filter(i=>E.tradeable(s,c,i)&&R()<.3), tp=E.props(s,to).filter(i=>E.tradeable(s,to,i)&&R()<.3);
          go(c,{t:'propose',to,gc:Math.floor(R()*Math.max(0,p.cash)/2),tc:Math.floor(R()*Math.max(0,s.players[to].cash)/2)+1,gp,tp}); }
        else if(p.jail&&R()<.3&&p.cash>=50) go(c,{t:'payJail'});
        else if(p.jail&&p.gojf.length) go(c,{t:'useCard'});
        else go(c,{t:'roll'});
      } else if(s.stage==='buy') go(c,{t:R()<.85?'buy':'skip'});
      else if(s.stage==='act') go(c,{t:'end'});
      else if(s.stage==='debt'){
        const mine=E.props(s,c), h=mine.filter(i=>E.canSellHouse(s,c,i)), sp=mine.filter(i=>E.canSellProp(s,c,i));
        if(h.length) go(c,{t:'sellHouse',tile:pick(h)}); else if(sp.length&&R()<.9) go(c,{t:'sellProp',tile:pick(sp)}); else go(c,{t:'bankrupt'});
      } else throw new Error('stuck stage '+s.stage);
      if(s.phase==='play'&&s.rush>=0&&R()<.7) go(s.rush,{t:'rush',n:Math.floor(R()*20)});
      if(s.phase==='play'&&s.stage!=='auction'&&R()<.05) go(E.cur(s),{t:'gift',to:(E.cur(s)+1)%s.players.length,n:500});
      if(s.phase==='play'&&R()<.05) go(pick(s.order),{t:'style',look:{skin:9,hair:'<b>',outfit:'gold'},pet:'dragon'});
      if(s.phase==='play'&&R()<.004&&s.order.length>1) go(pick(s.order),{t:'quit'});
      if(s.phase==='play'&&!s.timer&&R()<.01&&s.order.length>1){ const o=s.order.filter(i=>i!==E.cur(s)); now+=91000; go(pick(o),{t:'auto',force:1}); }
    }catch(e){stats.errs++; console.log('ERR',g,n,s.stage,e.message); break;}
    // invariants
    if(s.phase==='play'&&(s.stage==='auction')!==!!s.auc) throw new Error('auction state mismatch g'+g+' '+s.stage);
    if(s.auc){ if(s.auc.live.indexOf(s.auc.who)<0||s.auc.live.some(i=>s.players[i].out)||s.own[s.auc.tile]||(s.auc.by>=0&&s.auc.live.indexOf(s.auc.by)<0)) throw new Error('bad auction g'+g); }
    if(s.fx.some(f=>f.t==='sold')) stats.sold=(stats.sold||0)+1; if(s.fx.some(f=>f.t==='unsold')) stats.unsold=(stats.unsold||0)+1;
    s.players.forEach((q,i)=>{ if(q.cash<0) throw new Error('neg cash g'+g); if(q.out&&(s.order.includes(i)||E.props(s,i).length)) throw new Error('out player still active'); if(!(q.boxes>=0)||!(q.coins>=0)) throw new Error('bad loot'); });
    s.debts.forEach(d=>{ if(d.to>=0&&s.players[d.to].out) throw new Error('debt owed to a player who left'); });
    if(s.trade&&(s.players[s.trade.from].out||s.players[s.trade.to].out)) throw new Error('trade with a player who left');
    for(const k in s.own){const o=s.own[k]; if(o.h<0||o.h>5) throw new Error('h range'); if(o.h>0){const t=E.T[k]; const ls=E.GROUPS[t.g].map(j=>E.lvl(s,j)); if(Math.max(...ls)-Math.min(...ls)>1||!E.ownsGroup(s,o.o,t.g)) throw new Error('uneven '+ls);}}
    if(s.order.length<1||s.order.length!==s.players.filter(q=>!q.out).length) throw new Error('order');
    if(s.stage==='debt'&&!s.debts.length) throw new Error('debt empty');
    if(JSON.stringify(s).length>200000) throw new Error('big');
  }
  stats.steps+=steps; stats.busts+=s.busts; if(s.phase==='over'){stats.over++; if(mode!=='classic'&&s.order.length>1)stats.timed++; if(!s.winners.length) throw new Error('no winner'); if(mode==='classic'&&s.order.length!==1) throw new Error('classic end');}
}
console.log(stats);
