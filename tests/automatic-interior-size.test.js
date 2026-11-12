import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseInteriorSize} from '../server/interior-size.js';

test('automatic interior sizing uses the design brief and accepts only supported presets',async()=>{
  const old=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test';
  try{
    const choose=size=>chooseInteriorSize(null,{title:'Church',description:'Pews and a central aisle',generatedAssets:[]},async(url,options)=>{
      const body=JSON.parse(options.body);assert.match(body.messages[0].content[0].text,/never image resolution/);assert.match(body.messages[0].content[0].text,/Church/);
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({size,reason:'Space for seating and circulation'})}}]})};
    });
    assert.equal(await choose('large'),'large');
    await assert.rejects(choose('huge'),/supported interior size/);
  }finally{if(old===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=old;}
});
