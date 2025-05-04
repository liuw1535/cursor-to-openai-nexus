const express = require('express');
const router = express.Router();
const { fetch, ProxyAgent, Agent } = require('undici');

const $root = require('../proto/message.js');
const { v4: uuidv4, v5: uuidv5 } = require('uuid');
const { generateCursorBody, chunkToUtf8String, generateHashed64Hex, generateCursorChecksum } = require('../utils/utils.js');
const keyManager = require('../utils/keyManager.js');
const { spawn } = require('child_process');
const path = require('path');
const admin = require('../models/admin');
const config = require('../config/config');
const crypto = require('crypto');
const logger = require('../utils/logger');

// 存储刷新状态的变量
let refreshStatus = {
  isRunning: false,
  status: 'idle', // idle, running, completed, failed
  message: '',
  startTime: null,
  endTime: null,
  error: null
};

// 储存当前正在处理的Cookie获取请求
const pendingCookieRequests = new Map();

// 检查是否已有管理员账号
router.get('/admin/check', (req, res) => {
  try {
    return res.json({
      success: true,
      exists: admin.hasAdmin()
    });
  } catch (error) {
    logger.error('检查管理员账号失败:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 注册管理员
router.post('/admin/register', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }
    
    const token = admin.register(username, password);
    
    return res.json({
      success: true,
      message: '注册成功',
      token
    });
  } catch (error) {
    logger.error('注册管理员失败:', error);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// 管理员登录
router.post('/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }
    
    const token = admin.login(username, password);
    
    return res.json({
      success: true,
      message: '登录成功',
      token
    });
  } catch (error) {
    logger.error('登录失败:', error);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// 验证token
router.get('/admin/verify', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: '未提供认证token'
      });
    }
    
    const token = authHeader.split(' ')[1];
    const result = admin.verifyToken(token);
    
    return res.json(result);
  } catch (error) {
    logger.error('验证token失败:', error);
    return res.status(401).json({
      success: false,
      message: error.message
    });
  }
});

