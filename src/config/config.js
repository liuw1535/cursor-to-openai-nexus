// 读取并解析API_KEYS环境变量
// 解析API Keys配置
let apiKeysConfig = {};
try {
    if (process.env.API_KEYS) {
        // 解析API Keys字符串为对象
        apiKeysConfig = JSON.parse(process.env.API_KEYS);
        console.log('正在从环境变量加载API Keys...');
        console.log(`成功解析API Keys，包含 ${Object.keys(apiKeysConfig).length} 个键`);
    } else {
        console.log('警告: 环境变量API_KEYS未设置，系统将无法正常工作');
    }
} catch (error) {
    console.error('解析API_KEYS环境变量失败:', error.message);
    console.error('请确保API_KEYS是有效的JSON格式');
}

// 导出配置
module.exports = {
    port: process.env.PORT || 3010,
    apiKeys: apiKeysConfig,
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
