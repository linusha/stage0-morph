import { localInterface } from "lively-system-interface";
await localInterface.importPackage( "http://localhost:9011/stage0-morph/");
import Stage0Morph from "stage0-morph";
import { pt, Color } from "lively.graphics";
import { Morph, ProportionalLayout, Ellipse } from "lively.morphic";
import { Canvas } from "lively.components/canvas.js";
import { SmartText } from "lively.morphic/text/smart-text.js";

let fullSmartText = new SmartText({textAndAttributes: ["Hello", {fontSize: 50, backgroundColor: '#FFFF00',},"World\ntest\ntest"], readOnly: true, name: 'test'})
fullSmartText.extent
stage0m.addMorph(fullSmartText)
fullSmartText.textAndAttributes = ['Helloo', null, 'Robin\n', {backgroundColor: '#FFFF00'}, 'new line\n',null,'new line',null]
fullSmartText.extent
const stage0m = new Stage0Morph({extent: pt(500,500), fill: Color.white})
stage0m.openInWorld()
stage0m.remove()
let text;

text.renderingState.hasCSSLayoutChange = false;
text.renderingState.hasStructuralChanges = false;
text.renderingState.renderedTextAndAttributes = []
text.needsRerender = false;
stage0m.addMorph(text)

text.textAndAttributes = ["Hello", {textAlign: 'right', fontSize: 50, backgroundColor: '#FFFF00'},"World\ntest\ntest\ntest\ntest\ntest",null]

// TODO: for these morphs hook are not toggled i believe!
const subsubmorph = new Morph({name: 'subsubmorph', fill: Color.pink,extent: pt(20,20)})
stage0m.addMorph(subsubmorph)
$world.addMorph(subsubmorph)
const submorph = new Morph({name: 'submorph', fill: Color.red,extent: pt(40,40),position: pt(30,30),submorphs:[subsubmorph]})
const submorph2 = new Morph({name: 'submorph2', fill: Color.black ,extent: pt(10,10) ,position: pt(40,40)})
const newMorph = new Morph({name: 'newMorph', fill: Color.green, extent: pt(100,100), borderColor: Color.red, borderWidth: 3, submorphs: [submorph, submorph2]})
$world.addMorph(newMorph)
stage0m.addMorph(newMorph)
// submorph.fill = Color.orange;
// newMorph.clipMode = 'scroll'
// submorph2.position = pt(200,200)

stage0m.addMorph(new Morph({name:'morph after the fact', fill: Color.yellow}))
stage0m.addMorph(new Morph({fill: Color.pink}))
stage0m.addMorph(new Ellipse({extent: pt(30,80), fill: Color.brown}))
stage0m.addMorph(new Canvas({name: 'test', extent: pt(2)}))

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