const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { Octokit } = require('@octokit/rest');
const keyManager = require('./keyManager');
const config = require('../config/config');
const { extractCookiesFromCsv } = require('./extractCookieFromCsv');

// GitHub 仓库信息从环境变量中获取
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'liuw1535';
const GITHUB_REPO = process.env.GITHUB_REPO || 'Cursor-Register';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // 需要在环境变量中设置
const GITHUB_WORKFLOW_ID = process.env.GITHUB_WORKFLOW_ID || 'register.yml';
const TRIGGER_WORKFLOW = process.env.TRIGGER_WORKFLOW === 'true';

// 下载目录
const DOWNLOAD_DIR = path.join(__dirname, '../../downloads');
const EXTRACT_DIR = path.join(__dirname, '../../extracted');

// 确保目录存在
function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`创建目录成功: ${dir}`);
    } catch (err) {
      console.error(`创建目录失败: ${dir}`, err);
      throw err;
    }
  }
}

// 触发 GitHub Actions 工作流
async function triggerWorkflow() {
  try {
    if (!GITHUB_TOKEN) {
      console.error('未设置 GITHUB_TOKEN，无法触发工作流');
      return null;
    }

    console.log(`正在触发 GitHub Actions 工作流: ${GITHUB_WORKFLOW_ID}...`);
    const octokit = new Octokit({
      auth: GITHUB_TOKEN
    });

    // 从环境变量获取工作流参数
    const number = process.env.REGISTER_NUMBER || '2';
    const maxWorkers = process.env.REGISTER_MAX_WORKERS || '1';
    const emailServer = process.env.REGISTER_EMAIL_SERVER || 'TempEmail';
    const ingestToOneapi = process.env.REGISTER_INGEST_TO_ONEAPI === 'true';
    const uploadArtifact = process.env.REGISTER_UPLOAD_ARTIFACT !== 'false'; // 默认为true
    const useConfigFile = process.env.REGISTER_USE_CONFIG_FILE !== 'false'; // 默认为true
    const emailConfigs = process.env.REGISTER_EMAIL_CONFIGS || '[]';

    console.log(`工作流参数: number=${number}, maxWorkers=${maxWorkers}, emailServer=${emailServer}, ingestToOneapi=${ingestToOneapi}, uploadArtifact=${uploadArtifact}, useConfigFile=${useConfigFile}`);

    // 获取触发前的最新工作流ID，用于后续识别新触发的工作流
    const { data: beforeWorkflowRuns } = await octokit.actions.listWorkflowRuns({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      workflow_id: GITHUB_WORKFLOW_ID,
      per_page: 1
    });
    
    const latestWorkflowIdBefore = beforeWorkflowRuns.workflow_runs && beforeWorkflowRuns.workflow_runs.length > 0 
      ? beforeWorkflowRuns.workflow_runs[0].id 
      : 0;
    
    console.log(`触发前最新工作流ID: ${latestWorkflowIdBefore}`);

    // 触发工作流
    const response = await octokit.actions.createWorkflowDispatch({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      workflow_id: GITHUB_WORKFLOW_ID,
      ref: 'main', // 默认使用 main 分支，可以根据需要修改
      inputs: {
        number: number,
        max_workers: maxWorkers,
        email_server: emailServer,
        ingest_to_oneapi: ingestToOneapi.toString(),
        upload_artifact: uploadArtifact.toString(),
        use_config_file: useConfigFile.toString(),
        email_configs: emailConfigs
      }
    });

    console.log('工作流触发成功，等待工作流开始运行...');
    
    // 等待新工作流出现并获取其ID
    let newWorkflowRunId = null;
    let findAttempts = 0;
    const maxFindAttempts = 30; // 最多等待30次，每次5秒
    
    while (findAttempts < maxFindAttempts && !newWorkflowRunId) {
      findAttempts++;
      console.log(`查找新触发的工作流，尝试 ${findAttempts}/${maxFindAttempts}...`);
      
      try {
        const { data: afterWorkflowRuns } = await octokit.actions.listWorkflowRuns({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          workflow_id: GITHUB_WORKFLOW_ID,
          per_page: 5
        });
        
        if (afterWorkflowRuns.workflow_runs && afterWorkflowRuns.workflow_runs.length > 0) {
          // 查找ID大于之前最新工作流ID的工作流（即新触发的工作流）
          const newWorkflow = afterWorkflowRuns.workflow_runs.find(run => run.id > latestWorkflowIdBefore);
          if (newWorkflow) {
            newWorkflowRunId = newWorkflow.id;
            console.log(`找到新触发的工作流，ID: ${newWorkflowRunId}, 状态: ${newWorkflow.status}`);
          }
        }
      } catch (error) {
        console.error(`查找工作流时出错 (尝试 ${findAttempts}/${maxFindAttempts}): ${error.message}`);
        // 出错时继续尝试，不中断循环
      }
      
      if (!newWorkflowRunId) {
        // 等待5秒后再次检查
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    if (!newWorkflowRunId) {
      console.log('未能找到新触发的工作流，可能触发失败');
      return null;
    }
    
    // 等待工作流完成
    let attempts = 0;
    const maxAttempts = 120; // 最多等待120次，每次30秒，总共60分钟
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5; // 最多允许连续5次错误
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`等待工作流完成，尝试 ${attempts}/${maxAttempts}...`);
      
      try {
        // 获取工作流状态
        const { data: workflowRun } = await octokit.actions.getWorkflowRun({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          run_id: newWorkflowRunId
        });
        
        // 重置连续错误计数
        consecutiveErrors = 0;
        
        console.log(`工作流状态: ${workflowRun.status}, 结果: ${workflowRun.conclusion || '进行中'}`);
        
        // 检查工作流是否完成
        if (workflowRun.status === 'completed') {
          if (workflowRun.conclusion === 'success') {
            console.log(`工作流运行成功，ID: ${newWorkflowRunId}`);
            return workflowRun;
          } else {
            console.log(`工作流运行失败，结果: ${workflowRun.conclusion}`);
            return null;
          }
        }
      } catch (error) {
        consecutiveErrors++;
        console.error(`获取工作流状态时出错 (尝试 ${attempts}/${maxAttempts}, 连续错误 ${consecutiveErrors}/${maxConsecutiveErrors}): ${error.message}`);
        
        // 如果连续错误次数超过阈值，则放弃
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(`连续错误次数超过阈值 (${maxConsecutiveErrors})，放弃等待`);
          throw new Error(`连续 ${maxConsecutiveErrors} 次获取工作流状态失败: ${error.message}`);
        }
        
        // 错误后等待时间稍微延长
        await new Promise(resolve => setTimeout(resolve, 10000));
        // 继续循环，不中断
        continue;
      }
      
      // 等待30秒后再次检查
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    console.log('等待工作流完成超时');
    return null;
  } catch (error) {
    console.error('触发工作流失败:', error);
    throw error; // 重新抛出错误，让调用者处理
  }
}

