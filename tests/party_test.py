import asyncio, json, urllib.request
from playwright.async_api import async_playwright
from mock import ARGS, js, BOT
BASE='http://127.0.0.1:8377/'
def srv(code):
    with urllib.request.urlopen(BASE+'api/party/'+code) as r: return json.loads(r.read())['state']
def post(path, key, body):
    req=urllib.request.Request(BASE+'api/'+path, data=json.dumps(body).encode(), headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read())
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', args=ARGS); P=[]; errs=[]; ctxs=[]
        for i in range(4):
            c = await b.new_context(viewport={'width':1280,'height':800} if i==0 else {'width':390,'height':800}, reduced_motion='reduce'); ctxs.append(c)
            pg = await c.new_page(); await pg.add_init_script("window.__noRush = true;")
            pg.on('pageerror', lambda e, i=i: errs.append('P%d PAGEERR %s'%(i,e))); pg.on('console', lambda m, i=i: errs.append('P%d %s'%(i,m.text)) if m.type=='error' and 'ERR_' not in m.text and 'status of 4' not in m.text else None)
            await pg.goto(BASE); await pg.wait_for_function("typeof Net!=='undefined' && Net.ready"); P.append(pg)
        ids=[await p.evaluate("myId") for p in P]; print('four separate guests:', len(set(ids))==4, '| start', await P[0].evaluate("wallet.coins+' coins, '+wallet.boxes+' box'"))
        await P[0].fill('#f-name','Hosty'); await P[0].evaluate("document.querySelector('[data-a=create]').click(); document.querySelector('[data-a=create]').click()")
        await P[0].wait_for_function("G && G.phase==='lobby'", timeout=15000); code=await P[0].evaluate("G.code")
        await P[1].evaluate(js('[data-a="page"][data-v="join"]')); await P[1].fill('#f-code','zzzz'); await P[1].evaluate(js('[data-a="join"]')); await asyncio.sleep(.8); print('wrong code ->', await P[1].evaluate("(document.querySelector('#toast')||{}).textContent"))
        for i in (1,2,3):
            await P[i].evaluate(js('[data-a="page"][data-v="join"]')); await P[i].fill('#f-name','Pal%d'%i); await P[i].fill('#f-code',code.lower())
        await asyncio.gather(*[P[i].evaluate(js('[data-a="join"]')) for i in (1,2,3)]); await asyncio.sleep(2.5)
        print('party', code, 'lobby on server:', [p['name'] for p in srv(code)['players']], '| seen by all:', [await p.evaluate("G&&G.players.length") for p in P])
        await P[3].evaluate(js('[data-a="leave"]')); await asyncio.sleep(1.2)
        await P[1].evaluate("F.look.skin=3; F.look.hair='bun'; F.look.hat='crown'; styleChanged()"); await asyncio.sleep(1.5)
        print('one left; restyle with an item not owned ->', [(p['name'],p['look']['hair'],p['look']['hat']) for p in srv(code)['players']])
        await P[0].evaluate("document.querySelector('[data-a=start]').click(); document.querySelector('[data-a=start]').click()")
        for p in P[:3]: await p.wait_for_function("G && G.phase==='play'", timeout=15000)
        # cheating attempts straight at the server
        s=srv(code); cur=s['players'][s['order'][s['turn']]]['id']; other=[i for i in range(3) if ids[i]!=cur][0]; okey=await P[other].evaluate("KEY")
        print('roll out of turn ->', post('party/'+code, okey, {'op':'act','a':{'t':'roll'}})[1].get('message'), '| stranger moves ->', post('party/'+code, 'x'*40, {'op':'act','a':{'t':'roll'}})[1].get('message'), '| bogus move ->', post('party/'+code, okey, {'op':'act','a':{'t':'win'}})[1].get('message'), '| buy crown with 10k ->', post('shop', okey, {'op':'buy','item':'crown'})[1].get('message'))
        for p in P[:3]: await p.evaluate(BOT)
        await asyncio.sleep(25)
        # one player drops off the network for a while, then comes back
        await ctxs[2].set_offline(True); await asyncio.sleep(8); v_off=await P[2].evaluate("G.v"); await ctxs[2].set_offline(False); await asyncio.sleep(9)
        for p in P[:3]: await p.evaluate("clearInterval(window.__bot)")
        await asyncio.sleep(3); s=srv(code)
        print('after play: server v', s['v'], '| pages', [await p.evaluate("G.v") for p in P[:3]], '| offline page was at', v_off, '| identical to server:', [json.dumps(json.loads(await p.evaluate("JSON.stringify(G)")),sort_keys=True)==json.dumps(s,sort_keys=True) for p in P[:3]])
        print('  streets owned', len(s['own']), '| auctions held:', sum(1 for e in s['log'] if 'auction' in e['m']), '| cash', [p['cash'] for p in s['players']])
        for i in range(3): print('  P%d coins: page %s, server %s' % (i, await P[i].evaluate("wallet.coins"), post('me', await P[i].evaluate("KEY"), {})[1]['wallet']['coins']))
        # reload mid-game; buy and wear a cap; everyone sees it
        await P[1].reload(); await P[1].wait_for_function("typeof G!=='undefined' && G && G.phase==='play'", timeout=20000); print('reload mid-game: seat', await P[1].evaluate("me"), '| coins kept', await P[1].evaluate("wallet.coins"))
        await P[1].evaluate("wardrobeModal(); F.wtab='shop'; F.sel='cap'; refreshModal()"); await P[1].evaluate(js('[data-a=buy]')); await asyncio.sleep(2.5)
        me1=await P[1].evaluate("me"); print('bought a cap mid-game: others see', [await p.evaluate("G.players[%d].look.hat" % me1) for p in (P[0],P[2])], '| server owns', post('me', await P[1].evaluate("KEY"), {})[1]['wallet']['own'])
        await P[1].evaluate("closeModal()")
        # end the game (server test hook is off in production; here the clock is simply run out by the rules), then a rematch
        for p in P[:3]: await p.evaluate(BOT)
        print('ERRS so far', errs[:6])
        await b.close()
asyncio.run(main())
