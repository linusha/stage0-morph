import { HTMLMorph } from 'lively.morphic';
import h from 'esm://cache/npm:stage0@0.0.25';
import { defaultStyle } from 'lively.morphic/rendering/morphic-default.js';

export default class Stage0Morph extends HTMLMorph {
  renderMorph (morph) {
    const node = h`
      <div #morphData>
      </div>
    `;
    const { morphdata } = node.collect(node);

    // TODO
    //   ...defaultAttributes(morph, this)
    const styleProps = defaultStyle(morph);

    for (let prop in styleProps) {
      morphdata.style.setProperty(prop, styleProps[prop]);
    }
    return node;
  }

  displayMorph (morph) {
    let node = this.renderMorph(morph);

    for (let submorph of morph.submorphs) {
      const submorphNode = this.renderMorph(submorph);
      node.appendChild(submorphNode);
    }

    this.domNode = node;
  }

  counterExample () {
    // Create view template.
    // Mark dynamic references with a #-syntax where needed.
    const view = h`
      <div>
        <h1>#count</h1>
        <button #down>-</button>
        <button #up>+</button>
      </div>
    `;
    function Main () {
      const root = view;

      // Collect references to dynamic parts
      const { count, down, up } = view.collect(root);

      const state = {
        count: 0
      };

      const update = () => count.nodeValue = state.count;

      down.onclick = () => {
        state.count--;
        update();
      };

      up.onclick = () => {
        state.count++;
        update();
      };

      update();

      return root;
    }

    const dom = Main();
    this.domNode = dom;
  }
}
