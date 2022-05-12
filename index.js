
import Stage0Renderer from './renderer.js';
import Stage0VNode from './stage0-vnode.js';
import { Morph } from 'lively.morphic';

export default class Stage0Morph extends Morph {
  constructor (props) {
    super(props);
    this.renderer = new Stage0Renderer(this);
  }

  render (renderer) {
    return new Stage0VNode(this, renderer);
  }

  get isStage0Morph () {
    return true;
  }

  remove () {
    window.stage0renderer = null;
    super.remove();
  }
}
