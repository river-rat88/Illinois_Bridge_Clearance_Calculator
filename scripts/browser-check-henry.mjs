import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createHenryService } from '../src/henry-service.js';
import { makeServer } from '../server.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
// Live service uses cached snapshots if under five minutes old. No fixture value is drawn as live.
const service=createHenryService();let outage=false;
const server=makeServer({henryService:{get:()=>{if(outage)throw new Error('test outage');return service.get();}}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/henry`);
 await page.waitForFunction(()=>!document.getElementById('audit').disabled,{},{timeout:30000});
 assert.match(await page.locator('#checked').innerText(),/Evaluated/);
 assert.match(await page.locator('.snapshot').first().innerText(),/Unavailable/);
 assert.match(await page.locator('#stage').innerText(),/ft|Unavailable/);
 const downloadPromise=page.waitForEvent('download');await page.locator('#audit').click();const download=await downloadPromise;
 const stream=await download.createReadStream(),chunks=[];for await(const c of stream)chunks.push(c);
 const receipt=JSON.parse(Buffer.concat(chunks));assert.equal(receipt.result.clearance.valueFt,null);assert.ok(receipt.input.sources.stage.sha256);
 if(process.env.SCREENSHOT_DIR){await mkdir(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/henry-desktop.png`,fullPage:true});}
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(process.env.SCREENSHOT_DIR)await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/henry-mobile.png`,fullPage:true});
 outage=true;await page.locator('#refresh').click();await page.waitForFunction(()=>!document.getElementById('pilot-error').hidden);
 assert.equal(await page.locator('#stage').innerText(),'Unavailable');assert.equal(await page.locator('#forecast').innerText(),'Unavailable');assert.equal(await page.locator('#audit').isDisabled(),true);
 assert.deepEqual(errors,[]);console.log('Henry browser checks passed: desktop/mobile, source download, withheld clearance, API outage removes old readings.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
