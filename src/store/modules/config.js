// 游戏配置模块
export default {
  namespaced: true,
  
  state: {
    // 游戏基础配置
    boardWidth: 800,      // 游戏板宽度
    boardHeight: 600,     // 游戏板高度
    
    // 金币配置
    coinCount: 50,        // 金币数量
    coinSize: 30,         // 金币大小
    coinValue: 1,         // 基础金币价值
    
    // 推板配置
    pushBarLength: 100,   // 推板长度
    pushBarHeight: 20,    // 推板高度
    pushBarY: 500,        // 推板Y坐标位置
    pushBarSpeed: 5,      // 推板移动速度
    
    // 大奖配置
    prizes: [
      { name: '小奖', value: 10, probability: 30, dropProbability: 80, icon: 'prize-small.png' },
      { name: '中奖', value: 50, probability: 15, dropProbability: 60, icon: 'prize-medium.png' },
      { name: '大奖', value: 100, probability: 5, dropProbability: 40, icon: 'prize-large.png' }
    ],
    maxPrizes: 3,         // 场上最大大奖数量
    prizeSize: 40,        // 大奖大小
    prizeGenerationProbability: 5, // 大奖生成基础概率
    dropProbability: 70,  // 掉落概率基数
    
    // 物理引擎配置
    gravity: 9.8,         // 重力加速度
    friction: 0.1,        // 摩擦系数
    restitution: 0.7,     // 弹性系数
    
    // 游戏难度配置
    difficulty: 'normal', // 难度：easy, normal, hard
    difficultyFactors: {
      easy: {
        dropProbabilityMultiplier: 1.2,
        prizeGenerationMultiplier: 1.2
      },
      normal: {
        dropProbabilityMultiplier: 1.0,
        prizeGenerationMultiplier: 1.0
      },
      hard: {
        dropProbabilityMultiplier: 0.8,
        prizeGenerationMultiplier: 0.8
      }
    }
  },
  
  mutations: {
    SET_COIN_COUNT(state, count) {
      state.coinCount = count;
    },
    SET_PUSH_BAR_LENGTH(state, length) {
      state.pushBarLength = length;
    },
    SET_DIFFICULTY(state, difficulty) {
      state.difficulty = difficulty;
    },
    SET_DROP_PROBABILITY(state, probability) {
      state.dropProbability = probability;
    },
    UPDATE_PRIZE_CONFIG(state, { index, config }) {
      state.prizes[index] = { ...state.prizes[index], ...config };
    }
  },
  
  getters: {
    currentDifficultyFactors: state => state.difficultyFactors[state.difficulty],
    adjustedDropProbability: (state, getters) => {
      return state.dropProbability * getters.currentDifficultyFactors.dropProbabilityMultiplier;
    },
    adjustedPrizeGeneration: (state, getters) => {
      return state.prizeGenerationProbability * getters.currentDifficultyFactors.prizeGenerationMultiplier;
    }
  }
};