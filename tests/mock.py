import asyncio, json, random, time
URL='file:///tmp/claude-0/-home-claude/13bf3543-7b03-5820-b50e-34da8f21ab2b/scratchpad/t/test.html'
MOCK = """
(() => {
  const uid = '%s'; const subs = {};
  window.__fire = (path, json) => { (subs[path]||[]).forEach(fn => fn(snap(path, json))); };
  const snap = (path, json) => { const d = json == null ? undefined : Object.freeze(JSON.parse(json)); return { id: path.split('/').pop(), exists: json != null, data: () => d, metadata: {fromCache:false, hasPendingWrites:false} }; };
  window.__failSets = 0; window.__sets = 0;
  const doc = path => ({ id: path.split('/').pop(), path,
    get: async () => snap(path, await window.__dbGet(path)),
    set: async data => { window.__sets++; if (window.__failSets > 0) { window.__failSets--; throw { code: 'unavailable', message: 'mock outage' }; } await window.__dbSet(path, JSON.stringify(data)); },
    delete: async () => { await window.__dbSet(path, null); },
    acquire: async o => { const ok = await window.__dbAcquire(path, o.holder, o.ttlMs || 30000); return { acquired: ok, holder: ok ? o.holder : undefined }; },
    onSnapshot: (fn) => { (subs[path] = subs[path] || []).push(fn); window.__dbGet(path).then(j => fn(snap(path, j))); return () => { subs[path] = subs[path].filter(f => f !== fn); }; } });
  const q = c => ({ where: () => q(c), limit: () => q(c), orderBy: () => q(c), get: async () => ({ docs: [], size: 0, empty: true }) });
  const db = { doc, collection: c => Object.assign(q(c), { doc: id => doc(c + '/' + id) }) };
  const user = { id: async () => uid, can: async () => true, isOwner: async () => uid === 'u_0' };
  window.claude = { use: async n => n === 'db' ? db : n === 'user' ? user : null };
  window.__noRush = true;
})();
"""
class Net:
    def __init__(self): self.store={}; self.pages=[]; self.queues=[]; self.errs=[]; self.leases={}; self.lease_denied=0
    async def deliver(self, i):
        while True:
            path, js = await self.queues[i].get()
            await asyncio.sleep(random.uniform(0.01, 0.12))
            try: await self.pages[i].evaluate("([p,j]) => window.__fire && window.__fire(p,j)", [path, js])
            except Exception as e: pass
    async def add(self, b, i, vp, reduced=True):
        ctx = await b.new_context(viewport=vp, reduced_motion='reduce' if reduced else 'no-preference')
        pg = await ctx.new_page()
        async def dbset(src, path, js):
            await asyncio.sleep(random.uniform(0.005,0.06))
            if js is None: self.store.pop(path, None)
            else: self.store[path]=js
            for q in self.queues: q.put_nowait((path, js))
        async def dbget(src, path): await asyncio.sleep(random.uniform(0.005,0.04)); return self.store.get(path)
        async def acquire(src, path, holder, ttl):
            now=time.time(); cur=self.leases.get(path)
            if cur and cur[1] > now and cur[0] != holder: self.lease_denied+=1; return False
            self.leases[path]=(holder, now+ttl/1000); return True
        await ctx.expose_binding('__dbSet', dbset); await ctx.expose_binding('__dbGet', dbget); await ctx.expose_binding('__dbAcquire', acquire)
        await pg.add_init_script(MOCK % ('u_'+str(i)))
        pg.on('pageerror', lambda e, i=i: self.errs.append('P%d PAGEERR %s'%(i,e)))
        pg.on('console', lambda m, i=i: self.errs.append('P%d %s'%(i,m.text)) if m.type=='error' else None)
        self.pages.append(pg); self.queues.append(asyncio.Queue())
        asyncio.create_task(self.deliver(len(self.pages)-1))
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        return pg
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
js = lambda sel: "document.querySelector('%s').click()" % sel
BOT = """
window.__errs = window.__errs || []; window.addEventListener('error', e => window.__errs.push(String(e.message)));
clearInterval(window.__bot);
window.__bot = setInterval(() => {
  try {
    if (!G || G.phase !== 'play' || busy || pending > 0) return;
    if (modal && modal.kind === 'card') { closeModal(); return; }
    const s = G, c = E.cur(s);
    if (s.trade) { if (s.trade.to === me) act({ t: Math.random() < .5 ? 'accept' : 'reject' }); return; }
    if (s.stage === 'auction') { if (s.auc.who !== me) return; const nx = Math.max(10, s.auc.bid + 10); return act(nx <= s.players[me].cash && nx < 300 && Math.random() < .6 ? { t: 'bid', amt: nx } : { t: 'pass' }); }
    if (me !== c) return; const p = s.players[me];
    if (s.stage === 'roll') {
      const b = E.props(s, me).filter(i => E.canBuild(s, me, i));
      if (b.length && Math.random() < .5) return act({ t: 'build', tile: b[0] });
      if (Math.random() < .08 && s.order.length > 1) { const to = s.order.find(i => i !== me), gp = E.props(s, me).filter(i => E.tradeable(s, me, i)).slice(0, 1); return act({ t: 'propose', to, gc: 0, tc: Math.min(40, s.players[to].cash), gp, tp: [] }); }
      if (p.jail && p.cash >= 50 && Math.random() < .5) return act({ t: 'payJail' });
      return act({ t: 'roll' });
    }
    if (s.stage === 'buy') return act({ t: Math.random() < .9 ? 'buy' : 'skip' });
    if (s.stage === 'act') return act({ t: 'end' });
    if (s.stage === 'debt') { const m = E.props(s, me), h = m.filter(i => E.canSellHouse(s, me, i)), sp = m.filter(i => E.canSellProp(s, me, i)); if (h.length) return act({ t: 'sellHouse', tile: h[0] }); if (sp.length) return act({ t: 'sellProp', tile: sp[0] }); return act({ t: 'bankrupt' }); }
  } catch (e) { window.__errs.push('BOT ' + e.message); }
}, 40);
"""
