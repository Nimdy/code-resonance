# My Look

A starter shader pack (Visual Pack SDK 1): a background and a post pass on a built-in family. Add `"effects":
"effects.js"` with `export function createEffects(sdk){return {effect(cmd,frame){}, update(frame){}, onPrime(){},
dispose(){}};}` for procedural effects. Test: `node scripts/pack.js test <this folder>`.
