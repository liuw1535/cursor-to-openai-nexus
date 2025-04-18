#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const dotenv = require('dotenv');

// 创建交互式命令行界面
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 配置模板
const ENV_TEMPLATE = `# 服务端口
PORT=3010

# 日志格式 (tiny, combined, common, dev, short)
MORGAN_FORMAT=tiny

# API Key与Cookie映射关系 (JSON格式)
# 格式: {"自定义API Key": "Cookie值"} 或 {"自定义API Key": ["Cookie值1", "Cookie值2"]}
API_KEYS={API_KEYS_PLACEHOLDER}

# 轮询策略 (random 或 round-robin 或 default)
ROTATION_STRATEGY=default

# Cursor校验和 (可选)
# x-cursor-checksum=xxxxxxxx 

# 自动刷新Cookie设置
# 是否启用自动刷新Cookie (true 或 false)
ENABLE_AUTO_REFRESH=false

# 自动刷新Cookie的定时规则 (Cron表达式)
# 默认每6小时执行一次
REFRESH_CRON=0 */6 * * *

# 每个API Key最小Cookie数量
# 当Cookie数量低于此值时，会自动尝试刷新
MIN_COOKIE_COUNT=1000

# Cookie刷新模式
# replace: 每次刷新都将现有cookie全部标记为无效并替换成新cookie（默认）
# append: 保留现有cookie，仅追加新cookie
COOKIE_REFRESH_MODE=replace

# GitHub 仓库信息
GITHUB_OWNER={GITHUB_OWNER_PLACEHOLDER}
GITHUB_REPO=Cursor-Register-fix

# GitHub Token (用于从GitHub Actions下载Artifact)
# 需要有repo权限
GITHUB_TOKEN={GITHUB_TOKEN_PLACEHOLDER}

# GitHub Actions 工作流ID
# 用于触发工作流程
GITHUB_WORKFLOW_ID=cursor_register.yml

# 是否自动触发工作流
# 设置为true时，会自动触发工作流而不是仅获取最新结果
TRIGGER_WORKFLOW=true

# 工作流参数设置 目前只支持gmail，outlook过于复杂，暂时不支持
# 注册账号数量
REGISTER_NUMBER=1
# 最大并发工作线程数
REGISTER_MAX_WORKERS=1
# 邮箱服务器类型 (TempEmail 或 IMAP)
REGISTER_EMAIL_SERVER=IMAP
# 是否将账号令牌注入到OneAPI (true 或 false)
REGISTER_INGEST_TO_ONEAPI=false
# 是否上传账号信息到Artifact (true 或 false)
REGISTER_UPLOAD_ARTIFACT=true
# 是否从config.yaml读取邮箱配置 (true 或 false)
REGISTER_USE_CONFIG_FILE=false
# 邮箱配置JSON字符串（仅在REGISTER_USE_CONFIG_FILE=false时有效）
# 格式例如[{"email":"example@gmail.com","imap_server":"imap.gmail.com","imap_port":993,"username":"example@gmail.com","password":"your_app_password"}]
REGISTER_EMAIL_CONFIGS={EMAIL_CONFIGS_PLACEHOLDER}
`;

// 提示信息
console.log('===== Cursor-To-OpenAI 环境配置助手 =====');
console.log('这个脚本将帮助你配置必要的环境变量\n');

// 应用密码说明
function printAppPasswordInstructions() {
  console.log('\n===== 如何创建谷歌应用密码 =====');
  console.log('1. 访问 https://myaccount.google.com/security');
  console.log('2. 在"登录Google"部分，点击"两步验证"');
  console.log('   (如果未启用两步验证，需要先启用)');
  console.log('3. 在页面底部找到"应用密码"，点击进入');
  console.log('4. 在"选择应用"下拉菜单中选择"其他(自定义名称)"');
  console.log('5. 输入一个名称，例如"Cursor注册"');
  console.log('6. 点击"生成"');
  console.log('7. 复制生成的16位应用密码（格式如：xxxx xxxx xxxx xxxx）');
  console.log('8. 在下面的提示中输入这个密码');
  console.log('注意: 应用密码只会显示一次，请务必保存好\n');
}

