// 加载环境变量
require('dotenv').config();

// 在logger加载前添加临时日志函数
function tempLog(level, message) {
  const timestamp = new Date().toISOString();
  if (level === 'ERROR') {
    console.error(`[ERROR] ${timestamp} ${message}`);
  } else if (level === 'WARN') {
    console.warn(`[WARN] ${timestamp} ${message}`);
  } else {
    console.log(`[INFO] ${timestamp} ${message}`);
  }
}

// 环境检查
tempLog('INFO', '启动前检查环境配置...');
const envChecker = require('./utils/envChecker');
// 先执行简单检查，避免循环依赖
envChecker.enforceEnvCheck();

const express = require('express');
const morgan = require('morgan');
const path = require('path');
const cron = require('node-cron');
const app = express();
const cookieParser = require('cookie-parser');
const { spawn } = require('child_process');

// 先加载配置，再加载logger
const config = require('./config/config');
const logger = require('./utils/logger');
const routes = require('./routes');
const keyManager = require('./utils/keyManager');
const cookieRefresher = require('./utils/cookieRefresher');
const authMiddleware = require('./middleware/auth');

// 加载路由
const v1Router = require('./routes/v1');

// 初始化API Keys
logger.info('初始化API Keys...');
keyManager.initializeApiKeys();

// 输出最终的API Keys配置
logger.debug('最终API Keys配置:', JSON.stringify(keyManager.getAllApiKeys().reduce((obj, key) => {
  obj[key] = keyManager.getAllCookiesForApiKey(key);
  return obj;
}, {}), null, 2));

// 输出每个API key的Cookie数量信息
const apiKeys = keyManager.getAllApiKeys();
const keySummary = apiKeys.map(key => {
    const cookies = keyManager.getAllCookiesForApiKey(key);
    return `${key}: ${cookies.length}个Cookie`;
}).join(', ');

logger.info(`当前已加载 ${apiKeys.length} 个API Key，详情: ${keySummary}`);

// 添加CORS支持
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// 自定义Morgan格式，将日志输出到我们的日志系统
morgan.token('remote-addr', (req) => {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
});

// 创建一个将 Morgan 日志写入我们的日志系统的流
const morganLoggerStream = {
  write: (message) => {
    // 移除行尾的换行符
    const trimmedMessage = message.trim();
    if (trimmedMessage) {
      logger.http(trimmedMessage);
    }
  }
};

// 使用自定义格式的 Morgan 中间件
app.use(morgan(process.env.MORGAN_FORMAT || 'combined', { 
  stream: morganLoggerStream,
  // 跳过健康检查等路由的日志
  skip: (req, res) => {
    return req.path === '/health' || req.path === '/favicon.ico';
  }
}));

// 添加静态文件支持
app.use(express.static(path.join(__dirname, 'public')));

// 添加根路由，重定向到登录页面
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// 添加认证中间件
app.use(authMiddleware);

// API路由
app.use('/v1', v1Router);

app.use("/", routes)

// 设置自动定时刷新Cookie任务
if (config.refresh.enabled) {
    logger.info(`已启用自动刷新 Cookie，定时任务将在每 ${config.refresh.interval} 运行`);
    cron.schedule(config.refresh.interval, () => {
        logger.info('开始定时自动刷新 Cookie...');
        const scriptPath = path.resolve(__dirname, '../auto-refresh-cookies.js');
        
        const child = spawn('node', [scriptPath], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        child.stdout.on('data', (data) => {
            logger.info(`刷新进程输出: ${data.toString().trim()}`);
        });
        
        child.stderr.on('data', (data) => {
            logger.error(`刷新进程错误: ${data.toString().trim()}`);
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                logger.info('自动刷新 Cookie 定时任务完成');
            } else {
                logger.error(`自动刷新 Cookie 定时任务异常退出，代码: ${code}`);
            }
        });
    });
} else {
    logger.info('未启用自动刷新 Cookie，如需启用请设置环境变量 ENABLE_AUTO_REFRESH=true');
}

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error('服务器错误:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 处理404请求
app.use((req, res) => {
  logger.warn(`未找到路由: ${req.method} ${req.url}`);
  res.status(404).json({
    error: 'Not found',
    message: '请求的资源不存在'
  });
});

app.listen(config.port, () => {
    logger.info(`服务器已启动，监听端口: ${config.port}`);
    logger.info(`打开管理界面: http://localhost:${config.port}`);
});

module.exports = app;
