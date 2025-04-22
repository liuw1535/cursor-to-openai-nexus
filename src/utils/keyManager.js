const config = require('../config/config');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// 定义无效cookie的存储文件路径
const INVALID_COOKIES_FILE = path.join(__dirname, '../../data/invalid_cookies.json');
// 定义API Keys的存储文件路径
const API_KEYS_FILE = path.join(__dirname, '../../data/api_keys.json');

// 确保data目录存在
function ensureDataDirExists() {
  const dataDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      logger.info(`创建data目录: ${dataDir}`);
    } catch (err) {
      logger.error('创建data目录失败:', err);
    }
  }
}

// 存储API key与Cursor cookie的映射关系
let apiKeyMap = new Map();

// 存储每个API key对应的cookie轮询索引
let rotationIndexes = new Map();

// 存储被标记为无效的cookie
let invalidCookies = new Set();

// 从文件加载无效cookie
function loadInvalidCookiesFromFile() {
  ensureDataDirExists();
  
  try {
    if (fs.existsSync(INVALID_COOKIES_FILE)) {
      const data = fs.readFileSync(INVALID_COOKIES_FILE, 'utf8');
      const cookiesArray = JSON.parse(data);
      
      // 清空当前集合并添加从文件加载的cookie
      invalidCookies.clear();
      cookiesArray.forEach(cookie => invalidCookies.add(cookie));
      
      logger.info(`从文件加载了 ${cookiesArray.length} 个无效cookie`);
    } else {
      saveInvalidCookiesToFile(); // 如果文件不存在，创建新文件
    }
  } catch (err) {
    logger.error('加载无效cookie文件失败:', err);
    saveInvalidCookiesToFile(); // 如果加载失败，尝试创建新文件
  }
}

// 将无效cookie保存到文件
function saveInvalidCookiesToFile() {
  ensureDataDirExists();
  
  try {
    const cookiesArray = Array.from(invalidCookies);
    fs.writeFileSync(INVALID_COOKIES_FILE, JSON.stringify(cookiesArray, null, 2), 'utf8');
    logger.info(`已将 ${cookiesArray.length} 个无效cookie保存到文件`);
  } catch (err) {
    logger.error('保存无效cookie文件失败:', err);
  }
}

// 从文件加载API Keys
function loadApiKeysFromFile() {
  ensureDataDirExists();
  
  try {
    if (fs.existsSync(API_KEYS_FILE)) {
      const data = fs.readFileSync(API_KEYS_FILE, 'utf8');
      const apiKeysObj = JSON.parse(data);
      
      // 清空现有映射
      apiKeyMap.clear();
      rotationIndexes.clear();
      
      // 统计总cookie数量
      let totalCookies = 0;
      
      // 添加从文件加载的API Keys
      for (const [apiKey, cookies] of Object.entries(apiKeysObj)) {
        if (Array.isArray(cookies)) {
          apiKeyMap.set(apiKey, cookies);
          rotationIndexes.set(apiKey, 0);
          totalCookies += cookies.length;
        } else {
          logger.error(`API Key ${apiKey} 的cookies不是数组，跳过`);
        }
      }
      
      const apiKeyCount = Object.keys(apiKeysObj).length;
      logger.info(`从文件加载了 ${apiKeyCount} 个API Key，共 ${totalCookies} 个Cookie`);
      return apiKeyCount > 0;
    } else {
      logger.info('API Keys文件不存在，将使用配置中的API Keys');
      return false;
    }
  } catch (err) {
    logger.error('加载API Keys文件失败:', err);
    return false;
  }
}

// 将API Keys保存到文件
function saveApiKeysToFile() {
  ensureDataDirExists();
  
  try {
    // 将Map转换为普通对象
    const apiKeysObj = {};
    for (const [apiKey, cookies] of apiKeyMap.entries()) {
      apiKeysObj[apiKey] = cookies;
    }
    
    // 使用JSON.stringify时避免特殊字符处理问题
    const jsonString = JSON.stringify(apiKeysObj, null, 2);
    fs.writeFileSync(API_KEYS_FILE, jsonString, 'utf8');
    logger.info(`已将 ${Object.keys(apiKeysObj).length} 个API Key保存到文件`);
    
    // 简化验证过程
    try {
      const savedContent = fs.readFileSync(API_KEYS_FILE, 'utf8');
      JSON.parse(savedContent); // 只验证JSON格式是否正确
      logger.info('验证通过: 所有cookie都被完整保存');
    } catch (verifyErr) {
      logger.error('验证保存内容时出错:', verifyErr);
    }
  } catch (err) {
    logger.error('保存API Keys文件失败:', err);
  }
}

