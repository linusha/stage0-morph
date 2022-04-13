
import h from 'esm://cache/stage0@0.0.25';
import { keyed, noOpUpdate } from 'esm://cache/stage0@0.0.25/keyed';

import { applyAttributesToNode, applyStylingToNode } from './helpers.js';
import { withoutAll } from 'lively.lang/array.js';
import { string, arr, num, obj } from 'lively.lang';
import { getSvgVertices } from 'lively.morphic/rendering/property-dom-mapping.js';

const svgNs = 'http://www.w3.org/2000/svg';

/**
 * Currently handles rendering of a single Stage0Morph that acts as a "world", similar to the purporse a world would server in normal lively.
 This allows us to hack into the default render loop of lively.
 */
export default class Stage0Renderer {
  // -=-=-=-
  // SETUP
  // -=-=-=-
  constructor (owningMorph) {
    this.owner = owningMorph;
    this.renderMap = new WeakMap();
    this.morphsWithStructuralChanges = [];
    this.renderedMorphsWithChanges = [];
    this.renderedMorphsWithAnimations = [];
    this.rootNode = h`<div id='stage0root'></div>`;
    this.renderMap.set(this.owner, this.rootNode);
    this.doc = owningMorph.env.domEnv.document;
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  //  HIGHER LEVEL RENDERING FUNCTIONS
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  /**
   * Called to initialize and update the custom VDOM node as long as we are hooked into the default lively renderer.
   */
  renderWorld () {
    this.emptyRenderQueues();
    this.owner.applyLayoutIfNeeded(); // cascades through all submorphs and applies the javascript layouts

    const morphsToHandle = this.owner.withAllSubmorphsDo(m => m);

    // Handling these first allows us to assume correct wrapping, when we have submorphs already!
    for (let morph of morphsToHandle) {
      if (morph.renderingState.hasCSSLayoutChange) this.renderLayoutChange(morph);
    }

    for (let morph of morphsToHandle) {
      if (morph.renderingState.hasStructuralChanges) this.morphsWithStructuralChanges.push(morph);
      if (morph.renderingState.needsRerender) this.renderedMorphsWithChanges.push(morph);
      if (morph.renderingState.animationAdded) this.renderedMorphsWithAnimations.push(morph);
    }

    for (let morph of this.morphsWithStructuralChanges) {
      this.renderStructuralChanges(morph);
    }

    for (let morph of this.renderedMorphsWithChanges) {
      this.renderStylingChanges(morph);
    }

    for (let morph of this.renderedMorphsWithAnimations) {
      const node = this.getNodeForMorph(morph);
      morph._animationQueue.startAnimationsFor(node);
      morph.renderingState.animationsAdded = false;
    }

    return this.rootNode;
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-
  // BASIC RENDERING FUNCTIONS
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-

  /**
   * Returns a new DOM node for a morph.
   * @param {Morph} morph - The morph for which a DOM node should be generated.
   */
  renderMorph (morph) {
    let node;
    node = this.renderMap.get(morph);
    if (!node) {
      node = morph.getNodeForRenderer(this); // returns a DOM node as specified by the morph
      this.renderMap.set(morph, node);
    }

    // TODO: needs to be fixed once the correct abstraction for polygons is found
    if (!morph.isPath) {
      applyAttributesToNode(morph, node);
      applyStylingToNode(morph, node);
    }

    if (morph.submorphs.length === 0) return node;

    const skipWrapping = morph.layout && morph.layout.renderViaCSS;

    if (!skipWrapping) {
      this.installWrapperNodeFor(morph, node);
    }

    for (let submorph of morph.submorphs) {
      const submorphNode = this.renderMorph(submorph);
      if (skipWrapping) {
        if (!morph.isPath) node.appendChild(submorphNode);
        else node.insertBefore(submorphNode, node.lastChild);
      } else node.firstChild.nextSibling.appendChild(submorphNode);
      morph.renderingState.renderedMorphs.push(submorph);
    }

    return node;
  }

  installWrapperNodeFor (morph, node, fixChildNodes = false) {
    const wrapperNode = this.submorphWrapperNodeFor(morph);
    if (morph.isPolygon) this.renderPolygonClipMode(morph, wrapperNode);
    const children = Array.from(node.children);

    const wrapped = children.some(c => c.getAttribute('id') && c.getAttribute('id').includes('submorphs'));
    if (!wrapped) {
      if (!morph.isPath) node.appendChild(wrapperNode);
      else node.insertBefore(wrapperNode, node.lastChild);
      if (fixChildNodes) {
        const childNodes = Array.from(node.childNodes);
        if (morph.isPath) { childNodes.shift(); childNodes.pop(); } else if (morph.isImage || morph.isCanvas || morph.isHTMLMorph) childNodes.shift();
        childNodes.forEach((n) => {
          if (n !== wrapperNode) wrapperNode.appendChild(n);
        });
      }
      return wrapperNode;
    }
  }

  /**
   * Also removes the wrapper Node.
   * @param {Node} node - Node of the morph for which submorphs should get unwrapped.
   */
  unwrapSubmorphNodesIfNecessary (node, morph) {
    // do nothing if submorph nodes are not wrapped
    // e.g. in case we have had a css layout already, this can be skipped
    let children = Array.from(node.children);
    const wrapped = children.some(c => c.getAttribute('id') && c.getAttribute('id').includes('submorphs'));
    if (wrapped) {
      if (!morph.isPath) {
        node.append(...node.lastChild.childNodes);
        children = Array.from(node.children);
        children.forEach((n) => {
          if (n.getAttribute('id') && n.getAttribute('id').includes('submorphs')) n.remove();
        });
      } else {
        const wrapperNode = node.firstChild.nextSibling;
        let children = Array.from(wrapperNode.children);
        children.forEach((n) => node.insertBefore(n, node.lastChild));
        wrapperNode.remove();
      }
    }
  }

  renderLayoutChange (morph) {
    const node = this.getNodeForMorph(morph);

    // TODO: this might never be an actual possibility, once the stage0renderer is the only renderer in town
    // This was introduced as a fix for when a morph with an active CSS layout was dropped into the Stage0Morph 
    // Second case is for erly returning unneeded wrapping, since we only want to install wrappers when they are needed.
    if (!node || morph.submorphs.length === 0) return;

    let layoutAdded = morph.layout && morph.layout.renderViaCSS;

    if (layoutAdded) {
      this.unwrapSubmorphNodesIfNecessary(node, morph);
    } else { // no css layout applied at the moment
      this.installWrapperNodeFor(morph, node, true);
    }
    morph.renderingState.hasCSSLayoutChange = false;
    morph.submorphs.forEach(s => s.renderingState.needsRerender = true);
  }

  /**
   * Updates the DOM structure starting from the node for `morph`. Does not take styling into account. Will add/remove nodes to the dom as necessary.
   * Thus, this function is triggered for morphs that either have submorphs added or removed or that have a layout applied.
   * Going through this routine for morphs that have a layout added/removed is necessary, since we need to wrap/unwrap submorphs in a separate DOM node.
   * @param { Morph } morph - The morph which has had changed to its submorph hierarchy.
   */
  renderStructuralChanges (morph) {
    // Invariant: Morph has been rendered previously.
    const node = this.getNodeForMorph(morph);

    const submorphsToRender = morph.submorphs;

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // Optimization for when a morph has no longer any submorphs.
    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    if (morph.submorphs.length === 0) {
      if (morph.isPath) {
        // two SVG nodes are necessary
        // remove everything else, in the case that we have unwrapped submorph nodes
        node.childNodes.forEach(n => {
          if (n.tagName !== 'svg') n.remove();
        });
      } else {
        node.replaceChildren();
      }
      morph.renderingState.renderedMorphs = morph.submorphs.slice();
      morph.renderingState.hasStructuralChanges = false;
      return;
    }
    // Due to the early return, we know that we have submorphs here.
    const alreadyRenderedSubmorphs = morph.renderingState.renderedMorphs;
    const newlyRenderedSubmorphs = withoutAll(submorphsToRender, alreadyRenderedSubmorphs);

    let skipWrapping = morph.layout && morph.layout.renderViaCSS;
    if (morph.isPath) {
      if (skipWrapping) {
        const [firstSvg, secondSvg] = Array.from(node.children).filter(n => n.tagName === 'svg');
        keyed('id',
          node,
          alreadyRenderedSubmorphs,
          submorphsToRender,
          item => this.renderMorph(item),
          noOpUpdate,
          firstSvg, // before list
          secondSvg// after list
        );
      } else {
        this.installWrapperNodeFor(morph, node);
        keyed('id',
          node.firstChild.nextSibling,
          alreadyRenderedSubmorphs,
          submorphsToRender,
          item => this.renderMorph(item)
        );
      }
    } else // morph is not path
    if (skipWrapping) {
      const beforeElem = node.firstChild;
      keyed('id',
        node,
        alreadyRenderedSubmorphs,
        submorphsToRender,
        item => this.renderMorph(item),
        noOpUpdate,
        (morph.isCanvas || morph.isHTMLMorph || morph.isImage) ? beforeElem : null// before list
      );
    } else {
      this.installWrapperNodeFor(morph, node);
      keyed('id',
        node.lastChild,
        alreadyRenderedSubmorphs,
        submorphsToRender,
        item => this.renderMorph(item)
      );
    }

    // When a node get removed/added to the DOM its scollTop/scrollLeft values are reset.
    // We fix those up here.
    for (let morph of newlyRenderedSubmorphs) {
      morph.withAllSubmorphsDo(m => this.updateNodeScrollFromMorph(m));
    }

    // TODO: migrate actual hook over
    /* for (let submorph of newlyRenderedSubmorphs) {
      const node = this.getNodeForMorph(submorph);
      const hooks = submorph.getHooksForRenderer(this);
      for (let hook of hooks) {
        hook(submorph, node);
      }
      // TODO: this is not enough, we could have multiple hooks!
      // submorph.afterRenderHook(node);
    } */

    morph.renderingState.renderedMorphs = morph.submorphs.slice();
    morph.renderingState.hasStructuralChanges = false;
  }

  /**
   * Assumes that a DOM node for the given morph already exists and changes the attributes of this node according to the current style definition of the morph.
   * @param { Morph } morph - The morph for which to update the rendering.
   */
  renderStylingChanges (morph) {
    const node = this.getNodeForMorph(morph);

    // TODO
    //  this.renderPolygonMask(morph);
    if (morph.patchSpecialProps) {
      morph.patchSpecialProps(node, this);
    }

    applyStylingToNode(morph, node);

    // TODO: this needs to call the after render hooks later on
    morph.renderingState.needsRerender = false;
  }

  // -=-=-=-=-=-=-=-=-
  // HELPER FUNCTIONS
  // -=-=-=-=-=-=-=-=-

  submorphWrapperNodeFor (morph) {
    let { borderWidthLeft, borderWidthTop, origin: { x: oX, y: oY } } = morph;

    const node = h`<div></div>`;
    node.setAttribute('id', 'submorphs-' + morph.id);
    node.style.setProperty('position', 'absolute');
    node.style.setProperty('left', `${oX - (morph.isPath ? 0 : borderWidthLeft)}px`);
    node.style.setProperty('top', `${oY - (morph.isPath ? 0 : borderWidthTop)}px`);
    if (morph.isPolygon) {
      node.style.setProperty('height', '100%');
      node.style.setProperty('width', '100%');
    }

    return node;
  }

  emptyRenderQueues () {
    this.morphsWithStructuralChanges = [];
    this.renderedMorphsWithChanges = [];
  }

  getNodeForMorph (morph) {
    return this.renderMap.get(morph);
  }

  updateNodeScrollFromMorph (morph) {
    const node = this.getNodeForMorph(morph);
    const { x, y } = morph.scroll;
    node.scrollTop = y;
    node.scrollLeft = x;
  }

  // -=-=-=-=-=-
  // NODE TYPES
  // -=-=-=-=-=-
  nodeForMorph (morph) {
    return h`
      <div>
      </div>
    `;
  }

  nodeForCheckBox (morph) {
    return h`
       <div>
         <input type="checkbox">
         </input>
       </div>
      `;
  }

  nodeForCanvas (morph) {
    const node = h`
       <div>
         <canvas #innernode>
         </canvas>
       </div>
      `;
    const { innernode } = node.collect(node);
    // TODO: this is not enough, we need to do to not only when newly generating the node but also when updating the styleprops (e.g. width)
    innernode.style.width = `${this.width}px`;
    innernode.style.height = `${this.height}px`;
    innernode.style.pointerEvents = 'none';
    innernode.style.position = 'absolute';
    return node;
  }

  nodeForHTMLMorph (morph) {
    const node = h`
      <div>
      </div>
    `;
    node.appendChild(morph.domNode);

    return node;
  }

  nodeForImage (morph) {
    let url = morph.imageUrl;
    if (url.startsWith('data:')) {
      const dataPos = url.indexOf(',');
      const header = url.substring(5, dataPos);
      const [mimeType, encoding] = header.split(';');
      const data = url.substring(dataPos + 1);
      if (encoding !== 'base64') {
        url = string.createDataURI(data, mimeType);
      }
    }

    const node = h`
       <div>
         <img #innernode>
         </img>
       </div>
      `;
    const { innernode } = node.collect(node);
    innernode.draggable = false;
    innernode.style['pointer-events'] = 'none';
    innernode.style.position = 'absolute';
    innernode.style.left = 0;
    innernode.style.width = '100%';
    innernode.style.height = '100%';
    return node;
  }

  // -=-=-=-=-=-=-=-=-=-
  // SVGs and Polygons
  // -=-=-=-=-=-=-=-=-=-      
  nodeForPath (morph) {
    const node = h`<div></div>`;
    applyAttributesToNode(morph, node);

    const innerSvg = this.createSvgForPolygon();
    const pathElem = this.doc.createElementNS(svgNs, 'path');
    pathElem.setAttribute('id', 'svg' + morph.id);
    const defNode = this.doc.createElementNS(svgNs, 'defs');
    innerSvg.appendChild(pathElem);
    innerSvg.appendChild(defNode);

    const outerSvg = this.createSvgForPolygon();

    node.appendChild(innerSvg);
    node.appendChild(outerSvg);
    return node;
  }

  createSvgForPolygon () {
    const elem = this.doc.createElementNS(svgNs, 'svg');
    elem.style.position = 'absolute';
    elem.style.overflow = 'visible';
    return elem;
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // DYNAMICALLY RENDER POLYGON PROPS
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  renderControlPoints (morph) {
    let controlPoints = [];
    if (morph.showControlPoints) {
      controlPoints = this.doc.createElementNS(svgNs, 'g');
      controlPoints.append(...this._renderPath_ControlPoints(morph));
    }
    const node = this.getNodeForMorph(morph);
    // TODO: this could be optimized in a smart way
    node.lastChild.replaceChildren();
    if (!arr.equals(controlPoints, [])) {
      node.lastChild.appendChild(controlPoints);
    }
  }

  renderPolygonBorderColor (morph) {
    const node = this.getNodeForMorph(morph);
    node.firstChild.firstChild.setAttribute('stroke', morph.borderColor.valueOf().toString());
  }

  renderPolygonClippingPath (morph) {
    const clipPath = this.doc.createElementNS(svgNs, 'clipPath');
    clipPath.setAttribute('id', 'clipPath' + morph.id);
    const clipPathInner = this.doc.createElementNS(svgNs, 'path');
    clipPath.appendChild(clipPathInner);
    return clipPath;
  }

  renderPolygonDrawAttribute (morph) {
    // TODO: fix clippath for submorph clipping!
    const node = this.getNodeForMorph(morph);
    const d = getSvgVertices(morph.vertices);
    if (morph.vertices.length) {
      node.firstChild.firstChild.setAttribute('d', d);
      const defNode = Array.from(node.firstChild.children).find(n => n.tagName === 'defs');
      let clipPath = Array.from(defNode.children).find(n => n.tagName === 'clipPath');
      if (!clipPath) {
        clipPath = this.renderPolygonClippingPath(morph);
        defNode.appendChild(clipPath);
      }
      clipPath.firstChild.setAttribute('d', d);
      // const mask = Array.from(defNode.children).find(n => n.tagName === 'mask');

      // Array.from(mask.children).forEach(n => {
      //  if (n.tagName === 'path') n.setAttribute('d', d);
      // });
    }
  }

  renderPolygonFill (morph) {
    const node = this.getNodeForMorph(morph);
    let newGradient;
    let defsNode = Array.from(node.firstChild.children).find(n => n.tagName === 'defs');
    const def = Array.from(defsNode.children).find(n => n.getAttribute('id').includes('fill'));
    node.firstChild.firstChild.setAttribute('fill', morph.fill ? morph.fill.isGradient ? 'url(#gradient-fill' + morph.id + ')' : morph.fill.toString() : 'transparent');
    if (morph.fill && !morph.fill.isGradient) {
      if (def) def.remove();
      return;
    }
    newGradient = this.renderGradient('fill' + morph.id, morph.extent, morph.fill);

    if (!defsNode && newGradient) {
      defsNode = this.doc.createElementNS(svgNs, 'defs');
      defsNode.appendChild(newGradient);
      node.firstChild.appendChild(defsNode);
    } else {
      if (def) defsNode.replaceChild(newGradient, def);
      else defsNode.appendChild(newGradient);
    }
  }

  renderPolygonStrokeStyle (morph) {
    const node = this.getNodeForMorph(morph);
    const firstSvg = node.firstChild;
    firstSvg.style['stroke-linejoin'] = morph.cornerStyle || 'mint';
    firstSvg.style['stroke-linecap'] = morph.endStyle || 'round';
  }

  renderPolygonMask (morph) {
    const node = this.getNodeForMorph(morph);
    const drawnProportion = morph.drawnProportion;
    const pathElem = node.firstChild.firstChild;
    const defNode = node.firstChild.lastChild;
    // TODO: this can be optimized
    Array.from(defNode.children).forEach(n => {
      if (n.tagName === 'mask') n.remove();
    });

    if (drawnProportion !== 0) pathElem.setAttribute('mask', 'url(#mask' + morph.id + ')');
    else pathElem.setAttribute('mask', '');

    const maskNode = this.doc.createElementNS(svgNs, 'mask');
    const innerRect = this.doc.createElementNS(svgNs, 'rect');
    const firstInnerPath = this.doc.createElementNS(svgNs, 'path');
    const secondInnerPath = this.doc.createElementNS(svgNs, 'path');

    maskNode.append(innerRect, firstInnerPath, secondInnerPath);

    maskNode.setAttribute('id', 'mask' + morph.id);

    innerRect.setAttribute('fill', 'white');
    innerRect.setAttribute('x', 0);
    innerRect.setAttribute('y', 0);
    innerRect.setAttribute('width', morph.width + 20);
    innerRect.setAttribute('height', morph.height + 20);

    firstInnerPath.setAttribute('stroke', 'black');
    firstInnerPath.setAttribute('fill', 'none');
    if (drawnProportion) {
      firstInnerPath.setAttribute('stroke-width', morph.borderWidth.valueOf() + 1);
      firstInnerPath.setAttribute('stroke-dasharray', firstInnerPath.getTotalLength());
      firstInnerPath.setAttribute('stroke-dashoffset', firstInnerPath.getTotalLength() * (1 - morph.drawnProportion));
    }

    secondInnerPath.setAttribute('stroke', 'white');
    secondInnerPath.setAttribute('fill', 'none');
    if (drawnProportion) {
      firstInnerPath.setAttribute('stroke-width', morph.borderWidth.valueOf() + 1);
      firstInnerPath.setAttribute('stroke-dasharray', firstInnerPath.getTotalLength());
      firstInnerPath.setAttribute('stroke-dashoffset', firstInnerPath.getTotalLength() * (-1 + (1 - morph.drawnProportion)));
    }

    defNode.appendChild(maskNode);
  }

  renderPolygonBorder (morph) {
    const node = this.getNodeForMorph(morph);
    const pathNode = node.firstChild.firstChild;
    const bs = morph.borderStyle.valueOf();
    if (bs === 'dashed') {
      const bw = morph.borderWidth.valueOf();
      pathNode.setAttribute('stroke-dasharray', bw * 1.61 + ' ' + bw);
    } else if (bs === 'dotted') {
      const bw = morph.borderWidth.valueOf();
      pathNode.setAttribute('stroke-dasharray', '1 ' + bw * 2);
      pathNode.setAttribute('stroke-linecap', 'round');
      pathNode.setAttribute('stroke-linejoin', 'round');
    }
    pathNode.setAttribute('stroke-width', morph.borderWidth.valueOf());
  }

  renderPolygonSVGAttributes (morph) {
    const { width, height } = morph;
    const node = this.getNodeForMorph(morph);
    [node.firstChild, node.lastChild].forEach(n => {
      n.setAttribute('width', width || 1);
      n.setAttribute('height', height || 1);
      n.setAttribute('viewBox', [0, 0, width || 1, height || 1].join(' '));
    });
  }

  renderPolygonClipMode (morph, submorphNode) {
    if (!submorphNode) {
      submorphNode = Array.from(this.getNodeForMorph(morph).children).find(n => n.id && n.id.includes('submorphs'));
    }
    if (submorphNode) {
      submorphNode.style.setProperty('overflow', `${morph.clipMode}`);
      if (morph.clipMode !== 'visible') {
        submorphNode.style.setProperty('clip-path', `url(#clipPath${morph.id})`);
      } else {
        submorphNode.style.setProperty('clip-path', '');
      }
    } // when no submorphNode is found we are skipping wrapping or do not have any submorphs
  }

  _renderPath_ControlPoints (morph) {
    const {
      vertices,
      borderWidth, showControlPoints, _controlPointDrag
    } = morph;
    let fill = 'red';
    let radius = borderWidth === 0 ? 6 : borderWidth + 2;

    // HELPER FUNCTION
    const circ = (cx, cy, n, merge, type, isCtrl) => {
      let r = merge ? 12 : Math.min(8, Math.max(3, radius));
      let cssClass = 'path-point path-point-' + n;
      const color = merge ? 'orange' : fill;
      if (typeof type === 'string') cssClass += '-' + type;
      if (isCtrl) r = Math.max(3, Math.ceil(r / 2));
      const node = this.doc.createElementNS(svgNs, 'circle');
      if (isCtrl) {
        node.style.setProperty('fill', 'white');
        node.style.setProperty('stroke-width', 2);
        node.style.setProperty('stroke', color);
        node.setAttribute('class', cssClass);
        node.setAttribute('cx', cx);
        node.setAttribute('cy', cy);
        node.setAttribute('r', r);
      } else {
        node.style.setProperty('fill', color);
        node.setAttribute('class', cssClass);
        node.setAttribute('cx', cx);
        node.setAttribute('cy', cy);
        node.setAttribute('r', r);
      }
      return node;
    };

    const rendered = [];

    if (typeof showControlPoints === 'object') {
      const { radius: r, fill: f } = showControlPoints;
      if (f) fill = String(f);
      if (typeof r === 'number') radius = r;
    }

    if (vertices.length) {
      let i = 0; let X; let Y; let left_cp;
      {
        const { x, y, controlPoints: { next: n } } = vertices[0];
        const merge = _controlPointDrag && _controlPointDrag.maybeMerge && _controlPointDrag.maybeMerge.includes(i);
        X = x; Y = y;
        rendered.push(circ(X, Y, i, merge));
        left_cp = n;
      }

      for (let i = 1; i < vertices.length - 1; i++) {
        const vertex = vertices[i];
        const { isSmooth, x, y, controlPoints: { previous: p, next: n } } = vertex;
        const merge = _controlPointDrag && _controlPointDrag.maybeMerge && _controlPointDrag.maybeMerge.includes(i);

        if (isSmooth) {
          rendered.push(
            circ(x, y, i, merge),
            circ(X + left_cp.x, Y + left_cp.y, i - 1, false, 'control-2', true),
            circ(x + p.x, y + p.y, i, false, 'control-1', true));
        } else {
          rendered.push(circ(x, y, i, merge));
        }

        X = x; Y = y;
        left_cp = n;
      }

      {
        const { isSmooth, x, y, controlPoints: { previous: p } } = vertices[vertices.length - 1];
        const merge = _controlPointDrag && _controlPointDrag.maybeMerge && _controlPointDrag.maybeMerge.includes(i);
        if (isSmooth) {
          rendered.push(
            circ(x, y, i, merge),
            circ(X + left_cp.x, Y + left_cp.y, i - 1, false, 'control-2', true),
            circ(x + p.x, y + p.y, i, false, 'control-1', true));
        } else {
          rendered.push(circ(x, y, i, merge));
        }
      }
    }

    return rendered;
  }

  renderPathMarker (morph, mode) {
    const node = this.getNodeForMorph(morph);
    const pathElem = node.firstChild.firstChild;
    const defElem = node.firstChild.lastChild;

    const specTo_h_svg = (spec) => {
      let { tagName, id, children } = spec;
      const childNodes = children ? children.map(specTo_h_svg) : undefined;

      if (id) id = morph.id + '-' + id;

      const node = this.doc.createElementNS(svgNs, tagName);
      node.setAttribute('id', id);
      for (let prop in obj.dissoc(spec, ['id', 'tagName', 'children'])) {
        node.setAttribute(prop, spec[prop]);
      }

      if (childNodes) node.append(...childNodes);

      return node;
    };
    const marker = mode === 'start' ? morph.startMarker : morph.endMarker;

    // TODO: this can be further optimized
    pathElem.removeAttribute(`marker-${mode}`);
    const defs = Array.from(defElem.children);
    defs.forEach(d => {
      if (d.id && d.id.includes(`${mode}-marker`)) d.remove();
    });

    if (marker) {
      if (!marker.id) marker.id = `${mode}-marker`;
      pathElem.setAttribute(`marker-${mode}`, `url(#${morph.id}-${marker.id})`);
      const defs = Array.from(defElem.children);
      defs.forEach(d => {
        if (d.id && d.id.includes(`${mode}-marker`)) d.remove();
      });
      defElem.appendChild(specTo_h_svg(marker));
    }
  }

  renderGradient (id, extent, gradient) {
    gradient = gradient.valueOf();
    const { bounds, focus, vector, stops } = gradient;
    const { x: width, y: height } = extent;
    const props = {
      id: 'gradient-' + id,
      gradientUnits: 'userSpaceOnUse',
      r: '50%'
    };
    if (vector) {
      props.gradientTransform =
      `rotate(${num.toDegrees(vector.extent().theta())}, ${width / 2}, ${height / 2})`;
    }
    if (focus && bounds) {
      const { width: bw, height: bh } = bounds;
      const { x, y } = focus;
      props.gradientTransform = `matrix(
${bw / width}, 0, 0, ${bh / height},
${((width / 2) - (bw / width) * (width / 2)) + (x * width) - (width / 2)},
${((height / 2) - (bh / height) * (height / 2)) + (y * height) - (height / 2)})`;
    }

    const node = this.doc.createElementNS(svgNs, gradient.type);
    for (let prop in props) {
      node.setAttribute(prop, props[prop]);
    }

    const stopNodes = stops.map(stop => {
      const node = this.doc.createElementNS(svgNs, 'stop');
      node.setAttribute('offset', (stop.offset * 100) + '%');
      node.setAttribute('stop-opacity', stop.color.a);
      node.setAttribute('stop-color', stop.color.withA(1).toString());
      return node;
    });

    node.append(...stopNodes);

    return node;
  }

  // -=-=-=-
  // HOOKS
  // -=-=-=-
  hooksForCanvas () {
    return [function (morph, node) {
      const { innernode } = node.collect(node);
      const hasNewCanvas = morph._canvas !== innernode && innernode.tagName === 'CANVAS';
      morph.afterRender(innernode, hasNewCanvas);
    }
    ];
  }
}
