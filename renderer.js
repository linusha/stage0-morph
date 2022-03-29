
import h from 'esm://cache/npm:stage0@0.0.25';

import { remove } from 'lively.lang/array.js';
import { applyAttributesToNode, applyStylingToNode } from './helpers.js';

export default class Stage0Renderer {
  // -=-=-=-
  // SETUP
  // -=-=-=-
  constructor () {
    this.renderMap = new WeakMap();
    this.handledMorphs = [];
    // TODO: divide into optical and structural changes
    this.dirtyMorphs = [];
  }

  reset () {
    this.renderMap = new WeakMap();
    this.handledMorphs = [];
    this.rootMorph = null;
    this.rootNode = null;
  }

  addRootMorph (morph) {
    this.rootMorph = morph;
    const node = this.renderMorph(morph);
    this.rootNode = node;
    document.getElementById('stage0root').appendChild(node);
  }

  renderMorph (morph) {
    let domNode = this.renderMap.get(morph);
    // Morph has already been rendered once, node exists
    if (domNode) {
      applyAttributesToNode(morph, domNode);
      applyStylingToNode(morph, domNode);
      if (morph.structuralDirt) {
        // this leads to the correct result, but takes significantly more render steps than we want
        // here comes the tricky part, i.e. reconciliation of the dom nodes with keyed?
        domNode.replaceChildren();
        for (let submorph of morph.submorphs) {
          const submorphNode = this.renderMorph(submorph);
          domNode.appendChild(submorphNode);
        }
      }
      delete morph._customDirty;
      // return;
    }
    // morph gets rendered for the first time, need to create new dom node
    const node = h`
      <div>
      </div>
    `;

    applyAttributesToNode(morph, node);
    applyStylingToNode(morph, node);

    for (let submorph of morph.submorphs) {
      const submorphNode = this.renderMorph(submorph);
      node.appendChild(submorphNode);
    }

    delete morph._customDirty;
    this.renderMap.set(morph, node);
    this.handledMorphs.push(morph);
    return node;
  }

  simulateRenderingLoop () {
    this.dirtyMorphs = [];

    for (let morph of this.handledMorphs) {
      if (morph._customDirty) {
        this.dirtyMorphs.push(morph);
      }
    }

    for (let morph of this.dirtyMorphs) {
      this.renderMorph(morph);
      remove(this.dirtyMorphs, morph);
    }
  }

  // -=-=-=-=-=-=-=-=-
  // HELPER FUNCTIONS
  // -=-=-=-=-=-=-=-=-
  getNodeForMorph (morph) {
    return this.renderMap.get(morph);
  }
}
