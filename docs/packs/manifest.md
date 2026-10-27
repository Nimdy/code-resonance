# Manifest (`pack.json`)

The JSON Schema is `packs/schema/pack.schema.json` (draft 2020-12); add `"$schema": "<path to it>"` to get completion in
your editor. The receiver validates with the same file, then checks what a schema cannot: parameters and ranges against
the base family's [catalogue](catalogue.md), effect polarity, referenced files, and the code modules.

## Common fields

| Field | Rule |
|---|---|
| `schema` | `"code-resonance.pack.v1"` |
| `id` | namespaced and stable: `author.name`, lowercase letters, digits and dashes (`halcyon.cymatic-field`) |
| `name` | up to 40 letters, digits, spaces and `.,'&()-` |
| `version` | `major.minor.patch` |
| `kind` | `declarative`, `shader` or `world`, with the matching section and no other |
| `sdk` | `"^1.N"`: needs SDK 1.N or a later 1.x |
| `author` | `{name, url?}` (https only); shown in the player's pack list and approval dialog |
| `description`, `license` | up to 280 characters; an SPDX-like identifier |

## `declarative`

```json
"declarative": {
  "base": "stellar-forge",
  "overrides": {"geometry.arrangement": "binary-core", "geometry.spiralArms": [2, 3], "palette.primary": "#ff9a5c"},
  "effects": {"milestone.achieved": "aurora"},
  "unlocks": ["galactic-halo", "aurora-veils"],
  "technique": {"saturation": 0.82, "tint": [1.1, 0.97, 0.86], "aberration": 0.007}
}
```

`base` is a built-in family or an installed world pack (then `overrides` use `params.<name>` plus the shared palette,
light and technique entries). A number may be a `[min, max]` range: each project gets its own seeded value. `effects`
re-maps intents to other effect presets of the same polarity; `unlocks` orders the family's ambient layers.

## `shader`

```json
"shader": {
  "base": "machine-cathedral",
  "background": "shaders/paper.frag",
  "post": ["shaders/ink.frag"],
  "effects": "effects.js",
  "uniforms": {"uInk": {"type": "number", "min": 0.65, "max": 1}},
  "overrides": {"atmosphere.weather": "night-fog"},
  "technique": {"saturation": 0.75},
  "budget": {"drawCalls": 30, "passes": 32}
}
```

## `world`

```json
"world": {
  "entry": "world.js",
  "family": {"name": "Cymatic Field"},
  "parameters": {
    "baseOrder": {"type": "integer", "min": 2, "max": 5, "from": {"trait": "depth", "scale": 0.12, "jitter": 0.1}},
    "symmetry": {"type": "enum", "values": ["square", "radial"]},
    "drift": {"type": "number", "min": 0.3, "max": 1}
  },
  "effects": {"validation.failed": "dissonance", "milestone.achieved": "resonance", "...": "..."},
  "ambient": {"base": ["mode-drift"], "unlocks": ["golden-dust", "overtones", "aurora-field", "distant-plates"]},
  "palette": {"hues": [32, 44, 188, 204]},
  "shaders": ["shaders/common.glsl", "shaders/sand.vert"],
  "textures": [],
  "budget": {"drawCalls": 12, "passes": 32, "triangles": 250000, "points": 80000, "textures": 16, "updateMs": 6}
}
```

**Parameters** are drawn per project from its seed: `number` and `integer` in `[min, max]`, `enum` (optionally
`weights`), `boolean` (probability `p`). With `from`, a number follows a project trait: `min + (max - min) ×
clamp(trait × scale + offset)` plus seeded `jitter`. Traits: `modules`, `districts`, `symbols`, `ui`, `uiModules`,
`routes`, `model`, `functions`, `dependencyDensity`, `crossDensity`, `hubness`, `branching`, `depth` (symbols per
module), `tests`, `agents`, `agentShare`.

**Effects** name how each of the twelve effect intents looks; `validation.failed` and `milestone.achieved` are
required. **Ambient** `unlocks` (up to eight) are the layers verified milestones enable, in order (`frame.unlocks`).
**Budget** is what you promise at 1920×1080, full quality; the compatibility tests hold you to it.

## Files and limits

Lowercase names, `[a-z0-9_-]` path segments, extensions `js glsl frag vert json md txt png jpg`, plus `README.md`,
`LICENSE` and `pack.json`. At most 64 files, 1 MB each, 8 MB in total; no symbolic links; hidden files are not installed.
Declarative packs contain no code. In code packs, JavaScript files must be the declared entry or effects module.
