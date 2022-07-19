export const cssForTexts = `

    /* markers */

    .newtext-marker-layer {
      position: absolute;
    }

    /* selection / cursor */

    .newtext-cursor {
      z-index: 5;
      pointer-events: none;
      position: absolute;
      background-color: black;
    }

    .hidden-cursor .newtext-cursor {
      background-color: transparent !important;
    }

    .newtext-cursor.diminished {
      background-color: gray;
    }

    .newtext-selection-layer {
      position: absolute;
    }

    /*-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-*/
    /* text layer / content */
    .font-measure {
      visibility: hidden;
    }

    .newtext-text-layer {
      box-sizing: border-box;
      position: absolute;
      white-space: pre;
      z-index: 10; /* fixme: hackz */
      min-width: 100%;
      pointer-events: none;
    }

    .newtext-before-filler {}

    .newtext-text-layer.wrap-by-words {
      white-space: pre-wrap;
      overflow-wrap: break-word;
      max-width: 100%;
    }

    .newtext-text-layer.only-wrap-by-words {
      white-space: pre-wrap;
      overflow-wrap: break-all;
      max-width: 100%;
    }

    .newtext-text-layer.wrap-by-chars {
      white-space: pre-wrap;
      word-break: break-all;
      max-width: 100%;
    }

    .newtext-text-layer.no-wrapping {
    }

    .newtext-text-layer a {
       pointer-events: auto;
    }

    .newtext-text-layer.auto-width .line {
      width: fit-content;
    }

    .newtext-text-layer .line {
      -moz-border-radius: 0;
      -webkit-border-radius: 0;
      border-radius: 0;
      border-width: 0;
      background: transparent;
      font-family: inherit;
      font-size: inherit;
      margin: 0;
      word-wrap: normal;
      line-height: inherit;
      color: inherit;
      position: relative;
      overflow: visible;
      -webkit-tap-highlight-color: transparent;
      -webkit-font-variant-ligatures: contextual;
      font-variant-ligatures: contextual;
    }

    .line > .Morph {
      display: inline-block !important;
      vertical-align: top !important;
    }

    blockquote {
      margin: 0;
      -webkit-margin-start: 0;
      -webkit-margin-end: 0;
    }

    .newtext-text-layer blockquote {
      margin-left: 2em;
      margin-right: 2em;
      border-left: 2px lightgray solid;
      padding-left: 2%;
    }

    .selectable {
      user-select: text;
    }

    /* -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-*/
    /* debug styling */

    .debug-info {
      position: absolute;
      outline: 1px solid green;
      pointer-events: none;
      z-index: 4;
      text-align: center;
      font-family: monospace;
      color: green;
      background-color: white;
      font-size: small;
      vertical-align: baseline;
    }

    .debug-line {
      position: absolute;
      outline: 1px solid red;
      pointer-events: none;
      z-index: 4,
      text-align: right;
      font-family: monospace;
      font-size: small;
      vertical-align: baseline;
      color: red;
    }

    .debug-char {
      position: absolute;
      outline: 1px solid orange;
      pointer-events: none;
      z-index: 3
    }

  `;
