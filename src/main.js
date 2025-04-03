import Vue from 'vue';
import App from './App.vue';
import store from './store';
import './style.css';

// 使用Vue2
Vue.config.productionTip = false;

// 创建Vue实例
new Vue({
  store,
  render: h => h(App)
}).$mount('#app');
