/** Installed-extension/native API smoke test using ONLY synthetic Instagram responses.
 * CHROME_PATH=/path/to/chrome PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser-smoke.cjs
 * Requires Chrome for Testing with WebMCPTesting. This is not an LLM/browser-agent test.
 */
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const profile=fs.mkdtempSync(path.resolve('.tooling/browser-smoke-'));
 const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_PATH,headless:true,args:[`--disable-extensions-except=${path.resolve('dist')}`,`--load-extension=${path.resolve('dist')}`,'--enable-features=WebMCPTesting','--enable-experimental-web-platform-features']});
 let posts=0;const errors=[];
 try{
  await context.route('https://www.instagram.com/**',route=>{
   if(route.request().method()==='POST'){posts++;return route.abort()}
   return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Synthetic Instagram fixture</title><p>Test only — no account data</p>'});
  });
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
  const instagram=await context.newPage();await instagram.goto('https://www.instagram.com/');
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`chrome-extension://${id}/agent.html`);
  await page.waitForFunction(()=>document.getElementById('native').textContent.includes('registered'));
  const native=await page.evaluate(async()=>{
   const tools=await document.modelContext.getTools();
   const names=tools.map(t=>t.name).sort();const t=tools.find(t=>t.name==='instagram_get_status');
   return {names,status:JSON.parse(await document.modelContext.executeTool(t,{}))};
  });
  assert.equal(native.names.length,8);assert.equal(native.status.accountId,null);assert.match(native.status.login,/logged out/);
  const invalid=await page.evaluate(async()=>{const t=(await document.modelContext.getTools()).find(t=>t.name==='instagram_start_scan');return JSON.parse(await document.modelContext.executeTool(t,{arbitrary:1}))});assert.match(invalid.error,/Invalid/);
  const mutation=await page.evaluate(async()=>{const t=(await document.modelContext.getTools()).find(t=>t.name==='instagram_execute_unfollow');return JSON.parse(await document.modelContext.executeTool(t,{preparationId:'forged'}))});assert.match(mutation.error,/logged into Instagram/);
  // Synthetic stable account cookie and API responses; never log into a real account.
  await context.addCookies([{name:'ds_user_id',value:'99',domain:'www.instagram.com',path:'/',secure:true}]);
  const baseline={schemaVersion:1,accountId:'99',capturedAt:'2026-01-01T00:00:00Z',complete:true,followers:[],following:[]};
  await page.evaluate(async baseline=>{await chrome.storage.local.set({iu_history_99:{latest:baseline}})},baseline);
  await context.unroute('https://www.instagram.com/**');
  await context.route('https://www.instagram.com/**',route=>{
   if(route.request().method()==='POST'){posts++;return route.abort()}
   const url=route.request().url();
   const body=url.includes('/info/')?{status:'ok',user:{pk:99,follower_count:2,following_count:2}}:{data:{user:{edge_followed_by:{count:2,edges:[],page_info:{has_next_page:false,end_cursor:null}}}}};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const start=await page.evaluate(async()=>{const t=(await document.modelContext.getTools()).find(t=>t.name==='instagram_start_scan');return JSON.parse(await document.modelContext.executeTool(t,{}))});assert.ok(start.jobId);
  await page.evaluate(id=>new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{chrome.storage.onChanged.removeListener(changed);reject(new Error('Scan did not settle'))},10000);
   const check=value=>{if(value?.id===id && value.status==='failed'){clearTimeout(timeout);chrome.storage.onChanged.removeListener(changed);resolve(true)}};
   const changed=changes=>check(changes.iu_job?.newValue);
   chrome.storage.onChanged.addListener(changed);
   chrome.storage.local.get('iu_job').then(s=>check(s.iu_job));
  }),start.jobId);
  const failed=await page.evaluate(async()=>chrome.storage.local.get(['iu_job','iu_history_99']));
  assert.match(failed.iu_job.error,/Incomplete/,JSON.stringify(failed));assert.deepEqual(failed.iu_history_99.latest,baseline);
  // Reloaded content host must invalidate any persisted running job.
  await page.evaluate(async()=>{await chrome.storage.local.set({iu_job:{id:'interrupted-test',status:'running',complete:false}})});
  await instagram.reload();
  const recovered=await page.evaluate(async()=>chrome.runtime.sendMessage({type:'instagram_get_status',input:{}}));assert.equal(recovered.lastJob.status,'interrupted');
  await page.goto(`chrome-extension://${id}/popup.html`);await page.getByRole('button',{name:'Open Agent / Review'}).waitFor();assert.ok(await page.getByRole('button',{name:'Start Scan',exact:true}).count());
  assert.equal(posts,0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browser:context.browser().version(),installedExtension:true,nativeDiscovery:native.names,nativeReadOnlyInvocation:native.status,baselinePreservedAfterFailure:true,reloadRecovery:true,popupRendered:true,realInstagramRequests:0,mutationRequests:posts,browserAgentInvocation:false},null,2));
 }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
