
import h from 'esm://cache/stage0@0.0.25';
import keyed from 'esm://cache/stage0@0.0.25/keyed';

import { applyAttributesToNode, applyStylingToNode } from './helpers.js';
import { withoutAll } from 'lively.lang/array.js';
import { string } from 'lively.lang';

export default class Stage0Renderer {
  // -=-=-=-
  // SETUP
  // -=-=-=-
  constructor () {
    this.renderMap = new WeakMap();
    this.handledMorphs = [];
    this.morphsWithStructuralChanges = [];
    this.renderedMorphsWithChanges = [];
  }

  reset () {
    this.renderMap = new WeakMap();
    this.handledMorphs = [];
    this.morphsWithStructuralChanges = [];
    this.renderedMorphsWithChanges = [];
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  //  HIGHER LEVEL RENDERING FUNCTIONS
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  addRootMorph (morph) { // will be replaced with something related to the actual world later
    const node = this.renderNewMorph(morph);
    document.getElementById('stage0root').appendChild(node);
  }

  renderWorld () { // this is what we need to call in a loop later on
    this.emptyRenderQueues();

    for (let morph of this.handledMorphs) {
      if (morph.renderingState.hasStructuralChanges) this.morphsWithStructuralChanges.push(morph);
      if (morph.renderingState.needsRerender) this.renderedMorphsWithChanges.push(morph);
    }

    for (let morph of this.morphsWithStructuralChanges) {
      this.renderStructuralChanges(morph);
    }

    for (let morph of this.renderedMorphsWithChanges) {
      this.renderStylingChanges(morph);
    }
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-
  // BASIC RENDERING FUNCTIONS
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-

  /**
   * Returns a new DOM node for a morph.
   * @param {Morph} morph - The morph for which a DOM node should be generated.
   */
  renderNewMorph (morph) {
    let node;
    node = this.renderMap.get(morph);

    if (!node) {
      node = morph.getNodeForRenderer(this);
      this.renderMap.set(morph, node);
    }

    this.handledMorphs.push(morph); // this is only a hack while working on this in isolation and it can be removed later

    applyAttributesToNode(morph, node);
    applyStylingToNode(morph, node);

    for (let submorph of morph.submorphs) {
      const submorphNode = this.renderNewMorph(submorph);
      node.appendChild(submorphNode);
    }

    return node;
  }

  /**
   * Updates the DOM structure starting from the node for `morph`. Does not take styling into account. Will add/remove nodes to the dom as necessary.
   * @param { Morph } morph - The morph which has had changed to its submorph hierarchy.
   */
  renderStructuralChanges (morph) {
    const node = this.getNodeForMorph(morph);

    const submorphsToRender = morph.submorphs;
    const alredayRenderedSubmorphs = morph.renderingState.renderedMorphs;

    const newlyRenderedSubmorphs = withoutAll(submorphsToRender, alredayRenderedSubmorphs);

    keyed('key',
      node,
      alredayRenderedSubmorphs,
      submorphsToRender,
      item => this.renderNewMorph(item)
    );

    // TODO: migrate actual hook over
    for (let submorph of newlyRenderedSubmorphs) {
      const node = this.getNodeForMorph(submorph);
      const hooks = submorph.getHooksForRenderer(this);
      for (let hook of hooks) {
        hook(submorph, node);
      }
      // TODO: this is not enough, we could have multiple hooks!
      // submorph.afterRenderHook(node);
    }

    morph.renderingState.renderedMorphs = morph.submorphs.slice();
    morph.renderingState.hasStructuralChanges = false;
  }

  /**
   * Assumes that a DOM node for the given morph already exists and changes the attributes of this node according to the current style definition of the morph.
   * @param { Morph } morph - The morph for which to update the rendering.
   */
  renderStylingChanges (morph) {
    const node = this.getNodeForMorph(morph);
    applyStylingToNode(morph, node);

    // TODO: this needs to call the after render hooks later on
    morph.renderingState.needsRerender = false;
  }

  // -=-=-=-=-=-=-=-=-
  // HELPER FUNCTIONS
  // -=-=-=-=-=-=-=-=-

  emptyRenderQueues () {
    this.morphsWithStructuralChanges = [];
    this.renderedMorphsWithChanges = [];
  }

  getNodeForMorph (morph) {
    return this.renderMap.get(morph);
  }

  // -=-=-=-=-=-
  // NODE TYPES
  // -=-=-=-=-=-
  nodeForMorph (morph) {
    return h`
      <div>
      </div>
    `;
  }

  nodeForCheckBox (morph) {
    return h`
       <div>
         <input type="checkbox">
         </input>
       </div>
      `;
  }

  nodeForCanvas (morph) {
    const node = h`
       <div>
         <canvas #innernode>
         </canvas>
       </div>
      `;
    const { innernode } = node.collect(node);
    // TODO: this is not enough, we need to do to not only when newly generating the node but also when updating the styleprops (e.g. width)
    innernode.style.width = `${this.width}px`;
    innernode.style.height = `${this.height}px`;
    innernode.style.pointerEvents = 'none';
    innernode.style.position = 'absolute';
    return node;
  }

  nodeForHTMLMorph (morph) {
    const node = h`
      <div>
      </div>
    `;
    node.appendChild(morph.domNode);

    return node;
  }

  nodeForImage (morph) {
    let url = morph.imageUrl;
    if (url.startsWith('data:')) {
      const dataPos = url.indexOf(',');
      const header = url.substring(5, dataPos);
      const [mimeType, encoding] = header.split(';');
      const data = url.substring(dataPos + 1);
      if (encoding !== 'base64') {
        url = string.createDataURI(data, mimeType);
      }
    }

    const node = h`
       <div>
         <img #innernode>
         </img>
       </div>
      `;
    const { innernode } = node.collect(node);
    innernode.draggable = false;
    innernode.style['pointer-events'] = 'none';
    innernode.style.position = 'absolute';
    innernode.style.left = 0;
    innernode.style.width = '100%';
    innernode.style.height = '100%';
    innernode.src = url;
    innernode.alt = morph.tooltip || '';
    return node;
  }

  // -=-=-=-
  // HOOKS
  // -=-=-=-
  hooksForCanvas () {
    return [function (morph, node) {
      const { innernode } = node.collect(node);
      const hasNewCanvas = morph._canvas !== innernode && innernode.tagName === 'CANVAS';
      morph.afterRender(innernode, hasNewCanvas);
    }
    ];
  }
}
