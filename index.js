import { HTMLMorph } from 'lively.morphic';
import h from 'esm://cache/npm:stage0@0.0.25';

export default class Stage0Morph extends HTMLMorph {
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
