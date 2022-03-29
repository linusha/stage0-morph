
import h from 'esm://cache/stage0@0.0.25';
import keyed from 'esm://cache/stage0@0.0.25/keyed';

import { applyAttributesToNode, applyStylingToNode } from './helpers.js';

const morphnode = h`
      <div>
      </div>
    `;

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
    const node = morphnode.cloneNode(true);

    this.renderMap.set(morph, node);
    this.handledMorphs.push(morph);

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

    keyed('key',
      node,
      morph.renderingState.renderedMorphs,
      submorphsToRender,
      item => this.renderNewMorph(item));

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
}
