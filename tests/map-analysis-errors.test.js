import test from 'node:test';
import assert from 'node:assert/strict';
import {analysisJson,checkAnalysisResponse,publicMapError,structuredAnalysis,compatibleSchema} from '../server/map-analysis-errors.js';
import {analyzeTerrainLayout} from '../server/terrain-map.js';
import {PNG} from 'pngjs';

test('provider errors distinguish insufficient credits, rejected keys and rate limits',async()=>{
  for(const [status,pattern] of [[401,/API key/],[402,/credits/],[429,/rate limited/]]) {
    await assert.rejects(checkAnalysisResponse({ok:false,status,json:async()=>({})},'Map analysis'),error=>pattern.test(publicMapError(error).message));
  }
});
test('provider diagnostics redact credentials and embedded image data',async()=>{
  await assert.rejects(checkAnalysisResponse({ok:false,status:400,json:async()=>({error:{message:'Invalid model sk-private-token data:image/png;base64,AAAA'}})},'Map analysis'),error=>{
    const message=publicMapError(error).message;assert.match(message,/Invalid model/);assert.doesNotMatch(message,/sk-private|base64,AAAA/);return true;
  });
});
test('analysis handles text blocks and whitespace around JSON fences',()=>{
  assert.deepEqual(analysisJson({choices:[{message:{content:[{type:'text',text:'  ```json\n{"rows":[]}\n```  '}]}}]},'Layout'),{rows:[]});
  assert.throws(()=>analysisJson({choices:[{finish_reason:'length',message:{content:'{}'}}]},'Layout'),/stopped before completing/);
  assert.throws(()=>analysisJson({choices:[{message:{content:null}}]},'Layout'),/returned no result/);
});
test('timeouts and missing materials produce actionable browser errors',()=>{
  assert.equal(publicMapError({name:'TimeoutError'}).status,504);
  assert.match(publicMapError(new Error('Generate liquid paint before building a map containing water')).message,/liquid paint/);
  assert.equal(publicMapError(new Error('Database detail')).status,500);
});

test('missing commas between complete JSON values are repaired without evaluating expressions',()=>{
  const parse=content=>analysisJson({choices:[{message:{content}}]},'Layout');
  assert.deepEqual(parse('{"rows":["gggggggg"\n"dddddddd"] "regions":[{"x":1} {"x":2}]}'),{rows:['gggggggg','dddddddd'],regions:[{x:1},{x:2}]});
  assert.deepEqual(parse('{"text":"literal ] [ ,} and \\\"quotes\\\"" "ok":true}'),{text:'literal ] [ ,} and "quotes"',ok:true});
  assert.throws(()=>parse('{"rows":["g".repeat(32)]}'),/invalid JSON/);
  assert.throws(()=>parse('{"rows":["gggggggg"]'),/invalid JSON/);
});

test('large map analysis uses a compact overview while retaining full-resolution region coordinates',async()=>{
  const previous=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test';
  try{
    const region={type:'clearing',terrain:'g',points:[{x:44,y:30},{x:54,y:30},{x:54,y:40}],width:1,density:'sparse'};
    const result=await analyzeTerrainLayout(PNG.sync.write(new PNG({width:16,height:16})),{width:64,height:48},'exterior','',async(_url,options)=>{
      const body=JSON.parse(options.body),schema=body.response_format.json_schema.schema.properties.rows;
      assert.equal(schema.maxItems,24);assert.equal(schema.items.pattern,'^[gdwsaTBRFH]{32}$');assert.match(body.messages[0].content[0].text,/FULL 64 by 48/);
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({rows:Array(24).fill('g'.repeat(32)),regions:[region],patches:[],placements:[]})}}]})};
    });
    const png=PNG.sync.read(result);assert.equal(png.width,64);assert.equal(png.height,48);assert.deepEqual(result.dressing.regions,[region]);
  }finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
});

test('complete JSON tolerates commentary and trailing commas without changing strings',()=>{
  const content='Here is the layout:\n```json\n{"rows":["gggggggg",],"reason":"keep ,} and \\\"quoted\\\" text",}\n```';
  assert.deepEqual(analysisJson({choices:[{message:{content}}]},'Layout'),{rows:['gggggggg'],reason:'keep ,} and "quoted" text'});
  for(const content of ['{"rows":["gggggggg"]','{"rows":["g".repeat(8)]}','{"rows":[...data]}']){
    assert.throws(()=>analysisJson({choices:[{message:{content}}]},'Layout'),error=>error.invalidAnalysisJson===true);
  }
});
test('layout tolerates uppercase ground, lowercase props, spacing and cell arrays',async()=>{
  const previous=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test';
  try {
    const reference=PNG.sync.write(new PNG({width:16,height:16}));
    const image=await analyzeTerrainLayout(reference,{width:16,height:16},'exterior','',async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({rows:Array.from({length:16},(_,i)=>i===0?Array(16).fill('G'):'G G G G G G G G G G G G G G G t')})}}]})}));
    assert.equal(PNG.sync.read(image).height,16);
  }finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
});

