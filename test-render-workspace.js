import { localInterface } from "lively-system-interface";
await localInterface.importPackage( "http://localhost:9011/stage0-morph/");
import Stage0Morph from "stage0-morph";
import { pt, Color } from "lively.graphics";
import { Morph, ProportionalLayout, Ellipse } from "lively.morphic";
import { Canvas } from "lively.components/canvas.js";
import { SmartText } from "lively.morphic/text/smart-text.js";

const stage0m = new Stage0Morph({extent: pt(500,500), fill: Color.white})
stage0m.openInWorld()


let fullSmartText = new SmartText({textAndAttributes: ['Helloo Robin\n', null, 
                                   'new line1\n',null,
                                   'new line2\n',null,
                                   'new line3\n',null,
                                   'new line4\n',null,
                                   'new line5\n',null,
                                   'new line6\n',null,
                                   'new line7\n',null,
                                   'new line8',null,
                                  ], name: 'test',
                                  //fixedHeight: true,
                                  //height: 80,
                                  //fixedWidth: true,
                                  //width: 300,
                                  // lineHeight: 2,
                                  labelMode: false,
                                  clipMode: 'auto',
                                  //fontFamily: 'Monaco',
                                  //textAlign: 'center',
                                  // lineWrapping: 'by-chars',
                                  //fontSize: 20,
                                  //fontWeigth: 'bold',
                                  // debug: true
                                  })
fullSmartText.readOnly = false;
fullSmartText.readOnly = true;

stage0m.addMorph(fullSmartText)
fullSmartText.scroll = pt(0,50)
fullSmartText.fit()
fullSmartText.extent

fullSmartText.textAndAttributes
fullSmartText.forceRerender()
fullSmartText.remove()


fullSmartText.textAndAttributes = 'testerino'

fullSmartText.selection

stage0m.remove()

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