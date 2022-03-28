import { HTMLMorph } from 'lively.morphic';
import h from 'esm://cache/npm:stage0@0.0.25';
import { defaultStyle } from 'lively.morphic/rendering/morphic-default.js';

let renderMap, handledMorphs;

export default class Stage0Morph extends HTMLMorph {
  constructor (props) {
    super(props);
    renderMap = new WeakMap();
    handledMorphs = [];
  }

  updateRendering () {
    debugger;
    for (let morph of handledMorphs) {
      if (morph._hatOptikSchmutz) {
        const node = renderMap.get(morph);
        this.applyStylingToNode(morph, node);
      } // TODO: second case -- struktureller schmutz
      // else: noop
    }
  }

  renderMorph (morph) {
    const node = h`
      <div #morphData>
      </div>
    `;
    const { morphdata } = node.collect(node);

    // TODO
    //   ...defaultAttributes(morph, this)
    this.applyStylingToNode(morph, morphdata);
    renderMap.set(morph, node);
    handledMorphs.push(morph);
    return node;
  }

  applyStylingToNode (morph, node) {
    const styleProps = defaultStyle(morph);

    for (let prop in styleProps) {
      node.style.setProperty(prop, styleProps[prop]);
    }
  }

  displayMorph (morph) {
    let node = this.renderMorph(morph);

    for (let submorph of morph.submorphs) {
      const submorphNode = this.renderMorph(submorph);
      node.appendChild(submorphNode);
    }

    this.domNode = node;
  }
}