test('map layout requests a strict grid schema and recovers once from invalid JSON',async()=>{
  const previous=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test';
  try{
    const reference=PNG.sync.write(new PNG({width:16,height:16}));let calls=0,originalImage;
    const image=await analyzeTerrainLayout(reference,{width:16,height:16},'exterior','',async(_url,options)=>{
      calls++;const body=JSON.parse(options.body);
      assert.equal(body.response_format.type,'json_schema');assert.equal(body.response_format.json_schema.strict,true);
      assert.equal(body.provider.require_parameters,true);
      const rows=body.response_format.json_schema.schema.properties.rows;
      assert.equal(rows.minItems,16);assert.equal(rows.maxItems,16);assert.equal(rows.items.pattern,'^[gdwsaTBRFH]{16}$');
      const image=body.messages[0].content[1].image_url.url;
      if(calls===1)originalImage=image;else{assert.equal(image,originalImage);assert.match(body.messages.at(-1).content,/previous response was not valid JSON/);assert.deepEqual(body.messages.at(-2),{role:'assistant',content:'{"rows": ["g".repeat(16)]}'});}
      return {ok:true,json:async()=>({choices:[{message:{content:calls===1?'{"rows": ["g".repeat(16)]}':JSON.stringify({rows:Array(16).fill('g'.repeat(16))})}}]})};
    });
    assert.equal(calls,2);assert.equal(PNG.sync.read(image).width,16);
  }finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
});

test('malformed JSON retry is bounded and provider failures are not retried',async()=>{
  const body={messages:[],response_format:{type:'json_schema'}};let calls=0;
  await assert.rejects(structuredAnalysis(body,'Layout',async()=>{calls++;return {ok:true,json:async()=>({choices:[{message:{content:'not JSON'}}]})};}),/invalid JSON/);
  assert.equal(calls,2);calls=0;
  await assert.rejects(structuredAnalysis(body,'Layout',async()=>{calls++;return {ok:false,status:402,json:async()=>({})};}),/credits/);
  assert.equal(calls,1);
});

test('nested provider errors expose the rejected schema field while redacting credentials',async()=>{
  await assert.rejects(checkAnalysisResponse({ok:false,status:400,json:async()=>({error:{message:'Provider returned error',metadata:{raw:JSON.stringify({error:{message:'Invalid response schema: placements.maximum is unsupported sk-provider-secret'}})}}})},'Map layout analysis'),error=>{
    assert.match(error.message,/placements.maximum is unsupported/);assert.doesNotMatch(error.message,/sk-provider-secret/);assert.equal(error.providerStatus,400);return true;
  });
});

test('HTTP 400 retries once using a compatible schema while retaining JSON structure and enums',async()=>{
  const format={type:'json_schema',json_schema:{name:'layout',strict:true,schema:{type:'object',properties:{rows:{type:'array',maxItems:24,items:{type:'string',pattern:'^[g]{16}$'}},x:{type:'integer',minimum:0,maximum:15},kind:{type:'string',enum:['Tree','Bush']}},required:['rows','x','kind'],additionalProperties:false}}};
  let calls=0;
  const result=await structuredAnalysis({messages:[],response_format:format},'Layout',async(_url,options)=>{
    const body=JSON.parse(options.body);calls++;
    if(calls===1){assert.equal(body.response_format.json_schema.schema.properties.x.minimum,0);return {ok:false,status:400,json:async()=>({error:{message:'Unsupported schema constraint'}})};}
    const schema=body.response_format.json_schema.schema;
    assert.equal(schema.properties.x.minimum,undefined);assert.equal(schema.properties.rows.maxItems,undefined);assert.equal(schema.properties.rows.items.pattern,undefined);
    assert.equal(body.response_format.type,'json_schema');assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.properties.kind.enum,['Tree','Bush']);
    return {ok:true,json:async()=>({choices:[{message:{content:'{"rows":["gggggggggggggggg"],"x":2,"kind":"Tree"}'}}]})};
  });
  assert.equal(calls,2);assert.equal(result.kind,'Tree');assert.equal(format.json_schema.schema.properties.x.minimum,0);
  assert.deepEqual(compatibleSchema({type:'string',enum:['x'],minLength:1}),{type:'string',enum:['x']});
});
