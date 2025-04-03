import Vue from 'vue';
import Vuex from 'vuex';
import config from './modules/config';
import game from './modules/game';

Vue.use(Vuex);

export default new Vuex.Store({
  modules: {
    config,
    game
  },
  
  // 严格模式，确保状态变更只能通过mutation进行
  strict: process.env.NODE_ENV !== 'production'
});