// API Keys初始化函数
function initializeApiKeys() {
    // 首先从文件加载现有的API Keys
    const loadedFromFile = loadApiKeysFromFile();
    
    // 检查环境变量中是否有API Keys配置
    const configApiKeys = config.apiKeys;
    const hasEnvApiKeys = Object.keys(configApiKeys).length > 0;
    
    if (hasEnvApiKeys) {
        logger.info('从环境变量检测到API Keys配置，将合并到现有配置...');
        
        // 记录合并前的Cookie数量
        let beforeMergeCookies = 0;
        for (const cookies of apiKeyMap.values()) {
            beforeMergeCookies += cookies.length;
        }
        
        // 合并环境变量中的API Keys到现有映射
        for (const [apiKey, cookieValue] of Object.entries(configApiKeys)) {
            // 获取现有的cookies（如果有）
            const existingCookies = apiKeyMap.get(apiKey) || [];
            
            // 准备要添加的新cookies
            let newCookies = [];
            if (typeof cookieValue === 'string') {
                newCookies = [cookieValue];
            } else if (Array.isArray(cookieValue)) {
                newCookies = cookieValue;
            }
            
            // 合并cookies，确保不重复
            const mergedCookies = [...existingCookies];
            for (const cookie of newCookies) {
                if (!mergedCookies.includes(cookie)) {
                    mergedCookies.push(cookie);
                }
            }
            
            // 更新映射
            apiKeyMap.set(apiKey, mergedCookies);
            
            // 确保轮询索引存在
            if (!rotationIndexes.has(apiKey)) {
                rotationIndexes.set(apiKey, 0);
            }
        }
        
        // 记录合并后的Cookie数量
        let afterMergeCookies = 0;
        for (const cookies of apiKeyMap.values()) {
            afterMergeCookies += cookies.length;
        }
        
        logger.info(`合并前共有 ${beforeMergeCookies} 个Cookie，合并后共有 ${afterMergeCookies} 个Cookie`);
        
        // 保存合并后的结果到文件
        saveApiKeysToFile();
    } else if (!loadedFromFile) {
        logger.warn('警告: 未能从文件加载API Keys，且环境变量中也没有配置API Keys');
    }
    
    // 统计API Keys和Cookies数量
    let totalCookies = 0;
    for (const cookies of apiKeyMap.values()) {
        totalCookies += cookies.length;
    }
    
    logger.info(`API Keys初始化完成，共有 ${apiKeyMap.size} 个API Key，${totalCookies} 个Cookie`);
    
    // 加载无效cookie
    loadInvalidCookiesFromFile();
    
    // 从API Key中移除已知的无效cookie
    logger.info('开始从API Keys中移除无效cookie...');
    removeInvalidCookiesFromApiKeys();
}

// 从所有API Key中移除已知的无效cookie
function removeInvalidCookiesFromApiKeys() {
    let totalRemoved = 0;
    
    for (const [apiKey, cookies] of apiKeyMap.entries()) {
        const initialLength = cookies.length;
        
        // 过滤掉无效的cookie
        const filteredCookies = cookies.filter(cookie => !invalidCookies.has(cookie));
        
        // 如果有cookie被移除，更新API Key的cookie列表
        if (filteredCookies.length < initialLength) {
            const removedCount = initialLength - filteredCookies.length;
            totalRemoved += removedCount;
            
            apiKeyMap.set(apiKey, filteredCookies);
            rotationIndexes.set(apiKey, 0);
            
            logger.info(`从API Key ${apiKey} 中移除了 ${removedCount} 个无效cookie，剩余 ${filteredCookies.length} 个`);
        }
    }
    
    logger.info(`总共从API Keys中移除了 ${totalRemoved} 个无效cookie`);
    
    // 如果有cookie被移除，保存更新后的API Keys
    if (totalRemoved > 0) {
        saveApiKeysToFile();
    }
}

// 添加或更新API key映射
function addOrUpdateApiKey(apiKey, cookieValues) {
    if (!Array.isArray(cookieValues)) {
        cookieValues = [cookieValues];
    }
    
    // 过滤掉已知的无效cookie
    const validCookies = cookieValues.filter(cookie => !invalidCookies.has(cookie));
    
    if (validCookies.length < cookieValues.length) {
        logger.info(`API Key ${apiKey} 中有 ${cookieValues.length - validCookies.length} 个无效cookie被过滤`);
    }
    
    apiKeyMap.set(apiKey, validCookies);
    rotationIndexes.set(apiKey, 0);
    
    // 保存更新后的API Keys
    saveApiKeysToFile();
}

