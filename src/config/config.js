// 读取并解析API_KEYS环境变量
// 避免循环依赖，不要在此处引用logger

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

// 解析API Keys配置
let apiKeysConfig = {};
try {
    if (process.env.API_KEYS) {
        // 解析API Keys字符串为对象
        apiKeysConfig = JSON.parse(process.env.API_KEYS);
        log('INFO', '正在从环境变量加载API Keys...');
        log('INFO', `成功解析API Keys，包含 ${Object.keys(apiKeysConfig).length} 个键`);
    }
} catch (error) {
    log('ERROR', '解析API_KEYS环境变量失败:' + error.message);
    log('ERROR', '请确保API_KEYS是有效的JSON格式');
}

// 导出配置
module.exports = {
    port: process.env.PORT || 3000,
    
    // 日志配置
    log: {
        level: process.env.LOG_LEVEL || 'INFO', // ERROR, WARN, INFO, DEBUG, TRACE
        format: process.env.LOG_FORMAT || 'colored', // colored, json, text
        toFile: process.env.LOG_TO_FILE === 'true' || false,
        maxSize: parseInt(process.env.LOG_MAX_SIZE || '10', 10) * 1024 * 1024, // 默认10MB
        maxFiles: parseInt(process.env.LOG_MAX_FILES || '10', 10) // 保留最近10个日志文件
    },

    // 合并API Keys设置
    apiKeys: {
        ...apiKeysConfig,
        ...Object.fromEntries(
            Object.entries(process.env)
                .filter(([key]) => key.startsWith('API_KEY_'))
                .map(([key, value]) => {
                    const apiKey = key.replace('API_KEY_', 'sk-');
                    try {
                        // 尝试解析JSON字符串，支持数组格式的cookie
                        const parsed = JSON.parse(value);
                        return [apiKey, parsed];
                    } catch (e) {
                        // 如果不是JSON，直接作为字符串处理
                        return [apiKey, value];
                    }
                })
        )
    },

    defaultRotationStrategy: process.env.ROTATION_STRATEGY || 'round-robin',
    
    // 添加代理配置
    proxy: {
        enabled: process.env.PROXY_ENABLED === 'true' || false,
        url: process.env.PROXY_URL || 'http://127.0.0.1:7890',
    },
    
    // GitHub相关配置
    github: {
        token: process.env.GITHUB_TOKEN,
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_REPO,
        workflowId: process.env.GITHUB_WORKFLOW_ID,
        triggerWorkflow: process.env.TRIGGER_WORKFLOW === 'true'
    },
    
    // 工作流参数
    workflowParams: {
        number: parseInt(process.env.REGISTER_NUMBER || '2', 10),
        maxWorkers: parseInt(process.env.REGISTER_MAX_WORKERS || '1', 10),
        emailServer: process.env.REGISTER_EMAIL_SERVER || 'TempEmail',
        ingestToOneapi: process.env.REGISTER_INGEST_TO_ONEAPI === 'true',
        uploadArtifact: process.env.REGISTER_UPLOAD_ARTIFACT === 'true',
        useConfigFile: process.env.REGISTER_USE_CONFIG_FILE !== 'false',
        emailConfigs: process.env.REGISTER_EMAIL_CONFIGS || '[]'
    },
    
    // 刷新配置
    refresh: {
        cron: process.env.REFRESH_CRON || '0 */6 * * *',
        minCookieCount: parseInt(process.env.MIN_COOKIE_COUNT || '2', 10),
        enabled: process.env.ENABLE_AUTO_REFRESH === 'true'
    }
};
