const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {test} = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const {NextRequest} = require('next/server')

for (const env of [{NODE_ENV:'production',VERCEL_ENV:'production'}, {NODE_ENV:'production',VERCEL_ENV:'preview'}, {NODE_ENV:'production'}]) {
 test(`public world reads published documents with server credentials: ${JSON.stringify(env)}`,async()=>{
  const configs=[]
  const client={withConfig(config){configs.push(config);return {fetch:async()=>({districts:[]})}}}
  const source=readFileSync('src/app/api/library-world/route.ts','utf8')
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const exports={}
  vm.runInNewContext(code,{exports,process:{env:{...env,SANITY_API_READ_TOKEN:'test-read-token'}},console,require(id){
   if(id==='@/sanity/env')return {hasSanityConfig:true}
   if(id==='@/sanity/lib/client')return {client}
   if(id==='@/sanity/lib/queries')return {}
   if(id==='@/lib/libraryWorldConfig')return {DEFAULT_LIBRARY_WORLD_CONFIG:{},mergeLibraryWorldConfig:v=>({...v})}
   return require(id)
  }})
  const response=await exports.GET(new NextRequest('http://localhost/api/library-world?preview=1'))
  assert.equal(response.status,200)
  assert.equal(configs[0].perspective,'published')
  assert.equal(configs[0].token,'test-read-token')
  const body=await response.json()
  assert.equal(body.syncMode,'published')
  assert.equal(body.sanitySyncIssue,undefined)
 })
}
