import { localInterface } from "lively-system-interface";
await localInterface.importPackage( "http://localhost:9011/stage0-morph/");
import Stage0Morph from "stage0-morph";
import { pt, Color } from "lively.graphics";
import { Morph, ProportionalLayout, HTMLMorph, Ellipse } from "lively.morphic";
import { CheckBox } from "lively.components/widgets.js";
import { Canvas } from "lively.components/canvas.js";

const stage0m = new Stage0Morph({extent: pt(500,500)}).openInWorld()
stage0m.reset()

// TODO: for these morphs hook are not toggled i believe!
const subsubmorph = new Morph({name: 'subsubmorph', fill: Color.pink,extent: pt(20,20)})
const submorph = new Morph({name: 'submorph', fill: Color.red,extent: pt(40,40),position: pt(30,30)})
const submorph2 = new Morph({name: 'submorph2', fill: Color.black ,extent: pt(10,10) ,position: pt(40,40)})
const newMorph = new Morph({name: 'newMorph', fill: Color.green, extent: pt(100,100), borderColor: Color.red, borderWidth: 3, submorphs: [submorph, submorph2]})
const worldMorph = new Morph({name: 'world', fill: Color.transparent, extent: pt(500,500)})

stage0m.renderWorld(worldMorph)
// submorph.fill = Color.orange;
// newMorph.clipMode = 'scroll'
// submorph2.position = pt(200,200)

worldMorph.addMorph(new Morph({name:'morph after the fact', fill: Color.yellow}))

worldMorph.addMorph(new Morph({fill: Color.pink}))

worldMorph.addMorph(new Ellipse({extent: pt(30,80), fill: Color.brown}))

worldMorph.addMorph(new Canvas({name: 'test', extent: pt(2)}))

// setup for proportional layout
const layoutedMorph = new Morph({
  extent: pt(100,100),
  fill: Color.transparent,
  borderColor: Color.red,
  borderWidth: 1,
  position: pt(10,10),
  layout: new ProportionalLayout({lastExtent: pt(100,100)}),
  submorphs: [new Morph({fill: Color.transparent,
  borderColor: Color.red,
  borderWidth: 1,extent: pt(30,40), position: pt(20,20)})]
})

worldMorph.addMorph(that)
that.position = pt(10,10)
layoutedMorph.extent = pt(200,200)
that.submorphs.map(m => m.fill = Color.pink)
stage0m.renderWorld()
