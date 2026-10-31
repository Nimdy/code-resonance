'use strict';
// The hook installers after Claude Code, Cursor and Codex, in the order the Control Center lists them. Each exports
// merge/unmerge (the receiver's review-then-write flow), EVENTS, adapter, command and INFO (what the page says about it).
module.exports=[require('./install-gemini'),require('./install-qwen'),require('./install-copilot'),require('./install-droid'),require('./install-grok'),require('./install-goose')];
