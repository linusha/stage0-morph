
import h from 'esm://cache/stage0@0.0.25';
import keyed from 'esm://cache/stage0@0.0.25/keyed';

import { applyAttributesToNode, applyStylingToNode } from './helpers.js';
import { withoutAll } from 'lively.lang/array.js';
import { string } from 'lively.lang';

/**
 * Currently handles rendering of a single Stage0Morph that acts as a "world", similar to the purporse a world would server in normal lively.
 This allows us to hack into the default render loop of lively.
 */
export default class Stage0Renderer {
  // -=-=-=-
  // SETUP
  // -=-=-=-
  constructor (owningMorph) {
    this.owner = owningMorph;
    this.renderMap = new WeakMap();
    this.morphsWithStructuralChanges = [];
    this.renderedMorphsWithChanges = [];
    this.renderedMorphsWithAnimations = [];
    this.rootNode = h`<div id='stage0root'></div>`;
    this.renderMap.set(this.owner, this.rootNode);
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  //  HIGHER LEVEL RENDERING FUNCTIONS
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  /**
   * Called to initialize and update the custom VDOM node as long as we are hooked into the default lively renderer.
   */
  renderWorld () {
    this.emptyRenderQueues();
    this.owner.applyLayoutIfNeeded(); // cascades through all submorphs and applies the javascript layouts

    const morphsToHandle = this.owner.withAllSubmorphsDo(m => m);

    for (let morph of morphsToHandle) {
      if (morph.renderingState.hasStructuralChanges) this.morphsWithStructuralChanges.push(morph);
      if (morph.renderingState.needsRerender) this.renderedMorphsWithChanges.push(morph);
      if (morph.renderingState.animationAdded) this.renderedMorphsWithAnimations.push(morph);
    }

    for (let morph of this.morphsWithStructuralChanges) {
      this.renderStructuralChanges(morph);
    }

    for (let morph of this.renderedMorphsWithChanges) {
      this.renderStylingChanges(morph);
    }

    for (let morph of this.renderedMorphsWithAnimations) {
      const node = this.getNodeForMorph(morph);
      morph._animationQueue.startAnimationsFor(node);
      morph.renderingState.animationsAdded = false;
    }

    return this.rootNode;
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-
  // BASIC RENDERING FUNCTIONS
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-

  /**
   * Returns a new DOM node for a morph.
   * @param {Morph} morph - The morph for which a DOM node should be generated.
   */
  renderMorph (morph) {
    let node;
    node = this.renderMap.get(morph);

    if (!node) {
      node = morph.getNodeForRenderer(this); // returns a DOM node as specified by the morph
      this.renderMap.set(morph, node);
    }

    applyAttributesToNode(morph, node);
    applyStylingToNode(morph, node);

    const skipWrapping = morph.layout && morph.layout.renderViaCSS;
    const wrapperNode = this.submorphWrapperNodeFor(morph);
    if (!skipWrapping) node.appendChild(wrapperNode);

    for (let submorph of morph.submorphs) {
      const submorphNode = this.renderMorph(submorph);
      if (skipWrapping) node.appendChild(submorphNode);
      else wrapperNode.appendChild(submorphNode);
      morph.renderingState.renderedMorphs.push(submorph);
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

    let skipWrapping = morph.layout && morph.layout.renderViaCSS;
    if (skipWrapping) {
      let wasWrapped;
      if (node.firstChild && node.firstChild.getAttribute('key').includes('submorphs')) {
        node.firstChild.remove();
        wasWrapped = true;
      }

      keyed('key',
        node,
        // TODO: can this be optimized?
        wasWrapped ? [] : alredayRenderedSubmorphs,
        submorphsToRender,
        item => this.renderMorph(item)
      );
    } else {
      const wrapped = node.firstChild && node.firstChild.getAttribute('key').includes('submorphs');
      if (!wrapped) {
        node.appendChild(this.submorphWrapperNodeFor(morph));
      }
      keyed('key',
        node.firstChild,
        alredayRenderedSubmorphs,
        submorphsToRender,
        item => this.renderMorph(item)
      );
    }

    // When a node get removed/added to the DOM its scollTop/scrollLeft values are reset.
    // We fix those up here.
    for (let morph of newlyRenderedSubmorphs) {
      morph.withAllSubmorphsDo(m => this.updateNodeScrollFromMorph(m));
    }

    // TODO: migrate actual hook over
    /* for (let submorph of newlyRenderedSubmorphs) {
      const node = this.getNodeForMorph(submorph);
      const hooks = submorph.getHooksForRenderer(this);
      for (let hook of hooks) {
        hook(submorph, node);
      }
      // TODO: this is not enough, we could have multiple hooks!
      // submorph.afterRenderHook(node);
    } */

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

  submorphWrapperNodeFor (morph) {
    let { borderWidthLeft, borderWidthTop, origin: { x: oX, y: oY } } = morph;

    const node = h`<div></div>`;
    node.setAttribute('key', 'submorphs-' + morph.id);
    node.style.setProperty('position', 'absolute');
    node.style.setProperty('left', `${oX - (morph.isPath ? 0 : borderWidthLeft)}px`);
    node.style.setProperty('top', `${oY - (morph.isPath ? 0 : borderWidthTop)}px`);
    if (morph.isPolygon) {
      node.style.setProperty('height', '100%');
      node.style.setProperty('width', '100%');
      node.style.setProperty('overflow', `${morph.clipMode}`);
      if (morph.clipMode !== 'visible') {
        if (navigator.userAgent.includes('AppleWebKit')) { node.setAttribute('-webkit-clip-path', `url(#clipPath${morph.id})`); } else { node.setAttribute('clip-path', `url(#clipPath${morph.id})`); }
      }
    }

    return node;
  }

  emptyRenderQueues () {
    this.morphsWithStructuralChanges = [];
    this.renderedMorphsWithChanges = [];
  }

  getNodeForMorph (morph) {
    return this.renderMap.get(morph);
  }

  updateNodeScrollFromMorph (morph) {
    const node = this.getNodeForMorph(morph);
    const { x, y } = morph.scroll;
    node.scrollTop = y;
    node.scrollLeft = x;
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
