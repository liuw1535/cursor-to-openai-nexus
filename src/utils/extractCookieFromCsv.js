const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

/**
 * 从CSV文件中提取完整的cookie
 * @param {string} csvFilePath - CSV文件路径
 * @returns {Promise<string[]>} - 提取到的cookie数组
 */
async function extractCookiesFromCsv(csvFilePath) {
  return new Promise((resolve, reject) => {
    try {
      // 检查文件是否存在
      if (!fs.existsSync(csvFilePath)) {
        console.error(`CSV文件不存在: ${csvFilePath}`);
        return resolve([]);
      }

      // 读取文件内容
      const fileContent = fs.readFileSync(csvFilePath, 'utf8');
      console.log(`文件内容前200个字符: ${fileContent.substring(0, 200)}`);

      // 检查文件是否为空
      if (!fileContent || fileContent.trim() === '') {
        console.error('CSV文件为空');
        return resolve([]);
      }

      // 首先尝试直接从文件内容中提取所有可能的cookie
      const cookies = [];
      
      // 检查是否有JWT格式的token (新格式)
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

      // 检查文件内容是否包含关键字
      const hasTokenKeyword = fileContent.includes('token');
      const hasUserPrefix = fileContent.includes('user_');
      console.log(`文件包含"token"关键字: ${hasTokenKeyword}`);
      console.log(`文件包含"user_"前缀: ${hasUserPrefix}`);

      // 如果文件包含user_前缀，尝试提取旧格式cookie
      if (hasUserPrefix) {
        const oldFormatCookies = extractCookiesFromText(fileContent);
        if (oldFormatCookies.length > 0) {
          console.log(`从文件内容中提取到 ${oldFormatCookies.length} 个旧格式Cookie`);
          oldFormatCookies.forEach(cookie => {
            if (!cookies.includes(cookie)) {
              cookies.push(cookie);
            }
          });
        }
      }

      // 如果已经找到cookie，返回结果
      if (cookies.length > 0) {
        console.log(`总共提取到 ${cookies.length} 个Cookie`);
        return resolve(validateCookies(cookies));
      }

      // 使用csv-parser解析CSV文件
      const possibleTokenFields = ['token', 'cookie', 'value', 'Token', 'Cookie', 'Value', 'jwt', 'JWT'];
      
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
          // 检查所有可能的字段名
          for (const field of possibleTokenFields) {
            if (row[field]) {
              // 检查是否是JWT格式
              if (row[field].startsWith('ey') && row[field].includes('.')) {
                if (!cookies.includes(row[field])) {
                  cookies.push(row[field]);
                }
                break;
              }
              // 检查是否是旧格式
              else if (row[field].includes('user_')) {
                if (!cookies.includes(row[field])) {
                  cookies.push(row[field]);
                }
                break;
              }
            }
          }
          
          // 如果没有找到预定义的字段，遍历所有字段
          if (cookies.length === 0) {
            for (const field in row) {
              if (row[field] && typeof row[field] === 'string') {
                // 检查是否是JWT格式
                if (row[field].startsWith('ey') && row[field].includes('.')) {
                  if (!cookies.includes(row[field])) {
                    cookies.push(row[field]);
                  }
                  break;
                }
                // 检查是否是旧格式
                else if (row[field].includes('user_')) {
                  if (!cookies.includes(row[field])) {
                    cookies.push(row[field]);
                  }
                  break;
                }
              }
            }
          }
        })
        .on('end', () => {
          console.log(`从CSV解析中提取到 ${cookies.length} 个Cookie`);
          
          // 如果通过CSV解析没有找到cookie，尝试按行读取
          if (cookies.length === 0) {
            console.log('尝试按行读取文件...');
            const lines = fileContent.split('\n');
            for (const line of lines) {
              // 检查是否有JWT格式token
              if (line.includes('ey')) {
                const jwtMatches = line.match(jwtRegex);
                if (jwtMatches) {
                  jwtMatches.forEach(match => {
                    if (!cookies.includes(match)) {
                      cookies.push(match);
                    }
                  });
                }
              }
              
              // 检查是否有旧格式cookie
              if (line.includes('user_')) {
                const extractedCookies = extractCookiesFromText(line);
                extractedCookies.forEach(cookie => {
                  if (!cookies.includes(cookie)) {
                    cookies.push(cookie);
                  }
                });
              }
            }
            console.log(`按行读取后提取到 ${cookies.length} 个Cookie`);
          }
          
          // 验证提取的cookie是否完整
          const validatedCookies = validateCookies(cookies);
          
          resolve(validatedCookies);
        })
        .on('error', (error) => {
          console.error('解析CSV文件时出错:', error);
          
          // 如果已经提取到cookie，直接返回
          if (cookies.length > 0) {
            console.log(`解析出错但已提取到 ${cookies.length} 个Cookie，进行验证后返回`);
            resolve(validateCookies(cookies));
          } else {
            // 否则尝试其他方法提取
            console.log('尝试其他方法提取Cookie...');
            
            // 尝试提取JWT格式token
            const jwtMatches = fileContent.match(jwtRegex);
            if (jwtMatches) {
              jwtMatches.forEach(match => {
                if (!cookies.includes(match)) {
                  cookies.push(match);
                }
              });
            }
            
            // 尝试提取旧格式cookie
            const oldFormatCookies = extractCookiesFromText(fileContent);
            oldFormatCookies.forEach(cookie => {
              if (!cookies.includes(cookie)) {
                cookies.push(cookie);
              }
            });
            
            console.log(`通过其他方法提取到 ${cookies.length} 个Cookie`);
            resolve(validateCookies(cookies));
          }
        });
    } catch (error) {
      console.error('提取Cookie时出错:', error);
      reject(error);
    }
  });
}