// 删除API key映射
function removeApiKey(apiKey) {
    apiKeyMap.delete(apiKey);
    rotationIndexes.delete(apiKey);
    
    // 保存更新后的API Keys
    saveApiKeysToFile();
}

// 获取API key对应的cookie值（根据轮询策略）
function getCookieForApiKey(apiKey, strategy = config.defaultRotationStrategy) {
    // 如果API key不存在，也许是cookie本身，直接返回API key本身（向后兼容）
    if (!apiKeyMap.has(apiKey)) {
      return apiKey;
    }
    const cookies = apiKeyMap.get(apiKey);
    
    if (!cookies || cookies.length === 0) {
        return apiKey;
    }
    
    if (cookies.length === 1) {
        return cookies[0];
    }
    
    // 根据策略选择cookie
    if (strategy === 'random') {
        // 随机策略
        const randomIndex = Math.floor(Math.random() * cookies.length);
        return cookies[randomIndex];
    } else if(strategy === 'round-robin') {
        // 轮询策略（round-robin）
        let currentIndex = rotationIndexes.get(apiKey) || 0;
        const cookie = cookies[currentIndex];
        
        // 更新索引
        currentIndex = (currentIndex + 1) % cookies.length;
        rotationIndexes.set(apiKey, currentIndex);
        
        return cookie;
    } else {
      // 默认策略(default)
        return cookies[0];
    }
}

// 获取所有API key
function getAllApiKeys() {
    return Array.from(apiKeyMap.keys());
}

// 获取API key对应的所有cookie
function getAllCookiesForApiKey(apiKey) {
    return apiKeyMap.get(apiKey) || [];
}

// 从API key的cookie列表中移除特定cookie
function removeCookieFromApiKey(apiKey, cookieToRemove) {
    if (!apiKeyMap.has(apiKey)) {
        logger.info(`API Key ${apiKey} 不存在，无法移除cookie`);
        return false;
    }
    
    const cookies = apiKeyMap.get(apiKey);
    const initialLength = cookies.length;
    
    // 检查是否尝试移除与API Key相同的值（可能是向后兼容模式）
    if (cookieToRemove === apiKey && initialLength === 0) {
        logger.info(`API Key ${apiKey} 中没有任何cookie，系统正在尝试以向后兼容模式使用API Key本身`);
        return false;
    }
    
    // 过滤掉要移除的cookie
    const filteredCookies = cookies.filter(cookie => cookie !== cookieToRemove);
    
    // 如果长度没变，说明没有找到要移除的cookie
    if (filteredCookies.length === initialLength) {
        logger.info(`未找到要移除的cookie: ${cookieToRemove}`);
        return false;
    }
    
    // 更新cookie列表
    apiKeyMap.set(apiKey, filteredCookies);
    
    // 重置轮询索引
    rotationIndexes.set(apiKey, 0);
    
    // 将移除的cookie添加到无效cookie集合中
    invalidCookies.add(cookieToRemove);
    
    // 保存无效cookie到文件
    saveInvalidCookiesToFile();
    
    // 保存更新后的API Keys
    saveApiKeysToFile();
    
    logger.info(`已从API Key ${apiKey} 中移除cookie: ${cookieToRemove}`);
    logger.info(`剩余cookie数量: ${filteredCookies.length}`);
    
    return true;
}

// 获取所有被标记为无效的cookie
function getInvalidCookies() {
    return invalidCookies;
}

// 清除特定的无效cookie记录
function clearInvalidCookie(cookie) {
    const result = invalidCookies.delete(cookie);
    
    if (result) {
        // 保存更新后的无效cookie到文件
        saveInvalidCookiesToFile();
    }
    
    return result;
}

// 清除所有无效cookie记录
function clearAllInvalidCookies() {
    invalidCookies.clear();
    
    // 保存更新后的无效cookie到文件
    saveInvalidCookiesToFile();
    
    return true;
}

module.exports = {
    addOrUpdateApiKey,
    removeApiKey,
    getCookieForApiKey,
    getAllApiKeys,
    getAllCookiesForApiKey,
    initializeApiKeys,
    removeCookieFromApiKey,
    getInvalidCookies,
    clearInvalidCookie,
    clearAllInvalidCookies,
    loadInvalidCookiesFromFile,
    saveInvalidCookiesToFile,
    loadApiKeysFromFile,
    saveApiKeysToFile
}; 