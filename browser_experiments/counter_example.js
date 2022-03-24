import h from 'https://jspm.dev/stage0'

// Create view template.
// Mark dynamic references with a #-syntax where needed.
const view = h`
  <div>
    <h1>#count</h1>
    <button #down>-</button>
    <button #up>+</button>
  </div>
`
function Main() {
    const root = view

    // Collect references to dynamic parts
    const {count, down, up} = view.collect(root)

    const state = {
        count: 0
    }

    down.onclick = () => {
        state.count--
        update()
    }

    up.onclick = () => {
        state.count++
        update()
    }

    const update = () => count.nodeValue = state.count
    update()

    return root
}

document.body.appendChild(Main())