/**
 * 从文本中提取cookie
 * @param {string} text - 要提取cookie的文本
 * @returns {string[]} - 提取到的cookie数组
 */
function extractCookiesFromText(text) {
  const cookies = [];
  
  // 使用正则表达式匹配user_开头的cookie（旧格式）
  const oldFormatRegex = /user_[a-zA-Z0-9%]+%3A%3A[a-zA-Z0-9%\.\_\-]+/g;
  const oldFormatMatches = text.match(oldFormatRegex);
  
  if (oldFormatMatches) {
    oldFormatMatches.forEach(match => {
      if (!cookies.includes(match)) {
        cookies.push(match);
      }
    });
  }
  
  // 使用正则表达式匹配以ey开头的JWT格式cookie（新格式）
  const jwtRegex = /ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
  const jwtMatches = text.match(jwtRegex);
  
  if (jwtMatches) {
    jwtMatches.forEach(match => {
      if (!cookies.includes(match)) {
        cookies.push(match);
      }
    });
  }
  
  return cookies;
}

/**
 * 验证cookie是否完整
 * @param {string[]} cookies - 要验证的cookie数组
 * @returns {string[]} - 验证后的cookie数组
 */
function validateCookies(cookies) {
  return cookies.filter(cookie => {
    // 检查是否是新格式的JWT token (ey开头)
    if (cookie.startsWith('ey') && cookie.includes('.')) {
      const parts = cookie.split('.');
      // 检查JWT是否包含三个部分
      if (parts.length === 3) {
        return true; // cookie有效
      } else {
        console.warn(`检测到不完整的JWT(新格式): ${cookie}`);
        return false;
      }
    } 
    // 检查旧格式cookie是否完整
    else if (cookie.includes('%3A%3A')) {
      const parts = cookie.split('%3A%3A');
      if (parts.length === 2) {
        const jwt = parts[1];
        // 检查JWT是否包含两个点（表示三个部分）
        if (jwt.includes('.') && jwt.split('.').length === 3) {
          return true; // cookie完整
        } else {
          console.warn(`检测到不完整的JWT(旧格式): ${cookie}`);
          return false;
        }
      }
    }
    return true; // 对于无法识别的格式，默认保留
  });
}

module.exports = {
  extractCookiesFromCsv
}; 