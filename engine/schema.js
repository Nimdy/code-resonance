'use strict';
// A small JSON Schema validator for the subset of draft 2020-12 the visual pack manifest uses (packs/schema), so the
// same schema file serves editors and the receiver without a dependency. Supported keywords: $ref (local), $defs, type,
// enum, const, pattern (unicode), minLength, maxLength, minimum, maximum, items, minItems, maxItems, uniqueItems,
// properties, required, additionalProperties, patternProperties, propertyNames, minProperties, maxProperties,
// allOf, anyOf, oneOf, not, if/then/else. Annotations (title, description, $comment, default, examples) are ignored.
const KNOWN=new Set(['$schema','$id','$ref','$defs','$comment','title','description','default','examples','type','enum','const','pattern','minLength','maxLength',
  'minimum','maximum','items','minItems','maxItems','uniqueItems','properties','required','additionalProperties','patternProperties','propertyNames',
  'minProperties','maxProperties','allOf','anyOf','oneOf','not','if','then','else']);
const typeOf=v=>v===null?'null':Array.isArray(v)?'array':Number.isInteger(v)?'integer':typeof v;
const matchesType=(v,t)=>t==='number'?typeof v==='number'&&Number.isFinite(v):typeOf(v)===t;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function compile(root){
  const patterns=new Map();const re=p=>{if(!patterns.has(p))patterns.set(p,new RegExp(p,'u'));return patterns.get(p);};
  const resolve=ref=>{if(!ref.startsWith('#/'))throw new Error(`Only local $ref is supported: ${ref}`);
    return ref.slice(2).split('/').reduce((n,k)=>n?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],root);};
  function check(schema,v,at,errors){
    if(schema===true)return;if(schema===false){errors.push({at,message:'is not allowed'});return;}
    for(const k of Object.keys(schema))if(!KNOWN.has(k))throw new Error(`Unsupported schema keyword "${k}" at ${at||'/'}`);
    if(schema.$ref){const target=resolve(schema.$ref);if(!target)throw new Error(`Unresolved $ref ${schema.$ref}`);check(target,v,at,errors);}
    if(schema.type!==undefined){const types=[].concat(schema.type);if(!types.some(t=>matchesType(v,t))){errors.push({at,message:`must be ${types.join(' or ')}`});return;}}
    if(schema.enum&&!schema.enum.some(x=>equal(x,v)))errors.push({at,message:`must be one of ${schema.enum.map(x=>JSON.stringify(x)).join(', ')}`});
    if(schema.const!==undefined&&!equal(schema.const,v))errors.push({at,message:`must be ${JSON.stringify(schema.const)}`});
    if(typeof v==='string'){
      const n=[...v].length;
      if(schema.minLength!==undefined&&n<schema.minLength)errors.push({at,message:`must be at least ${schema.minLength} characters`});
      if(schema.maxLength!==undefined&&n>schema.maxLength)errors.push({at,message:`must be at most ${schema.maxLength} characters`});
      if(schema.pattern&&!re(schema.pattern).test(v))errors.push({at,message:`does not match ${schema.pattern}`});
    }
    if(typeof v==='number'){
      if(schema.minimum!==undefined&&v<schema.minimum)errors.push({at,message:`must be >= ${schema.minimum}`});
      if(schema.maximum!==undefined&&v>schema.maximum)errors.push({at,message:`must be <= ${schema.maximum}`});
    }
    if(Array.isArray(v)){
      if(schema.minItems!==undefined&&v.length<schema.minItems)errors.push({at,message:`must have at least ${schema.minItems} items`});
      if(schema.maxItems!==undefined&&v.length>schema.maxItems)errors.push({at,message:`must have at most ${schema.maxItems} items`});
      if(schema.uniqueItems&&new Set(v.map(x=>JSON.stringify(x))).size!==v.length)errors.push({at,message:'must not repeat items'});
      if(schema.items)v.forEach((x,i)=>check(schema.items,x,`${at}/${i}`,errors));
    }
    if(v&&typeof v==='object'&&!Array.isArray(v)){
      const keys=Object.keys(v);
      if(schema.minProperties!==undefined&&keys.length<schema.minProperties)errors.push({at,message:`must have at least ${schema.minProperties} entries`});
      if(schema.maxProperties!==undefined&&keys.length>schema.maxProperties)errors.push({at,message:`must have at most ${schema.maxProperties} entries`});
      for(const r of schema.required||[])if(!(r in v))errors.push({at,message:`must have "${r}"`});
      for(const k of keys){
        const path=`${at}/${k}`;let known=false;
        if(schema.propertyNames)check(schema.propertyNames,k,path,errors);
        if(schema.properties&&k in schema.properties){known=true;check(schema.properties[k],v[k],path,errors);}
        for(const [p,s] of Object.entries(schema.patternProperties||{}))if(re(p).test(k)){known=true;check(s,v[k],path,errors);}
        if(!known&&schema.additionalProperties!==undefined){if(schema.additionalProperties===false)errors.push({at:path,message:'is not a known field'});else check(schema.additionalProperties,v[k],path,errors);}
      }
    }
    for(const s of schema.allOf||[])check(s,v,at,errors);
    if(schema.anyOf&&!schema.anyOf.some(s=>{const e=[];check(s,v,at,e);return !e.length;}))errors.push({at,message:'matches none of the allowed forms'});
    if(schema.oneOf){const ok=schema.oneOf.filter(s=>{const e=[];check(s,v,at,e);return !e.length;}).length;if(ok!==1)errors.push({at,message:ok?'matches more than one allowed form':'matches none of the allowed forms'});}
    if(schema.not){const e=[];check(schema.not,v,at,e);if(!e.length)errors.push({at,message:'is not allowed here'});}
    if(schema.if){const e=[];check(schema.if,v,at,e);if(!e.length){if(schema.then)check(schema.then,v,at,errors);}else if(schema.else)check(schema.else,v,at,errors);}
  }
  return value=>{const errors=[];check(root,value,'',errors);return errors.map(e=>({...e,at:e.at||'/'}));};
}
module.exports={compile};
