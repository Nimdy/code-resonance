'use strict';
// What every v10 adapter shares (engine/languages/scan.js and the registry): the lexer never lets a brace or keyword in
// a string or comment through and never moves an offset; each language's test files are validation while every JS/TS
// path keeps the test flag it had in v9; language categories only grow; the extension indexes every analysed file
// type; adapters never throw on garbage, honour the 160 KB cap, and stay fast on the largest files they accept.
const test=require('node:test'),assert=require('node:assert/strict');
const {lex}=require('../engine/languages/scan');
const {ADAPTERS,adapterFor,analyze,languageOf}=require('../engine/languages');
const {SOURCE_GLOB}=require('../extension/filters');
const {project}=require('./languages-fixture');
const braces=code=>(code.match(/[{}]/g)||[]).join('');
test('The lexer blanks string and comment contents in place, whatever the dialect',()=>{
  const cases=[
    [{rust:true,nest:true,chars:'rust',multiline:true},"fn f<'a>(x: &'a str) { let c = '{'; let s = r#\"a \"} b\"#; let b = b'}'; /* x /* { */ } */ }",'{}'],
    [{chars:'c',cpp:true,pre:'c'},'int f() { auto r = R"x(a)" } {)x"; long n = 1\'000; char c = \'}\'; }','{}'],
    [{chars:'c',cs:true,triple:true,pre:'c'},'void F() { var a = @"c:\\{"; var b = $"{d["k"]} }}"; var c = """ { """; }','{}'],
    [{chars:'c',triple:true,interp:'kotlin',nest:true,tick:'ident',newlines:true},'fun `a { b`() { val s = "${m["}"]} {"; val r = """ } """ }','{}'],
    [{swift:true,triple:true,interp:'swift',nest:true,tick:'ident',newlines:true,pre:'swift'},'func f() { let s = "\\(d["}"]) {"; let r = #"}"#; }','{}'],
    [{chars:'c',tick:'raw',newlines:true},'func f() { s := `}` + "{"; r := \'}\' }','{}'],
    [{php:true,hash:true,sq:true,multiline:true,interp:'php',tick:'shell'},'<p>{</p><?php function f() { $a = "{$b["}"]}"; $h = <<<EOT\n}\nEOT;\n# {\n} ?><b>}</b>','{}']
  ];
  for(const [d,src,expected] of cases){
    const r=lex(src,d);
    assert.equal(r.code.length,src.length,'offsets never move');assert.equal(r.code.split('\n').length,src.split('\n').length,'lines never move');
    assert.equal(braces(r.code),expected,src);
  }
  const rb=analyze('a.rb','class A\n  X = <<~EOS\n    end end\n  EOS\n  W = %w[end def class]\n  def a = x / 2\n  def b; y.split /end/; end\nend\nclass B; end\n');
  assert.deepEqual(rb.symbols.map(s=>`${s.kind} ${s.owner}.${s.name}`),['class .A','property A.X','property A.W','method A.a','method A.b','class .B']);
});
// The v9 rule, kept here to prove that no JS/TS path changes its test flag in v10.
const V9_TEST_FILE=/(?:^|\/)(?:test|tests|__tests__|spec|e2e)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;
test('Each language\'s test-file convention is validation; every JS/TS path keeps its v9 flag',()=>{
  const tests=['pkg/store_test.go','tests/test_api.py','api_test.py','conftest.py','crates/a/benches/b.rs','crates/a/tests/it.rs','src/test/java/A.java',
    'src/jvmTest/kotlin/A.kt','UserServiceTests.cs','Shop.Tests/Helpers.cs','spec/order_spec.rb','test/order_test.rb','tests/Unit/UserTest.php','src/UserTest.php',
    'Tests/AppTests/A.swift','AppTests.swift','store_test.cc','store_unittest.cpp','test/a.c'];
  const plain=['pkg/store.go','api.py','testing.py','contest.py','src/bench.rs','benches.rs','src/main/java/Test.java','Contest.cs','order.rb','User.php','App.swift','store.cc','latest.c'];
  const js=['benches/run.js','Tests/a.js','src/Tests/a.ts','test_x.js','conftest.js','a_test.js','a_spec.js','FooTest.ts','fooTests.js','Foo.Tests/a.js','src/test/a.ts',
    'src/commonTest/a.js','x_test.go.js','a.test.ts','a.spec.mjs','e2e/a.js','__tests__/a.jsx','lib/latest.js','spec.js','tests.js'];
  const files={};for(const f of [...tests,...plain,...js])files[f]=f.endsWith('.py')?'x = 1\n':'';
  const p=project(files,{salt:'tests'});
  for(const f of tests)assert.equal(p.node(f).test,true,f);
  for(const f of plain)assert.equal(p.node(f).test,false,f);
  for(const f of js)assert.equal(p.node(f).test,V9_TEST_FILE.test(f),`${f} keeps its v9 flag`);
});
test('Language categories only grow: v9 categories unchanged, the new languages have their own',()=>{
  assert.deepEqual(['a.tsx','a.ts','a.mts','a.jsx','a.js','a.cjs','a.py','a.pyi','a.go','a.rs','a.scss','a.html','a.json','a.mdx','Makefile','a.lua'].map(languageOf),
    ['tsx','ts','ts','jsx','js','js','py','py','go','rs','css','html','json','md','other','other']);
  assert.deepEqual(['A.java','A.kt','b.kts','A.cs','A.swift','a.c','a.h','a.cc','a.cpp','a.hpp','a.php','a.rb','tasks.rake'].map(languageOf),
    ['java','kt','kt','cs','swift','c','c','cpp','cpp','cpp','php','rb','rb']);
});
test('The extension indexes every file type an adapter analyses, with a flat glob VS Code can read',()=>{
  const m=/^\*\*\/\{([^{}]+)\}$/.exec(SOURCE_GLOB);assert(m,'one flat brace group (VS Code globs do not nest braces)');
  const alts=m[1].split(','),matches=f=>alts.some(a=>a.startsWith('*.')?f.endsWith(a.slice(1)):f.split('/').pop()===a);
  for(const f of ['a.ts','a.tsx','a.js','a.mjs','a.py','a.pyi','a.go','go.mod','src/lib.rs','crates/x/Cargo.toml','A.java','A.kt','b.kts','A.cs','A.swift','a.c','a.h','a.cc','a.cpp','a.hpp','a.php','composer.json','package.json','a.rb','x.rake'])
    assert(matches(f)&&(adapterFor(f)||/\.(?:md|css|html)$/.test(f)),f);
});
// A small deterministic stream of hostile text: unbalanced brackets, unterminated strings and comments, keywords.
function garbage(seed,n){
  const parts=['{','}','(',')','[',']','"','\'','`','/*','*/','//','#','\n','<<<EOT\n','<<~X\n','%w[','r#"','"#','R"(',')"','@"','$"','${','\\(','\\','class ','fn ','func ','def ','end ','impl ','struct ','#if 0\n','#else\n','#endif\n','<?php ','?>','::','->','=>',' x ',';',',','=','<','>','?','|'];
  let s=seed>>>0,out='';for(let i=0;i<n;i++){s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;out+=parts[s%parts.length];}
  return out;
}
const FILES=['a.go','src/a.rs','src/main/java/A.java','A.kt','A.cs','A.swift','a.cpp','a.h','a.php','a.rb','a.py'];
test('Adapters never throw on hostile input and always return well-formed symbols with unique keys',()=>{
  const KINDS=new Set(['class','interface','type','function','method','property','variable','ui.component','api.route','callsite']);
  for(let seed=1;seed<=30;seed++)for(const f of FILES){
    const r=analyze(f,garbage(seed*7919,600));
    assert(Array.isArray(r.symbols)&&Array.isArray(r.imports),f);
    const keys=new Set();
    for(const s of r.symbols){assert(KINDS.has(s.kind),s.kind);assert.match(s.fingerprint,/^[0-9a-f]{16}$/);assert(Number.isInteger(s.line)&&s.line>=1);
      assert.equal(typeof s.local,'boolean');assert.equal(typeof s.owner,'string');assert(!keys.has(s.key),`${f}: ${s.key} twice`);keys.add(s.key);}
    for(const i of r.imports)assert(typeof i.spec==='string'&&i.spec.length<=180);
  }
});
// Realistic files near the 160 KB cap: one repeated unit per language.
const UNITS={
  'big.go':i=>`type T${i} struct {\n\tA int \`json:"a"\`\n\tB string\n}\n\nfunc (t *T${i}) Get(x int) (int, error) {\n\tif x > 0 {\n\t\treturn x, nil\n\t}\n\treturn 0, fmt.Errorf("bad %d", x)\n}\n\n`,
  'src/big.rs':i=>`pub struct T${i}<'a> { pub a: u32, b: &'a str }\nimpl<'a> T${i}<'a> {\n    pub fn get(&self, x: u32) -> Option<u32> { if x > 0 { Some(x) } else { None } }\n}\n\n`,
  'src/main/java/Big.java':i=>`  public static final class T${i} implements Comparable<T${i}> {\n    private final Map<String, List<Integer>> m = new HashMap<>();\n    @GetMapping("/t/${i}")\n    public int get(int x) { return x > 0 ? x : -x; }\n    public int compareTo(T${i} o) { return 0; }\n  }\n`,
  'Big.kt':i=>`data class T${i}(val a: Int, val b: String) {\n    fun get(x: Int): Int = if (x > 0) x else -x\n    val label: String get() = "t\${a}"\n}\n\n`,
  'Big.cs':i=>`  public sealed class T${i} : IComparable<T${i}>\n  {\n    public int A { get; set; }\n    [HttpGet("t/${i}")]\n    public int Get(int x) { return x > 0 ? x : -x; }\n    public int CompareTo(T${i} other) => 0;\n  }\n`,
  'Big.swift':i=>`struct T${i}: Codable {\n    let a: Int\n    var b: String { "\\(a)" }\n    func get(_ x: Int) -> Int { x > 0 ? x : -x }\n}\n\n`,
  'big.cpp':i=>`class T${i} : public Base {\n public:\n  explicit T${i}(int a) : a_(a) {}\n  int get(int x) const { return x > 0 ? x : -x; }\n private:\n  int a_ = 0;\n};\n\n`,
  'big.php':i=>`final class T${i} {\n    private array $m = [];\n    public function get(int $x): int { return $x > 0 ? $x : -$x; }\n}\n\n`,
  'big.rb':i=>`class T${i} < Base\n  attr_reader :a\n  def get(x)\n    x > 0 ? x : -x\n  end\nend\n\n`
};
const PREAMBLE={'src/main/java/Big.java':['public class Big {\n','}\n'],'Big.cs':['namespace Big {\n','}\n'],'big.php':['<?php\n','']};
test('Every adapter honours the 160 KB cap and analyses a file just under it quickly',t=>{
  const report=[];
  for(const [file,unit] of Object.entries(UNITS)){
    const [head,tail]=PREAMBLE[file]||['',''];let body='';for(let i=0;Buffer.byteLength(head+body+unit(i)+tail)<158*1024;i++)body+=unit(i);
    const source=head+body+tail;
    const t0=process.hrtime.bigint(),r=analyze(file,source),ms=Number(process.hrtime.bigint()-t0)/1e6;
    report.push(`${file} ${(source.length/1024).toFixed(0)} KB ${ms.toFixed(1)} ms ${r.symbols.length} symbols`);
    assert(r.symbols.length>300,`${file}: ${r.symbols.length} symbols`);
    // Generous on purpose (the suite runs in parallel on a developer machine): a catastrophic regex would take seconds.
    assert(ms<2000,report.at(-1));
    assert.equal(analyze(file,source+' '.repeat(4*1024)).lines,0,`${file}: over 160 KB yields nothing`);
  }
  t.diagnostic(report.join('; '));
});
test('Every adapter in the registry is reachable and the TypeScript adapter still comes first',()=>{
  assert.equal(ADAPTERS[0].id,'typescript');assert.equal(ADAPTERS.at(-1).id,'manifest');
  assert.equal(new Set(ADAPTERS.map(a=>a.id)).size,ADAPTERS.length);
});
