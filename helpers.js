import { defaultStyle } from 'lively.morphic/rendering/morphic-default.js';
import bowser from 'bowser';

export function applyStylingToNode (morph, node) {
  const styleProps = defaultStyle(morph);

  for (let prop in styleProps) {
    node.style.setProperty(prop, styleProps[prop]);
  }
}

/**
   * equivalent to defaultAttributes from `lively.morphic/rendering/morphic-default.js`
   * but with morph-after-render-hook removed
   * TODO: scroll will be kaputt due to this
   */
function defaultAttributes (morph) {
  const attrs = {
    // animation: new Animation(morph),
    key: morph.id,
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

export function applyAttributesToNode (morph, node) {
  const attrs = defaultAttributes(morph);

  for (let attr in attrs) {
    node.setAttribute(attr, attrs[attr]);
  }
}