// 从现有.env文件加载配置
function loadExistingConfig() {
  const envPath = path.join(process.cwd(), '.env');
  let existingConfig = {
    apiKeys: {},
    githubOwner: '',
    githubToken: '',
    emailConfigs: [],
    cookieRefreshMode: 'append'
  };
  
  if (fs.existsSync(envPath)) {
    console.log('发现现有的.env配置文件，将加载现有设置作为默认值');
    console.log('提示: 直接按回车将保留现有设置不变\n');
    
    try {
      // 加载.env文件
      const envConfig = dotenv.parse(fs.readFileSync(envPath));
      
      // 提取API Keys
      if (envConfig.API_KEYS) {
        try {
          existingConfig.apiKeys = JSON.parse(envConfig.API_KEYS);
        } catch (e) {
          console.log('无法解析现有的API Keys配置，将使用默认设置');
        }
      }
      
      // 提取GitHub Owner
      if (envConfig.GITHUB_OWNER) {
        existingConfig.githubOwner = envConfig.GITHUB_OWNER;
      }
      
      // 提取GitHub Token
      if (envConfig.GITHUB_TOKEN) {
        existingConfig.githubToken = envConfig.GITHUB_TOKEN;
      }
      
      // 提取Email配置
      if (envConfig.REGISTER_EMAIL_CONFIGS) {
        try {
          existingConfig.emailConfigs = JSON.parse(envConfig.REGISTER_EMAIL_CONFIGS);
        } catch (e) {
          console.log('无法解析现有的Email配置，将使用默认设置');
        }
      }
      
      // 提取Cookie刷新模式
      if (envConfig.COOKIE_REFRESH_MODE) {
        existingConfig.cookieRefreshMode = envConfig.COOKIE_REFRESH_MODE;
      }
      
      console.log('成功加载现有配置');
    } catch (error) {
      console.error('加载现有配置时出错:', error.message);
      console.log('将使用默认设置');
    }
  } else {
    console.log('未找到现有的.env配置文件，将创建新的配置文件');
  }
  
  return existingConfig;
}

