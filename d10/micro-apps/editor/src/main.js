import { createApp } from 'vue'
import App from './App.vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import { renderWithQiankun, qiankunWindow } from 'vite-plugin-qiankun/dist/helper'

let app = null

function render(props = {}) {
  const { container } = props
  const root = container ? container.querySelector('#app') : document.getElementById('app')
  
  app = createApp(App)
  app.use(ElementPlus)
  app.mount(root)
}

renderWithQiankun({
  mount(props) {
    render(props)
  },
  bootstrap() {
    console.log('editor bootstrap')
  },
  unmount(props) {
    app?.unmount()
    app = null
  },
  update(props) {
    console.log('editor update', props)
  }
})

if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  render()
}