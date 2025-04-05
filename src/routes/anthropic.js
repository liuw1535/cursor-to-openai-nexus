const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { generateCursorBody, chunkToUtf8String, generateCursorChecksum } = require('../utils/utils');
const keyManager = require('../utils/keyManager');

// 将Anthropic格式的请求转换为OpenAI格式
function convertAnthropicToOpenAI(anthropicRequest) {
  // 提取Anthropic请求中的关键参数
  const {
    model,
    max_tokens,
    messages,
    stream = false,
    temperature,
    top_p,
    top_k,
    stop_sequences,
    system
  } = anthropicRequest;

  // 构建OpenAI格式的消息数组
  let openaiMessages = [];

  // 如果有system参数，添加为system消息
  if (system) {
    openaiMessages.push({
      role: 'system',
      content: system
    });
  }

  // 添加其他消息
  if (messages && Array.isArray(messages)) {
    // 将Anthropic消息格式转换为OpenAI格式
    messages.forEach(msg => {
      // 确保content是字符串
      let content = '';
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        // 如果content是数组，将文本内容连接起来
        content = msg.content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join('');
      }

      openaiMessages.push({
        role: msg.role,
        content: content
      });
    });
  }

  // 构建OpenAI格式的请求
  const openaiRequest = {
    model: model,
    messages: openaiMessages,
    stream: stream,
    max_tokens: max_tokens
  };

  // 添加可选参数
  if (temperature !== undefined) openaiRequest.temperature = temperature;
  if (top_p !== undefined) openaiRequest.top_p = top_p;
  if (stop_sequences !== undefined) openaiRequest.stop = stop_sequences;

  return openaiRequest;
}

// 将OpenAI格式的流式响应转换为Anthropic格式
function convertOpenAIStreamToAnthropic(openaiChunk, requestId) {
  try {
    // 解析OpenAI的数据块
    const data = JSON.parse(openaiChunk);

    // 构建Anthropic格式的响应
    const anthropicResponse = {
      type: "content_block_delta",
      index: 0,
      delta: {
        type: "text_delta",
        text: data.choices[0].delta.content || ""
      }
    };

    return `data: ${JSON.stringify(anthropicResponse)}\n\n`;
  } catch (error) {
    console.error('转换OpenAI流式响应到Anthropic格式失败:', error);
    return openaiChunk; // 如果转换失败，返回原始数据
  }
}

// 将OpenAI格式的完整响应转换为Anthropic格式
function convertOpenAIToAnthropic(openaiResponse) {
  // 提取OpenAI响应中的关键数据
  const { id, created, model, choices, usage } = openaiResponse;

  // 构建Anthropic格式的响应
  const anthropicResponse = {
    id: id,
    type: "message",
    role: "assistant",
    content: choices[0].message.content,
    model: model,
    stop_reason: choices[0].finish_reason,
    stop_sequence: null,
    usage: {
      input_tokens: usage?.prompt_tokens || 0,
      output_tokens: usage?.completion_tokens || 0
    }
  };

  return anthropicResponse;
}

