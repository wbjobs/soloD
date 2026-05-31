<template>
  <div id="app">
    <el-container style="height: 100vh">
      <el-header style="background: #409eff; color: white; display: flex; align-items: center; padding: 0 20px">
        <h1 style="margin: 0; font-size: 20px">🎨 低代码开发平台</h1>
        <el-menu
          mode="horizontal"
          :router="true"
          style="margin-left: 50px; background: transparent"
          text-color="white"
          active-text-color="#ffd04b"
        >
          <el-menu-item index="/">项目管理</el-menu-item>
          <el-menu-item index="/components">组件库</el-menu-item>
          <el-menu-item index="/users">用户管理</el-menu-item>
        </el-menu>
      </el-header>
      <el-main style="padding: 20px; background: #f5f7fa">
        <router-view></router-view>
        <div id="micro-app-container"></div>
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
}
</style>