import { createRouter, createWebHistory } from 'vue-router'
import Chat from '../views/Chat.vue'
import Documents from '../views/Documents.vue'

const routes = [
  {
    path: '/',
    redirect: '/chat'
  },
  {
    path: '/chat',
    name: 'Chat',
    component: Chat
  },
  {
    path: '/documents',
    name: 'Documents',
    component: Documents
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