// 提示用户输入，带有默认值
function promptWithDefault(question, defaultValue) {
  return new Promise((resolve) => {
    const defaultText = defaultValue ? ` [${defaultValue}]` : '';
    rl.question(`${question}${defaultText}: `, (answer) => {
      // 如果用户只按了回车，使用默认值
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

// 收集配置信息
async function collectConfig() {
  // 加载现有配置
  const existingConfig = loadExistingConfig();
  
  const config = {
    apiKeys: {},
    githubOwner: '',
    githubToken: '',
    emailConfigs: [],
    cookieRefreshMode: 'replace'
  };

  // 获取GitHub用户名
  config.githubOwner = await promptWithDefault('请输入你的GitHub用户名', existingConfig.githubOwner);

  // 获取GitHub Token
  config.githubToken = await promptWithDefault('请输入你的GitHub Token (具有repo权限)', existingConfig.githubToken);

  // 处理API Keys
  const existingApiKeys = Object.keys(existingConfig.apiKeys);
  if (existingApiKeys.length > 0) {
    console.log('\n现有的API Keys:');
    existingApiKeys.forEach(key => console.log(`- ${key}`));
    
    const keepExistingApiKeys = await promptWithDefault('是否保留现有的API Keys? (y/n)', 'y');
    if (keepExistingApiKeys.toLowerCase() === 'y') {
      config.apiKeys = { ...existingConfig.apiKeys };
    }
  }

  // 询问是否添加新的API Key
  const addNewApiKey = await promptWithDefault('是否添加新的API Key? (y/n)', existingApiKeys.length === 0 ? 'y' : 'n');
  if (addNewApiKey.toLowerCase() === 'y') {
    const apiKey = await promptWithDefault('请输入自定义的API Key (不含sk-前缀，将自动添加)', '');
    if (apiKey) {
      const fullApiKey = apiKey.startsWith('sk-') ? apiKey : `sk-${apiKey}`;
      config.apiKeys[fullApiKey] = [];
    }
  }

  // 询问Cookie刷新模式
  const refreshModePrompt = `选择Cookie刷新模式 [append/replace]`;
  const defaultRefreshMode = existingConfig.cookieRefreshMode || 'replace';
  config.cookieRefreshMode = await promptWithDefault(refreshModePrompt, defaultRefreshMode);

  // 解释所选的刷新模式
  if (config.cookieRefreshMode.toLowerCase() === 'replace') {
    config.cookieRefreshMode = 'replace';
    console.log('已选择替换模式: 每次刷新都将现有cookie全部标记为无效并替换成新cookie');
  } else {
    config.cookieRefreshMode = 'append';
    console.log('已选择追加模式: 保留现有cookie，仅追加新cookie');
  }

  // 处理Email配置
  if (existingConfig.emailConfigs.length > 0) {
    console.log('\n现有的Gmail账号:');
    existingConfig.emailConfigs.forEach((emailConfig, index) => {
      console.log(`- ${index + 1}: ${emailConfig.email}`);
    });
    
    const keepExistingEmails = await promptWithDefault('是否保留现有的Gmail账号? (y/n)', 'y');
    if (keepExistingEmails.toLowerCase() === 'y') {
      config.emailConfigs = [...existingConfig.emailConfigs];
    }
  }

  // 询问是否添加新的Gmail账号
  const addNewGmail = await promptWithDefault('是否添加新的Gmail账号? (y/n)', existingConfig.emailConfigs.length === 0 ? 'y' : 'n');
  if (addNewGmail.toLowerCase() === 'y') {
    printAppPasswordInstructions();
    await askForGmailAccount(config);
  } else if (config.emailConfigs.length === 0 && existingConfig.emailConfigs.length === 0) {
    console.log('\n⚠️ 警告: 未添加Gmail账号，自动刷新功能可能无法正常工作');
    console.log('你可以稍后在.env文件中手动配置REGISTER_EMAIL_CONFIGS\n');
  }

  return config;
}

// 询问Gmail账号
async function askForGmailAccount(config) {
  const addGmail = await promptWithDefault('\n是否添加Gmail账号用于注册? (y/n)', 'y');
  
  if (addGmail.toLowerCase() === 'y') {
    const email = await promptWithDefault('请输入Gmail地址', '');
    const password = await promptWithDefault('请输入Gmail的应用密码 (不是邮箱密码)', '');
    
    if (email && password) {
      // 添加Email配置
      config.emailConfigs.push({
        email: email,
        imap_server: "imap.gmail.com",
        imap_port: 993,
        username: email,
        password: password
      });
    }
    
    const continueAnswer = await promptWithDefault('是否继续添加另一个Gmail账号? (y/n)', 'n');
    if (continueAnswer.toLowerCase() === 'y') {
      await askForGmailAccount(config);
    }
  }
  
  return config;
}

// 生成配置文件
function generateEnvFile(config) {
  try {
    // 准备API Keys
    const apiKeysJson = JSON.stringify(config.apiKeys);
    
    // 准备邮箱配置
    const emailConfigsJson = JSON.stringify(config.emailConfigs);
    
    // 替换模板中的占位符
    let envContent = ENV_TEMPLATE
      .replace('{API_KEYS_PLACEHOLDER}', apiKeysJson)
      .replace('{GITHUB_OWNER_PLACEHOLDER}', config.githubOwner)
      .replace('{GITHUB_TOKEN_PLACEHOLDER}', config.githubToken)
      .replace('{EMAIL_CONFIGS_PLACEHOLDER}', emailConfigsJson);
      
    // 更新Cookie刷新模式
    envContent = envContent.replace('COOKIE_REFRESH_MODE=append', `COOKIE_REFRESH_MODE=${config.cookieRefreshMode}`);
    
    // 写入.env文件
    const envPath = path.join(process.cwd(), '.env');
    
    // 检查是否存在备份文件
    const backupPath = path.join(process.cwd(), '.env.backup');
    if (fs.existsSync(envPath)) {
      // 创建备份
      fs.copyFileSync(envPath, backupPath);
      console.log(`\n✅ 已创建原配置文件备份: ${backupPath}`);
    }
    
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log(`\n✅ 配置文件已生成: ${envPath}`);
    
    // 检查data目录
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`✅ 创建数据目录: ${dataDir}`);
    }
    
    return true;
  } catch (error) {
    console.error('\n❌ 生成配置文件时出错:', error.message);
    return false;
  }
}

// 主函数
async function main() {
  try {
    const config = await collectConfig();
    
    if (generateEnvFile(config)) {
      console.log('\n===== 配置完成 =====');
      console.log('你可以使用以下命令启动服务:');
      console.log('  npm start');
      console.log('\n如需手动获取cookie执行:');
      console.log('  npm run refresh-cookies');
      
      // 根据配置的刷新模式提供提示
      console.log(`\n当前Cookie刷新模式为: ${config.cookieRefreshMode}`);
      if (config.cookieRefreshMode === 'replace') {
        console.log('每次刷新都会将现有cookie全部标记为无效并替换成新cookie');
      } else {
        console.log('刷新时会保留现有cookie，仅追加新cookie');
      }
      console.log('你可以在.env文件中修改COOKIE_REFRESH_MODE设置');
    }
  } catch (error) {
    console.error('\n❌ 配置过程中出错:', error.message);
  } finally {
    rl.close();
  }
}

// 运行主函数
main(); 