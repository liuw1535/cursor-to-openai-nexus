// logger.js - 统一的日志系统模块
const fs = require('fs');
const path = require('path');

// 避免循环依赖
let config = null;
// 延迟加载配置
function getConfig() {
  if (!config) {
    try {
      config = require('../config/config');
    } catch (err) {
      console.error('加载配置文件失败:', err.message);
      config = { log: { level: 'INFO', format: 'colored' } };
    }
  }
  return config;
}

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
  HTTP: 2 // HTTP日志级别与INFO相同
};

// 默认日志级别
let currentLogLevel = LOG_LEVELS.INFO;

// 日志格式
let logFormat = 'colored'; // colored, json, text

// 带颜色的控制台输出
const COLORS = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  GREEN: '\x1b[32m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m'
};

// 日志文件配置
const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
let logToFile = false;

// 内存中存储的日志（用于网页显示）
const memoryLogs = [];
const MAX_MEMORY_LOGS = 1000; // 内存中最多保存的日志条数

// 确保日志目录存在
function ensureLogDirExists() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    return true;
  } catch (err) {
    console.error(`创建日志目录失败: ${err.message}`);
    return false;
  }
}

// 初始化文件日志
function initFileLogging() {
  const conf = getConfig();
  if (process.env.LOG_TO_FILE === 'true' || (conf.log && conf.log.toFile)) {
    if (ensureLogDirExists()) {
      logToFile = true;
      // 检查日志文件大小，如果超过最大值则进行轮转
      if (fs.existsSync(LOG_FILE)) {
        const stats = fs.statSync(LOG_FILE);
        if (stats.size > MAX_LOG_SIZE) {
          rotateLogFile();
        }
      }
      return true;
    }
  }
  return false;
}

// 日志文件轮转
function rotateLogFile() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const newLogFile = path.join(LOG_DIR, `app-${timestamp}.log`);
    if (fs.existsSync(LOG_FILE)) {
      fs.renameSync(LOG_FILE, newLogFile);
    }
    // 清理旧日志文件，保留最近10个
    const logFiles = fs.readdirSync(LOG_DIR)
      .filter(file => file.startsWith('app-') && file.endsWith('.log'))
      .sort()
      .reverse();
    
    if (logFiles.length > 10) {
      logFiles.slice(10).forEach(file => {
        try {
          fs.unlinkSync(path.join(LOG_DIR, file));
        } catch (err) {
          console.error(`删除旧日志文件失败: ${err.message}`);
        }
      });
    }
  } catch (err) {
    console.error(`日志文件轮转失败: ${err.message}`);
    logToFile = false;
  }
}

// 添加日志到内存
function addLogToMemory(level, timestamp, ...args) {
  // 将日志对象添加到内存数组
  const logEntry = {
    level,
    timestamp,
    message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
  };
  
  memoryLogs.unshift(logEntry); // 新日志添加到数组开头
  
  // 保持数组在最大长度以内
  if (memoryLogs.length > MAX_MEMORY_LOGS) {
    memoryLogs.pop(); // 移除最旧的日志
  }
}

// 将日志写入文件
function writeLogToFile(level, timestamp, ...args) {
  if (!logToFile) return;
  
  try {
    let logEntry;
    
    if (logFormat === 'json') {
      // JSON格式
      const data = args.map(arg => typeof arg === 'object' ? arg : String(arg));
      const logObject = {
        level,
        timestamp,
        message: data.length === 1 ? data[0] : data
      };
      logEntry = JSON.stringify(logObject) + '\n';
    } else {
      // 文本格式
      logEntry = `[${level}] ${timestamp} ${args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : arg
      ).join(' ')}\n`;
    }
    
    fs.appendFileSync(LOG_FILE, logEntry);
    
    // 检查文件大小，必要时进行轮转
    const stats = fs.statSync(LOG_FILE);
    if (stats.size > MAX_LOG_SIZE) {
      rotateLogFile();
    }
  } catch (err) {
    console.error(`写入日志文件失败: ${err.message}`);
    logToFile = false;
  }
}

// 获取时间戳
function getTimestamp() {
  return new Date().toISOString();
}

// 设置日志级别
function setLogLevel(level) {
  if (typeof level === 'string') {
    level = level.toUpperCase();
    if (LOG_LEVELS[level] !== undefined) {
      currentLogLevel = LOG_LEVELS[level];
    } else {
      error(`无效的日志级别: ${level}`);
    }
  } else if (typeof level === 'number' && level >= 0 && level <= 4) {
    currentLogLevel = level;
  } else {
    error(`无效的日志级别: ${level}`);
  }
}

// 设置日志格式
function setLogFormat(format) {
  const validFormats = ['colored', 'json', 'text'];
  if (validFormats.includes(format)) {
    logFormat = format;
    return true;
  } else {
    error(`无效的日志格式: ${format}`);
    return false;
  }
}

// 格式化控制台日志
function formatConsoleLog(level, timestamp, color, ...args) {
  if (logFormat === 'json') {
    // JSON格式
    const data = args.map(arg => typeof arg === 'object' ? arg : String(arg));
    return JSON.stringify({
      level,
      timestamp,
      message: data.length === 1 ? data[0] : data
    });
  } else if (logFormat === 'text') {
    // 纯文本格式（无颜色）
    return `[${level}] ${timestamp} ${args.join(' ')}`;
  } else {
    // 默认：带颜色格式
    return `${color}[${level}] ${timestamp}${COLORS.RESET} ${args.join(' ')}`;
  }
}

