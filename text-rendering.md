This document contains notes on how Text (i.e., `Text Morph` and `Label`) are currently rendered in the system.
Its goal is to provide a basis for migrating this towards a vanilla DOM based renderer.

# Current Text Rendering

## Label

Labels are used to display (usually) smaller amounts of text and provide limited layouting cababilities. They provide means to format text as e.g. **bold**, by usage of `TextAttributes` but they do not have the capability of e.g. right-aligning text. They cannot be interactively edited. Thus, they are less powerful than a full-blown `TextMorph`.

`Labels` use the default rendering pipeline of `lively.next`, i.e. they provide a `render()` method that returns a node for the `vdom`.

`Labels` have a property `autofit`, that dictates whether the bounds of a `Label` will be adjusted according to its text content. Changing the content or the text styling of a `Label` with `autofit = true` will thus result in adjusting its bounds.

This process is managed by the `fit()` method. The `fit()` method updates the extent of a `Label`. The new `extent` depends on the `textBounds()` of the label.

The `textBounds()` need to be measured directly from the DOM, which is why they are cached when possible. When the cache was invalidated, the measuring is conducted. In the simpler case that only default text is used, the `fontMetric` is used to figure out the width and height of this text Chunk. Which text needs to be measured depends on whether the font is monospaced or not. *This heuristic dies when monspaced text over more than one line is rendered.*

The Label only has an Array of `textAndAttributes` which map a chunk of text to styling attributes.
### Font Loading

TO BE INVESTIGATED

## Text

`TextMorphs` are the real deal and provide all capabilities like layouting text, formatting it, embedding other morphs etc.

The TextMorph also utilizes a FontMetric, that is contains itself. Each one contains two `newtext-text-layer`, one `actual` that contains the real text to be rendered and one for `font-measure`.
There exists a `viewState` property on `Text` that, as I understand it currently, holds results/useful state for rendering and layouting of `Text`. I believe it is similar to my `renderingState`.
This makes them quite expensive at the moment and also led to the introduction of various short-cuts, as the rendering can be sped up significantly, when not all of these capabilities are needed. This is the case quite often, e.g. the live-editing capabilities are seldomly used in frozen sites to be published.

`Text` stores its content in a `Document` which allows to efficiently insert text at arbitrary places. A `Document` wraps texts and attributes in a B-Tree, and can return it line wise.

# New Text Rendering

There should not be any conceptual difference between `Text` and `Label` anymore. Instead, we progressively add capabilities to the `Label` as needed.

In the easiest case, we just have a `Label` containing Text. This can be directly rendered into the DOM. We want to scrap the `FontMetric`, since directly measuring the actual node is at least equaly fast. This however means that a `Text` morph creates its node directly when it is initialized and keeps it updated. This forces us to hang the node into the DOM to get accurate measurement. *Maybe we can reuse the current `Text` implementation partially?* When the morph is actually rendered, we thus only need to hang this "prepared" node into the DOM.

When we have other `Morphs` inside of the `Text` to be rendered, this does not complicate the situation. We insert the node into the `Texts` node as usual and can still just measure. 

The same goes for layouting, which can be added but is not present in the most simple case. Layouting in this case currently is just another textAttribute (textAlign).
In principle we could even use this on `Label` right now, however due to the fact that `Label` renders `span` elements directly inside of the `Morph` `div`, this has no effect.
As long as interactive editing and lively selection is not active, this can however be for cheap.

The largest upgrade to a `Text` is thus the option of "lively selection" and interactive editing. Both require more advanced rendering logic as well as a `Document`. We assume, that these options go hand in hand, i.e. you can have both of them or none. At the latest when we introcude a `Document` we also need a `Layout`. *However, we might already need this earlier?*

## Finding the common abstraction

Labels currently have zero abstractions, as described above.
`Document` already provides an access by line.
I believe that one line is a worthwhile abstraction, as we later can also use `keyed` on that basis. When this is working, we can also experiment with keyeing the chunks inside of one line, but exchanging the lines could be good enough for the beginning. In any case this is a necessary stop before we can drill further down.

Let's introduce a label mode for Text. This can be a derived property, that for now is active when:

- readOnly = true
- selectable = false.

Depending on the values of `fixedWidth` and `fixedHeight` this is equivalent to a `Label` with `autofit` or without.

A `Text` in labelMode gets instantiated without a Document.
This is imortant, as the Document creation and house-keeping is expensive.
Since it is not interactive, the only way of changing its contents is by either setting the whole `textAndAttribute` array or by setting its `textString`. In either case, we need to make sure, that these, let's call them **chunks**, **do not go over a line break**. This allows us to introduce lines as the common abstraction.

The attributes of such a `Text` can only be changed all at once, since there is no option to select only parts of the text.

The rendering process probably should go something like this:

- renderMorph
- dispatches to nodeForText
- a method that takes care of the outer most node (in the case described here, this one can hold the styling information for all text, since it will be uniform) *Is this really the case? When one changes the text and attributes by hand this would not need to be true!*
- calls another method per line
- that calls another method per chunk

## Asynchronous Loading of Special Functionality

In the best case, we would find a way to asynchronously load the `Layout` and `Document` when they are needed by a `Text`, as we ship a lot of dead code when bundling the, more prevalent, non-interactive `Texts`.

## Synchronous Rendering

It is important that changes to e.g. the size of a `Text` (that result from a changed `textString` property) are reflected into the morph synchronously. E.g., changing the textString of a `Text` and directly afterwards getting its extent, should provide the correct answer in the case of morphs that are fitted.

## Submorphs

Currently, only `Text` supports having submorphs (at least in the text). *Should it become possible to embed Morphs without having a document/layout?*.
Currently, a Morph inside of `Text` can be in three modes:

1. Just be a submorph, floating above the text and not caring.
2. Being **embedded** in the text, i.e. being treated as just another character, letting the line become larger.
3. Being **in displacing mode**, with text floating around it. 

In theory, 2 and 3 can be toggled with `toggleTextWrappingAround` on `Text`. This method is broken, due to changes to the graphics system.

Morphs can simply be added into a `Text` by putting them into the `textAndAttributes`. *Their positions are somehow kept track of with the usage of anchors*.
When one drops a Morph into a `Text`, `[morph, null]` is inserted at the appropriate position.
The renderer, when rendering a line, simply checks if the current "token" is a Character or a Morph, if it is a morph it will render the submorph.

## Different Selection Modes

There should be three different selection modes. Currently, we only have no selection at all or the lively selection that requires a full-blown `Document`.

1. No Selection at all (current default)
2. Native Selection is possible - can be achieved by setting `user-select: text` where necessary, i.e. does not require any more involved changes
3. Full blown lively selection. As per above, this **only comes with interactive editing capabilities and vice verca**. 

The problem with the approach outlined in 2. is that the KeyArea needs to have focus in order to register keyevents for keycombos that do not need a target, such as Alt-X for the command palette to be opened.

We either find a way for this to work otherwise, or we accept that with the mouse over a morph that uses native selection these kinds of keycombos do not work.
The latter case seems preferrable right now, as it is much cheaper.
For `user-select` to work as expected, the Morph needs to have `stealsFocus = true`.     
