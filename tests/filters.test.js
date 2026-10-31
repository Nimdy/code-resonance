'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {isFileEligible,classifyCommand,countNewlines,MAX_PATH}=require('../extension/filters');
const {safeRelative,validateEvent,sha}=require('../receiver/protocol');
test('Extension never emits a path the receiver would reject (shared exclusion rules)',()=>{
  const corpus=['src/a.ts','src/ui/App.tsx','.github/workflows/ci.json','.eslintrc.js','.idea/x.js','.vscode-test/x.js','Node_Modules/a.js',
    'src/.env','config/secrets.json','keys/server.pem','dist/out.js','a/b/'+'x'.repeat(MAX_PATH)+'.ts','lib/app.min.js','../outside.ts','docs/README.md'];
  for(const file of corpus)for(const includeHidden of [false,true]){
    if(isFileEligible(file,{includeHidden}))assert.notEqual(safeRelative(file),null,`receiver rejects ${file}`);
  }
});
test('Hidden files are opt-in; secrets and long paths are always excluded',()=>{
  assert.equal(isFileEligible('.github/workflows/ci.json'),false);
  assert.equal(isFileEligible('.github/workflows/ci.json',{includeHidden:true}),true);
  assert.equal(isFileEligible('src/.env',{includeHidden:true}),false);
  assert.equal(isFileEligible('.idea/workspace.js',{includeHidden:true}),false);
  assert.equal(isFileEligible('src/'+'d/'.repeat(160)+'f.ts'),false);
  assert.equal(isFileEligible('src/index.ts'),true);
});
test('Command lines are classified locally into categories only',()=>{
  const cases={'npm test':'test','npm run test:unit -- --watch=false':'test','pnpm vitest run':'test','npx vitest run':'test','pytest -q tests/':'test','node --test':'test',
    'go test ./...':'test','cargo test':'test','npm run build':'build','npx vite build':'build','make -j8':'build','npx tsc --noEmit':'typecheck',
    'npm run lint':'lint','eslint src':'lint','ruff check .':'lint','npm ci':'install','pip install -r requirements.txt':'install',
    'git commit -m "x"':'git','npm run dev':'run','node server.js':'run','ls -la':'other','':'other','npm run build && npm test':'test','echo test':'other'};
  for(const [line,expected] of Object.entries(cases))assert.equal(classifyCommand(line),expected,line);
  assert.equal(countNewlines('a\nb\r\nc\n'),3);
});
test('Receiver drops inserted text from legacy document.change events',()=>{
  const ev=validateEvent({v:1,id:'legacy-change-1',ts:Date.now(),kind:'document.change',projectId:sha('p'),sessionId:'s',file:'src/a.ts',
    changes:[{start:0,end:0,text:'const AWS_SECRET="pasted-value";',insertedLines:0,removedLines:0}]});
  assert(!JSON.stringify(ev).includes('pasted-value'));
  assert.equal(ev.changes[0].insertedChars,32);
});
test('Commands of the v10 languages\' toolchains are classified too',()=>{
  const cases={'./gradlew test':'test','mvn clean verify':'test','swift test':'test','xcodebuild test -scheme App':'test','ctest':'test','bin/rails test':'test',
    'rake spec':'test','php artisan test':'test','vendor/bin/phpunit':'test','./vendor/bin/pest':'test','cargo check':'typecheck','go vet ./...':'lint',
    'rubocop':'lint','phpstan analyse':'lint','swiftlint':'lint','clang-tidy a.cpp':'lint','./gradlew build':'build','swift build':'build','ninja':'build',
    'javac Main.java':'build','g++ -o a a.cpp':'build','go fmt ./...':'format','rustfmt src/main.rs':'format','dotnet format':'format',
    'composer install':'install','gem install rails':'install','dotnet restore':'install','ruby app.rb':'run','php -S localhost:8000':'run','java -jar a.jar':'run','swift run':'run'};
  for(const [line,expected] of Object.entries(cases))assert.equal(classifyCommand(line),expected,line);
});
