/** Installed-extension test. Synthetic Instagram only; never logs in or sends real unfollows.
 * CHROME_PATH=/path/to/chrome PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser-smoke.cjs
 * TEST_LEGACY_DOMAIN=1 reproduces Chrome 156 domain-keyed context; NO_WEBMCP=1 verifies fallback.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 fs.mkdirSync('.tooling',{recursive:true});const profile=fs.mkdtempSync(path.resolve('.tooling/browser-smoke-'));
 const args=[`--disable-extensions-except=${path.resolve('dist')}`,`--load-extension=${path.resolve('dist')}`,...(!process.env.NO_WEBMCP?['--enable-features=WebMCPTesting','--enable-experimental-web-platform-features']:[]),...(process.env.TEST_LEGACY_DOMAIN?['--disable-features=OriginAgentClusterDefaultEnabled']:[])];
 const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_PATH,headless:true,args});
 let mutations=0,reads=0,scenario='empty';const errors=[];
 const html='<!doctype html><title>Synthetic Instagram fixture</title><main><h2>tester</h2><a href="/accounts/edit/">Edit profile</a><a>2 followers</a><a>2 following</a></main>';
 const raw=id=>({pk_id:id,username:'u'+id,full_name:'Test '+id,profile_pic_url:'',is_private:false,is_verified:false});
 const baseline={schemaVersion:1,accountId:'99',capturedAt:'2026-01-01T00:00:00Z',complete:true,followers:[],following:[]};
 try{
  await context.route('https://www.instagram.com/**',route=>{
   const req=route.request(),url=new URL(req.url());
   if(req.method()==='POST'){mutations++;return route.abort()}
   if(url.pathname==='/tester/')return route.fulfill({status:200,contentType:'text/html',body:html});
   reads++;assert.ok(url.pathname.includes('/api/v1/friendships/99/'));assert.equal(req.headers()['x-ig-app-id'],'936619743392459');assert.equal(req.headers()['x-requested-with'],'XMLHttpRequest');
   if(scenario==='rate')return route.fulfill({status:429,headers:{'Retry-After':'1800'},body:'limited'});
   let body={status:'ok',users:[]};
   if(scenario==='complete')body=url.pathname.includes('/followers/')?(url.searchParams.has('max_id')?{status:'ok',users:[raw('2')],has_more:true}:{status:'ok',users:[raw('1')],has_more:true,next_max_id:'page2'}):{status:'ok',users:[raw('1'),raw('3')],has_more:false};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
  const instagram=await context.newPage();await instagram.goto('https://www.instagram.com/tester/');
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`chrome-extension://${id}/agent.html`);
  await page.waitForFunction(()=>!document.getElementById('native').textContent.includes('Checking'));
  assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
  let names=[];
  if(!process.env.NO_WEBMCP){
   await page.getByText('Native WebMCP registered on this extension tab.',{exact:false}).waitFor();
   names=await page.evaluate(async()=>Array.from(await document.modelContext.getTools(),t=>t.name));assert.equal(names.length,8);
   const status=await page.evaluate(async()=>{const t=(await document.modelContext.getTools()).find(t=>t.name==='instagram_get_status');return JSON.parse(await document.modelContext.executeTool(t,{}))});assert.equal(status.accountId,null);
   const invalid=await page.evaluate(async()=>{const t=(await document.modelContext.getTools()).find(t=>t.name==='instagram_start_scan');return JSON.parse(await document.modelContext.executeTool(t,{arbitrary:1}))});assert.match(invalid.error,/Invalid/);
  }else await page.getByText('Native WebMCP unavailable.',{exact:false}).waitFor();
  await context.addCookies([{name:'ds_user_id',value:'99',domain:'www.instagram.com',path:'/',secure:true},{name:'csrftoken',value:'synthetic',domain:'www.instagram.com',path:'/',secure:true}]);
  await page.evaluate(async baseline=>chrome.storage.local.set({iu_history_99:{latest:baseline}}),baseline);
  const send=(type,input={})=>page.evaluate(({type,input})=>chrome.runtime.sendMessage({type,input}),{type,input});
  async function settled(jobId){return page.evaluate(id=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{chrome.storage.onChanged.removeListener(changed);reject(new Error('Job did not settle'))},15000);const check=j=>{if(j?.id===id&&!['running','paused'].includes(j.status)){clearTimeout(timer);chrome.storage.onChanged.removeListener(changed);resolve(j)}};const changed=c=>check(c.iu_job?.newValue);chrome.storage.onChanged.addListener(changed);chrome.storage.local.get('iu_job').then(s=>check(s.iu_job))}),jobId)}
  const first=await send('instagram_start_scan');assert.ok(first.jobId);assert.match((await settled(first.jobId)).error,/Incomplete/);assert.deepEqual((await page.evaluate(()=>chrome.storage.local.get('iu_history_99'))).iu_history_99.latest,baseline);
  scenario='complete';const start=await send('instagram_start_scan');assert.ok(start.jobId);assert.equal((await settled(start.jobId)).complete,true);
  await page.getByRole('button',{name:'Refresh extension status'}).click();await page.getByRole('link',{name:'@u3',exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'Review @u3',exact:true}).check();await page.getByRole('textbox',{name:'Cleanup reason for @u3'}).fill('Reviewed entertainment-only promotion; no useful or personal connection identified.');
  // Refresh should not destroy focused account inputs every polling cycle.
  await page.getByRole('textbox',{name:'Cleanup reason for @u3'}).focus();await page.waitForTimeout(3300);assert.equal(await page.getByRole('textbox',{name:'Cleanup reason for @u3'}).evaluate(e=>e===document.activeElement),true);assert.match(await page.getByRole('textbox',{name:'Cleanup reason for @u3'}).inputValue(),/entertainment-only/);
  await page.getByRole('button',{name:'Prepare review list',exact:true}).click();await page.getByRole('button',{name:'Approve this exact list',exact:true}).waitFor();
  const s=await send('instagram_get_status');assert.equal(s.preparation.users[0].id,'3');assert.match((await send('instagram_execute_unfollow',{preparationId:s.preparation.id})).error,/Approval/);assert.equal(mutations,0);
  await page.getByRole('button',{name:'Protect @u3',exact:true}).click();assert.equal(await page.getByRole('checkbox',{name:'Review @u3',exact:true}).isDisabled(),true);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:process.env.NO_WEBMCP?'.tooling/workbench-fallback-mobile.png':'.tooling/workbench-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:1000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await page.getByRole('heading',{name:'Instagram — Agent & Review',exact:true}).count(),1);await page.screenshot({path:process.env.NO_WEBMCP?'.tooling/workbench-fallback-desktop.png':'.tooling/workbench-desktop.png',fullPage:false});
  scenario='rate';const rateStart=await send('instagram_start_scan');assert.ok(rateStart.jobId);const fail=await settled(rateStart.jobId);assert.equal(fail.diagnostic.httpStatus,429);const before=reads;assert.match((await send('instagram_start_scan')).error,/cooldown/);assert.equal(reads,before);
  await page.evaluate(()=>chrome.storage.local.set({iu_job:{id:'interrupted-test',status:'running',complete:false}}));await instagram.reload();assert.equal((await send('instagram_get_status')).lastJob.status,'interrupted');
  await page.goto(`chrome-extension://${id}/popup.html`);await page.getByRole('button',{name:'Open Agent / Review'}).waitFor();assert.deepEqual(errors,[]);assert.equal(mutations,0);
  console.log(JSON.stringify({browser:context.browser().version(),installedExtension:true,nativeTools:names.length,manualFallback:!!process.env.NO_WEBMCP,completeRESTScan:true,pagination:true,baselinePreservation:true,reasonInputPreserved:true,exactListPreparation:true,unapprovedMutationRejected:true,protectedAccounts:true,responsive:true,rateLimitCooldown:true,reloadRecovery:true,realInstagramRequests:0,mutationRequests:mutations,actualBrowserAgentInvocation:false},null,2));
 }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
