# Blueprint Cathedral

A **shader** visual pack (Visual Pack SDK 1) by Northlight Works, a fictional studio. It keeps Machine Cathedral's world
and adds: a drafting-paper background (`shaders/paper.frag`), an ink pass that traces the edges of the lit city into cyan
lines over a blue wash (`shaders/ink.frag`), and procedural survey rings for passing runs, recoveries, commits and
milestones (`effects.js`). Its two uniforms are drawn per project (the grid gets denser with the project's size).

It contains code, so Code Resonance runs it only in the isolated pack frame and only after you approve it:

    node scripts/pack.js install packs/examples/blueprint-cathedral
    node scripts/pack.js approve northlight.blueprint-cathedral

Then choose **BLUEPRINT CATHEDRAL · MACHINE-CATHEDRAL · CODE** under the look selector. MIT.
