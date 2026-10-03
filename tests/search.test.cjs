const assert=require('node:assert/strict')
const {readFileSync}=require('node:fs')
const {test}=require('node:test')
const vm=require('node:vm')
const ts=require('typescript')
const {NextRequest}=require('next/server')
test('search excludes unrelated feed entries and finds matching tag content',async()=>{
 const urls=[]; const exports={}
 const code=ts.transpileModule(readFileSync('src/app/api/devto/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(code,{exports,require,URL,console,fetch:async url=>{
  urls.push(url)
  return {ok:true,json:async()=>url.includes('tag=typescript')?[{id:2,title:'Typed functions',tag_list:['typescript']}]:[{id:1,title:'A cooking tutorial',tag_list:['food']} ]}
 }})
 const response=await exports.GET(new NextRequest('http://localhost/api/devto?mode=search&q=typescript'))
 assert.equal(response.status,200)
 const body=await response.json()
 assert.deepEqual(body.articles.map(a=>a.id),[2])
 assert.ok(urls.every(url=>!url.includes('/articles/search')))
})
