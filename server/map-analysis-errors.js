export function mapError(message,status=502){return Object.assign(new Error(message),{mapStatus:status});}

export async function checkAnalysisResponse(response,stage){
  if(response.ok)return;
  let detail='';
  try{
    const data=await response.json();
    if(typeof data.error?.message==='string')detail=data.error.message;
    let raw=data.error?.metadata?.raw;
    if(typeof raw==='string'){try{raw=JSON.parse(raw);}catch{raw={message:raw};}}
    const providerMessage=raw?.error?.message??raw?.message;
    if(typeof providerMessage==='string'&&providerMessage!==detail)detail+=`${detail?': ':''}${providerMessage}`;
  }catch{}
  if(process.env.OPENROUTER_API_KEY)detail=detail.split(process.env.OPENROUTER_API_KEY).join('[redacted]');
  detail=detail.replace(/sk-[\w-]+/g,'[redacted]').replace(/data:image\/[^\s"']+/g,'[image omitted]').slice(0,700);
  const hints={401:'OpenRouter rejected the API key. Check OPENROUTER_API_KEY on the server.',402:'Insufficient OpenRouter credits for map analysis.',403:'OpenRouter denied access to the configured map-analysis model.',429:'Map analysis is rate limited. Wait a moment and retry.'};
  throw Object.assign(mapError(hints[response.status]||`${stage} failed (HTTP ${response.status}).${detail?' '+detail:''}`),{providerStatus:response.status});
}

// Accept a complete object wrapped in provider commentary and remove trailing
// commas only outside strings. Never evaluate model output or invent missing data.
function completeJsonObject(text){
  const start=text.indexOf('{');if(start<0)return null;
  let quoted=false,escaped=false,depth=0,clean='';
  for(let i=start;i<text.length;i++){
    const c=text[i];
    if(quoted){clean+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"'){quoted=true;clean+=c;continue;}
    if(c==='{')depth++;if(c==='}')depth--;
    if(c===','&&/^\s*[}\]]/.test(text.slice(i+1)))continue;
    clean+=c;if(depth===0)return clean;
  }
  return null;
}

// Repair missing JSON separators only. Tokenization rejects executable syntax,
// comments and unknown literals; leaf values and closing brackets are untouched.
function separatedJson(text){
  const tokens=[];let i=0;
  while(i<text.length){
    if(/\s/.test(text[i])){i++;continue;}
    const rest=text.slice(i),match=rest.match(/^(?:"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\]:,])/);
    if(!match)return null;tokens.push(match[0]);i+=match[0].length;
  }
  let result='',previous='';
  for(const token of tokens){
    const ends=previous&&(previous[0]==='"'||/^(?:-?\d|true$|false$|null$|[}\]])/.test(previous));
    const begins=token[0]==='"'||/^(?:-?\d|true$|false$|null$|[{\[])/.test(token);
    if(ends&&begins)result+=',';
    result+=token;previous=token;
  }
  return result;
}

export function analysisJson(data,stage){
  const choice=data?.choices?.[0];
  if(choice?.finish_reason==='length')throw mapError(`${stage} stopped before completing its response. Try a smaller image or a different MAP_ANALYSIS_MODEL.`);
  const message=choice?.message;
  if(message?.refusal)throw mapError(`${stage} could not analyze this image. Try another image.`);
  let text=message?.content;
  if(Array.isArray(text))text=text.filter(part=>part.type==='text').map(part=>part.text).join('');
  if(typeof text!=='string'||!text.trim())throw mapError(`${stage} returned no result. Check that MAP_ANALYSIS_MODEL supports image analysis.`);
  try{return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}
  catch{
    const complete=completeJsonObject(text);
    if(complete){try{return JSON.parse(complete);}catch{}const separated=separatedJson(complete);if(separated){try{return JSON.parse(separated);}catch{}}}
    const error=Object.assign(mapError(`${stage} returned invalid JSON after analysis. Please retry.`),{invalidAnalysisJson:true});
    // Keep malformed content internal and bounded; do not expose it in errors/logs.
    Object.defineProperty(error,'analysisText',{value:text.slice(0,64000)});
    throw error;
  }
}

export async function structuredAnalysis(body,stage,fetcher=fetch,timeout=180000){
  let format=body.response_format;
  let invalidText;
  for(let attempt=0;attempt<2;attempt++){
    const messages=invalidText?[...body.messages,{role:'assistant',content:invalidText},{role:'user',content:'The previous response was not valid JSON. Correct that response and return only a complete JSON object matching the provided schema. Preserve the analyzed layout. Use literal row strings and literal arrays, quoted keys and strings, and commas between entries. Do not use JavaScript expressions, repeat(), comments, ellipses, trailing commas or Markdown. Include every required field.'}]:body.messages;
    const response=await fetcher('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',signal:AbortSignal.timeout(timeout),headers:{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({...body,response_format:format,messages,provider:{require_parameters:true}}),
    });
    try{await checkAnalysisResponse(response,stage);}
    catch(error){
      if(attempt===0&&error.providerStatus===400&&format?.type==='json_schema'){
        format=compatibleSchema(format);continue;
      }
      throw error;
    }
    try{return analysisJson(await response.json(),stage);}
    catch(error){if(attempt===0&&error.invalidAnalysisJson){invalidText=error.analysisText;continue;}throw error;}
  }
}

// Provider schema dialects differ. Keep JSON structure, types, enum values and
// required fields; enforce coordinate bounds and array limits in our own validator.
export function compatibleSchema(value){
  if(Array.isArray(value))return value.map(compatibleSchema);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!['minimum','maximum','minItems','maxItems','minLength','maxLength','pattern'].includes(key)).map(([key,item])=>[key,compatibleSchema(item)]));
}

export function publicMapError(error){
  if(error.selectionError)return {status:400,message:error.message};
  if(error.mapStatus)return {status:error.mapStatus,message:error.message};
  if(error.name==='TimeoutError'||error.name==='AbortError')return {status:504,message:'AI map analysis timed out. Please try again.'};
  if(error.message==='fetch failed')return {status:502,message:'Could not reach the map-analysis provider. Check the server internet connection and retry.'};
  if(error.message==='OPENROUTER_API_KEY is not configured')return {status:503,message:'Configure OPENROUTER_API_KEY in this project’s server environment.'};
  if(/^Generate (texture paint|wall paint|liquid paint|tree assets)/.test(error.message)||/^The tree border leaves/.test(error.message))return {status:400,message:error.message};
  return {status:500,message:'Map assembly failed on the server. Check the server terminal for details.'};
}
