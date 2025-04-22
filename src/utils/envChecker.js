const fs = require('fs');
const path = require('path');

// 添加自己的简单日志函数，防止循环依赖
function log(level, message) {
  // 只在控制台输出，不写入文件
  const timestamp = new Date().toISOString();
  if (level === 'ERROR') {
    console.error(`[ERROR] ${timestamp} ${message}`);
  } else if (level === 'WARN') {
    console.warn(`[WARN] ${timestamp} ${message}`);
  } else {
    console.log(`[INFO] ${timestamp} ${message}`);
  }
}

/**
 * 检查 .env 文件是否存在
 * @returns {boolean} 文件是否存在
 */
function checkEnvFileExists() {
  const envPath = path.resolve(process.cwd(), '.env');
  return fs.existsSync(envPath);
}

/**
 * 检查必要的环境变量是否已设置
 * @returns {Object} 检查结果，包含是否通过和缺失的变量列表
 */
function checkRequiredEnvVars() {
  // 定义必要的环境变量列表
  const requiredVars = [
    'API_KEYS', // API Keys 配置
  ];

  // 如果启用了自动刷新，则需要检查相关配置
  if (process.env.ENABLE_AUTO_REFRESH === 'true') {
    requiredVars.push(
      'GITHUB_TOKEN',
      'GITHUB_OWNER',
      'GITHUB_REPO',
      'GITHUB_WORKFLOW_ID',
      'TRIGGER_WORKFLOW'
    );
  }

  // 检查每个必要的环境变量
  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  return {
    passed: missingVars.length === 0,
    missingVars
  };
}

/**
 * 执行环境检查，如果不符合要求则退出程序
 */
function enforceEnvCheck() {
  log('INFO', '正在检查环境配置...');
  
  // 检查 .env 文件是否存在
  const envFileExists = checkEnvFileExists();
  if (!envFileExists) {
    log('ERROR', '\n错误: 未找到 .env 文件!');
    log('ERROR', '请根据 .env.example 创建 .env 文件并配置必要的环境变量。');
    log('ERROR', '执行以下命令复制示例文件: cp .env.example .env,或执行npm run setup\n');
    process.exit(1); // 退出程序，状态码 1 表示错误
  }
  
  // 检查必要的环境变量
  const { passed, missingVars } = checkRequiredEnvVars();
  if (!passed) {
    log('ERROR', '\n错误: 以下必要的环境变量未在 .env 文件中设置:');
    missingVars.forEach(varName => {
      log('ERROR', `  - ${varName}`);
    });
    log('ERROR', '\n请在 .env 文件中配置这些变量后重新启动程序。\n');
    process.exit(1); // 退出程序，状态码 1 表示错误
  }
  
  log('INFO', '环境检查通过，继续启动程序...');
}

module.exports = {
  checkEnvFileExists,
  checkRequiredEnvVars,
  enforceEnvCheck
}; 