// 加载环境变量
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const keyManager = require('./src/utils/keyManager');
const logger = require('./src/utils/logger');

// 环境检查
const envChecker = require('./src/utils/envChecker');
logger.info('启动前检查环境配置...');
envChecker.enforceEnvCheck();

// 已适配GitHub Actions工作流新参数 (use_config_file, email_configs)
logger.info('环境检查通过，已适配最新GitHub Actions工作流参数');

const cookieRefresher = require('./src/utils/cookieRefresher');
const config = require('./src/config/config');

// 解析命令行参数
const args = process.argv.slice(2);
const targetApiKey = args.length > 0 ? args[0] : null;
const forceRefresh = args.includes('--force') || args.includes('-f');

// 最小 Cookie 数量
const MIN_COOKIE_COUNT = process.env.MIN_COOKIE_COUNT || 3;

// 获取Cookie刷新模式
const COOKIE_REFRESH_MODE = process.env.COOKIE_REFRESH_MODE || 'append';

// 主函数
async function main() {
  logger.info('===== 自动刷新 Cookie 开始 =====');
  logger.info(`最小 Cookie 数量: ${MIN_COOKIE_COUNT}`);
  logger.info(`Cookie 刷新模式: ${COOKIE_REFRESH_MODE} (${COOKIE_REFRESH_MODE === 'replace' ? '替换现有cookie' : '追加新cookie'})`);
  
  if (targetApiKey) {
    logger.info(`指定刷新 API Key: ${targetApiKey}`);
  }
  
  if (forceRefresh) {
    logger.info('强制刷新模式: 忽略 Cookie 数量检查');
  }
  
  try {
    // 获取所有 API Key
    const apiKeys = keyManager.getAllApiKeys();
    
    if (apiKeys.length === 0) {
      logger.warn('警告: 系统中没有找到任何 API Key');
      
      // 检查环境变量中是否有 API Keys
      const envApiKeys = Object.keys(config.apiKeys);
      if (envApiKeys.length > 0) {
        logger.info(`检测到环境变量中有 ${envApiKeys.length} 个 API Key，但尚未加载到系统中`);
        logger.info('正在重新初始化 API Keys...');
        
        // 重新初始化 API Keys
        keyManager.initializeApiKeys();
        
        // 重新获取 API Keys
        const refreshedApiKeys = keyManager.getAllApiKeys();
        if (refreshedApiKeys.length > 0) {
          logger.info(`成功加载 ${refreshedApiKeys.length} 个 API Key，继续刷新流程`);
          // 继续执行后续刷新逻辑
        } else {
          logger.warn('初始化后仍未找到 API Key，请检查配置');
          logger.info('===== 自动刷新 Cookie 结束 =====');
          return;
        }
      } else {
        logger.warn('环境变量中也没有配置 API Key，请先添加 API Key');
        logger.info('===== 自动刷新 Cookie 结束 =====');
        return;
      }
    }
    
    // 重新获取最新的 API Keys（可能已经通过上面的初始化更新了）
    const updatedApiKeys = keyManager.getAllApiKeys();
    logger.info(`系统中共有 ${updatedApiKeys.length} 个 API Key`);
    
    // 如果指定了特定的 API Key，检查它是否存在
    if (targetApiKey && !updatedApiKeys.includes(targetApiKey)) {
      logger.error(`错误: 指定的 API Key "${targetApiKey}" 不存在`);
      logger.info('===== 自动刷新 Cookie 异常结束 =====');
      return;
    }
    
    // 过滤需要处理的 API Keys
    const keysToProcess = targetApiKey ? [targetApiKey] : updatedApiKeys;
    
    // 按 Cookie 数量排序，优先处理 Cookie 数量少的 API Key
    const sortedKeys = keysToProcess.sort((a, b) => {
      const aCount = keyManager.getAllCookiesForApiKey(a).length;
      const bCount = keyManager.getAllCookiesForApiKey(b).length;
      return aCount - bCount; // 升序排列，Cookie 数量少的排在前面
    });
    
    // 检查每个 API Key 是否需要刷新
    let refreshedCount = 0;
    let needRefreshCount = 0;
    
    for (const apiKey of sortedKeys) {
      const cookies = keyManager.getAllCookiesForApiKey(apiKey);
      logger.info(`API Key: ${apiKey}, Cookie 数量: ${cookies.length}`);
      
      // 判断是否需要刷新：强制刷新模式或 Cookie 数量低于阈值
      if (forceRefresh || cookies.length < MIN_COOKIE_COUNT) {
        needRefreshCount++;
        if (forceRefresh) {
          logger.info(`强制刷新 API Key: ${apiKey}`);
        } else {
          logger.info(`API Key ${apiKey} 的 Cookie 数量不足，需要刷新`);
        }
        
        // 执行刷新
        logger.info(`开始自动刷新 Cookie，目标 API Key: ${apiKey}，最小 Cookie 数量: ${MIN_COOKIE_COUNT}，刷新模式: ${COOKIE_REFRESH_MODE}`);
        const result = await cookieRefresher.autoRefreshCookies(apiKey, MIN_COOKIE_COUNT);
        
        if (result.success) {
          refreshedCount++;
          logger.info(`刷新结果: ${result.message}`);
          
          // 根据刷新模式输出额外的信息
          if (COOKIE_REFRESH_MODE === 'replace') {
            logger.info(`使用替换模式: 现有cookie已全部标记为无效，系统现在只使用新cookie`);
          } else {
            logger.info(`使用追加模式: 现有cookie已保留，新cookie已添加到系统`);
          }
        } else {
          logger.error(`刷新失败: ${result.message}`);
        }
      } else {
        logger.info(`API Key ${apiKey} 的 Cookie 数量足够，不需要刷新`);
      }
    }
    
    logger.info('===== 自动刷新 Cookie 完成 =====');
    logger.info(`共有 ${needRefreshCount} 个 API Key 需要刷新，成功刷新 ${refreshedCount} 个`);
  } catch (error) {
    logger.error('自动刷新 Cookie 失败:', error);
    logger.info('===== 自动刷新 Cookie 异常结束 =====');
  }
}

// 执行主函数
main().catch(err => logger.error(err)); 