// 添加API key管理路由
router.post("/api-keys", async (req, res) => {
  try {
    const { apiKey, cookieValues } = req.body;
    
    if (!apiKey || !cookieValues) {
      return res.status(400).json({
        error: 'API key and cookie values are required',
      });
    }
    
    keyManager.addOrUpdateApiKey(apiKey, cookieValues);
    
    return res.json({
      success: true,
      message: 'API key added or updated successfully',
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

// 获取所有API Keys
router.get("/api-keys", async (req, res) => {
  try {
    logger.info('收到获取API Keys请求');
    const apiKeys = keyManager.getAllApiKeys();
    logger.info('获取到的API Keys:', apiKeys);
    
    const result = {
      success: true,
      apiKeys: apiKeys.map(apiKey => ({
        key: apiKey,
        cookieCount: keyManager.getAllCookiesForApiKey(apiKey).length,
      })),
    };
    logger.info('返回结果:', result);
    
    return res.json(result);
  } catch (error) {
    logger.error('获取API Keys失败:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// 删除API key
router.delete("/api-keys/:apiKey", async (req, res) => {
  try {
    const { apiKey } = req.params;
    
    keyManager.removeApiKey(apiKey);
    
    return res.json({
      success: true,
      message: 'API key removed successfully',
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

// 获取特定API Key的Cookie值
router.get("/api-keys/:apiKey/cookies", async (req, res) => {
  try {
    const { apiKey } = req.params;
    logger.info(`收到获取API Key ${apiKey}的Cookie值请求`);
    
    const cookies = keyManager.getAllCookiesForApiKey(apiKey);
    logger.info(`API Key ${apiKey}的Cookie值:`, cookies);
    
    return res.json({
      success: true,
      cookies: cookies
    });
  } catch (error) {
    logger.error(`获取API Key ${req.params.apiKey}的Cookie值失败:`, error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// 获取所有无效的cookie
router.get("/invalid-cookies", async (req, res) => {
  try {
    const invalidCookies = keyManager.getInvalidCookies();
    
    return res.json({
      success: true,
      invalidCookies: Array.from(invalidCookies)
    });
  } catch (error) {
    logger.error('获取无效cookie失败:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// 清除特定的无效cookie
router.delete("/invalid-cookies/:cookie", async (req, res) => {
  try {
    const { cookie } = req.params;
    const success = keyManager.clearInvalidCookie(cookie);
    
    return res.json({
      success: success,
      message: success ? '无效cookie已清除' : '未找到指定的无效cookie'
    });
  } catch (error) {
    logger.error('清除无效cookie失败:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// 清除所有无效cookie
router.delete("/invalid-cookies", async (req, res) => {
  try {
    keyManager.clearAllInvalidCookies();
    
    return res.json({
      success: true,
      message: '所有无效cookie已清除'
    });
  } catch (error) {
    logger.error('清除所有无效cookie失败:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// 批量添加无效cookie
router.post("/invalid-cookies", async (req, res) => {
  try {
    const { invalidCookies } = req.body;
    
    if (!Array.isArray(invalidCookies)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'invalidCookies必须是一个数组'
      });
    }
    
    // 获取当前无效cookie集合
    const currentInvalidCookies = keyManager.getInvalidCookies();
    
    // 添加新的无效cookie
    for (const cookie of invalidCookies) {
      if (typeof cookie === 'string' && cookie.trim()) {
        currentInvalidCookies.add(cookie.trim());
      }
    }
    
    // 保存到文件
    keyManager.saveInvalidCookiesToFile();
    
    return res.json({
      success: true,
      message: `已添加${invalidCookies.length}个无效cookie`
    });
  } catch (error) {
    logger.error('添加无效cookie失败:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.get("/models", async (req, res) => {
  try{
    let bearerToken = req.headers.authorization?.replace('Bearer ', '');
    
    // 使用keyManager获取实际的cookie
    let authToken = keyManager.getCookieForApiKey(bearerToken);
    
    if (authToken && authToken.includes('%3A%3A')) {
      authToken = authToken.split('%3A%3A')[1];
    }
    else if (authToken && authToken.includes('::')) {
      authToken = authToken.split('::')[1];
    }

    const checksum = req.headers['x-cursor-checksum'] 
      ?? process.env['x-cursor-checksum'] 
      ?? generateCursorChecksum(authToken.trim());
    //const cursorClientVersion = "0.45.11"
    const cursorClientVersion = "0.48.7";

    const availableModelsResponse = await fetch("https://api2.cursor.sh/aiserver.v1.AiService/AvailableModels", {
      method: 'POST',
      headers: {
        'accept-encoding': 'gzip',
        'authorization': `Bearer ${authToken}`,
        'connect-protocol-version': '1',
        'content-type': 'application/proto',
        'user-agent': 'connect-es/1.6.1',
        'x-cursor-checksum': checksum,
        'x-cursor-client-version': cursorClientVersion,
        'x-cursor-config-version': uuidv4(),
        'x-cursor-timezone': 'Asia/Shanghai',
        'x-ghost-mode': 'true',
        'Host': 'api2.cursor.sh',
      },
    })
    const data = await availableModelsResponse.arrayBuffer();
    const buffer = Buffer.from(data);
    try{
      const models = $root.AvailableModelsResponse.decode(buffer).models;

      return res.json({
        object: "list",
        data: models.map(model => ({
          id: model.name,
          created: Date.now(),
          object: 'model',
          owned_by: 'cursor'
        }))
      })
    } catch (error) {
      const text = buffer.toString('utf-8');
      throw new Error(text);      
    }
  }
  catch (error) {
    logger.error(error);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
})


router.post('/chat/completions', async (req, res) => {
  // 检查请求体是否存在
  if (!req.body) {
    return res.status(400).json({
      error: '请求体不能为空',
    });
  }

  // 检查模型属性是否存在
  if (!req.body.model) {
    return res.status(400).json({
      error: '缺少必要参数: model',
    });
  }

  // o1开头的模型，不支持流式输出
  if (typeof req.body.model === 'string' && req.body.model.startsWith('o1-') && req.body.stream) {
    return res.status(400).json({
      error: 'Model not supported stream',
    });
  }

  try {
    let { model, messages, stream = false } = req.body;
    let bearerToken = req.headers.authorization?.replace('Bearer ', '');
   
    if (model == "cur-claude-3-7-sonnet") {
	    model = "claude-3-7-sonnet-20250219";
    }
    if (model == "cur-claude-3-5-sonnet") {
        model = "claude-3-5-sonnet-20241022";
    }
    
    // 使用keyManager获取实际的cookie
    let authToken = keyManager.getCookieForApiKey(bearerToken);
    // 保存原始cookie，用于后续可能的错误处理
    const originalAuthToken = authToken;
    //console.log('原始cookie:', originalAuthToken);

    if (authToken && authToken.includes('%3A%3A')) {
      authToken = authToken.split('%3A%3A')[1];
    }
    else if (authToken && authToken.includes('::')) {
      authToken = authToken.split('::')[1];
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0 || !authToken) {
      return res.status(400).json({
        error: 'Invalid request. Messages should be a non-empty array and authorization is required',
      });
    }

    const checksum = req.headers['x-cursor-checksum'] 
      ?? process.env['x-cursor-checksum'] 
      ?? generateCursorChecksum(authToken.trim());

    const sessionid = uuidv5(authToken,  uuidv5.DNS);
    const clientKey = generateHashed64Hex(authToken);
    const cursorClientVersion = "0.49.4";

    // 然后继续请求 AvailableModels 接口
    await fetch("https://api2.cursor.sh/aiserver.v1.AiService/AvailableModels", {
      method: 'POST',
      headers: {
        'accept-encoding': 'gzip',
        'authorization': `Bearer ${authToken}`,
        'connect-protocol-version': '1',
        'content-type': 'application/proto',
        'user-agent': 'connect-es/1.6.1',
        'x-amzn-trace-id': `Root=${uuidv4()}`,
        'x-client-key': clientKey,
        'x-cursor-checksum': checksum,
        'x-cursor-client-version': cursorClientVersion,
        'x-cursor-timezone': 'Asia/Shanghai',
        'x-ghost-mode': 'true',
        "x-request-id": uuidv4(),
        "x-session-id": sessionid,
        'Host': 'api2.cursor.sh',
      },
    })

    const cursorBody = generateCursorBody(messages, model);
    
    // 添加代理支持
    const dispatcher = config.proxy && config.proxy.enabled
      ? new ProxyAgent(config.proxy.url, { allowH2: true })
      : new Agent({ allowH2: true });

    // 根据.env配置决定是否使用TLS代理
    const useTlsProxy = process.env.USE_TLS_PROXY === 'true';
    
    let response;
    
    if (useTlsProxy) {
      // 使用JA3指纹伪造代理服务器
	const startPort = 8081;
	const endPort = 8120;
	const randomPort = Math.floor(Math.random() * (endPort - startPort + 1)) + startPort;

// 动态构建URL
	const url = `http://localhost:${randomPort}/proxy`;
	    //
      logger.info(`使用TLS代理服务器`);
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: 'https://api2.cursor.sh/aiserver.v1.ChatService/StreamUnifiedChatWithTools',
          method: 'POST',
          headers: {
            'authorization': `Bearer ${authToken}`,
            'connect-accept-encoding': 'gzip',
            'connect-content-encoding': 'gzip',
            'connect-protocol-version': '1',
            'content-type': 'application/connect+proto',
            'user-agent': 'connect-es/1.6.1',
            'x-amzn-trace-id': `Root=${uuidv4()}`,
            'x-client-key': clientKey,
            'x-cursor-checksum': checksum,
            'x-cursor-client-version': cursorClientVersion,
            'x-cursor-config-version': uuidv4(),
            'x-cursor-timezone': 'Asia/Shanghai',
            'x-ghost-mode': 'true',
            'x-request-id': uuidv4(),
            'x-session-id': sessionid,
            'Host': 'api2.cursor.sh',
          },
          body: cursorBody,
          stream: true // 启用流式响应
        }),
        timeout: {
          connect: 5000,
          read: 30000
        }
      });
    } else {
      // 直接调用API，不使用TLS代理
      logger.info('不使用TLS代理服务器，直接请求API');
      response = await fetch('https://api2.cursor.sh/aiserver.v1.ChatService/StreamUnifiedChatWithTools', {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${authToken}`,
          'connect-accept-encoding': 'gzip',
          'connect-content-encoding': 'gzip',
          'connect-protocol-version': '1',
          'content-type': 'application/connect+proto',
          'user-agent': 'connect-es/1.6.1',
          'x-amzn-trace-id': `Root=${uuidv4()}`,
          'x-client-key': clientKey,
          'x-cursor-checksum': checksum,
          'x-cursor-client-version': cursorClientVersion,
          'x-cursor-config-version': uuidv4(),
          'x-cursor-timezone': 'Asia/Shanghai',
          'x-ghost-mode': 'true',
          'x-request-id': uuidv4(),
          'x-session-id': sessionid,
          'Host': 'api2.cursor.sh',
        },
        body: cursorBody,
        dispatcher: dispatcher,
        timeout: {
          connect: 5000,
          read: 30000
        }
      });
    }

    // 处理响应
    if (stream) {
let isFirst = true;
      const responseId = `chatcmpl-${uuidv4()}`;
      
      let isThinking_status = 0; //0为没有思考，1为处于思考状态
      try {
        let responseEnded = false; // 添加标志，标记响应是否已结束
        
        for await (const chunk of response.body) {
          // 如果响应已结束，不再处理后续数据
          if (responseEnded) {
            continue;
          }
          
          let result = chunkToUtf8String(chunk);
          // 输出完整的text内容和类型，便于调试
          //console.log("收到的响应:", typeof text, text && typeof text === 'object' ? JSON.stringify(text) : text);

          
          // 检查是否返回了错误对象
          if (result && typeof result === 'object' && result.error) {
            // 检查是否包含特定的无效cookie错误信息
            const errorStr = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
            
            // 处理错误并获取结果
            const errorResult = handleCursorError(errorStr, bearerToken, originalAuthToken);
            
            // 如果是需要移除的cookie，从API Key中移除
            if (errorResult.shouldRemoveCookie) {
              const removed = keyManager.removeCookieFromApiKey(bearerToken, originalAuthToken);
              logger.info(`Cookie移除${removed ? '成功' : '失败'}`);
              
              // 如果成功移除，在错误消息中添加明确提示
              if (removed) {
                errorResult.message = `⚠️ 目前Cookie已从API Key中移除 ⚠️\n\n${errorResult.message}`;
              }
            }
            res.status(500).json('request error');
		  return;
            // 返回错误信息给客户端，作为assistant消息
            res.write(
              `data: ${JSON.stringify({
                id: responseId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: req.body.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      content: '',
                    },
                  },
                ],
              })}\n\n`
            );
            
            res.write('data: [DONE]\n\n');
            responseEnded = true; // 标记响应已结束
            break; // 跳出循环，不再处理后续数据
          }

          let text = result.content;
	  	      if (text &&text.length>0 && isFirst) {
      		res.setHeader('Content-Type', 'text/event-stream');
      		res.setHeader('Cache-Control', 'no-cache');
      		res.setHeader('Connection', 'keep-alive');
		isFirst = false;
	      }
 

          if (result.isThink && isThinking_status == 0)
          {
            isThinking_status = 1; //存在思考内容，并且状态为开始思考
            text = "<think>"+"\n"+text;
          }
          else if (!result.isThink && isThinking_status == 1)
          {
            isThinking_status = 0; //初始化状态
            console.log("text:" + text);
            text = text+"\n"+"</think>"+"\n";
          }
          if (text && text.length > 0) {
            res.write(
              `data: ${JSON.stringify({
                id: responseId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: req.body.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      content: text,
                    },
                  },
                ],
              })}\n\n`
            );
          }
        }
        
        // 只有在响应尚未结束的情况下，才发送结束标记
        if (!responseEnded) {
	  if (isFirst) {
			   	res.status(500).json('request error');
		return;

	  }


          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (streamError) {
        logger.error('Stream error:', streamError);
        // 确保在发送错误信息前检查响应是否已结束
        if (!res.writableEnded) {
          if (streamError.name === 'TimeoutError') {
            // 将超时错误作为assistant消息发送
		res.status(500).json('request error');
		  return;
            const errorMessage = `⚠️ 请求超时 ⚠️\n\n错误：服务器响应超时，请稍后重试。`;
            res.write(
              `data: ${JSON.stringify({
                id: responseId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: req.body.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      content: '',
                    },
                  },
                ],
              })}\n\n`
            );
          } else {
		  res.status(500).json('request error');
		  return;
            // 将处理错误作为assistant消息发送
            const errorMessage = `⚠️ 处理错误 ⚠️\n\n错误：流处理出错，请稍后重试。\n\n${streamError.message || ''}`;
            res.write(
              `data: ${JSON.stringify({
                id: responseId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: req.body.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      content: '',
                    },
                  },
                ],
              })}\n\n`
            );
          }
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }
    } else {
      try {
        let text = '';
        let responseEnded = false; // 添加标志，标记响应是否已结束
        
        for await (const chunk of response.body) {
          // 如果响应已结束，不再处理后续数据
          if (responseEnded) {
            continue;
          }
          
          const result = chunkToUtf8String(chunk);
          // 输出完整的chunkText内容和类型，便于调试
          //console.log("收到的非流式响应:", typeof chunkText, chunkText && typeof chunkText === 'object' ? JSON.stringify(chunkText) : chunkText);
          
          // 检查是否返回了错误对象
          if (result && typeof result === 'object' && result.error) {
            //console.error('检测到错误响应:', chunkText.error);
            
            // 检查是否包含特定的无效cookie错误信息
            const errorStr = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
            
            // 处理错误并获取结果
            const errorResult = handleCursorError(errorStr, bearerToken, originalAuthToken);
            
            // 如果是需要移除的cookie，从API Key中移除
            if (errorResult.shouldRemoveCookie) {
              const removed = keyManager.removeCookieFromApiKey(bearerToken, originalAuthToken);
              logger.info(`Cookie移除${removed ? '成功' : '失败'}`);
              
              // 如果成功移除，在错误消息中添加明确提示
              if (removed) {
                errorResult.message = `⚠️ 目前Cookie已从API Key中移除 ⚠️\n\n${errorResult.message}`;
              }
            }
            res.status(500).json('request error');
		  return;
            // 无效cookie错误，格式化为assistant消息
            res.json({
              id: `chatcmpl-${uuidv4()}`,
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: errorResult.message,
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
              },
            });
            
            responseEnded = true; // 标记响应已结束
            break; // 跳出循环，不再处理后续数据
          }
          
          // 正常文本，添加到结果中
          let chunkText = result.content;
          if (chunkText && typeof chunkText === 'string') {
            text += chunkText;
          }
        }
        
        // 只有在响应尚未结束的情况下，才处理和返回结果
        if (!responseEnded) {
          // 对解析后的字符串进行进一步处理
          text = text.replace(/^.*<\|END_USER\|>/s, '');
          text = text.replace(/^\n[a-zA-Z]?/, '').trim();
          // console.log(text)
		//
          if (text.length < 15) {
		            res.status(500).json('reponse failed');
		  return;
	  }

          res.json({
            id: `chatcmpl-${uuidv4()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: text,
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
            },
          });
        }
      } catch (error) {
	      res.status(500).json('request error');
	      return;
        logger.error('Non-stream error:', error);
        // 确保在发送错误信息前检查响应是否已结束
        if (!res.headersSent) {
          if (error.name === 'TimeoutError') {
            // 使用统一的错误格式
            const errorMessage = `⚠️ 请求超时 ⚠️\n\n错误：服务器响应超时，请稍后重试。`;
            return res.json({
              id: `chatcmpl-${uuidv4()}`,
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model: req.body.model || 'unknown',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: errorMessage,
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
              },
            });
          }
          throw error;
        }
      }
    }
  } catch (error) {
	  res.status(500).json('request error');
	  return;
    logger.error('Error:', error);
    if (!res.headersSent) {
      const errorText = error.name === 'TimeoutError' ? '请求超时' : '服务器内部错误';
      
      if (req.body.stream) {
        // 流式响应格式的错误
        const responseId = `chatcmpl-${uuidv4()}`;
        // 添加清晰的错误提示
        const errorMessage = `⚠️ 请求失败 ⚠️\n\n错误：${errorText}，请稍后重试。\n\n${error.message || ''}`;
        res.write(
          `data: ${JSON.stringify({
            id: responseId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: req.body.model || 'unknown',
            choices: [
              {
                index: 0,
                delta: {
                  content: errorMessage,
                },
              },
            ],
          })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        // 非流式响应格式的错误
        // 添加清晰的错误提示
        const errorMessage = `⚠️ 请求失败 ⚠️\n\n错误：${errorText}，请稍后重试。\n\n${error.message || ''}`;
        res.json({
          id: `chatcmpl-${uuidv4()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: req.body.model || 'unknown',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: errorMessage,
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        });
      }
    }
  }
});

// 触发Cookie刷新
router.post("/refresh-cookies", async (req, res) => {
  try {
    // 如果已经有刷新进程在运行，则返回错误
    if (refreshStatus.isRunning) {
      return res.status(409).json({
        success: false,
        message: '已有刷新进程在运行，请等待完成后再试'
      });
    }
    
    // 获取请求参数
    const apiKey = req.query.apiKey || '';
    
    // 重置刷新状态
    refreshStatus = {
      isRunning: true,
      status: 'running',
      message: '正在启动刷新进程...',
      startTime: new Date(),
      endTime: null,
      error: null
    };
    
    logger.info(`收到刷新Cookie请求，API Key: ${apiKey || '所有'}`);
    
    // 构建命令行参数
    const args = [];
    if (apiKey) {
      args.push(apiKey);
    }
    
    // 获取auto-refresh-cookies.js的绝对路径
    const scriptPath = path.resolve(__dirname, '../../auto-refresh-cookies.js');
    
    // 启动子进程执行刷新脚本
    const refreshProcess = spawn('node', [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // 收集输出
    let output = '';
    
    refreshProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      logger.info(`刷新进程输出: ${text}`);
      
      // 更新状态消息
      if (text.includes('开始自动刷新')) {
        refreshStatus.message = '正在刷新Cookie...';
      } else if (text.includes('刷新结果:')) {
        refreshStatus.message = text.trim();
      }
    });
    
    refreshProcess.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      logger.error(`刷新进程错误: ${text}`);
      
      // 更新错误信息
      refreshStatus.error = text.trim();
      refreshStatus.message = `发生错误: ${text.trim()}`;
    });
    
    refreshProcess.on('close', (code) => {
      logger.info(`刷新进程退出，代码: ${code}`);
      
      refreshStatus.isRunning = false;
      refreshStatus.endTime = new Date();
      
      if (code === 0) {
        refreshStatus.status = 'completed';
        
        // 提取成功信息
        const successMatch = output.match(/成功刷新 (\d+) 个/);
        if (successMatch) {
          refreshStatus.message = `成功刷新 ${successMatch[1]} 个API Key的Cookie`;
        } else {
          refreshStatus.message = '刷新完成';
        }
        
        // 子进程执行完成后，重新初始化API Keys来加载新的Cookie
        try {
          const keyManager = require('../utils/keyManager');
          logger.info('子进程刷新Cookie完成，重新初始化主进程中的API Keys...');
          keyManager.initializeApiKeys();
          logger.info('主进程API Keys重新加载完成');
        } catch (initError) {
          logger.error('重新初始化API Keys失败:', initError);
        }
      } else {
        refreshStatus.status = 'failed';
        refreshStatus.message = refreshStatus.error || '刷新失败，请查看服务器日志';
      }
    });
    
    // 立即返回响应，不等待刷新完成
    return res.json({
      success: true,
      message: '刷新请求已接受，正在后台处理'
    });
  } catch (error) {
    logger.error('触发刷新Cookie失败:', error);
    
    // 更新刷新状态
    refreshStatus.isRunning = false;
    refreshStatus.status = 'failed';
    refreshStatus.endTime = new Date();
    refreshStatus.error = error.message;
    refreshStatus.message = `触发刷新失败: ${error.message}`;
    
    return res.status(500).json({
      success: false,
      message: `触发刷新失败: ${error.message}`
    });
  }
});

// 查询Cookie刷新状态
router.get("/refresh-status", (req, res) => {
  try {
    // 返回当前刷新状态
    return res.json({
      success: true,
      data: {
        ...refreshStatus,
        isRunning: refreshStatus.isRunning || false,
        status: refreshStatus.status || 'unknown',
        message: refreshStatus.message || '未触发刷新',
        startTime: refreshStatus.startTime || null,
        endTime: refreshStatus.endTime || null
      }
    });
  } catch (error) {
    logger.error('获取刷新状态失败:', error);
    return res.status(500).json({
      success: false,
      message: `获取刷新状态失败: ${error.message}`
    });
  }
});

// 生成获取Cookie的链接
router.post('/generate-cookie-link', async (req, res) => {
  try {
    // 验证管理员权限
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: '未提供认证token'
      });
    }
    
    const token = authHeader.split(' ')[1];
    const authResult = admin.verifyToken(token);
    
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: '认证失败'
      });
    }
    
    // 生成UUID和PKCE验证器
    const uuid = uuidv4();
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

    // 生成登录链接
    const loginUrl = `https://www.cursor.com/cn/loginDeepControl?challenge=${challenge}&uuid=${uuid}&mode=login`;
    
    // 记录请求信息
    pendingCookieRequests.set(uuid, {
      uuid,
      verifier,
      status: 'waiting',
      created: Date.now(),
      apiKey: req.body.apiKey || '', // 目标API Key，空字符串表示所有API Key
      lastCheck: Date.now(),
      cookie: null
    });
    
    // 设置60分钟后自动清理
    setTimeout(() => {
      if (pendingCookieRequests.has(uuid)) {
        pendingCookieRequests.delete(uuid);
      }
    }, 60 * 60 * 1000);
    
    return res.json({
      success: true,
      url: loginUrl,
      uuid: uuid
    });
  } catch (error) {
    logger.error('生成Cookie链接失败:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 查询Cookie获取状态
router.get('/check-cookie-status', async (req, res) => {
  try {
    const { uuid } = req.query;
    
    if (!uuid || !pendingCookieRequests.has(uuid)) {
      return res.json({
        success: false,
        status: 'failed',
        message: '无效的UUID或请求已过期'
      });
    }
    
    const request = pendingCookieRequests.get(uuid);
    request.lastCheck = Date.now();
    
    // 检查状态
    if (request.status === 'waiting') {
      // 检查Cursor API获取token
      try {
        const apiUrl = `https://api2.cursor.sh/auth/poll?uuid=${uuid}&verifier=${request.verifier}`;
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6834.210 Safari/537.36',
            'Accept': '*/*',
            'Origin': 'vscode-file://vscode-app',
            'x-ghost-mode': 'true'
          },
          timeout: 5000
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data && data.accessToken) {
            // 获取到了Cookie
            request.cookie = data.accessToken;
            request.status = 'success';
            
            // 将Cookie添加到目标API Key
            let message = '';
            
            if (request.apiKey) {
              // 添加到特定API Key
              const apiKey = request.apiKey;
              const cookies = keyManager.getAllCookiesForApiKey(apiKey) || [];
              cookies.push(request.cookie);
              keyManager.addOrUpdateApiKey(apiKey, cookies);
              message = `Cookie已添加到API Key: ${apiKey}`;
            } else {
              // 添加到所有API Key
              const apiKeys = keyManager.getAllApiKeys();
              for (const apiKey of apiKeys) {
                const cookies = keyManager.getAllCookiesForApiKey(apiKey) || [];
                cookies.push(request.cookie);
                keyManager.addOrUpdateApiKey(apiKey, cookies);
              }
              message = `Cookie已添加到所有API Key，共${apiKeys.length}个`;
            }
            
            // 完成后从等待列表中移除
            pendingCookieRequests.delete(uuid);
            
            return res.json({
              success: true,
              message: message
            });
          }
        }
        
        // 如果没有获取到Cookie，继续等待
        return res.json({
          success: false,
          status: 'waiting'
        });
        
      } catch (error) {
        logger.error('查询Cursor API失败:', error);
        // 发生错误但继续等待，不改变状态
        return res.json({
          success: false,
          status: 'waiting',
          message: '轮询过程中出现错误，继续等待'
        });
      }
    } else if (request.status === 'success') {
      // 已成功，返回结果
      const message = request.apiKey 
        ? `Cookie已添加到API Key: ${request.apiKey}`
        : `Cookie已添加到所有API Key`;
      
      // 完成后从等待列表中移除
      pendingCookieRequests.delete(uuid);
      
      return res.json({
        success: true,
        message: message
      });
    } else {
      // 失败
      pendingCookieRequests.delete(uuid);
      return res.json({
        success: false,
        status: 'failed',
        message: '获取Cookie失败'
      });
    }
  } catch (error) {
    logger.error('检查Cookie状态失败:', error);
    return res.status(500).json({
      success: false,
      status: 'failed',
      message: error.message
    });
  }
});

// 获取日志API
router.get("/logs", (req, res) => {
  try {
    // 获取查询参数
    const level = req.query.level;
    const search = req.query.search;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 100;
    const startTime = req.query.startTime;
    const endTime = req.query.endTime;
    
    // 过滤参数
    const filter = {
      level,
      search,
      page,
      pageSize,
      startTime,
      endTime
    };
    
    // 获取日志
    const logs = logger.getLogs(filter);
    
    return res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    logger.error('获取日志失败:', error);
    return res.status(500).json({
      success: false,
      message: `获取日志失败: ${error.message}`
    });
  }
});

// 清除内存日志
router.delete("/logs", (req, res) => {
  try {
    logger.clearMemoryLogs();
    return res.json({
      success: true,
      message: '日志已清除'
    });
  } catch (error) {
    logger.error('清除日志失败:', error);
    return res.status(500).json({
      success: false,
      message: `清除日志失败: ${error.message}`
    });
  }
});

// 在文件末尾添加错误处理函数
function handleCursorError(errorStr, bearerToken, originalAuthToken) {
  let message = '';
  let shouldRemoveCookie = false;
  
  if (errorStr.includes('Not logged in')) {
    // 更明确的错误日志
    if (originalAuthToken === bearerToken) {
      logger.error(`检测到API Key "${bearerToken}" 中没有可用Cookie，正在尝试以向后兼容模式使用API Key本身`);
      message = `错误：API Key "${bearerToken}" 中没有可用的Cookie。请添加有效的Cookie到此API Key，或使用其他有效的API Key。\n\n详细信息：${errorStr}`;
    } else {
      logger.error('检测到无效cookie:', originalAuthToken);
      message = `错误：Cookie无效或已过期，请更新Cookie。\n\n详细信息：${errorStr}`;
    }
    shouldRemoveCookie = true;
  } else if (errorStr.includes('You\'ve reached your trial request limit') || errorStr.includes('You\'ve reached the usage limit for free usage')) {
    logger.error('检测到额度用尽cookie:', originalAuthToken);
    message = `错误：Cookie使用额度已用完，请更换Cookie或等待刷新。\n\n详细信息：${errorStr}`;
    shouldRemoveCookie = true;
  } else if (errorStr.includes('User is unauthorized')) {
    logger.error('检测到未授权cookie:', originalAuthToken);
    message = `错误：Cookie已被封禁或失效，请更换Cookie。\n\n详细信息：${errorStr}`;
    shouldRemoveCookie = true;
  } else if (errorStr.includes('suspicious activity checks')) {
    logger.error('检测到IP黑名单:', originalAuthToken);
    message = `错误：IP可能被列入黑名单，请尝试更换网络环境或使用代理。\n\n详细信息：${errorStr}`;
    shouldRemoveCookie = false;
  } else if (errorStr.includes('Too many computers')) {
    logger.error('检测到账户暂时被封禁:', originalAuthToken);
    message = `错误：账户因在多台设备登录而暂时被封禁，请稍后再试或更换账户。\n\n详细信息：${errorStr}`;
    shouldRemoveCookie = true;
  } else if (errorStr.includes('Login expired') || errorStr.includes('login expired')) {
    logger.error('检测到登录过期cookie:', originalAuthToken);
    message = `错误：Cookie登录已过期，请更新Cookie。\n\n详细信息：${errorStr}`;
    shouldRemoveCookie = true;
  } else if(errorStr.includes('your request has been blocked due to the use of a temporary email service for this account')) {
    logger.error('检测到临时邮箱:', originalAuthToken);
    message = `错误：请求被阻止，检测到临时邮箱服务，请更换邮箱。\n\n详细信息：${errorStr}`;
    shouldRemoveCookie = true;
  } else if (errorStr.includes('Your request has been blocked as our system has detected suspicious activity from your account')) {
    logger.error('检测到账户异常:', originalAuthToken);
    message = `错误：请求被阻止，可能是假ban，多重试几次/更换cookie/更换设备。\n\n详细信息：${errorStr}`;
    shouldRemoveCookie = false;
  } else {
    // 非Cookie相关错误
    logger.error('检测到其他错误:', errorStr);
    message = `错误：请求失败。\n\n详细信息：${errorStr}`;
    shouldRemoveCookie = false;
  }
  
  return {
    message,
    shouldRemoveCookie
  };
}

module.exports = router;
