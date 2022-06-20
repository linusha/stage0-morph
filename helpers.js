import { defaultStyle } from 'lively.morphic/rendering/morphic-default.js';
import bowser from 'bowser';

/**
 * Extract the styling information from `morph`'s morphic model and applies them to its DOM node.
 * Classes subclassing Morph can implement `renderStyles` that gets the Object with the styles to be applied passed before they are applied to the node. 
 * @see defaultStyle.
 * @param {Morph} morph - The Morph to be rendered.
 * @param {Node} node - The node in which `morph` is rendered into the DOM.
 * @returns {Node} `morph`'s DOM node with applied styling attributes.
 */
export function applyStylingToNode (morph, node) {
  let styleProps = defaultStyle(morph);

  if (typeof morph.renderStyles === 'function') {
    styleProps = morph.renderStyles(styleProps);
  }

  stylepropsToNode(styleProps, node); // eslint-disable-line no-use-before-define
  return node;
}

/**
 * Actually applies styles as defined in an Object to a DOM node.
 * @param {Object} styleProps - The styles to apply. 
 * @param {Node} node - The DOM node to which to apply `styleProps`. 
 * @returns {Node} the DOM node with changed style properties.
 */
export function stylepropsToNode (styleProps, node) {
  for (let prop in styleProps) {
    // fixme: this is more of a hack and is probably already implemented somewhere else as well
    let name = prop.replace(/([A-Z])/g, '-$1');
    name = name.toLowerCase();
    node.style.setProperty(name, styleProps[prop]);
  }
  return node;
}

/**
  * @param {Morph} morph - The Morph for which to generate the attributes. 
  * Equivalent to defaultAttributes from `lively.morphic/rendering/morphic-default.js`
  * but with morph-after-render-hook removed
  */
function defaultAttributes (morph) {
  const attrs = {
    id: morph.id,
    class: (morph.hideScrollbars
      ? morph.styleClasses.concat('hiddenScrollbar')
      : morph.styleClasses).join(' '),
    draggable: false
  };
  if (bowser.ios && morph.draggable && !morph.isWorld) {
    attrs['touch-action'] = 'none';
  } else if (bowser.ios && morph.clipMode !== 'visible' && !morph.isWorld) {
    attrs['touch-action'] = 'auto';
  } else {
    attrs['touch-action'] = 'manipulation';
  }
  return attrs;
}

/**
 * @see applyStylingToNode
 * @param {Morph} morph 
 * @param {Node} node 
 */
export function applyAttributesToNode (morph, node) {
  let attrs = defaultAttributes(morph);

  if (typeof morph.renderAttributes === 'function') {
    attrs = morph.renderAttributes(attrs);
  }
  for (let attr in attrs) {
    node.setAttribute(attr, attrs[attr]);
  }
}

/**
   * Helper method that maps the morphic property values to our responding custom CSS classes.
   * @param {String} lineWrapping - a lineWrapping morphic property value
   * @returns {String} A lively.next CSS class name
   */
export function lineWrappingToClass (lineWrapping) {
  switch (lineWrapping) {
    case true:
    case 'by-words': return 'wrap-by-words';
    case 'only-by-words': return 'only-wrap-by-words';
    case 'by-chars': return 'wrap-by-chars';
  }
  return 'no-wrapping';
}
