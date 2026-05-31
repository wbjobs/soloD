import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import { registerMicroApps, start } from 'qiankun'

const app = createApp(App)

app.use(router)
app.use(ElementPlus)
app.mount('#app')

registerMicroApps([
  {
    name: 'editor',
    entry: '//localhost:8081',
    container: '#micro-app-container',
    activeRule: '/editor'
  },
  {
    name: 'renderer',
    entry: '//localhost:8082',
    container: '#micro-app-container',
    activeRule: '/renderer'
  }
], {
  beforeLoad: [
    app => {
      console.log('加载微应用:', app.name)
    }
  ]
})

start()