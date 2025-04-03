// 游戏状态模块
export default {
  namespaced: true,
  
  state: {
    gameState: 'init',    // 游戏状态：init, running, paused, ended
    coins: [],           // 金币列表
    prizes: [],          // 大奖列表
    pushBarPosition: 0,  // 推板位置
    score: 0,            // 当前得分
    rewards: [],         // 获得的奖励
    gameTime: 0,         // 游戏时间（秒）
    highScore: 0,        // 最高分
    combo: 0,            // 连击数
    lastDropTime: 0      // 上次掉落时间戳
  },
  
  mutations: {
    SET_GAME_STATE(state, newState) {
      state.gameState = newState;
    },
    UPDATE_COINS(state, coins) {
      state.coins = coins;
    },
    UPDATE_PRIZES(state, prizes) {
      state.prizes = prizes;
    },
    SET_PUSH_BAR_POSITION(state, position) {
      state.pushBarPosition = position;
    },
    ADD_SCORE(state, points) {
      state.score += points;
      // 更新最高分
      if (state.score > state.highScore) {
        state.highScore = state.score;
        localStorage.setItem('highScore', state.highScore);
      }
      
      // 计算连击
      const now = Date.now();
      if (now - state.lastDropTime < 1000) { // 1秒内的掉落算连击
        state.combo++;
      } else {
        state.combo = 1;
      }
      state.lastDropTime = now;
    },
    ADD_REWARD(state, reward) {
      state.rewards.push({
        ...reward,
        id: Date.now(),
        timestamp: Date.now()
      });
    },
    UPDATE_GAME_TIME(state, time) {
      state.gameTime = time;
    },
    RESET_GAME(state) {
      state.gameState = 'init';
      state.coins = [];
      state.prizes = [];
      state.score = 0;
      state.rewards = [];
      state.gameTime = 0;
      state.combo = 0;
      state.lastDropTime = 0;
    }
  },
  
  actions: {
    startGame({ commit, dispatch }) {
      commit('SET_GAME_STATE', 'running');
      dispatch('startGameTimer');
    },
    
    pauseGame({ commit, state }) {
      if (state.gameState === 'running') {
        commit('SET_GAME_STATE', 'paused');
      }
    },
    
    resumeGame({ commit, state }) {
      if (state.gameState === 'paused') {
        commit('SET_GAME_STATE', 'running');
      }
    },
    
    endGame({ commit }) {
      commit('SET_GAME_STATE', 'ended');
    },
    
    movePushBar({ commit }, position) {
      commit('SET_PUSH_BAR_POSITION', position);
    },
    
    updateGameObjects({ commit }, { coins, prizes }) {
      commit('UPDATE_COINS', coins);
      commit('UPDATE_PRIZES', prizes);
    },
    
    addScore({ commit }, points) {
      commit('ADD_SCORE', points);
    },
    
    addReward({ commit }, reward) {
      commit('ADD_REWARD', reward);
    },
    
    startGameTimer({ commit, state, dispatch }) {
      const timer = setInterval(() => {
        if (state.gameState === 'running') {
          commit('UPDATE_GAME_TIME', state.gameTime + 1);
        }
        if (state.gameState !== 'running' && state.gameState !== 'paused') {
          clearInterval(timer);
        }
      }, 1000);
    },
    
    resetGame({ commit }) {
      commit('RESET_GAME');
    },
    
    loadSavedGame({ commit }) {
      const savedHighScore = localStorage.getItem('highScore');
      if (savedHighScore) {
        commit('SET_HIGH_SCORE', parseInt(savedHighScore, 10));
      }
    }
  },
  
  getters: {
    isGameRunning: state => state.gameState === 'running',
    isGamePaused: state => state.gameState === 'paused',
    isGameEnded: state => state.gameState === 'ended',
    totalScore: state => state.score,
    currentCombo: state => state.combo,
    comboMultiplier: state => Math.min(3, 1 + state.combo * 0.1), // 最高3倍
    allRewards: state => state.rewards,
    gameTimeFormatted: state => {
      const minutes = Math.floor(state.gameTime / 60);
      const seconds = state.gameTime % 60;
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }
};