import { HTMLMorph } from 'lively.morphic';
import h from 'esm://cache/npm:stage0@0.0.25';
import Stage0Renderer from './renderer.js';

export default class Stage0Morph extends HTMLMorph {
  constructor (props) {
    super(props);
    this.renderer = new Stage0Renderer();
    this.domNode = h`
      <div id='stage0root'>
      </div>
    `;
  }

  reset () {
    this.renderer.reset();
    this.domNode = h`
      <div id='stage0root'>
      </div>
    `;
  }

  updateRendering () {
    this.renderer.simulateRenderingLoop();
  }

  /**
   * Current entry point for render logic
   */
  renderWorld (worldMorph) {
    if (worldMorph) this.renderer.addRootMorph(worldMorph);
    this.updateRendering();
  }
}
