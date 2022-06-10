import { applyAttributesToNode, stylepropsToNode, applyStylingToNode } from './helpers.js';
import { withoutAll } from 'lively.lang/array.js';
import { arr, num, obj } from 'lively.lang';
import { getSvgVertices } from 'lively.morphic/rendering/property-dom-mapping.js';
import { setCSSDef } from 'lively.morphic/rendering/dom-helper.js';
import { cssForTexts } from './css-decls.js';
import { Rectangle, pt } from 'lively.graphics';
import { objectReplacementChar } from 'lively.morphic/text/document.js';

import { keyed, noOpUpdate } from './keyed.js';
import { StatusMessageError } from 'lively.halos/components/messages.cp.js';

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
    this.installTextCSS();
    this.installPlaceholder();
    window.stage0renderer = this;
  }

  installPlaceholder () {
    this.placeholder = this.placeholder || this.doc.getElementById('placeholder');

    if (this.placeholder) return;

    const placeholder = this.doc.createElement('div');
    placeholder.id = 'placeholder';
    placeholder.style.height = 'auto';
    placeholder.style.width = 'auto';
    placeholder.style.visibility = 'hidden';
    placeholder.style.position = 'absolute';
    this.placeholder = this.doc.body.appendChild(placeholder);
  }

  installTextCSS () {
    const style = document.createElement('style');
    style.type = 'text/css';
    style.id = 'stylesfortext';
    // TODO: make more robust
    if (Array.from(this.doc.head.children).find(c => c.id === 'stylesfortext')) return null;
    setCSSDef(style, cssForTexts, this.doc);
    (this.doc.head || this.doc).appendChild(style);
    return style;
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
      // For inline morphs, trigger updating of line
      if (morph.renderingState.needsRerender && morph._isInline) {
        this.renderedMorphsWithChanges.push(morph.ownerChain().find(m => m.isSmartText));
      }
      if (morph.renderingState.needsRerender && !morph._isInline) this.renderedMorphsWithChanges.push(morph);
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
      morph.renderingState.animationAdded = false;
    }

    return this.rootNode;
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-
  // BASIC RENDERING FUNCTIONS
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-

  /**
   * Returns a new DOM node for a morph.
   * @param {Morph} morph - The morph for which a DOM node should be generated.
   * @param {Boolean} force - If set to true will force a rerender of the morph, ignoring possibly cached nodes.
   */
  renderMorph (morph, force) {
    let node;
    node = this.renderMap.get(morph);
    if (force || morph._isInline || !node) {
      node = morph.getNodeForRenderer(this); // returns a DOM node as specified by the morph
      // inline morphs will be rendered again inside of the font metric
      // ignore the morph map here in order to not mess the actually rendered node up
      if (!morph._isInline) this.renderMap.set(morph, node);
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

    const wrapped = node.querySelector(`#submorphs-${morph.id}`);
    if (!wrapped) {
      if (morph.isSmartText) {
        const scrollWrapper = node.querySelector('.scrollWrapper');
        scrollWrapper.appendChild(wrapperNode);
      } else if (!morph.isPath) node.appendChild(wrapperNode); // normal morphs
      else node.insertBefore(wrapperNode, node.lastChild); // path
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

    let submorphsToRender = morph.submorphs;
    // these embedded morphs are not really submorphs, but only for a really short time
    submorphsToRender = submorphsToRender.filter(sm => !sm._isInline);

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // Optimization for when a morph has no longer any submorphs.
    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    if (morph.submorphs.filter(sm => !sm._isInline).length === 0) {
      if (morph.isPath) {
        // two SVG nodes are necessary
        // remove everything else, in the case that we have unwrapped submorph nodes
        node.childNodes.forEach(n => {
          if (n.tagName !== 'svg') n.remove();
        });
      } else if (morph.isSmartText) {
        const scrollWrapper = node.querySelector('.scrollWrapper');
        // we need to keep markers, selections, syntax errors etc. around
        scrollWrapper.childNodes.forEach(n => {
          if (!n.className) n.remove();
          if (n.classList.contains('morph')) n.remove();
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
    } else if (morph.isSmartText) {
      if (skipWrapping) {
        // TODO: talk about this from a conceptual point of view with robin
        // TODO: this is not enough to enforce that the problematic aspect of this (i.e. adding a layout ONTO a text morph) does not occur 
        $world.setStatusMessage('Not supported for SmartText', StatusMessageError);
      } else {
        this.installWrapperNodeFor(morph, node);
        keyed('id',
          node.querySelector(`#submorphs-${morph.id}`),
          alreadyRenderedSubmorphs,
          submorphsToRender,
          item => this.renderMorph(item)
        );
      }
    } else { // morph is not path
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

    // fixme: hackz
    if (morph.isSmartText && !morph.readOnly) node.style.overflow = 'hidden';
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

  lineNodeFunctionFor (morph) {
    return (line) => this.nodeForLine(line, morph);
  }

  textLayerNodeFunctionFor (morph) {
    return () => this.textLayerNodeFor(morph);
  }

  textLayerNodeFor (morph) {
    const {
      lineWrapping,
      fixedWidth,
      fixedHeight,
      selectionMode
    } = morph;

    let textLayerClasses = 'newtext-text-layer actual';

    // TODO: we want to support right and left align also for morpht that have a non-fixed widht and or height
    textLayerClasses = textLayerClasses + ' ' + (fixedWidth ? this.lineWrappingToClass(lineWrapping) : this.lineWrappingToClass(false));

    // TODO: we want to support right and left align also for morpht that have a non-fixed widht and or height
    if (!fixedWidth) textLayerClasses = textLayerClasses + ' auto-width';
    if (!fixedHeight) textLayerClasses = textLayerClasses + ' auto-height';
    if (selectionMode === 'native') textLayerClasses = textLayerClasses + ' selectable';

    const node = this.doc.createElement('div');
    const style = morph.styleObject();
    stylepropsToNode(style, node);
    morph.renderingState.nodeStyleProps = style;
    node.className = textLayerClasses;

    return node;
  }

  updateDebugLayer (node, morph) {
    const textNode = node.querySelector('.actual');
    textNode.querySelectorAll('.debug-line, .debug-char, .debug-info').forEach(n => n.remove());
    if (morph.debug) textNode.append(...this.renderDebugLayer(morph));
  }

  renderTextAndAttributes (node, morph) {
    const textNode = node.querySelector('.actual');
    if (morph.readOnly) textNode.replaceChildren(...this.renderAllLines(morph));
    else {
      textNode.querySelectorAll('.debug-line, .debug-char, .debug-info').forEach(n => n.remove());
      const linesToRender = this.collectVisibleLinesForRendering(morph, node);
      morph.viewState.visibleLines = linesToRender;
      keyed('row',
        textNode,
        morph.renderingState.renderedLines,
        linesToRender,
        item => this.nodeForLine(item, morph),
        noOpUpdate,
        textNode.firstChild,
        null
      );
      morph.renderingState.renderedLines = morph.viewState.visibleLines;
      let i = 0; // the first child is always the filler, we can skip it
      for (const line of morph.renderingState.renderedLines) {
        i++;
        if (!line.needsRerender) continue;
        const oldLineNode = textNode.children[i];
        const newLineNode = this.nodeForLine(line, morph);
        textNode.replaceChild(newLineNode, oldLineNode);
      }
    }
    if (morph.document) {
      this.updateExtentsOfLines(textNode, morph);
    }

    let inlineMorphUpdated = false;
    morph.textAndAttributes.forEach(ta => {
      if (ta && ta.isMorph && ta.renderingState.needsRerender) {
        ta.renderingState.needsRerender = false;
        inlineMorphUpdated = true;
      }
    });
    if (inlineMorphUpdated) morph.invalidateTextLayout(true, false);
    morph.renderingState.renderedTextAndAttributes = morph.textAndAttributes;
    morph.renderingState.extent = morph.extent;
  }

  renderMorphInLine (morph, attr) {
    // TODO: investigate if this is necessary 
    attr = attr || {};
    const rendered = this.renderMorph(morph);
    rendered.style.position = 'sticky';
    rendered.style.transform = '';
    rendered.style.textAlign = 'initial';
    rendered.style.removeProperty('top');
    rendered.style.removeProperty('left');

    // fixme:  this addition screws up the bounds computation of the embedded submorph
    if (attr.paddingTop) rendered.style.marginTop = attr.paddingTop;
    if (attr.paddingLeft) rendered.style.marginLeft = attr.paddingLeft;
    if (attr.paddingRight) rendered.style.marginRight = attr.paddingRight;
    if (attr.paddingBottom) rendered.style.marginBottom = attr.paddingBottom;
    morph.needsRerender = false;
    return rendered;
  }

  /**
   * Renders chunks (1 pair of text and textAttributes) into lines (divs),
   * Thus returns an array of divs that can each contain multiple spans 
   */
  nodeForLine (lineObject, morph) {
    const line = lineObject.isLine ? lineObject.textAndAttributes : lineObject;
    const size = line.length;

    const renderedChunks = [];

    let content, attributes, fontSize, nativeCursor, textStyleClasses, link, tagname, chunkNodeStyle, nodeAttrs, paddingRight, paddingLeft, paddingTop, paddingBottom, lineHeight, textAlign, wordSpacing, letterSpacing, quote, textStroke, fontFamily, fontWeight, textDecoration, fontStyle, fontColor, backgroundColor, verticalAlign, chunkNodeAttributes;
    let minFontSize = morph.fontSize;

    if (size > 0) {
      // create chunks per line  
      for (let i = 0; i < line.length; i = i + 2) {
        content = line[i] || '\u00a0';
        attributes = line[i + 1];

        if (typeof content !== 'string') {
          renderedChunks.push(
            content.isMorph
            // TODO: how does this work?
              ? this.renderMorphInLine(content, attributes)
              : objectReplacementChar);
          continue;
        }

        if (!attributes) { renderedChunks.push(content); continue; }

        chunkNodeStyle = {};
        chunkNodeAttributes = {};

        fontSize = attributes.fontSize && (obj.isString(attributes.fontSize) ? attributes.fontSize : attributes.fontSize + 'px');
        fontFamily = attributes.fontFamily;
        fontWeight = attributes.fontWeight;
        fontStyle = attributes.fontStyle;
        textDecoration = attributes.textDecoration;
        fontColor = attributes.fontColor;
        backgroundColor = attributes.backgroundColor;
        nativeCursor = attributes.nativeCursor;
        textStyleClasses = attributes.textStyleClasses;
        link = attributes.link;
        lineHeight = attributes.lineHeight || lineHeight;
        textAlign = attributes.textAlign || textAlign;
        wordSpacing = attributes.wordSpacing || wordSpacing;
        letterSpacing = attributes.letterSpacing || letterSpacing;
        paddingRight = attributes.paddingRight;
        paddingLeft = attributes.paddingLeft;
        paddingTop = attributes.paddingTop;
        paddingBottom = attributes.paddingBottom;
        verticalAlign = attributes.verticalAlign;
        textStroke = attributes.textStroke;
        quote = attributes.quote || quote;

        tagname = 'span';

        if (fontSize && attributes.fontSize < minFontSize) minFontSize = attributes.fontSize;

        if (link) {
          tagname = 'a';
          chunkNodeAttributes.href = link;
          if (link && link.startsWith('http')) chunkNodeAttributes.target = '_blank';
        }

        if (link || nativeCursor) chunkNodeStyle.pointerEvents = 'auto';

        if (fontSize) chunkNodeStyle.fontSize = fontSize;
        if (fontFamily) chunkNodeStyle.fontFamily = fontFamily;
        if (fontWeight) chunkNodeStyle.fontWeight = fontWeight;
        if (fontStyle) chunkNodeStyle.fontStyle = fontStyle;
        if (textDecoration) chunkNodeStyle.textDecoration = textDecoration;
        if (fontColor) chunkNodeStyle.color = String(fontColor);
        if (backgroundColor) chunkNodeStyle.backgroundColor = String(backgroundColor);
        if (nativeCursor) chunkNodeStyle.cursor = nativeCursor;
        if (paddingRight) chunkNodeStyle.paddingRight = paddingRight;
        if (paddingLeft) chunkNodeStyle.paddingLeft = paddingLeft;
        if (paddingTop) chunkNodeStyle.paddingTop = paddingTop;
        if (paddingBottom) chunkNodeStyle.paddingBottom = paddingBottom;
        if (verticalAlign) chunkNodeStyle.verticalAlign = verticalAlign;
        if (textStroke) chunkNodeStyle['-webkit-text-stroke'] = textStroke;
        if (attributes.doit) { chunkNodeStyle.pointerEvents = 'auto'; chunkNodeStyle.cursor = 'pointer'; }

        textStyleClasses = attributes.textStyleClasses;
        if (textStyleClasses && textStyleClasses.length) { nodeAttrs.className = textStyleClasses.join(' '); }

        const chunkNode = this.doc.createElement(tagname);
        chunkNode.textContent = content;
        if (chunkNodeAttributes.href) chunkNode.href = chunkNodeAttributes.href;
        if (chunkNodeAttributes.target) chunkNode.target = chunkNodeAttributes.target;
        stylepropsToNode(chunkNodeStyle, chunkNode);
        renderedChunks.push(chunkNode);
      }
    } else renderedChunks.push(this.doc.createElement('br'));

    const lineStyle = {};

    if (morph.fontSize > minFontSize) lineStyle.fontSize = minFontSize + 'px';
    if (lineHeight) lineStyle.lineHeight = lineHeight;
    if (textAlign) lineStyle.textAlign = textAlign;
    if (letterSpacing) lineStyle.letterSpacing = letterSpacing + 'px';
    if (wordSpacing) lineStyle.wordSpacing = wordSpacing + 'px';
    let node = this.doc.createElement('div');
    node.className = 'line';
    if (lineObject.isLine) {
      node.dataset.row = lineObject.row;
    }
    stylepropsToNode(lineStyle, node);
    node.append(...renderedChunks);

    // node.append(this.doc.createElement('br'));

    if (quote) {
      if (typeof quote !== 'number') quote = 1;
      for (let i = quote; i--;) {
        const quoteNode = this.doc.createElement('blockquote');
        quoteNode.append(node);
        node = quoteNode;
      }
    }

    return node;
  }

  renderAllLines (morph) {
    const renderedLines = [];
    if (!morph.document) {
    // when we have no doc, text and attributes are split into lines
      for (let i = 0; i < morph.textAndAttributes.length; i++) {
        const newLine = this.nodeForLine(morph.textAndAttributes[i], morph);
        renderedLines.push(newLine);
      }
    }
    return renderedLines;
  }

  collectVisibleLinesForRendering (morph, node) {
    const {
      height,
      scroll,
      document: doc,
      clipMode,
      padding: { y: padTop }
    } = morph;
    const scrollTop = scroll.y;
    const scrollHeight = height;
    const lastLineNo = doc.rowCount - 1;
    const textHeight = doc.height;
    const clipsContent = clipMode !== 'visible';

    const {
      line: startLine,
      offset: startOffset,
      y: heightBefore,
      row: startRow
    } = doc.findLineByVerticalOffset(clipsContent ? Math.max(0, clipsContent ? scrollTop - padTop : 0) : 0) ||
     { row: 0, y: 0, offset: 0, line: doc.getLine(0) };

    const {
      line: endLine,
      offset: endLineOffset,
      row: endRow
    } = doc.findLineByVerticalOffset(clipsContent ? Math.min(textHeight, (scrollTop - padTop) + scrollHeight) : textHeight) ||
     { row: lastLineNo, offset: 0, y: 0, line: doc.getLine(lastLineNo) };

    const firstVisibleRow = clipsContent ? startRow : 0;
    const firstFullyVisibleRow = startOffset === 0 ? startRow : startRow + 1;
    const lastVisibleRow = clipsContent ? endRow + 1 : lastLineNo;
    const lastFullyVisibleRow = !endLine || endLineOffset === endLine.height ? endRow : endRow - 1;

    morph.maxVisibleLines = Math.max(morph.maxVisibleLines || 1, lastVisibleRow - firstVisibleRow + 1);

    // NEW NEW NEW 
    morph.renderingState.maxVisibleLines = morph.maxVisibleLines;
    morph.renderingState.startLine = firstVisibleRow;

    const visibleLines = [];

    let line = startLine; let i = 0;
    while (i < morph.maxVisibleLines) {
      visibleLines.push(line);
      i++;
      line = line.nextLine();
      if (!line) break;
    }

    this.updateFillerDIV(node, heightBefore);

    Object.assign(morph.viewState, {
      scrollTop,
      scrollHeight,
      scrollBottom: scrollTop + scrollHeight,
      heightBefore,
      textHeight,
      firstVisibleRow,
      lastVisibleRow,
      firstFullyVisibleRow,
      lastFullyVisibleRow,
      visibleLines
    });

    return visibleLines;
  }

  updateFillerDIV (node, heightBefore) {
    const textLayer = node.querySelector('.actual');
    const filler = textLayer.querySelector('.newtext-before-filler');
    if (filler) {
      filler.style.height = heightBefore + 'px';
    } else {
      const spacer = this.doc.createElement('div');
      spacer.classList.add('newtext-before-filler');
      spacer.style.height = heightBefore + 'px';
      textLayer.insertBefore(spacer, textLayer.firstChild);
    }
  }

  measureBoundsFor (morph) {
    const node = this.getNodeForMorph(morph);

    const textNode = node.querySelector('.actual');
    const prevParent = textNode.parentNode;
    this.placeholder.appendChild(textNode);
    const domMeasure = textNode.getBoundingClientRect();
    const bounds = new Rectangle(domMeasure.x, domMeasure.y, domMeasure.width, domMeasure.height);
    prevParent.appendChild(textNode);

    return bounds;
  }

  /**
   * Renders the slices as specified in renderSelectionLayer to SVG, utilizing a rounded corner
   * selection style that is stolen from MS Studio Code.
   * @param {Rectangle[]} slice - The slices to render.
   * @param {Color} selectionColor - The color of the rendered selection.
   * @param {Text} morph - The TextMorph to be rendered.
   * @return Collection of rendered slices as svg.
   */
  selectionLayerRounded (slices, selectionColor, morph) {
    // split up the rectangle corners into a left and right batches
    let currentBatch;
    const batches = [
      currentBatch = {
        left: [], right: []
      }
    ];

    let lastSlice;
    for (const slice of slices) {
      // if rectangles do not overlap, create a new split batch
      if (lastSlice && (lastSlice.left() > slice.right() || lastSlice.right() < slice.left())) {
        batches.push(currentBatch = { left: [], right: [] });
      }
      currentBatch.left.push(slice.topLeft(), slice.bottomLeft());
      currentBatch.right.push(slice.topRight(), slice.bottomRight());
      lastSlice = slice;
    }
    // turn each of the batches into its own svg path
    const svgs = [];
    for (const batch of batches) {
      if (!batch.left.length) continue;
      const pos = batch.left.reduce((p1, p2) => p1.minPt(p2)); // topLeft of the path
      const vs = batch.left.concat(batch.right.reverse());

      // move a sliding window over each vertex
      let updatedVs = [];
      for (let vi = 0; vi < vs.length; vi++) {
        const prevV = vs[vi - 1] || arr.last(vs);
        const currentV = vs[vi];
        const nextV = vs[vi + 1] || arr.first(vs);

        // replace the vertex by two adjacent ones offset by distance
        const offset = 6;
        const offsetV1 = prevV.subPt(currentV).normalized().scaleBy(offset);
        const p1 = currentV.addPt(offsetV1);
        p1._next = offsetV1.scaleBy(-1);
        const offsetV2 = nextV.subPt(currentV).normalized().scaleBy(offset);
        const p2 = currentV.addPt(offsetV2);
        p2._prev = offsetV2.scaleBy(-1);

        updatedVs.push(p1, p2);
      }

      updatedVs = updatedVs.map(p => ({
        position: p.subPt(pos), isSmooth: true, controlPoints: { next: p._next || pt(0), previous: p._prev || pt(0) }
      })
      );

      const d = getSvgVertices(updatedVs);
      const { y: minY, x: minX } = updatedVs.map(p => p.position).reduce((p1, p2) => p1.minPt(p2));
      const { y: maxY, x: maxX } = updatedVs.map(p => p.position).reduce((p1, p2) => p1.maxPt(p2));
      const height = maxY - minY;
      const width = maxX - minX;
      const pathNode = this.doc.createElementNS(svgNs, 'path');
      pathNode.setAttribute('fill', selectionColor.toString());
      pathNode.setAttribute('d', d);

      const svgNode = this.doc.createElementNS(svgNs, 'svg');
      svgNode.classList.add('selection');
      svgNode.setAttribute('style', `position: absolute; left: ${pos.x}px;top: ${pos.y}px; width: ${width}px; height: ${height}px`);

      svgNode.appendChild(pathNode);
      svgs.push(svgNode);
    }

    return svgs;
  }

  /**
   * Since we can not control the selection of HTML DOM-Nodes we wing it ourselves.
   * Here we render a custom DOM representation of the current selection within a TextMorph.
   * @param {Text} morph - The TextMorph to be rendered.
   * @param {Selection} selection - The selection to be rendered.
   * @param {Boolean} diminished - Wether or not to render the cursor diminished.
   * @param {Integer} cursroWidth - The width of the cursor.
   */
  renderSelectionPart (morph, selection, diminished = false, cursorWidth = 2) {
    if (!selection) return [];
    const { textLayout } = morph;

    const { start, end, cursorVisible, selectionColor } = selection;
    const { document, cursorColor } = morph;
    const isReverse = selection.isReverse();

    const startBounds = textLayout.boundsFor(morph, start);
    const endBounds = textLayout.boundsFor(morph, end);

    const leadLineHeight = startBounds.height;
    const endLineHeight = endBounds.height;

    const endPos = pt(endBounds.x, endBounds.y);

    const cursorPos = isReverse ? pt(startBounds.x, startBounds.y) : endPos;
    const cursorHeight = isReverse ? leadLineHeight : endLineHeight;
    const renderedCursor = this.cursor(cursorPos, cursorHeight, cursorVisible, diminished, cursorWidth, cursorColor);

    if (obj.equals(selection.start, selection.end)) return [renderedCursor];

    // render selection layer
    const slices = [];
    let row = selection.start.row;
    let yOffset = document.computeVerticalOffsetOf(row) + morph.padding.top();
    const paddingLeft = morph.padding.left();
    const bufferOffset = 50; // todo: what does this do?

    let charBounds,
      selectionTopLeft,
      selectionBottomRight,
      isFirstLine,
      cb, line, isWrapped;

    // extract the slices the selection is comprised of
    while (row <= selection.end.row) {
      line = document.getLine(row);
      if (row < morph.viewState.firstVisibleRow - bufferOffset) { // selected lines before the visible ones
        yOffset += line.height;
        row++;
        continue;
      }

      if (row > morph.viewState.lastVisibleRow + bufferOffset) break; // selected lines after the visible ones

      // selected lines (rows) that are visible
      charBounds = textLayout.charBoundsOfRow(morph, row).map(Rectangle.fromLiteral);
      isFirstLine = row === selection.start.row;
      isWrapped = charBounds[0].bottom() < arr.last(charBounds).top();

      if (isWrapped) {
        // since wrapped lines spread multiple "rendered" rows, we need to do add in a couple of
        // additional selection parts here
        const rangesToRender = textLayout.rangesOfWrappedLine(morph, row).map(r => r.intersect(selection));
        let isFirstSubLine = isFirstLine;
        let subLineMinY = 0;
        let subCharBounds;
        let subLineMaxBottom;
        for (const r of rangesToRender) {
          if (r.isEmpty()) continue;

          subCharBounds = charBounds.slice(r.start.column, r.end.column);

          subLineMinY = isFirstSubLine ? arr.min(subCharBounds.map(cb => cb.top())) : subLineMinY;
          subLineMaxBottom = arr.max(subCharBounds.map(cb => cb.bottom()));

          cb = subCharBounds[0];
          selectionTopLeft = pt(paddingLeft + cb.left(), yOffset + subLineMinY);

          cb = arr.last(subCharBounds);
          selectionBottomRight = pt(paddingLeft + cb.right(), yOffset + subLineMaxBottom);

          subLineMinY = subLineMaxBottom;
          isFirstSubLine = false;

          slices.push(Rectangle.fromAny(selectionTopLeft, selectionBottomRight));
        }
      } else {
        const isLastLine = row === selection.end.row;
        const startIdx = isFirstLine ? selection.start.column : 0;
        const endIdx = isLastLine ? selection.end.column : charBounds.length - 1;
        const lineMinY = isFirstLine && arr.min(charBounds.slice(startIdx, endIdx + 1).map(cb => cb.top())) || 0;
        const emptyBuffer = startIdx >= endIdx ? 5 : 0;

        cb = charBounds[startIdx];
        selectionTopLeft = pt(paddingLeft + (cb ? cb.left() : arr.last(charBounds).right()), yOffset + lineMinY);

        cb = charBounds[endIdx];
        if (selection.includingLineEnd) { selectionBottomRight = pt(morph.width - morph.padding.right(), yOffset + lineMinY + line.height); } else {
          const excludeCharWidth = isLastLine && selection.end.column <= charBounds.length - 1;
          selectionBottomRight = pt(paddingLeft + (cb ? (excludeCharWidth ? cb.left() : cb.right()) : arr.last(charBounds).right()) + emptyBuffer, yOffset + lineMinY + line.height);
        }

        slices.push(Rectangle.fromAny(selectionTopLeft, selectionBottomRight));
      }

      yOffset += line.height;
      row++;
    }

    const renderedSelection = this.selectionLayerRounded(slices, selectionColor, morph);

    renderedSelection.push(renderedCursor);
    return renderedSelection;
  }

  /**
   * When a TextMorph is set up to support selections we render our custom
   * selection layer instead of the HTML one which we can not control.
   * @param {Text} morph - The TextMorph to be rendered.
   */
  renderSelectionLayer (morph) {
    if (!morph.document || !morph.selection) return [];
    const cursorWidth = morph.cursorWidth || 1;
    const sel = morph.selection;
    if (morph.inMultiSelectMode()) {
      const selectionLayer = [];
      const sels = sel.selections; let i = 0;
      for (; i < sels.length - 1; i++) { selectionLayer.push(...this.renderSelectionPart(morph, sels[i], true/* diminished */, 2)); }
      selectionLayer.push(...this.renderSelectionPart(morph, sels[i], false/* diminished */, 4));
      return selectionLayer;
    } else {
      return this.renderSelectionPart(morph, sel, false, cursorWidth);
    }
  }

  /**
   * Renders a TextMorph's text cursor.
   * @param {Point} pos - The slices to render.
   * @param {Number} height - The slices to render.
   * @param {Boolean} visible - Wether or not to display the cursor.
   * @param {Boolean} diminished - Wether or not to render the cursor diminished.
   * @param {Number} width - The width of the cursor in pixels.
   * @param {Color} color - The color of the cursor.
   */
  cursor (pos, height, visible, diminished, width, color) {
    const node = this.doc.createElement('div');
    node.classList.add('newtext-cursor');
    if (diminished) node.classList.add('diminished');
    node.style.left = pos.x - Math.ceil(width / 2) + 'px';
    node.style.top = pos.y + 'px';
    node.style.width = width + 'px';
    node.style.height = height + 'px';
    node.style.display = visible ? '' : 'none';
    node.style.background = color || 'black';
    return node;
  }

  /**
   * When the TextMorph is set up to be interactive we decouple scrolling of the text
   * via a separate scroll layer that captures the scroll events from the user.
   * @param {Text} morph - The TextMorph to be rendered.
   */
  renderScrollLayer (morph) {
    const horizontalScrollBarVisible = morph.document.width > morph.width;
    const scrollBarOffset = horizontalScrollBarVisible ? morph.scrollbarOffset : pt(0, 0);
    const verticalPaddingOffset = morph.padding.top() + morph.padding.bottom();
    const node = this.doc.createElement('div');
    node.classList.add('scrollLayer');
    node.style.position = 'absolute';
    node.style.top = '0px';
    node.style.width = '100%';
    node.style.height = '100%';
    node.style['overflow-anchor'] = 'none';

    const subnode = this.doc.createElement('div');
    subnode.style.width = Math.max(morph.document.width, morph.width) + 'px';
    subnode.style.height = Math.max(morph.document.height, morph.height) - scrollBarOffset.y + verticalPaddingOffset + 'px';

    node.appendChild(subnode);
    return node;
  }

  scrollWrapperFor (morph) {
    const scrollWrapper = this.doc.createElement('div');
    scrollWrapper.classList.add('scrollWrapper');
    scrollWrapper.style['pointer-events'] = 'none',
    scrollWrapper.style.position = 'absolute',
    scrollWrapper.style.width = '100%',
    scrollWrapper.style.height = '100%',
    scrollWrapper.style.transform = `translate(-${morph.scroll.x}px, -${morph.scroll.y}px)`;
    return scrollWrapper;
  }

  adjustScrollLayerChildSize (node, morph) {
    const scrollLayer = node.querySelectorAll('.scrollLayer')[0];
    if (!scrollLayer) return;
    const horizontalScrollBarVisible = morph.document.width > morph.width;
    const scrollBarOffset = horizontalScrollBarVisible ? morph.scrollbarOffset : pt(0, 0);
    const verticalPaddingOffset = morph.padding.top() + morph.padding.bottom();
    scrollLayer.firstChild.style.width = Math.max(morph.document.width, morph.width) + 'px';
    scrollLayer.firstChild.style.height = Math.max(morph.document.height, morph.height) - scrollBarOffset.y + verticalPaddingOffset + 'px';
  }

  scrollScrollLayerFor (node, morph) {
    const scrollWrapper = node.querySelectorAll('.scrollWrapper')[0];
    if (!scrollWrapper) return;
    scrollWrapper.style.transform = `translate(-${morph.scroll.x}px, -${morph.scroll.y}px)`;
    morph.renderingState.scroll = morph.scroll;
    this.renderTextAndAttributes(node, morph);
  }

  patchTextLayerStyleObject (node, morph, newStyle) {
    const textLayer = node.querySelector('.actual');
    const fontMeasureTextLayer = node.querySelector('.font-measure');
    stylepropsToNode(newStyle, textLayer);
    stylepropsToNode(newStyle, fontMeasureTextLayer);
    morph.renderingState.nodeStyleProps = newStyle;
    morph.invalidateTextLayout(true, false);
  }

  lineWrappingToClass (lineWrapping) {
    switch (lineWrapping) {
      case true:
      case 'by-words': return 'wrap-by-words';
      case 'only-by-words': return 'only-wrap-by-words';
      case 'by-chars': return 'wrap-by-chars';
    }
    return 'no-wrapping';
  }

  patchLineWrapping (node, morph) {
    const oldWrappingClass = this.lineWrappingToClass(morph.renderingState.lineWrapping);
    const newWrappingClass = morph.fixedWidth ? this.lineWrappingToClass(morph.lineWrapping) : this.lineWrappingToClass(false);

    const textLayer = node.querySelector('.actual');
    const fontMeasureTextLayer = node.querySelector('.font-measure');

    textLayer.classList.remove(oldWrappingClass);
    fontMeasureTextLayer.classList.remove(oldWrappingClass);

    textLayer.classList.add(newWrappingClass);
    fontMeasureTextLayer.classList.add(newWrappingClass);

    morph.renderingState.lineWrapping = morph.lineWrapping;
    morph.renderingState.fixedWidth = morph.fixedWidth;
  }

  clearTextNodeSubnodesFor (morph) {
    const textNode = this.getNodeForMorph(morph);
    textNode.querySelector('.actual').replaceChildren();
  }

  nodeForText (morph) {
    let scrollLayerNode;
    const node = this.doc.createElement('div');

    const textLayer = this.textLayerNodeFor(morph);

    /*
      The scrollLayer is mecessary for Text that can be interactively edited.
      For performance reasons, we do not render all lines in this case, but only the ones that are visible.
      This means, that when scrolling in such a morph, the lines (divs) are exchanged/updated.
      For some reason, changing the subnodes of a DOM node that is simultaneously scrolled will lead to unsmooth scrolling.
      With this trick, the scrollLayer is the node that actually gets scrolled, while we can exchange all line nodes as we like.
      Since for non-interactive text all lines are rendered once, this trick in not needed.
    */
    if (!morph.readOnly) {
      if (morph.document) { // fixme hack
        scrollLayerNode = this.renderScrollLayer(morph);
        node.appendChild(scrollLayerNode);
      }
      const textLayerForFontMeasure = this.textLayerNodeFor(morph);
      // hackz
      textLayerForFontMeasure.classList.remove('actual');
      textLayerForFontMeasure.classList.add('font-measure');
      node.appendChild(textLayerForFontMeasure);
    }

    if (!morph.readOnly && morph.document) { // fixme hack
      const scrollWrapper = this.scrollWrapperFor(morph);
      node.appendChild(scrollWrapper);
      scrollWrapper.appendChild(textLayer);
    } else node.appendChild(textLayer);
    this.renderTextAndAttributes(node, morph);
    if (morph.document) {
      const textLayerNode = node.querySelector('.actual');
      this.updateExtentsOfLines(textLayerNode, morph);
    }
    return node;
    // TODO: submorphs and stuff (see renderMorphFast in text/renderer.js)
  }

  /**
   * Renders the debug layer of a TextMorph, which visualizes the bounds computed
   * by the text layout.
   * @param {Text} morph - The text morph to visualize the text layout for.
   * @return {VNode} A virtual dom node representing the debug layer.
   */
  renderDebugLayer (morph) {
    const vs = morph.viewState;
    const debugHighlights = [];
    let { heightBefore: rowY, firstVisibleRow, lastVisibleRow, visibleLines } = vs;
    const { padding, scroll: { x: visibleLeft, y: visibleTop } } = morph;
    const leftP = padding.left();
    const rightP = padding.right();
    const topP = 0;
    const debugInfo = this.doc.createElement('div');
    debugInfo.classList.add('debug-info');
    debugInfo.style.left = (visibleLeft + leftP) + 'px';
    debugInfo.style.top = visibleTop + 'px';
    debugInfo.style.width = (morph.width - rightP) + 'px';

    const visibleRowsSpan = this.doc.createElement('span');
    visibleRowsSpan.innerHTML = `visible rows: ${firstVisibleRow} - ${lastVisibleRow}`;
    debugInfo.appendChild(visibleRowsSpan);
    debugHighlights.push(debugInfo);

    for (let i = 0, row = firstVisibleRow; row < lastVisibleRow; i++, row++) {
      const line = visibleLines[i];
      const charBounds = morph.textLayout.lineCharBoundsCache.get(line);
      const { height } = line;

      const debugLine = this.doc.createElement('div');
      debugLine.classList.add('debug-line');
      debugLine.style.left = (visibleLeft + leftP) + 'px';
      debugLine.style.top = (topP + rowY) + 'px';
      debugLine.style.width = (morph.width - rightP) + 'px';
      debugLine.style.height = height + 'px';

      const lineSpan = this.doc.createElement('span');
      lineSpan.innerHTML = String(row);

      debugLine.appendChild(lineSpan);
      debugHighlights.push(debugLine);

      if (!charBounds) {
        rowY = rowY + height;
        continue;
      }

      for (let col = 0; col < charBounds.length; col++) {
        const { x, y, width, height } = charBounds[col];
        const debugChar = this.doc.createElement('div');
        debugChar.classList.add('debug-char');

        debugChar.style.left = (leftP + x) + 'px';
        debugChar.style.top = (topP + rowY + y) + 'px';
        debugChar.style.width = width + 'px';
        debugChar.style.height = height + 'px';

        debugHighlights.push(debugChar);
      }

      rowY = rowY + height;
    }

    return debugHighlights;
  }

  handleScrollLayer (node, morph) {
    if (morph.renderingState.needsScrollLayerAdded) {
      if (node.querySelector('.scrollWrapper')) {
        delete morph.renderingState.needsScrollLayerAdded;
        return;
      }
      const scrollLayer = this.renderScrollLayer(morph);
      const scrollWrapper = this.scrollWrapperFor(morph);
      node.childNodes.forEach(c => scrollWrapper.appendChild(c));
      node.appendChild(scrollLayer);
      node.appendChild(scrollWrapper);
      delete morph.renderingState.needsScrollLayerAdded;
    } else if (morph.renderingState.needsScrollLayerRemoved) {
      node.querySelector('.scrollLayer').remove();
      const wrapper = node.querySelector('.scrollWrapper');
      Array.from(wrapper.children).forEach(c => node.append(c));
      wrapper.remove();
      delete morph.renderingState.needsScrollLayerRemoved;
    }
  }

  patchSelectionLayer (node, morph) {
    if (!node) return; // fixme
    node.querySelectorAll('div.newtext-cursor').forEach(c => c.remove());
    node.querySelectorAll('svg.selection').forEach(s => s.remove());
    const nodeToAppendTo = morph.readOnly ? node : node.querySelectorAll('.scrollWrapper')[0];
    nodeToAppendTo.append(...this.renderSelectionLayer(morph));
    morph.renderingState.selection = morph.selection; // not yet working
  }

  /**
   * Renders a slice of a single/multiline marker.
   * @param {Text} morph - The text morph owning the markers.
   * @param {TextPosition} start - The position in the text where the marker starts.
   * @param {TextPosition} end - The position in the text where the marker ends.
   * @param {CSSStyle} style - Custom styles for the marker to override the defaults.
   * @param {Boolean} entireLine - Flag to indicate wether or not the marker part covers the entire line.
   * @return {VNode} A virtual dom node representing the respective part of the marker.
   */
  renderMarkerPart (morph, start, end, style, entireLine = false) {
    let startX = 0; let endX = 0; let y = 0; let height = 0;
    const { document: doc, textLayout } = morph;
    const line = doc.getLine(start.row);
    if (entireLine) {
      const { padding } = morph;
      startX = padding.left();
      y = padding.top() + doc.computeVerticalOffsetOf(start.row);
      endX = startX + line.width;
      height = line.height;
    } else {
      ({ x: startX, y } = textLayout.boundsFor(morph, start));
      ({ x: endX, height } = textLayout.boundsFor(morph, end));
    }
    height = Math.ceil(height);
    const node = this.doc.createElement('div');
    node.classList.add('newtext-marker-layer');
    node.style.left = startX + 'px';
    node.style.top = y + 'px';
    node.style.height = height + 'px';
    node.style.width = endX - startX + 'px';
    for (const prop in style) {
      node.style[prop] = style[prop];
    }

    return node;
  }

  /**
   * @param {type} node - description
   * @param {type} morph - description
   * @param {Boolean} fromMorph - If this is true, we set the correct clipMode according to the Morph. Otherwise, we sett hidden.
   */
  patchClipModeForText (node, morph, scrollActive) {
    const scrollLayer = node.querySelectorAll('.scrollLayer')[0];
    if (!scrollLayer) return;

    if (scrollActive) scrollLayer.style.overflow = morph.clipMode;
    else scrollLayer.style.overflow = 'hidden';

    morph.renderingState.scrollActive = morph.scrollActive;
  }

  /**
   * Renders the layer comprising all the markers of the TextMorph.
   * @param {Text} morph - The TextMorph owning the markers.
   */
  renderMarkerLayer (morph) {
    const {
      markers,
      viewState: { firstVisibleRow, lastVisibleRow }
    } = morph;
    const parts = [];

    if (!markers) return parts;

    for (const m of markers) {
      const { style, range: { start, end } } = m;

      if (end.row < firstVisibleRow || start.row > lastVisibleRow) continue;

      // single line
      if (start.row === end.row) {
        parts.push(this.renderMarkerPart(morph, start, end, style));
        continue;
      }

      // multiple lines
      // first line
      parts.push(this.renderMarkerPart(morph, start, morph.lineRange(start.row).end, style));
      // lines in the middle
      for (let row = start.row + 1; row <= end.row - 1; row++) {
        const { start: lineStart, end: lineEnd } = morph.lineRange(row);
        parts.push(this.renderMarkerPart(morph, lineStart, lineEnd, style, true));
      }
      // last line
      parts.push(this.renderMarkerPart(morph, { row: end.row, column: 0 }, end, style));
    }

    return parts; // returns an array of nodes
  }

  patchMarkerLayer (node, morph) {
    if (!node) return; // fixme
    node.querySelectorAll('div.newtext-marker-layer').forEach(s => s.remove());
    const nodeToAppendTo = morph.readOnly ? node : node.querySelectorAll('.scrollWrapper')[0];
    nodeToAppendTo.append(...this.renderMarkerLayer(morph));
    morph.renderingState.markers = morph.markers; // not yet working
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // TEXTRENDERING - MEASURING AFTER RENDER
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  updateLineHeightOfNode (morph, docLine, lineNode) {
    if (docLine.height === 0 || docLine.hasEstimatedExtent) {
      const tfm = morph.getGlobalTransform().inverse();
      tfm.e = tfm.f = 0;

      const needsTransformAdjustment = tfm.getScale() !== 1 || tfm.getRotation() !== 0;
      if (needsTransformAdjustment) lineNode.style.transform = tfm.toString();
      const { height: nodeHeight, width: nodeWidth } = lineNode.getBoundingClientRect();
      if (needsTransformAdjustment) lineNode.style.transform = '';

      if (nodeHeight && nodeWidth && (docLine.height !== nodeHeight || docLine.width !== nodeWidth) &&
         morph.fontMetric.isFontSupported(morph.fontFamily, morph.fontWeight)) {
        // console.log(`[${docLine.row}] ${nodeHeight} vs ${docLine.height}`)
        docLine.changeExtent(nodeWidth, nodeHeight, false);
        morph.textLayout.resetLineCharBoundsCacheOfLine(docLine);
        // force re-render in case text layout / line heights changed
        // todo: use new flags
        this.needsRerender = true;
        morph.viewState._needsFit = true;
      }

      // positions embedded morphs
      if (docLine.textAndAttributes && docLine.textAndAttributes.length) {
        let inlineMorph;
        for (let j = 0, column = 0; j < docLine.textAndAttributes.length; j += 2) {
          inlineMorph = docLine.textAndAttributes[j];
          if (inlineMorph && inlineMorph.isMorph) {
            morph._positioningSubmorph = inlineMorph;
            inlineMorph.position = morph.textLayout.pixelPositionFor(morph, { row: docLine.row, column }).subPt(morph.origin);
            inlineMorph._dirty = false; // no need to rerender
            morph._positioningSubmorph = null;
            column++;
          } else if (inlineMorph) {
            column += inlineMorph.length;
          }
        }
      }

      return nodeHeight;
    }
    return docLine.height;
  }

  updateExtentsOfLines (textlayerNode, morph) {
    // figure out what lines are displayed in the text layer node and map those
    // back to document lines.  Those are then updated via lineNode.getBoundingClientRect
    const { viewState, fontMetric } = morph;

    viewState.dom_nodes = [];
    viewState.dom_nodeFirstRow = 0;
    viewState.textWidth = textlayerNode.scrollWidth;

    const lineNodes = textlayerNode.children;
    let i = 0;
    let firstLineNode;

    while (i < lineNodes.length && lineNodes[i].className !== 'line') i++;

    if (i < lineNodes.length) {
      firstLineNode = lineNodes[i];
    } else {
      return;
    }

    const ds = firstLineNode.dataset;
    const row = Number(ds ? ds.row : firstLineNode.getAttribute('data-row'));
    if (typeof row !== 'number' || isNaN(row)) return;

    viewState.dom_nodeFirstRow = row;
    let actualTextHeight = 0;
    let line = morph.document.getLine(row);

    let foundEstimatedLine;
    for (; i < lineNodes.length; i++) {
      const node = lineNodes[i];
      viewState.dom_nodes.push(node);
      if (line) {
        if (!foundEstimatedLine) { foundEstimatedLine = line.hasEstimatedExtent; }
        line.hasEstimatedExtent = foundEstimatedLine;
        actualTextHeight = actualTextHeight + this.updateLineHeightOfNode(morph, line, node);
        // if we measured but the font as not been loaded, this is also just an estimate
        line.hasEstimatedExtent = !fontMetric.isFontSupported(morph.fontFamily, morph.fontWeight);
        line = line.nextLine();
      }
    }

    // TODO: use new flags?
    if (this.needsRerender) {
      morph.fitIfNeeded();
      morph.makeDirty();
    } else morph._dirty = !!morph.submorphs.find(m => m.needsRerender());
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
