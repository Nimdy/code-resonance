# Recorded project: Lumen Recipes

A real recording, made by `CR_QUAL_SCENARIO=construct xvfb-run -a node vscode/run.js`: VS Code 1.143 with the
Code Resonance extension capturing an almost empty repository while editor typing and six Claude Code (Haiku) agents
built a small recipe app (data layer and UI in parallel, tests written first and failing, implementation, API
integration, commit, refactor, commit). Four minutes; 230 events; agents cost $0.51.

Only raw observations are kept (journal, content blobs, project id, salt); everything else is re-derived by the
receiver. Render the film:

    node visual/film.js --data recordings/lumen-recipes --project c6c876a59a661b8d8772059a2f3bd44255110676c4ad7f9d11e60328395f117b

The receiver writes derived files (state.json, performance.jsonl, public.json) next to the journal; they are not
committed.
