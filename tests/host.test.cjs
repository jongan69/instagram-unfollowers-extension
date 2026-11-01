const {test}=require('node:test');const assert=require('node:assert/strict');
const tick=()=>new Promise(r=>setImmediate(r));
const path=require.resolve('../.test-build/content/content');
function host(fetcher){
 const data={};let listener;global.__iuHost=false;global.document={cookie:'ds_user_id=99; csrftoken=test'};global.fetch=fetcher;
 global.chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listener=fn}},storage:{local:{get:async k=>typeof k==='string'?{[k]:data[k]}:data,set:async s=>Object.assign(data,structuredClone(s))}}};
 delete require.cache[path];require(path);
 const send=(type,input={},sender={id:'test',url:'chrome-extension://test/agent.html'})=>new Promise(resolve=>{const accepted=listener({type,input},sender,resolve);if(!accepted)resolve({rejected:true})});
 return {data,send};
}
const profile={status:'ok',user:{pk:99,follower_count:1,following_count:1}};
const user={id:'1',username:'someone',full_name:'Someone',profile_pic_url:''};
const page={count:1,edges:[{node:user}],page_info:{has_next_page:false,end_cursor:null}};
const json=x=>({ok:true,json:async()=>x});
const complete={schemaVersion:1,accountId:'99',capturedAt:'2026-01-01T00:00:00Z',complete:true,followers:[user],following:[user]};
async function finished(send){for(let i=0;i<1500;i++){const s=await send('GET_STATUS');if(s.job && s.job.status!=='running')return s.job;await new Promise(r=>setTimeout(r,10))}throw new Error('job never settled')}
test('host scan failure preserves exact baseline and last valid UI results; errors visible',async()=>{
 const {data,send}=host(async url=>json(url.includes('/info/')?profile:{data:{user:{edge_followed_by:{...page,edges:[]}}}}));data.iu_history_99={latest:complete};data.iu_app_state={accountId:'99',results:[user],status:'scanning_done'};
 const started=await send('instagram_start_scan');assert.ok(started.jobId);const j=await finished(send);assert.equal(j.status,'failed');assert.equal(j.complete,false);assert.match(j.error,/Incomplete/);assert.deepEqual(data.iu_history_99,{latest:complete});assert.deepEqual(data.iu_app_state.results,[user]);assert.match(data.iu_app_state.error,/Incomplete/);
});
test('complete host scan atomically rotates valid snapshot and publishes both lists',async()=>{
 const urls=[];const {data,send}=host(async url=>{urls.push(url);return json({data:{user:url.includes('c761')?{edge_followed_by:page}:{edge_follow:page}}})});data.iu_history_99={latest:complete};await send('START_SCAN');const j=await finished(send);assert.equal(j.status,'complete');assert.equal(j.complete,true);assert.deepEqual(data.iu_history_99.previous,complete);assert.equal(data.iu_history_99.latest.followers.length,1);assert.equal(data.iu_app_state.status,'scanning_done');assert.equal((await send('instagram_get_nonfollowers')).accounts.length,0);assert.equal(urls.length,4);assert.ok(urls.every(u=>u.includes('/graphql/query/')));assert.equal(urls.filter(u=>JSON.parse(new URL(u).searchParams.get('variables')).first===1).length,2);
});
test('cancellation aborts in-flight fetch, returns promptly, preserves baseline',async()=>{
 const {data,send}=host(async(url,opts)=>{if(url.includes('/info/'))return json(profile);return new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(opts.signal.reason),{once:true}))});data.iu_history_99={latest:complete};const start=await send('START_SCAN');await tick();const cancelled=await send('instagram_cancel_scan',{jobId:start.jobId});assert.equal(cancelled.status,'cancelling');assert.equal((await finished(send)).status,'cancelled');assert.deepEqual(data.iu_history_99,{latest:complete});
});
test('host rejects external senders, direct mutation, malformed envelope, and unapproved execution',async()=>{
 let requests=0;const {data,send}=host(async()=>{requests++;throw new Error('must not fetch')});assert.equal((await send('START_SCAN',{}, {id:'test',url:'https://www.instagram.com/'})).rejected,true);assert.match((await send('START_UNFOLLOW',{userIds:['1']})).error,/Invalid command/);data.iu_history_99={latest:complete};assert.match((await send('instagram_execute_unfollow',{preparationId:'forged'})).error,/Approval/);assert.equal(requests,0);
});
test('reload forgets active approval/job and new host cannot execute old approval',async()=>{
 const {data,send}=host(async()=>{throw new Error('no network')});const fresh={...complete,capturedAt:new Date().toISOString(),followers:[]};data.iu_history_99={latest:fresh};const p=await send('instagram_prepare_unfollow',{candidates:[{id:'1',reason:'Reviewed entertainment-only meme account.'}]});assert.ok(p.id);await send('APPROVE_PREPARATION',{preparationId:p.id});const h2=host(async()=>{throw new Error('no network')});h2.data.iu_history_99={latest:fresh};assert.match((await h2.send('instagram_execute_unfollow',{preparationId:p.id})).error,/Approval/);
});
test('import validates logged-in account and cannot replace current history with partial data',async()=>{
 const {data,send}=host(async()=>{throw new Error('no network')});data.iu_history_99={latest:{...complete,capturedAt:'2026-01-02T00:00:00Z'}};const before=structuredClone(data.iu_history_99);assert.ok((await send('IMPORT_BASELINE',{snapshot:{...complete,accountId:'88'}})).error);assert.ok((await send('IMPORT_BASELINE',{snapshot:{...complete,complete:false}})).error);assert.deepEqual(data.iu_history_99,before);assert.equal((await send('IMPORT_BASELINE',{snapshot:complete})).success,true);assert.deepEqual(data.iu_history_99.previous,complete);
});
test('approved mutation stops immediately on rate limit and approval cannot be replayed',async()=>{
 let posts=0,reads=0;const {data,send}=host(async(url,opts)=>{
  if(opts.method==='POST'){posts++;return {ok:false,status:429}}
  reads++;return json({following:true,followed_by:false});
 });
 const two={...user,id:'2',username:'second'};data.iu_history_99={latest:{...complete,capturedAt:new Date().toISOString(),followers:[],following:[user,two]}};
 const p=await send('instagram_prepare_unfollow',{candidates:[{id:'1',reason:'Reviewed entertainment-only memes.'},{id:'2',reason:'Reviewed party promotion only.'}]});
 assert.equal((await send('APPROVE_PREPARATION',{preparationId:p.id})).approved,true);
 const start=await send('instagram_execute_unfollow',{preparationId:p.id});assert.ok(start.jobId);const j=await finished(send);assert.match(j.error,/Rate limited/);assert.equal(posts,1);assert.equal(reads,1);
 delete data.iu_rate_limit;data.iu_job.error='already observed';assert.match((await send('instagram_execute_unfollow',{preparationId:p.id})).error,/Approval/);assert.equal(posts,1);
});
test('account switch clears legacy display without deleting previous account history',async()=>{const {data,send}=host(async()=>{throw new Error('no network')});data.iu_history_99={latest:complete};data.iu_app_state={accountId:'88',results:[user],status:'scanning_done'};await send('GET_STATUS');assert.deepEqual(data.iu_history_99.latest,complete);assert.equal(data.iu_app_state.accountId,'99');assert.equal(data.iu_app_state.results[0].id,'1');global.document.cookie='ds_user_id=88';await send('GET_STATUS');assert.deepEqual(data.iu_app_state.results,[]);assert.deepEqual(data.iu_history_99.latest,complete)});
test('initial GraphQL 429 persists diagnostics and blocks repeated starts across host reload',async()=>{
 let requests=0;const h=host(async()=>{requests++;return {ok:false,status:429,headers:{get:()=> '1800'}}});h.data.iu_history_99={latest:complete};await h.send('START_SCAN');const failed=await finished(h.send);assert.equal(failed.phase,'followers');assert.equal(failed.diagnostic.endpoint,'/graphql/query/');assert.equal(failed.diagnostic.retryAfterSeconds,1800);assert.ok(h.data.iu_rate_limit.until>Date.now()+1700000);assert.match((await h.send('START_SCAN')).error,/cooldown/);assert.equal(requests,1);assert.deepEqual(h.data.iu_history_99.latest,complete);
 const reloaded=host(async()=>{requests++;throw new Error('must not request')});Object.assign(reloaded.data,h.data);assert.match((await reloaded.send('START_SCAN')).error,/cooldown/);assert.equal(requests,1);
});
test('a failed atomic publication cannot rotate the complete baseline',async()=>{
 const h=host(async url=>json(url.includes('/info/')?profile:{data:{user:url.includes('c761')?{edge_followed_by:page}:{edge_follow:page}}}));h.data.iu_history_99={latest:complete};const set=global.chrome.storage.local.set;global.chrome.storage.local.set=async x=>{if(x.iu_history_99)throw new Error('storage commit failed');return set(x)};
 await h.send('START_SCAN');assert.equal((await finished(h.send)).status,'failed');assert.deepEqual(h.data.iu_history_99,{latest:complete});
});
test('previous-version rate-limit failures seed a cooldown without issuing another request',async()=>{let requests=0;const h=host(async()=>{requests++;throw new Error('must not fetch')});h.data.iu_job={status:'failed',error:'Rate limited. Stop and retry later.',finishedAt:new Date().toISOString()};assert.match((await h.send('START_SCAN')).error,/cooldown/);assert.equal(requests,0)});
test('closing count drift cannot publish a snapshot',async()=>{let reads=0;const h=host(async()=>{reads++;return json({data:{user:{edge_followed_by:reads>=3?{...page,count:2}:page,edge_follow:page}}})});h.data.iu_history_99={latest:complete};await h.send('START_SCAN');assert.match((await finished(h.send)).error,/counts changed/);assert.deepEqual(h.data.iu_history_99,{latest:complete})});
test('account switch aborts pending scan rather than showing it running indefinitely',async()=>{const h=host(async(url,opts)=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(opts.signal.reason),{once:true})));h.data.iu_history_99={latest:complete};await h.send('START_SCAN');await new Promise(r=>setTimeout(r,10));global.document.cookie='ds_user_id=88';await h.send('GET_STATUS');assert.equal((await finished(h.send)).status,'cancelled');assert.deepEqual(h.data.iu_history_99,{latest:complete})});
