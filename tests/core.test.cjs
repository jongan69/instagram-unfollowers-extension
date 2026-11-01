const {test}=require('node:test');const assert=require('node:assert/strict');
const {collectPages,compareSnapshots,nonfollowers,validateSnapshot,readJSON,wait}=require('../.test-build/core/scan');
const {prepare,authorize,mutateOne}=require('../.test-build/core/cleanup');
const a=(id,username='u'+id)=>({id,username,full_name:'',profile_pic_url:''});
const page=(count,ids,next=false,cursor=null)=>({count,edges:ids.map(id=>({node:a(id)})),page_info:{has_next_page:next,end_cursor:cursor}});
const collect=(pages,signal=new AbortController().signal)=>{let n=0;return collectPages(async()=>pages[n++],signal,async()=>{},0)};
const snap=(followers,following,time='2026-01-01T00:00:00Z')=>({schemaVersion:1,accountId:'99',capturedAt:time,complete:true,followers:followers.map(x=>typeof x==='string'?a(x):x),following:following.map(x=>a(x))});
test('positive count with empty edges is never successful',async()=>{await assert.rejects(collect([page(3,[])]),/Incomplete/)});
test('empty zero count is complete',async()=>assert.deepEqual(await collect([page(0,[])]),[]));
test('deduplicate by stable ID while allowing page overlap',async()=>assert.deepEqual((await collect([page(3,['1','2'],true,'a'),page(3,['2','3'])])).map(x=>x.id),['1','2','3']));
for(const [name,pages,pattern] of [
 ['truncated terminal page',[page(2,['1'])],/Incomplete/],
 ['missing data',[undefined],/Malformed/],
 ['missing count',[{edges:[],page_info:{has_next_page:false}}],/Malformed/],
 ['invalid ID',[page(1,['x'])],/Malformed account/],
 ['count drift',[page(3,['1'],true,'a'),page(2,['2'])],/Count changed/],
 ['missing cursor',[page(3,['1'],true,null)],/cursor/],
 ['repeated cursor',[page(4,['1'],true,'a'),page(4,['2'],true,'a')],/cursor/],
 ['stalled duplicate edges',[page(3,['1'],true,'a'),page(3,['1'],true,'b')],/stalled/],
 ['excess unique count',[page(1,['1','2'])],/Incomplete/],
 ['rename mid-scan',[page(2,['1'],true,'a'),{...page(2,[]),edges:[{node:a('1','renamed')},{node:a('2')}]}],/changed/]
])test(name,async()=>assert.rejects(collect(pages),pattern));
test('abort stops request processing and delays',async()=>{const ac=new AbortController();ac.abort(new Error('cancel'));await assert.rejects(collect([page(0,[])],ac.signal),/cancel/);await assert.rejects(async()=>wait(10000,ac.signal),/cancel/)});
test('abort during pagination does not publish a result',async()=>{const ac=new AbortController();let calls=0;await assert.rejects(collectPages(async()=>{calls++;return page(2,['1'],true,'a')},ac.signal,async()=>{ac.abort(new Error('cancel'))},0),/cancel/);assert.equal(calls,1)});
for(const status of [404,429,500])test(`HTTP ${status} propagates`,async()=>assert.rejects(readJSON('https://example.test',new AbortController().signal,{},async()=>({ok:false,status})),new RegExp(status===429?'Rate limited':String(status))));
test('GraphQL errors and login errors propagate',async()=>{for(const json of [{errors:[{}]},{status:'fail'},{message:'login_required'}])await assert.rejects(readJSON('x',new AbortController().signal,{},async()=>({ok:true,json:async()=>json})),/rejected/)});
test('comparison uses IDs so rename is not an unfollow; absent cause inconclusive',()=>{const before=snap(['1','2'],['1','3']);const now=snap([a('1','renamed')],['1','3'],'2026-01-02T00:00:00Z');const c=compareSnapshots(before,now);assert.deepEqual(c.absentFollowers.map(x=>x.id),['2']);assert.match(c.interpretation,/inconclusive/);assert.deepEqual(nonfollowers(now).map(x=>x.id),['3'])});
test('reject partial, foreign-account, duplicate, extra-field and future baselines',()=>{const good=snap(['1'],['2']);assert.deepEqual(validateSnapshot(good,'99'),good);for(const bad of [{...good,complete:false},{...good,accountId:'98'},{...good,followers:[a('1'),a('1')]},{...good,extra:true},{...good,capturedAt:'2999-01-01'}])assert.throws(()=>validateSnapshot(bad,'99'));assert.throws(()=>compareSnapshots(good,good),/precede/)});
test('preparation requires fresh nonfollowers and preserves whitelist',()=>{const s=snap(['1'],['1','2'],new Date().toISOString());const candidates=[{id:'2',reason:'Reviewed entertainment-only promotion.'}];assert.equal(prepare(s,candidates,[]).users[0].id,'2');assert.throws(()=>prepare(s,candidates,['2']),/whitelisted/);assert.throws(()=>prepare(s,[{id:'1',reason:'x'}],[]),/nonfollower/);assert.throws(()=>prepare(snap([],['2']),candidates,[]),/older/)});
test('execution requires exact, current, single-use, unexpired account-bound approval',()=>{const p=prepare(snap([],['2'],new Date().toISOString()),[{id:'2',reason:'Reviewed entertainment-only meme.'}],[]);assert.throws(()=>authorize(p,p.id,'99',p.snapshotAt),/Approval/);const approved={...p,approvedAt:new Date().toISOString()};assert.equal(authorize(approved,p.id,'99',p.snapshotAt).consumed,true);for(const [list,id,owner,stamp] of [[approved,'wrong','99',p.snapshotAt],[approved,p.id,'98',p.snapshotAt],[approved,p.id,'99','new'],[{...approved,consumed:true},p.id,'99',p.snapshotAt],[{...approved,approvedAt:'2000-01-01'},p.id,'99',p.snapshotAt]])assert.throws(()=>authorize(list,id,owner,stamp),/Approval/)});
test('relationship must be explicitly nonreciprocal before POST and verified after',async()=>{let posts=0;for(const r of [{following:true,followed_by:true},{following:false,followed_by:false},{following:true}])await assert.rejects(mutateOne('2',async()=>r,async()=>posts++),/Relationship/);assert.equal(posts,0);let n=0;await mutateOne('2',async()=>({following:++n===1,followed_by:false}),async()=>posts++);assert.equal(posts,1);await assert.rejects(mutateOne('2',async()=>({following:true,followed_by:false}),async()=>posts++),/unverified/)});
test('stalled request times out and aborts fetch',async t=>{t.mock.timers.enable({apis:['setTimeout']});const request=readJSON('x',new AbortController().signal,{},async(url,opts)=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(opts.signal.reason),{once:true})));t.mock.timers.tick(30000);await assert.rejects(request,/stalled/);t.mock.timers.reset()});
