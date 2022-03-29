import h from 'esm://cache/npm:stage0@0.0.25';
import keyed from 'esm://cache/npm:stage0@0.0.25/keyed';
import { applyAttributesToNode, applyStylingToNode } from "stage0-morph/helpers.js";
import { Morph } from "lively.morphic";
import { Color, pt } from "lively.graphics";

that.domNode = h`<div #rootNode></div>`

const morphnode = h`
      <div>
      </div>
    `;

function renderedMorph(morph){
  const domNode =  morphnode.cloneNode(true)
  applyAttributesToNode(morph, domNode);
  applyStylingToNode(morph, domNode);
  return domNode
}

let renderedMorphs = []
const morphsToRender = [m1]
renderedMorphs = morphsToRender.slice()

m3.extent = pt(30,30)

keyed("key",
  that.domNode,
  renderedMorphs,
  morphsToRender,
  item => renderedMorph(item),
  (node, item) => applyStylingToNode(item, node)
  )

const m1 = new Morph({fill: Color.red, position: pt(20,20)})
const m2 = new Morph({fill: Color.blue, position: pt(10,10)})
const m3 = new Morph({fill: Color.green, position: pt(30,30)})