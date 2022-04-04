import vdom from 'virtual-dom';
const { diff, patch, create: createElement } = vdom;

/**
 * Heavily based on the `CustomVNode` used to render HTMLMorphs and IFrameMorphs
 */
export default class Stage0VNode {
  /**
   * @param { Renderer } renderer - A **default morphic renderer** from which the render method of a Stage0Morph has been called which led us here! Not to be confused with the Stage0Renderer which is referenced in `morph`.
   */
  constructor (morph, renderer) {
    this.stage0Morph = morph;
    this.morphicRenderer = renderer;
    this.stage0Renderer = morph.renderer;
    this.morphVtree = null;
    // TODO: necessary? 
    this.key = 'custom-stage0morph';
  }

  get type () { return 'Widget'; }

  renderMorph () {
    this.morphVtree = this.stage0Renderer.renderWorld();
    return this.morphVtree;
  }

  init () {
    const elem = this.renderMorph();
    // debugger;
    return elem;
  }

  /**
   * The function called when the widget is being updated.
   * @see{ @link https://github.com/Matt-Esch/virtual-dom/blob/master/docs/widget.md}
   */
  update (previous, domNode) {
    const oldTree = previous.morphVtree || this.renderMorph();
    const newTree = this.renderMorph();
    const patches = diff(oldTree, newTree);

    patch(domNode, patches);
    // if (this.morph.afterRenderHook) this.morph.afterRenderHook();
    return null;
  }

  destroy (domNode) {
    // no custom operation 
  }
}