// 从 GitHub Actions 获取最新的 Artifact
async function getLatestArtifact() {
  try {
    console.log('正在连接 GitHub API...');
    const octokit = new Octokit({
      auth: GITHUB_TOKEN
    });

    // 如果配置了自动触发工作流，则先触发工作流
    let workflowRun = null;
    if (TRIGGER_WORKFLOW) {
      console.log('配置了自动触发工作流，正在触发...');
      try {
        workflowRun = await triggerWorkflow();
      } catch (error) {
        console.error('触发工作流过程中出现错误:', error.message);
        console.log('尝试继续使用已找到的工作流ID...');
        
        // 尝试获取最新的工作流，看是否有正在运行的工作流
        const { data: runningWorkflows } = await octokit.actions.listWorkflowRuns({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          workflow_id: GITHUB_WORKFLOW_ID,
          status: 'in_progress',
          per_page: 5
        });
        
        if (runningWorkflows.workflow_runs && runningWorkflows.workflow_runs.length > 0) {
          // 找到正在运行的工作流
          const runningWorkflow = runningWorkflows.workflow_runs[0];
          console.log(`找到正在运行的工作流，ID: ${runningWorkflow.id}, 状态: ${runningWorkflow.status}`);
          
          // 等待工作流完成
          let attempts = 0;
          const maxAttempts = 120; // 最多等待120次，每次30秒，总共60分钟
          let consecutiveErrors = 0;
          const maxConsecutiveErrors = 5; // 最多允许连续5次错误
          
          while (attempts < maxAttempts) {
            attempts++;
            console.log(`等待工作流完成，尝试 ${attempts}/${maxAttempts}...`);
            
            try {
              // 获取工作流状态
              const { data: currentWorkflow } = await octokit.actions.getWorkflowRun({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
                run_id: runningWorkflow.id
              });
              
              // 重置连续错误计数
              consecutiveErrors = 0;
              
              console.log(`工作流状态: ${currentWorkflow.status}, 结果: ${currentWorkflow.conclusion || '进行中'}`);
              
              // 检查工作流是否完成
              if (currentWorkflow.status === 'completed') {
                if (currentWorkflow.conclusion === 'success') {
                  console.log(`工作流运行成功，ID: ${currentWorkflow.id}`);
                  workflowRun = currentWorkflow;
                  break;
                } else {
                  console.log(`工作流运行失败，结果: ${currentWorkflow.conclusion}`);
                  break;
                }
              }
            } catch (err) {
              consecutiveErrors++;
              console.error(`获取工作流状态时出错 (尝试 ${attempts}/${maxAttempts}, 连续错误 ${consecutiveErrors}/${maxConsecutiveErrors}): ${err.message}`);
              
              // 如果连续错误次数超过阈值，则放弃
              if (consecutiveErrors >= maxConsecutiveErrors) {
                console.error(`连续错误次数超过阈值 (${maxConsecutiveErrors})，放弃等待`);
                break;
              }
              
              // 错误后等待时间稍微延长
              await new Promise(resolve => setTimeout(resolve, 10000));
              // 继续循环，不中断
              continue;
            }
            
            // 等待30秒后再次检查
            await new Promise(resolve => setTimeout(resolve, 30000));
          }
        }
      }
      
      if (!workflowRun) {
        console.log('触发工作流失败或等待超时，尝试获取最新的工作流运行');
      }
    }

    // 如果没有触发工作流或触发失败，则获取最新的工作流运行
    if (!workflowRun) {
      console.log('获取最新的工作流运行...');
      const { data: workflowRuns } = await octokit.actions.listWorkflowRunsForRepo({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        status: 'success',
        per_page: 5
      });

      if (!workflowRuns.workflow_runs || workflowRuns.workflow_runs.length === 0) {
        console.log('没有找到成功的工作流运行');
        return null;
      }

      // 获取最新成功运行的 Artifacts
      workflowRun = workflowRuns.workflow_runs[0];
    }
    
    console.log(`找到最新的工作流运行: ${workflowRun.id}`);

    // 等待一段时间，确保Artifact已经上传完成
    console.log('等待Artifact上传完成...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 获取工作流的Artifacts
    let artifacts = null;
    let artifactAttempts = 0;
    const maxArtifactAttempts = 10; // 最多尝试10次，每次10秒
    
    while (artifactAttempts < maxArtifactAttempts && (!artifacts || !artifacts.artifacts || artifacts.artifacts.length === 0)) {
      artifactAttempts++;
      console.log(`尝试获取Artifacts，尝试 ${artifactAttempts}/${maxArtifactAttempts}...`);
      
      try {
        const response = await octokit.actions.listWorkflowRunArtifacts({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          run_id: workflowRun.id
        });
        
        artifacts = response.data;
      } catch (error) {
        console.error(`获取Artifacts时出错 (尝试 ${artifactAttempts}/${maxArtifactAttempts}): ${error.message}`);
        // 出错时继续尝试，不中断循环
      }
      
      if (!artifacts || !artifacts.artifacts || artifacts.artifacts.length === 0) {
        console.log('暂时没有找到Artifacts，等待10秒后重试...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    if (!artifacts || !artifacts.artifacts || artifacts.artifacts.length === 0) {
      console.log('没有找到Artifacts，可能工作流没有生成Artifact');
      return null;
    }

    console.log(`找到 ${artifacts.artifacts.length} 个Artifacts`);

    // 查找 Account info Artifact
    const accountInfoArtifact = artifacts.artifacts.find(artifact => 
      artifact.name.toLowerCase().includes('account info'));

    if (!accountInfoArtifact) {
      console.log('没有找到 Account info Artifact');
      return null;
    }

    console.log(`找到 Account info Artifact: ${accountInfoArtifact.id}`);
    return accountInfoArtifact;
  } catch (error) {
    console.error('获取 Artifact 失败:', error);
    return null;
  }
}

// 下载 Artifact
async function downloadArtifact(artifact) {
  let downloadAttempts = 0;
  const maxDownloadAttempts = 5; // 最多尝试5次下载
  
  while (downloadAttempts < maxDownloadAttempts) {
    downloadAttempts++;
    try {
      console.log(`开始下载 Artifact: ${artifact.id}... (尝试 ${downloadAttempts}/${maxDownloadAttempts})`);
      ensureDirectoryExists(DOWNLOAD_DIR);

      const octokit = new Octokit({
        auth: GITHUB_TOKEN
      });

      // 获取下载 URL
      const { url } = await octokit.actions.downloadArtifact({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        artifact_id: artifact.id,
        archive_format: 'zip'
      });

      // 下载 zip 文件
      const zipFilePath = path.join(DOWNLOAD_DIR, `${artifact.id}.zip`);
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'arraybuffer',
        timeout: 60000 // 设置60秒超时
      });

      fs.writeFileSync(zipFilePath, response.data);
      console.log(`Artifact 下载完成: ${zipFilePath}`);
      return zipFilePath;
    } catch (error) {
      console.error(`下载 Artifact 失败 (尝试 ${downloadAttempts}/${maxDownloadAttempts}): ${error.message}`);
      
      if (downloadAttempts >= maxDownloadAttempts) {
        console.error('达到最大尝试次数，放弃下载');
        return null;
      }
      
      // 等待一段时间后重试
      const retryDelay = 10000; // 10秒
      console.log(`等待 ${retryDelay/1000} 秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  return null;
}

// 解压 Artifact
async function extractArtifact(zipFilePath) {
  let extractAttempts = 0;
  const maxExtractAttempts = 3; // 最多尝试3次解压
  
  while (extractAttempts < maxExtractAttempts) {
    extractAttempts++;
    try {
      console.log(`开始解压 Artifact: ${zipFilePath}... (尝试 ${extractAttempts}/${maxExtractAttempts})`);
      ensureDirectoryExists(EXTRACT_DIR);

      const zip = new AdmZip(zipFilePath);
      zip.extractAllTo(EXTRACT_DIR, true);
      console.log(`Artifact 解压完成: ${EXTRACT_DIR}`);

      // 查找 token CSV 文件
      const files = fs.readdirSync(EXTRACT_DIR);
      const tokenFile = files.find(file => file.startsWith('token_') && file.endsWith('.csv'));

      if (!tokenFile) {
        console.log('没有找到 token CSV 文件');
        
        if (extractAttempts >= maxExtractAttempts) {
          return null;
        }
        
        // 等待一段时间后重试
        const retryDelay = 5000; // 5秒
        console.log(`等待 ${retryDelay/1000} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }

      console.log(`找到 token CSV 文件: ${tokenFile}`);
      return path.join(EXTRACT_DIR, tokenFile);
    } catch (error) {
      console.error(`解压 Artifact 失败 (尝试 ${extractAttempts}/${maxExtractAttempts}): ${error.message}`);
      
      if (extractAttempts >= maxExtractAttempts) {
        console.error('达到最大尝试次数，放弃解压');
        return null;
      }
      
      // 等待一段时间后重试
      const retryDelay = 5000; // 5秒
      console.log(`等待 ${retryDelay/1000} 秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  return null;
}

/**
 * 从CSV文件中提取cookies
 * @param {string} csvFilePath - CSV文件路径
 * @returns {Promise<string[]>} - 提取到的cookie数组
 */
async function extractCookiesFromCsvFile(csvFilePath) {
  const maxExtractAttempts = 3;
  let attempt = 1;
  
  while (attempt <= maxExtractAttempts) {
    console.log(`尝试从CSV文件提取cookies (尝试 ${attempt}/${maxExtractAttempts})...`);
    
    try {
      // 读取文件内容
      if (!fs.existsSync(csvFilePath)) {
        console.error(`CSV文件不存在: ${csvFilePath}`);
        return [];
      }
      
      // 读取文件内容并处理可能的换行符
      let fileContent = fs.readFileSync(csvFilePath, 'utf8');
      fileContent = fileContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      
      // 首先尝试直接从文件内容中提取所有可能的cookie
      const cookies = [];
      
      // 1. 检查是否有JWT格式的token (新格式)
      const jwtRegex = /ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
      const jwtMatches = fileContent.match(jwtRegex);
      
      if (jwtMatches && jwtMatches.length > 0) {
        console.log(`直接从文件内容中提取到 ${jwtMatches.length} 个JWT token格式的Cookie`);
        jwtMatches.forEach(match => {
          if (!cookies.includes(match)) {
            cookies.push(match);
          }
        });
      }
      
      // 2. 检查是否有旧格式的cookie
      if (fileContent.includes('user_')) {
        console.log('文件包含旧格式cookie标识"user_"');
        
        // 使用旧的提取函数尝试提取
        try {
          const oldFormatCookies = await extractCookiesFromCsv(csvFilePath);
          if (oldFormatCookies && oldFormatCookies.length > 0) {
            console.log(`通过提取模块获取到 ${oldFormatCookies.length} 个cookie`);
            oldFormatCookies.forEach(cookie => {
              if (!cookies.includes(cookie)) {
                cookies.push(cookie);
              }
            });
          }
        } catch (e) {
          console.warn('通过提取模块获取cookie失败:', e.message);
        }
      }
      
      // 3. 如果找到了cookie，返回结果
      if (cookies.length > 0) {
        const newFormatCount = cookies.filter(c => c.startsWith('ey')).length;
        const oldFormatCount = cookies.filter(c => c.includes('%3A%3A')).length;
        
        console.log(`总共找到 ${cookies.length} 个cookie`);
        console.log(`新格式cookie(ey开头): ${newFormatCount}个`);
        console.log(`旧格式cookie(包含%3A%3A): ${oldFormatCount}个`);
        console.log(`其他格式cookie: ${cookies.length - newFormatCount - oldFormatCount}个`);
        
        return cookies;
      }
      
      console.warn(`未能从文件中提取到任何cookie (尝试 ${attempt}/${maxExtractAttempts})`);
    } catch (error) {
      console.error(`从CSV文件提取cookies时出错 (尝试 ${attempt}/${maxExtractAttempts}):`, error);
    }
    
    attempt++;
    if (attempt <= maxExtractAttempts) {
      console.log(`等待5秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.error(`在 ${maxExtractAttempts} 次尝试后未能从CSV文件提取到cookies`);
  return [];
}

// 将新的有效cookie添加到系统中
function addNewCookiesToSystem(apiKey, newCookies) {
  try {
    console.log(`准备添加 ${newCookies.length} 个新cookie到系统中`);
    
    // 获取当前的cookies
    const currentCookies = keyManager.getAllCookiesForApiKey(apiKey) || [];
    console.log(`当前API密钥 ${apiKey} 有 ${currentCookies.length} 个cookies`);
    
    // 获取无效的cookies
    const invalidCookies = keyManager.getInvalidCookies() || [];
    console.log(`系统中有 ${invalidCookies.length || 0} 个无效cookies`);
    
    // 过滤出新的有效cookie
    let newValidCookies = [];
    
    // 检查invalidCookies的类型并相应处理
    if (invalidCookies instanceof Set) {
      newValidCookies = newCookies.filter(cookie => 
        !currentCookies.includes(cookie) && !invalidCookies.has(cookie)
      );
    } else if (Array.isArray(invalidCookies)) {
      newValidCookies = newCookies.filter(cookie => 
        !currentCookies.includes(cookie) && !invalidCookies.includes(cookie)
      );
    } else if (invalidCookies && typeof invalidCookies === 'object') {
      // 如果是普通对象，检查cookie是否作为键存在
      newValidCookies = newCookies.filter(cookie => 
        !currentCookies.includes(cookie) && !(cookie in invalidCookies)
      );
    } else {
      // 如果invalidCookies不是预期的类型，只过滤当前cookies
      newValidCookies = newCookies.filter(cookie => !currentCookies.includes(cookie));
    }
    
    console.log(`过滤后有 ${newValidCookies.length} 个新的有效cookies`);
    
    // 验证cookie是否完整
    const validatedCookies = newValidCookies.filter(cookie => {
      // 检查是否是新格式的JWT token (ey开头)
      if (cookie.startsWith('ey') && cookie.includes('.')) {
        const parts = cookie.split('.');
        // 检查JWT是否包含三个部分
        if (parts.length !== 3) {
          console.warn(`跳过不完整的JWT cookie (新格式): ${cookie}`);
          return false;
        }
        return true;
      }
      // 检查旧格式cookie是否包含JWT的三个部分
      else if (cookie.includes('%3A%3A')) {
        const parts = cookie.split('%3A%3A');
        if (parts.length === 2) {
          const jwt = parts[1];
          // 检查JWT是否包含点（表示JWT的三个部分）
          if (!jwt.includes('.') || jwt.split('.').length !== 3) {
            console.warn(`跳过不完整的cookie (旧格式): ${cookie}`);
            return false;
          }
        }
      }
      return true;
    });
    
    console.log(`验证完整性后有 ${validatedCookies.length} 个有效cookies`);
    
    if (validatedCookies.length > 0) {
      // 添加新的有效cookie到系统
      keyManager.addOrUpdateApiKey(apiKey, [...currentCookies, ...validatedCookies]);
      console.log(`成功添加 ${validatedCookies.length} 个新cookie到API密钥 ${apiKey}`);
      return validatedCookies.length; // 返回添加的cookie数量
    } else {
      console.log(`没有新的有效cookie需要添加到API密钥 ${apiKey}`);
      return 0; // 没有添加cookie，返回0
    }
  } catch (error) {
    console.error('添加新cookie到系统时出错:', error);
    return 0; // 出错时返回0
  }
}

// 清理临时文件
function cleanupTempFiles() {
  try {
    console.log('开始清理临时文件...');
    
    // 清理下载目录
    if (fs.existsSync(DOWNLOAD_DIR)) {
      fs.readdirSync(DOWNLOAD_DIR).forEach(file => {
        fs.unlinkSync(path.join(DOWNLOAD_DIR, file));
      });
    }
    
    // 清理解压目录
    if (fs.existsSync(EXTRACT_DIR)) {
      fs.readdirSync(EXTRACT_DIR).forEach(file => {
        fs.unlinkSync(path.join(EXTRACT_DIR, file));
      });
    }
    
    console.log('临时文件清理完成');
  } catch (error) {
    console.error('清理临时文件失败:', error);
  }
}

// 检查 API Key 是否需要补充 Cookie
function checkApiKeyNeedRefresh(apiKey, minCookieCount = config.refresh.minCookieCount) {
  const cookies = keyManager.getAllCookiesForApiKey(apiKey);
  return cookies.length < minCookieCount;
}

// 将现有cookie全部设为无效并从API Key中移除
function markExistingCookiesAsInvalid(apiKey) {
  try {
    // 获取当前API Key的所有cookie
    const currentCookies = keyManager.getAllCookiesForApiKey(apiKey) || [];
    console.log(`正在将API Key ${apiKey} 的 ${currentCookies.length} 个现有cookie标记为无效...`);
    
    // 如果没有cookie，直接返回
    if (currentCookies.length === 0) {
      console.log(`API Key ${apiKey} 没有现有cookie，无需标记为无效`);
      return 0;
    }
    
    // 获取无效cookie列表
    const invalidCookies = keyManager.getInvalidCookies();
    let markedCount = 0;
    
    // 遍历cookie并添加到无效列表
    for (const cookie of currentCookies) {
      // 将cookie添加到无效集合中
      if (invalidCookies instanceof Set) {
        invalidCookies.add(cookie);
      }
      markedCount++;
    }
    
    // 保存无效cookie到文件
    keyManager.saveInvalidCookiesToFile();
    
    // 清空当前API Key的cookie列表
    keyManager.addOrUpdateApiKey(apiKey, []);
    
    // 保存更新后的API Keys
    keyManager.saveApiKeysToFile();
    
    console.log(`已将API Key ${apiKey} 的 ${markedCount} 个cookie标记为无效并从API Key中移除`);
    return markedCount;
  } catch (error) {
    console.error(`标记现有cookie为无效时出错:`, error);
    return 0;
  }
}

// 主函数：自动刷新 Cookie
async function autoRefreshCookies(apiKey, minCookieCount = config.refresh.minCookieCount) {
  console.log(`开始自动刷新 Cookie，目标 API Key: ${apiKey}，最小 Cookie 数量: ${minCookieCount}`);
  
  try {
    // 检查是否需要刷新
    if (!checkApiKeyNeedRefresh(apiKey, minCookieCount)) {
      console.log(`API Key ${apiKey} 的 Cookie 数量足够，不需要刷新`);
      return {
        success: true,
        message: '当前 Cookie 数量足够，不需要刷新',
        refreshed: 0
      };
    }
    
    // 获取最新的 Artifact
    const artifact = await getLatestArtifact();
    if (!artifact) {
      return {
        success: false,
        message: '获取 Artifact 失败',
        refreshed: 0
      };
    }
    
    // 下载 Artifact
    const zipFilePath = await downloadArtifact(artifact);
    if (!zipFilePath) {
      return {
        success: false,
        message: '下载 Artifact 失败',
        refreshed: 0
      };
    }
    
    // 解压 Artifact
    const csvFilePath = await extractArtifact(zipFilePath);
    if (!csvFilePath) {
      return {
        success: false,
        message: '解压 Artifact 失败',
        refreshed: 0
      };
    }
    
    // 提取 Cookie
    const cookies = await extractCookiesFromCsvFile(csvFilePath);
    if (cookies.length === 0) {
      return {
        success: false,
        message: '没有找到有效的 Cookie',
        refreshed: 0
      };
    }
    
    // 分析提取到的cookie格式
    const newFormatCookies = cookies.filter(cookie => cookie.startsWith('ey'));
    const oldFormatCookies = cookies.filter(cookie => cookie.includes('%3A%3A'));
    console.log(`提取到 ${newFormatCookies.length} 个新格式cookie(ey开头)`);
    console.log(`提取到 ${oldFormatCookies.length} 个旧格式cookie(包含%3A%3A)`);
    
    // 根据配置决定是否将现有cookie标记为无效
    const refreshMode = process.env.COOKIE_REFRESH_MODE || 'append';
    
    if (refreshMode === 'replace') {
      // 将现有cookie标记为无效并从API Key中移除
      console.log('使用替换模式: 将现有cookie标记为无效');
      markExistingCookiesAsInvalid(apiKey);
    } else {
      console.log('使用追加模式: 保留现有cookie，只添加新cookie');
    }
    
    // 添加新的 Cookie 到系统
    const addedCount = addNewCookiesToSystem(apiKey, cookies);
    
    // 清理临时文件
    cleanupTempFiles();
    
    return {
      success: true,
      message: `成功添加 ${addedCount} 个新 Cookie (新格式: ${newFormatCookies.length}, 旧格式: ${oldFormatCookies.length})`,
      refreshed: addedCount
    };
  } catch (error) {
    console.error('自动刷新 Cookie 失败:', error);
    return {
      success: false,
      message: `刷新失败: ${error.message}`,
      refreshed: 0
    };
  }
}

module.exports = {
  autoRefreshCookies,
  checkApiKeyNeedRefresh,
  getLatestArtifact,
  downloadArtifact,
  extractArtifact,
  extractCookiesFromCsvFile,
  addNewCookiesToSystem,
  cleanupTempFiles,
  triggerWorkflow,
  markExistingCookiesAsInvalid
}; 