# stage0-morph

## Idea of the new stage0 renderer

![](img/loop.jpg)

## Notes on the current render logic

### Rendering loop

The core rendering logic is implemented in the `Renderer` class in `lively.morphic`. When a world is loaded (`loadWorld()` in `lively.morphic/world-loading.js`) a Renderer is installed by calling `setWorld()` on the morphic environment.

In its constructor, `requestAnimationFrame` is installed on the renderer from the `window` such that `window` is bound to `this` inside of `renderer.requestAnimationFrame`.

After creating a `Renderer` the `renderLater()` function is invoked in `setWorld()` and kicks of the render loop, eventually executing `renderStep()` which will begin rendering with the `worldMorph` as rootnode. Each change to a morph that warrants a rerender will later call `makeDiry()`, causing another call to `renderLater()`.

### morphic.renderAsRoot()

Gets dispatched to `renderRootMorph` in `lively.morphic/morphic-default.js`. Initial creation of the actual domNodes gets handled here if necessary. For handling updates of rendered morphs, the `Renderer` has a `WeakMap` `renderMap` in which a mapping `Morph -> resulting vdomnode` is stored.

Thus, to render the world, the following steps are necessary:

1. Get the current vdom tree of the world from the `renderMap`.
2. Get an updated version of the vdom tree by calling `render(world)`.
3. Diff the old version of the tree and and the new version, generating a set of patches.
4. Patch the actual DOM, resulting in new vdom and actual DOM being consistent.

**Open Question: `renderRootMorph()` separately calls `renderFixedMorphs` -- why are those handled separately?**

### renderer.render(morph)

Provides a mechanism to not rerender morphs for which a rerender is not necessary. If a rerender is due, call `render(renderer)` on the Morph to be rendered. Overall, a morph can be in the following states in the rendering process:

| State      | Related      |
| ----------- | ----------- |
|\_diry|needsRerender|
|\rendering|`aboutToRender`|
|"clean state"|`MorphAfterRenderHook`|

When `render` is called on a morph, master component styling is applied and the call gets dispatched back to `Renderer.renderMorph(morph)`. This function returns a vdomNode (using `h`), including all submorphs of the morph to be rendered as childnodes. This dispatch allows for a morph to a) take action themselfes when being rendered b) invoke another render function in the renderer as opposed to the default `renderMorph()`. This is what e.g. allows for native checkboxes to be rendered, by calling `renderCheckbox` which will create an `input` node instead of a `div`.

#### rendering of submorphs

There are two options for submorphs to be rendered. They come either wrapped or not wrapped. In the wrapped case, they get wrapped inside an additional `div` which has `position: absolute` set. This wrapping allows for layouting of morphs with javascript based layouts.

For layouts that are rendered via CSS, this wrapping is skipped.

#### installation of attributes and style

When creating the `div` with `h()` in `renderMorph()`, the style object of the vdom node are created by calling `defaultStyle(morph)`.

- CSS for layouts is installed if applicable
- the MorphAfterRenderHook gets installed on the node (see [here](https://github.com/Matt-Esch/virtual-dom/blob/dcb8a14e96a5f78619510071fd39a5df52d381b7/docs/hooks.md))

### rendering of fixed morphs

Morphs with a fixed position have a separate rendering mechanism, as they exist in a separate hierarchy, e.g. are not inside of the `div` representing the world.


## LICENSE

MIT
