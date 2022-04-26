This document contains notes on how Text (i.e., `Text Morph` and `Label`) are currently rendered in the system.
Its goal is to provide a basis for migrating this towards a vanilla DOM based renderer.

# Current Text Rendering

## Label

Labels are used to display (usually) smaller amounts of text and provide limited layouting cababilities. They provide means to format text as e.g. **bold**, by usage of `TextAttributes` but they do not have the capability of e.g. right-aligning text. They cannot be interactively edited. Thus, they are less powerful than a full-blown `TextMorph`.

`Labels` use the default rendering pipeline of `lively.next`, i.e. they provide a `render()` method that returns a node for the `vdom`.

`Labels` have a property `autofit`, that dictates whether the bounds of a `Label` will be adjusted according to its text content. Changing the content or the text styling of a `Label` with `autofit = true` will thus result in adjusting its bounds.

This process is managed by the `fit()` method. The `fit()` method updates the extent of a `Label`. The new `extent` depends on the `textBounds()` of the label.

The `textBounds()` need to be measured directly from the DOM, which is why they are cached when possible. When the cache was invalidated, the measuring is conducted. In the simpler case that only default text is used, the `fontMetric` is used to figure out the width and height of this text Chunk. Which text needs to be measured depends on whether the font is monospaced or not. **This heuristic dies when monspaced text over more than one line is rendered.**

### Font Loading

TO BE INVESTIGATED

## Text

`TextMorphs` are the real deal and provide all capabilities like layouting text, formatting it, embedding other morphs etc.

This makes them quite expensive at the moment and also led to the introduction of various short-cuts, as the rendering can be sped up significantly, when not all of these capabilities are needed. This is the case quite often, e.g. the live-editing capabilities are seldomly used in frozen sites to be published.

# New Text Rendering

There should not be any conceptual difference between `Text` and `Label` anymore. Instead, we progressively add capabilities to the `Label` as needed.

In the easiest case, we just have a `Label` containing Text. This can be directly rendered into the DOM. We want to scrap the `FontMetric`, since directly measuring the actual node is at least equaly fast. This however means that a `Text` morph creates its node directly when it is initialized and keeps it updated. When the morph is actually rendered, we thus only need to hang this "prepared" node into the DOM. 

When we have other `Morphs` inside of the `Text` to be rendered, this does not complicate the situation. We insert the node into the `Texts` node as usual and can still just measure. 

The same goes for layouting, which can be added but is not present in the most simple case. 

The largest upgrade to a `Text` is thus the option of "lively selection" and interactive editing. Both require more advanced rendering logic as well as a `Document`. We assume, that these options go hand in hand, i.e. you can have both of them or none. 

## Asynchronous Loading of Special Functionality

In the best case, we would find a way to asynchronously load the `Layout` and `Document` when they are needed by a `Text`, as we ship a lot of dead code when bundling the, more prevalent, non-interactive `Texts`.


## Synchronous Rendering

It is important that changes to e.g. the size of a `Text` (that result from a changed `textString` property) are reflected into the morph synchronously. E.g., changing the textString of a `Text` and directly afterwards getting its extent, should provide the correct answer in the case of morphs that are fitted.

## Different Selection Modes

There should be three different selection modes. Currently, we only have no selection at all or the lively selection that requires a full-blown `Document`.

1. No Selection at all (current default)
2. Native Selection is possible - can be achieved by setting `user-select: text` where necessary, i.e. does not require any more involved changes
3. Full blown lively selection. As per above, this **only comes with interactive editing capabilities and vice verca**. 

