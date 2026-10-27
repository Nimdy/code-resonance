'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const filters = require('../extension/filters');
// Kinds are only ever added, never repurposed, so historical journals stay interpretable.
const VALID_KINDS = new Set([
  'workspace.started','workspace.stopped','workspace.settings','project.baseline','document.snapshot','document.change','document.edits',
  'document.opened','document.saved','file.created','file.deleted','file.renamed',
  'terminal.command.started','terminal.command.finished','task.started','task.finished',
  'diagnostics.updated','repository.commit.observed','repository.head.changed',
  'agent.prompt.submitted','agent.thinking.visible','agent.tool.started','agent.tool.completed',
  'agent.response.completed','agent.plan.visible','agent.message.visible',
  'agent.file.modified','instrument.note',
  'agent.session.started','agent.session.ended','agent.subagent.started','agent.subagent.stopped'
]);
// Shared with the extension so it can never send a path the receiver would reject.
const EXCLUDE_PARTS = new Set(filters.EXCLUDED_DIRS);
const SECRET_FILE = filters.SECRET_FILE;
// Capture settings reported by the extension (0.5+) on workspace.started/workspace.settings. Each key has exactly one
// type and is kept only on those kinds, so a setting can never be smuggled into, or confused with, another event's meta.
const REPORTED_KINDS = new Set(['workspace.started','workspace.settings']);
const REPORTED_META = {extensionVersion:'string',remote:'string',includeHidden:'boolean',captureDocumentContents:'boolean',
  captureTerminalCommands:'boolean',capturePromptText:'boolean',shareProjectName:'boolean',baselineFileLimit:'number',receiverPort:'number'};
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function safeRelative(input) {
  if (typeof input !== 'string' || !input || input.length > filters.MAX_PATH || /\0/.test(input)) return null;
  const str = input.replace(/\\/g,'/');
  if (str.startsWith('/') || /^[a-z]:\//i.test(str)) return null;
  const normalized = path.posix.normalize(str);
  if (normalized === '..' || normalized.startsWith('../')) return null;
  const segments = normalized.toLowerCase().split('/');
  if (segments.some(x=>EXCLUDE_PARTS.has(x))) return null;
  if (SECRET_FILE.test(normalized)) return null;
  return normalized;
}
function cleanString(s,max=1000) { return typeof s === 'string' ? s.slice(0,max).replace(/\0/g,'') : ''; }
function validateEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid event');
  if (!VALID_KINDS.has(value.kind)) throw new Error('Unsupported event kind');
  if (typeof value.id !== 'string' || !/^[a-zA-Z0-9._:-]{8,120}$/.test(value.id)) throw new Error('Invalid event id');
  const ts=Number(value.ts);
  if (!Number.isFinite(ts) || ts<0 || ts>Date.now()+86400000) throw new Error('Invalid event timestamp');
  const projectId = cleanString(value.projectId,128);
  if (!/^[a-z0-9-]{12,128}$/i.test(projectId)) throw new Error('Invalid project id');
  const file = value.file === undefined ? undefined : safeRelative(value.file);
  if (value.file !== undefined && !file) throw new Error('Invalid or sensitive filename');
  const result = { v:1, id:value.id, ts, kind:value.kind, projectId, sessionId: cleanString(value.sessionId,100), origin:cleanString(value.origin,35) || 'unknown' };
  if (file) result.file=file;
  // Rename source; an unsafe or excluded source path is dropped rather than rejecting the event.
  if (value.from !== undefined) { const from = safeRelative(value.from); if (from) result.from = from; }
  if (value.name) result.name=cleanString(value.name,100);
  if (value.content !== undefined) {
    if (typeof value.content !== 'string' || Buffer.byteLength(value.content,'utf8')>160*1024) throw new Error('Document too large');
    result.content=value.content;
  }
  if (Array.isArray(value.changes)) {
    if (value.changes.length>120) throw new Error('Too many edits');
    // Inserted text is never persisted (v0.2 extensions sent it); only its size survives.
    result.changes=value.changes.map(c=>({
      start: Math.max(0, Number(c.start)||0),
      end: Math.max(0, Number(c.end)||0),
      insertedChars:typeof c.text==='string'?c.text.length:Math.max(0,Number(c.insertedChars)||0),
      insertedLines:Math.max(0,Math.min(10000,Number(c.insertedLines)||0)),
      removedLines:Math.max(0,Math.min(10000,Number(c.removedLines)||0))
    }));
  }
  if (value.meta && typeof value.meta === 'object' && !Array.isArray(value.meta)) {
    const allowed=['count','truncated','language','changed','errors','warnings','exitCode','taskName','durationMs', 'command','fingerprint','length','tool','result','commit','parent','provider','thinkingExposed','source','reason',
      'category','edits','insertedChars','removedChars','insertedLines','removedLines','windowMs','agent'];
    result.meta={};
    for (const key of allowed) if (Object.hasOwn(value.meta,key)) {
      const val=value.meta[key];
      if (typeof val === 'string') result.meta[key]=cleanString(val,512);
      if (typeof val === 'number' && Number.isFinite(val)) result.meta[key]=val;
      if (typeof val === 'boolean') result.meta[key]=val;
    }
    if (REPORTED_KINDS.has(value.kind)) for (const [key,type] of Object.entries(REPORTED_META)) if (Object.hasOwn(value.meta,key)) {
      const val=value.meta[key];
      if (typeof val !== type || (type === 'number' && !Number.isFinite(val))) continue;
      result.meta[key]=type === 'string' ? cleanString(val,64) : val;
    }
  }
  if (value.text !== undefined) result.text=cleanString(value.text,12000);
  return result;
}
module.exports={VALID_KINDS,REPORTED_META,SECRET_FILE,EXCLUDE_PARTS,sha,safeRelative,validateEvent};
