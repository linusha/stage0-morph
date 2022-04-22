
import { keyed, noOpUpdate } from 'esm://cache/stage0@0.0.25/keyed';

import { applyAttributesToNode, applyStylingToNode } from './helpers.js';
import { withoutAll } from 'lively.lang/array.js';
import { arr, num, obj } from 'lively.lang';
import { getSvgVertices } from 'lively.morphic/rendering/property-dom-mapping.js';

const svgNs = 'http://www.w3.org/2000/svg';

/**
 * Currently handles rendering of a single Stage0Morph that acts as a "world", similar to the purporse a world would serve in normal lively.
 * This allows us to hack into the default render loop of lively.
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
    this.doc = owningMorph.env.domEnv.document;
    this.rootNode = this.doc.createElement('div');
    this.rootNode.setAttribute('id', 'stage0root');
    this.renderMap.set(this.owner, this.rootNode);
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

    applyAttributesToNode(morph, node);
    applyStylingToNode(morph, node);

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
      } else { // do not skip wrapping
        if (!morph.isPath) node.firstChild.appendChild(submorphNode);
        else node.firstChild.nextSibling.appendChild(submorphNode);
      }
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
        this.isComposite(morph) ? beforeElem : null// before list
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

  isComposite (morph) {
    return morph.isCanvas || morph.isHTMLMorph || morph.isImage || morph.isCheckbox;
  }

  /**
   * Assumes that a DOM node for the given morph already exists and changes the attributes of this node according to the current style definition of the morph.
   * @param { Morph } morph - The morph for which to update the rendering.
   */
  renderStylingChanges (morph) {
    const node = this.getNodeForMorph(morph);

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

    const node = this.doc.createElement('div');
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
    return this.doc.createElement('div');
  }

  nodeForCanvas (morph) {
    const node = this.doc.createElement('div');
    const canvasNode = this.doc.createElement('canvas');

    canvasNode.style.width = `${this.width}px`;
    canvasNode.style.height = `${this.height}px`;
    canvasNode.style.pointerEvents = 'none';
    canvasNode.style.position = 'absolute';

    node.appendChild(canvasNode);

    return node;
  }

  nodeForHTMLMorph (morph) {
    const node = this.doc.createElement('div');
    node.appendChild(morph.domNode);

    return node;
  }

  nodeForImage (morph) {
    const node = this.doc.createElement('div');
    const imageNode = this.doc.createElement('img');

    imageNode.draggable = false;
    imageNode.style['pointer-events'] = 'none';
    imageNode.style.position = 'absolute';
    imageNode.style.left = 0;
    imageNode.style.width = '100%';
    imageNode.style.height = '100%';

    node.appendChild(imageNode);
    return node;
  }

  nodeForCheckbox (morph) {
    const node = this.doc.createElement('div');
    const boxNode = this.doc.createElement('input');
    node.appendChild(boxNode);

    boxNode.setAttribute('type', 'checkbox');

    boxNode.setAttribute('draggable', 'false'),

    boxNode.style['pointer-events'] = 'none';
    boxNode.style.width = '15px',
    boxNode.style.height = '15px',
    boxNode.style.position = 'absolute';

    return node;
  }

  // -=-=-=-=-=-=-=-=-=-
  // SVGs and Polygons
  // -=-=-=-=-=-=-=-=-=-      
  nodeForPath (morph) {
    const node = this.doc.createElement('div');
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
    // TODO: This can and should be optimized, since live manipulation of a Path is super slow at the moment.
    // It should be investigated whether this is only slowness, or whether we also have some kind of threshhold that stops the dragging of control points from being slow.
    // An optimization would probably find a nice data structure for the control points, save that somewhere and then use that to patch the difference with the `keyed` method that `stage0` provides us with.    
    if (morph.showControlPoints) {
      controlPoints = this.doc.createElementNS(svgNs, 'g');
      controlPoints.append(...this._renderPath_ControlPoints(morph));
    }
    const node = this.getNodeForMorph(morph);

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

  /**
   * This inserts/changes a defined mask for a Polygon morph in order to animate its drawn part.
   * This can result in animations that seem like the SVG is drawing itself.
   * The way the SVG rendering is implemented, **it is impossible to change the vertices of a SVG when such an animation is running**.
   * Doing so results in unknown behavior, up to crashing the render process!
   * This is currently the only known limitation, i.e. other properties can be animated/changed simultaneously.
   * @see{ @link https://css-tricks.com/svg-line-animation-works/ } for more information regarding how and why this works.
   * @param { Morph } morph - The Polygon/Path for which the mask should be updated.
   */
  renderPolygonMask (morph) {
    const node = this.getNodeForMorph(morph);
    const drawnProportion = morph.drawnProportion;
    const pathElem = node.firstChild.firstChild;
    const defNode = node.firstChild.lastChild;

    let maskNode, innerRect, firstPath, secondPath;

    for (let n of Array.from(defNode.children)) {
      if (n.tagName === 'mask') {
        maskNode = n;
        break;
      }
    }

    if (drawnProportion === 0) {
      pathElem.removeAttribute('mask');
      return;
    }

    pathElem.setAttribute('mask', 'url(#mask' + morph.id + ')');

    if (maskNode) {
      innerRect = maskNode.firstChild;
      firstPath = innerRect.nextSibling;
      secondPath = firstPath.nextSibling;
    } else {
      maskNode = this.doc.createElementNS(svgNs, 'mask');
      innerRect = this.doc.createElementNS(svgNs, 'rect');
      firstPath = this.doc.createElementNS(svgNs, 'path');
      secondPath = this.doc.createElementNS(svgNs, 'path');
    }

    maskNode.setAttribute('id', 'mask' + morph.id);

    innerRect.setAttribute('fill', 'white');
    innerRect.setAttribute('x', 0);
    innerRect.setAttribute('y', 0);
    innerRect.setAttribute('width', morph.width + 20);
    innerRect.setAttribute('height', morph.height + 20);

    [firstPath, secondPath].map(path => {
      path.setAttribute('d', getSvgVertices(morph.vertices));
      path.setAttribute('stroke-width', morph.borderWidth.valueOf() + 1);
      path.setAttribute('stroke-dasharray', path.getTotalLength());
      secondPath.setAttribute('fill', 'none');
    });

    firstPath.setAttribute('stroke', 'black');
    secondPath.setAttribute('stroke', 'white');

    firstPath.setAttribute('stroke-dashoffset', firstPath.getTotalLength() * (1 - morph.drawnProportion));
    secondPath.setAttribute('stroke-dashoffset', secondPath.getTotalLength() * (-1 + (1 - morph.drawnProportion)));

    maskNode.append(innerRect, firstPath, secondPath);
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

    if (marker) {
      if (!marker.id) marker.id = `${mode}-marker`;
      if (!pathElem.getAttribute(`marker-${mode}`)) pathElem.setAttribute(`marker-${mode}`, `url(#${morph.id}-${marker.id})`);
      const defs = Array.from(defElem.children);
      const newMarkerNode = specTo_h_svg(marker);
      let markerInserted = false;
      defs.forEach(d => {
        // This is still one DOM operation too many, since we could also patch the existing spec node.
        if (d.id && d.id.includes(`${mode}-marker`)) {
          defElem.replaceChild(newMarkerNode, d);
          markerInserted = true;
        }
      });
      if (!markerInserted) defElem.appendChild(newMarkerNode);
    } else {
      pathElem.removeAttribute(`marker-${mode}`);
      const defs = Array.from(defElem.children);
      defs.forEach(d => {
        if (d.id && d.id.includes(`${mode}-marker`)) d.remove();
      });
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
      const canvasNode = node.firstChild;
      const hasNewCanvas = morph._canvas !== canvasNode && canvasNode.tagName === 'CANVAS';
      morph.afterRender(canvasNode, hasNewCanvas);
    }
    ];
  }
}
