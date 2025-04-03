<template>
  <div class="app">
    <index />
  </div>
</template>

<script>
import index from './views/index.vue'

export default {
  name: 'App',
  
  components: {
    index
  },
};
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.app {
  width: 100vw;
  height: 100vh;
  background: #f0f0f0;
  display: flex;
  justify-content: center;
  align-items: center;
}

</style>