// 处理Anthropic消息API请求
router.post('/', async (req, res) => {
  try {
    // 获取认证信息
    let bearerToken = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-api-key'];
    if (!bearerToken) {
      return res.status(401).json({
        error: {
          type: "authentication_error",
          message: "Authentication failed: API key is missing"
        }
      });
    }

    // 使用keyManager获取实际的cookie
    let authToken = keyManager.getCookieForApiKey(bearerToken);
    if (!authToken) {
      return res.status(401).json({
        error: {
          type: "authentication_error",
          message: "Authentication failed: Invalid API key"
        }
      });
    }

    if (authToken && authToken.includes('%3A%3A')) {
      authToken = authToken.split('%3A%3A')[1];
    }
    else if (authToken && authToken.includes('::')) {
      authToken = authToken.split('::')[1];
    }

    // 将Anthropic请求转换为OpenAI格式
    const openaiRequest = convertAnthropicToOpenAI(req.body);

    // 生成请求ID
    const requestId = uuidv4();

    // 准备Cursor请求所需的参数
    const checksum = req.headers['x-cursor-checksum']
      ?? process.env['x-cursor-checksum']
      ?? generateCursorChecksum(authToken.trim());
    const cursorClientVersion = "0.48.7";
    const clientKey = uuidv4();
    const sessionid = uuidv4();

    // 请求可用模型
    const availableModelsResponse = await fetch("https://api2.cursor.sh/aiserver.v1.AiService/AvailableModels", {
      method: 'POST',
      headers: {
        'accept-encoding': 'gzip',
        'authorization': `Bearer ${authToken}`,
        'connect-protocol-version': '1',
        'content-type': 'application/proto',
        'user-agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Cursor/${cursorClientVersion} Chrome/132.0.6834.210 Electron/34.3.4 Safari/537.36`,
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
    });

    // 准备Cursor请求体
    const cursorBody = generateCursorBody(openaiRequest.messages, openaiRequest.model);

    // 发送请求到Cursor API
    const response = await fetch('https://api2.cursor.sh/aiserver.v1.AiService/StreamChat', {
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
        'x-cursor-timezone': 'Asia/Shanghai',
        'x-ghost-mode': 'true',
        'x-request-id': uuidv4(),
        'x-session-id': sessionid,
        'Host': 'api2.cursor.sh',
      },
      body: cursorBody,
      timeout: {
        connect: 5000,
        read: 30000
      }
    });

    // 处理流式响应
    if (openaiRequest.stream) {
      // 设置响应头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        let responseEnded = false;

        // 处理流式响应
        for await (const chunk of response.body) {
          if (responseEnded) continue;

          const chunkText = chunkToUtf8String(chunk);

          // 检查是否有错误
          if (chunkText && typeof chunkText === 'object' && chunkText.error) {
            const errorResult = {
              hasError: true,
              message: `⚠️ 请求失败 ⚠️\n\n错误：${chunkText.error}`
            };

            // 发送错误消息
            const errorResponse = {
              type: "error",
              error: {
                type: "server_error",
                message: errorResult.message
              }
            };

            res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
            res.write('data: [DONE]\n\n');
            responseEnded = true;
            break;
          }

          // 处理正常文本
          if (chunkText && typeof chunkText === 'string') {
            // 转换为Anthropic格式并发送
            const anthropicChunk = {
              type: "content_block_delta",
              index: 0,
              delta: {
                type: "text_delta",
                text: chunkText
              }
            };

            res.write(`data: ${JSON.stringify(anthropicChunk)}\n\n`);
          }
        }

        // 发送结束标记
        if (!responseEnded) {
          const doneMessage = {
            type: "message_stop",
            message: {
              id: requestId,
              type: "message",
              role: "assistant",
              content: [],
              model: openaiRequest.model,
              stop_reason: "end_turn",
              stop_sequence: null
            }
          };

          res.write(`data: ${JSON.stringify(doneMessage)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (streamError) {
        console.error('Stream error:', streamError);

        if (!res.writableEnded) {
          const errorResponse = {
            type: "error",
            error: {
              type: "server_error",
              message: streamError.message || "Stream processing error"
            }
          };

          res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }
    } else {
      // 处理非流式响应
      try {
        let text = '';
        let responseEnded = false;

        for await (const chunk of response.body) {
          if (responseEnded) continue;

          const chunkText = chunkToUtf8String(chunk);

          // 检查是否有错误
          if (chunkText && typeof chunkText === 'object' && chunkText.error) {
            const errorResult = {
              hasError: true,
              message: `⚠️ 请求失败 ⚠️\n\n错误：${chunkText.error}`
            };

            // 返回Anthropic格式的错误响应
            return res.status(500).json({
              type: "error",
              error: {
                type: "server_error",
                message: errorResult.message
              }
            });
          }

          // 处理正常文本
          if (chunkText && typeof chunkText === 'string') {
            text += chunkText;
          }
        }

        // 处理完整响应
        if (!responseEnded) {
          // 清理文本
          text = text.replace(/^.*<\|END_USER\|>/s, '');
          text = text.replace(/^\n[a-zA-Z]?/, '').trim();

          // 构建Anthropic格式的响应
          const anthropicResponse = {
            id: requestId,
            type: "message",
            role: "assistant",
            content: [
              {
                type: "text",
                text: text
              }
            ],
            model: openaiRequest.model,
            stop_reason: "end_turn",
            stop_sequence: null,
            usage: {
              input_tokens: 0,  // 这里无法获取准确的token数量
              output_tokens: 0
            }
          };

          return res.json(anthropicResponse);
        }
      } catch (error) {
        console.error('Non-stream error:', error);

        if (!res.headersSent) {
          return res.status(500).json({
            type: "error",
            error: {
              type: "server_error",
              message: error.message || "Internal server error"
            }
          });
        }
      }
    }
  } catch (error) {
    console.error('Error:', error);

    if (!res.headersSent) {
      return res.status(500).json({
        type: "error",
        error: {
          type: "server_error",
          message: error.message || "Internal server error"
        }
      });
    }
  }
});

module.exports = router;
