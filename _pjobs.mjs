import { chromium } from '@playwright/test';
const tmp='C:/Users/kmoul/AppData/Local/Temp/qa';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto('https://app.onservice.ph/auth/login',{waitUntil:'networkidle',timeout:45000}); await p.waitForTimeout(1500);
await p.locator('input').first().fill('9251234567'); await p.waitForTimeout(200);
await p.getByText('Send Verification Code').click(); await p.waitForTimeout(2200);
await p.locator('input[aria-label="Enter 6-digit code"]').focus(); await p.keyboard.type('000000',{delay:60}); await p.waitForTimeout(3500);
await p.goto('https://app.onservice.ph/jobs',{waitUntil:'networkidle',timeout:25000}); await p.waitForTimeout(2000);
await p.screenshot({path:`${tmp}/pj-active.png`,fullPage:true});
console.log('ACTIVE text:', (await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').slice(0,200));
// Completed tab
await p.getByText('Completed',{exact:true}).first().click(); await p.waitForTimeout(2000);
await p.screenshot({path:`${tmp}/pj-completed.png`,fullPage:true});
console.log('COMPLETED text:', (await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').slice(0,200));
await b.close();
