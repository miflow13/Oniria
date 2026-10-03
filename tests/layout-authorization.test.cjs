const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {test} = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const {NextRequest} = require('next/server')

function loadRoute(env) {
  const source = readFileSync('src/app/api/library-layout-markers/route.ts', 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText
  const exports = {}
  vm.runInNewContext(code, {
    exports,
    process: {env},
    require: (id) => id === '@/sanity/env' ? {hasSanityConfig: false} : require(id),
    console,
  })
  return exports
}

for (const env of [
  {NODE_ENV: 'production', VERCEL_ENV: 'preview'},
  {NODE_ENV: 'production', VERCEL_ENV: 'production'},
  {NODE_ENV: 'production'},
]) {
  test(`public layout writes require a key: ${JSON.stringify(env)}`, async () => {
    const route = loadRoute(env)
    for (const method of ['POST', 'DELETE']) {
      const response = await route[method](new NextRequest('http://localhost/api/library-layout-markers', {method}))
      assert.equal(response.status, 403)
    }
  })
}

test('local development remains available and configured keys are enforced', async () => {
  const cases = [
    [{NODE_ENV: 'development'}, undefined, 503],
    [{NODE_ENV: 'production', LIBRARY_LAYOUT_AUTHORING_KEY: 'test-key'}, undefined, 403],
    [{NODE_ENV: 'production', LIBRARY_LAYOUT_AUTHORING_KEY: 'test-key'}, 'wrong', 403],
    [{NODE_ENV: 'production', LIBRARY_LAYOUT_AUTHORING_KEY: 'test-key'}, 'test-key', 503],
  ]
  for (const [env, key, status] of cases) {
    const response = await loadRoute(env).POST(new NextRequest('http://localhost/api/library-layout-markers', {
      method: 'POST', headers: key ? {'x-oniria-layout-key': key} : {},
    }))
    assert.equal(response.status, status)
  }
})
