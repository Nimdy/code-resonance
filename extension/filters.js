'use strict';
// Pure capture rules (no `vscode` import) so they are unit-testable and provably aligned with the receiver.
const EXCLUDED_DIRS=['node_modules','.git','.next','dist','build','out','coverage','.venv','venv','__pycache__','.cache','.turbo','.idea','.vscode-test'];
const SECRET_FILE=/(?:^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|\.pypirc|\.netrc|id_(?:rsa|ed25519|ecdsa)(?:\.pub)?|.*\.(?:pem|key|p12|pfx|kdbx|sqlite|db)|credentials(?:\..+)?|secrets?(?:\..+)?|.*\.min\.(?:js|css))$/i;
const MAX_PATH=300;
// Files the extension indexes and watches: every language engine/languages analyses, plus the go.mod and Cargo.toml
// manifests (VS Code globs do not nest braces, so the alternatives are one flat list).
const SOURCE_GLOB='**/{'+['ts','tsx','js','jsx','mjs','cjs','json','css','html','py','pyi','go','rs','md','java','kt','kts','cs','swift','c','h','cc','cpp','cxx','hh','hpp','hxx','php','rb','rake']
  .map(e=>'*.'+e).concat(['go.mod','Cargo.toml']).join(',')+'}';
const EXCLUDE_GLOB=`**/{${EXCLUDED_DIRS.join(',')}}/**`;
function isFileEligible(file,{includeHidden=false}={}){
  if(!file||file.length>MAX_PATH||file.startsWith('../')||file.startsWith('/')||file.includes('\\')||file.includes('\0')||SECRET_FILE.test(file))return false;
  const segments=file.split('/');
  if(segments.some(seg=>EXCLUDED_DIRS.includes(seg.toLowerCase())))return false;
  return includeHidden||!segments.some(seg=>seg.startsWith('.'));
}
function countNewlines(text){let n=0;for(let i=0;i<text.length;i++)if(text.charCodeAt(i)===10)n++;return n;}
// Classifies a command line locally so only a category leaves the editor, never the command text.
const COMMAND_RULES=[
  ['test',/(?:^|\s)(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test(?::[\w-]+)?|npx\s+(?:jest|vitest|mocha|playwright\s+test)|jest|vitest|mocha|ava|playwright\s+test|cypress\s+run|pytest|py\.test|go\s+test|cargo\s+(?:test|nextest)|dotnet\s+test|rspec|phpunit|node\s+--test|deno\s+test|tox|nox|(?:\.\/)?gradlew?\s+(?:\S+\s+)*(?:test|check|connectedCheck)|mvnw?\s+(?:\S+\s+)*(?:test|verify)|swift\s+test|xcodebuild\s+(?:\S+\s+)*test|ctest|(?:bin\/)?rails\s+test|rake\s+(?:test|spec)|php\s+artisan\s+test|(?:[\w.-]*\/)+(?:phpunit|pest|rspec)|pest)(?:\s|$)/],
  ['typecheck',/(?:^|\s)(?:npx\s+)?(?:tsc|vue-tsc|mypy|pyright)(?:\s|$)|(?:^|\s)(?:cargo\s+check|srb\s+tc)(?:\s|$)|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:typecheck|type-check|check-types)(?:\s|$)/],
  ['lint',/(?:^|\s)(?:npx\s+)?(?:eslint|biome\s+(?:lint|check)|ruff(?:\s+check)?|flake8|pylint|golangci-lint|stylelint|cargo\s+clippy|go\s+vet|staticcheck|rubocop|phpstan|psalm|swiftlint|ktlint|detekt|clang-tidy|cppcheck)(?:\s|$)|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?lint(?::[\w-]+)?(?:\s|$)/],
  ['build',/(?:^|\s)(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build(?::[\w-]+)?|(?:npx\s+)?(?:vite|next|nuxt|astro)\s+build|webpack|rollup|esbuild|tsup|cargo\s+build|go\s+build|make|cmake|dotnet\s+build|gradlew?\s+(?:build|assemble)|mvn\s+(?:\S+\s+)*(?:package|install|compile)|\.\/gradlew\s+(?:\S+\s+)*(?:build|assemble)|mvnw\s+(?:\S+\s+)*(?:package|install|compile)|swift\s+build|xcodebuild|ninja|msbuild|javac|kotlinc|rustc|gcc|g\+\+|clang|clang\+\+)(?:\s|$)/],
  ['format',/(?:^|\s)(?:npx\s+)?(?:prettier|black|gofmt|cargo\s+fmt|biome\s+format|go\s+fmt|rustfmt|clang-format|swiftformat|ktfmt|dotnet\s+format|php-cs-fixer)(?:\s|$)/],
  ['install',/(?:^|\s)(?:npm\s+(?:i|install|ci|add)|pnpm\s+(?:i|install|add)|yarn\s+(?:install|add)|bun\s+(?:install|add)|pip3?\s+install|poetry\s+(?:install|add)|uv\s+(?:sync|add|pip\s+install)|cargo\s+add|go\s+(?:get|mod\s+tidy)|bundle\s+install|composer\s+(?:install|require|update)|gem\s+install|dotnet\s+(?:restore|add)|pod\s+install|swift\s+package\s+resolve)(?:\s|$)/],
  ['git',/^\s*git(?:\s|$)/],
  ['run',/(?:^|\s)(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:start|dev|serve|preview)|node|deno\s+run|bun\s+run|python3?|go\s+run|cargo\s+run|dotnet\s+run|swift\s+run|ruby|php|java|(?:bin\/)?rails\s+(?:s|server))(?:\s|$)/]
];
const PRIORITY=COMMAND_RULES.map(([name])=>name);
function classifyCommand(commandLine){
  const parts=String(commandLine||'').split(/&&|\|\||;|\|/).map(s=>s.trim()).filter(Boolean);
  let best=null;
  for(const part of parts)for(const [name,rule] of COMMAND_RULES)if(rule.test(part)){if(best===null||PRIORITY.indexOf(name)<PRIORITY.indexOf(best))best=name;break;}
  return best||'other';
}
module.exports={EXCLUDED_DIRS,SECRET_FILE,MAX_PATH,SOURCE_GLOB,EXCLUDE_GLOB,isFileEligible,countNewlines,classifyCommand};