// 错误日志
function error(...args) {
  if (currentLogLevel >= LOG_LEVELS.ERROR) {
    const timestamp = getTimestamp();
    const formattedLog = formatConsoleLog('ERROR', timestamp, COLORS.RED, ...args);
    console.error(formattedLog);
    writeLogToFile('ERROR', timestamp, ...args);
    addLogToMemory('ERROR', timestamp, ...args);
  }
}

// 警告日志
function warn(...args) {
  if (currentLogLevel >= LOG_LEVELS.WARN) {
    const timestamp = getTimestamp();
    const formattedLog = formatConsoleLog('WARN', timestamp, COLORS.YELLOW, ...args);
    console.warn(formattedLog);
    writeLogToFile('WARN', timestamp, ...args);
    addLogToMemory('WARN', timestamp, ...args);
  }
}

// 信息日志
function info(...args) {
  if (currentLogLevel >= LOG_LEVELS.INFO) {
    const timestamp = getTimestamp();
    const formattedLog = formatConsoleLog('INFO', timestamp, COLORS.GREEN, ...args);
    console.log(formattedLog);
    writeLogToFile('INFO', timestamp, ...args);
    addLogToMemory('INFO', timestamp, ...args);
  }
}

// 调试日志
function debug(...args) {
  if (currentLogLevel >= LOG_LEVELS.DEBUG) {
    const timestamp = getTimestamp();
    const formattedLog = formatConsoleLog('DEBUG', timestamp, COLORS.BLUE, ...args);
    console.log(formattedLog);
    writeLogToFile('DEBUG', timestamp, ...args);
    addLogToMemory('DEBUG', timestamp, ...args);
  }
}

// 跟踪日志
function trace(...args) {
  if (currentLogLevel >= LOG_LEVELS.TRACE) {
    const timestamp = getTimestamp();
    const formattedLog = formatConsoleLog('TRACE', timestamp, COLORS.CYAN, ...args);
    console.log(formattedLog);
    writeLogToFile('TRACE', timestamp, ...args);
    addLogToMemory('TRACE', timestamp, ...args);
  }
}

// HTTP请求日志 (特殊处理，方便筛选)
function http(...args) {
  if (currentLogLevel >= LOG_LEVELS.INFO) {
    const timestamp = getTimestamp();
    const formattedLog = formatConsoleLog('HTTP', timestamp, COLORS.CYAN, ...args);
    console.log(formattedLog);
    writeLogToFile('HTTP', timestamp, ...args);
    addLogToMemory('HTTP', timestamp, ...args);
  }
}

// 获取内存中的日志
function getLogs(filter = {}) {
  let filteredLogs = [...memoryLogs];
  
  // 按日志级别筛选
  if (filter.level) {
    filteredLogs = filteredLogs.filter(log => log.level === filter.level);
  }
  
  // 按时间范围筛选
  if (filter.startTime) {
    filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= new Date(filter.startTime));
  }
  
  if (filter.endTime) {
    filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= new Date(filter.endTime));
  }
  
  // 按关键词搜索
  if (filter.search) {
    const searchTerm = filter.search.toLowerCase();
    filteredLogs = filteredLogs.filter(log => 
      log.message.toLowerCase().includes(searchTerm) || 
      log.level.toLowerCase().includes(searchTerm)
    );
  }
  
  // 分页
  const page = filter.page || 1;
  const pageSize = filter.pageSize || 100;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  
  return {
    logs: filteredLogs.slice(start, end),
    total: filteredLogs.length,
    page,
    pageSize
  };
}

// 清除内存日志
function clearMemoryLogs() {
  memoryLogs.length = 0;
  info('内存日志已清除');
}

// 初始化配置
function initialize() {
  try {
    const conf = getConfig();
    
    // 初始化日志级别
    const envLevel = process.env.LOG_LEVEL;
    if (envLevel) {
      setLogLevel(envLevel);
    } else if (conf && conf.log && conf.log.level) {
      setLogLevel(conf.log.level);
    }
    
    // 初始化日志格式
    const envFormat = process.env.LOG_FORMAT;
    if (envFormat) {
      setLogFormat(envFormat);
    } else if (conf && conf.log && conf.log.format) {
      setLogFormat(conf.log.format);
    }
    
    // 初始化文件日志
    initFileLogging();
  } catch (err) {
    console.error(`初始化日志系统出错: ${err.message}`);
  }
}

// 初始化
initialize();

module.exports = {
  LOG_LEVELS,
  setLogLevel,
  setLogFormat,
  error,
  warn,
  info,
  debug,
  trace,
  http,
  // 暴露文件日志相关方法
  enableFileLogging: () => {
    if (ensureLogDirExists()) {
      logToFile = true;
      info('文件日志已启用');
      return true;
    }
    return false;
  },
  disableFileLogging: () => {
    logToFile = false;
    info('文件日志已禁用');
  },
  rotateLogFile,
  // 添加内存日志相关方法
  getLogs,
  clearMemoryLogs
}; 