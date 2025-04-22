# Cursor-To-OpenAI

将Cursor的API请求转发到OpenAI，支持多个API Key轮询，自动刷新Cookie。

## 项目特点

- 🔄 **自动刷新Cookie**: 通过GitHub Action自动注册账号获取Cookie
- 🔑 **多Key轮询**: 配置多个API Key轮询，提高可用性
- 🚀 **简易配置**: 一键配置脚本，快速搭建环境
- 📧 **邮箱管理**: 支持管理多个Gmail账号用于自动注册
- 📊 **状态监控**: 查看API Key使用情况和Cookie状态
- 🔧 **易于维护**: 便捷的维护脚本，简化日常操作
- 🤖 **多格式兼容**: 支持OpenAI和Anthropic Claude API格式的请求

## 快速开始

### 使用管理脚本

```bash
# 下载管理脚本
curl -O https://github.com/liuw1535/cursor-to-openai-nexus/main/cursor-to-openai-helper.sh

# 设置可执行权限
chmod +x cursor-to-openai-helper.sh

# 运行脚本
./cursor-to-openai-helper.sh
```

### 管理脚本功能

- **启动服务**: 快速启动服务
- **安装配置**: 完成初始安装和配置
- **系统维护**: 执行维护任务
- **退出**: 退出脚本

### 首次使用流程

1. 运行脚本选择「安装配置」
2. 按顺序完成：克隆仓库 → 安装依赖 → 创建配置文件 → 设置管理员账户 → 运行安装向导
3. 配置完成后，回到主菜单选择「启动服务」

### 准备工作

在开始配置前，请确保您已经：

1. Fork了 [Cursor-Register-fix](https://github.com/liuw1535/Cursor-Register-fix) 仓库到您的GitHub账号
   - **⚠️ 重要提示**: 如果需要使用自动刷新功能，必须fork该项目，并配置好GitHub用户名和token
   - 如果不需要自动刷新功能，请在.env文件中将`ENABLE_AUTO_REFRESH`设置为`false`（默认为`true`）
2. 创建了GitHub个人访问令牌（Personal Access Token），具有 repo 权限
3. 拥有至少一个Gmail账号，并启用了两步验证
4. 为Gmail账号创建了应用密码（Application Password）

### Cookie管理

维护菜单提供三种刷新Cookie的方式：

1. **常规刷新**: 检查现有Cookie数量，必要时触发刷新
2. **强制刷新**: 忽略数量检查，直接触发刷新
3. **持续刷新**: 在设定时间内持续尝试，直到成功添加新Cookie

### 项目更新与备份

- **更新项目代码**: 自动备份配置、拉取最新代码并恢复配置
- **备份项目数据**: 将重要配置文件备份到backups目录

### Gmail应用密码设置

1. 访问 Google账号安全设置
2. 在"登录Google"部分，点击"两步验证"（如未启用需先启用）
3. 在页面底部找到"应用密码"，点击进入
4. 选择"其他(自定义名称)"，输入名称（如"Cursor注册"）
5. 点击"生成"并复制16位应用密码

### 常用命令

```bash
# 启动服务
npm start

# 刷新Cookie
npm run refresh-cookies

# 管理邮箱配置
npm run manage-emails

# 运行快速配置
npm run setup
```

## 手动配置教程

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-username/cursor-to-openai.git
cd cursor-to-openai

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env

# 配置管理员账户
cp data/admin.example.json data/admin.json
node scripts/create-admin.js
```

### 使用说明

1. 启动服务: `npm start`
2. 访问管理界面: `http://localhost:3010`，使用管理员账户登录
3. 添加API Key: 在管理界面添加Cursor API Key
4. 使用API: 将OpenAI客户端的base URL改为`http://localhost:3010`

## 环境配置

在`.env`文件中配置以下关键参数：

- `API_KEYS`: API Key与Cookie的映射关系（JSON格式）
- 自动刷新Cookie相关配置:
  - `GITHUB_TOKEN`: GitHub个人访问令牌
  - `GITHUB_OWNER`: GitHub用户名
  - `GITHUB_REPO`: 仓库名称
  - `GITHUB_WORKFLOW_ID`: 工作流文件名
  - `REFRESH_CRON`: 自动刷新的定时规则
  - `MIN_COOKIE_COUNT`: 每个API Key的最小Cookie数量
  - `ENABLE_AUTO_REFRESH`: 是否启用自动刷新（默认为true）

系统启动时会自动合并`.env`中的API Keys和`data/api_keys.json`中的API Keys，确保数据一致性。

## 自动刷新Cookie功能

### 配置说明

```
# 启用配置
ENABLE_AUTO_REFRESH=true
REFRESH_CRON=0 */6 * * *
MIN_COOKIE_COUNT=2

# GitHub配置
GITHUB_TOKEN=your_github_token
GITHUB_OWNER=your_github_username
GITHUB_REPO=your_repo_name
GITHUB_WORKFLOW_ID=cursor_register.yml
TRIGGER_WORKFLOW=true

# 工作流参数
REGISTER_NUMBER=2
REGISTER_MAX_WORKERS=1
REGISTER_EMAIL_SERVER=TempEmail
REGISTER_UPLOAD_ARTIFACT=true
```

### 工作原理

1. 系统检查API Key的Cookie数量，低于阈值则触发刷新
2. 系统触发GitHub工作流，等待完成后下载Artifact
3. 从Artifact中提取Cookie并添加到对应API Key

## 部署方式

### 使用Docker Compose

```bash
# 创建配置文件
cp .env.example .env
mkdir -p data
cp data/admin.example.json data/admin.json

# 创建管理员账户
node scripts/create-admin.js

# 启动服务
docker compose up -d --build

# 查看日志
docker compose logs -f

# 停止服务
docker compose down
```

## 如何使用服务器

### OpenAI API

1. 获取模型列表
    - URL：`http://localhost:3010/v1/models`
    - 请求方式：`GET`
    - 认证方式：`Bearer Token`（自定义API Key或WorkosCursorSessionToken值）

2. 聊天补全
    - URL：`http://localhost:3010/v1/chat/completions`
    - 请求方式：`POST`
    - 认证方式：`Bearer Token`（自定义API Key或WorkosCursorSessionToken值）

请求和响应格式请参考OpenAI API文档。

### Anthropic API

1. 消息API
    - URL：`http://localhost:3010/v1/messages`
    - 请求方式：`POST`
    - 认证方式：`Bearer Token`（自定义API Key或WorkosCursorSessionToken值）

请求和响应格式请参考Anthropic Claude API文档。

## API使用示例

### OpenAI API示例

```python
from openai import OpenAI

# 使用自定义API Key
client = OpenAI(api_key="your_custom_api_key",
                base_url="http://localhost:3010/v1")

# 或直接使用Cookie
# client = OpenAI(api_key="user_...",
#                base_url="http://localhost:3010/v1")

response = client.chat.completions.create(
    model="claude-3-7-sonnet",
    messages=[
        {"role": "user", "content": "Hello."},
    ],
    stream=False
)

print(response.choices)
```

### Anthropic API 示例

```python
from anthropic import Anthropic

# 使用自定义API Key
anthro = Anthropic(api_key="your_custom_api_key",
                base_url="http://localhost:3010/v1")

response = anthro.messages.create(
    model="claude-3-7-sonnet",
    messages=[
        {"role": "user", "content": "Hello."}
    ],
    max_tokens=1024
)

print(response.content)
```

## 注意事项

- 请妥善保管你的WorkosCursorSessionToken
- 本项目仅用于学习和研究目的，请遵守Cursor的使用条款

## 致谢

- 本项目基于[cursor-api](https://github.com/zhx47/cursor-api)(by zhx47)
- 整合了[cursor-api](https://github.com/lvguanjun/cursor-api)(by lvguanjun)的提交内容

# 日志系统

项目集成了统一的日志系统，可以通过以下方式配置：

## 日志级别配置

1. 在 `.env` 文件中设置环境变量
   ```
   LOG_LEVEL=INFO
   LOG_FORMAT=colored
   LOG_TO_FILE=true
   LOG_MAX_SIZE=10
   LOG_MAX_FILES=10
   ```
2. 在启动命令中指定环境变量，例如：`LOG_LEVEL=DEBUG npm start`

支持的日志级别有：
- ERROR：只显示错误信息
- WARN：显示警告和错误信息
- INFO：显示一般信息、警告和错误信息（默认）
- DEBUG：显示调试信息、一般信息、警告和错误信息
- TRACE：显示所有日志信息

## 日志格式

日志格式为：`[级别] 时间戳 日志内容`，不同级别使用不同颜色显示，方便区分：
- ERROR：红色
- WARN：黄色
- INFO：绿色
- DEBUG：蓝色
- TRACE：青色
- HTTP：青色（专用于HTTP请求日志）

## HTTP请求日志

项目使用 Morgan 中间件记录 HTTP 请求，并集成到统一日志系统中：

1. 在 `.env` 文件中设置 HTTP 日志格式：
   ```
   # 选项: tiny, combined, common, dev, short
   MORGAN_FORMAT=tiny
   ```

2. HTTP 日志会以 `[HTTP]` 前缀显示，使用青色高亮，便于识别

3. Morgan 格式选项说明：
   - `tiny`: 最简洁的格式，仅包含方法、URL、状态码、响应时间
   - `combined`: 标准的 Apache 组合日志格式，包含 IP、时间、请求、状态码、响应大小、referrer、user-agent
   - `common`: 标准的 Apache 通用日志格式，类似 combined 但不包含 referrer 和 user-agent
   - `dev`: 开发友好的彩色格式，包含方法、URL、状态码(带颜色)、响应时间
   - `short`: 更短的格式，包含方法、URL、状态码、响应时间、响应大小

## 文件日志

项目支持将日志同时输出到控制台和文件，可以通过以下配置启用：

1. 在 `.env` 文件中设置：`LOG_TO_FILE=true`
2. 可选配置:
   - `LOG_MAX_SIZE`: 日志文件最大大小，单位MB，默认10MB
   - `LOG_MAX_FILES`: 保留的历史日志文件数量，默认10个

日志文件存储在项目根目录的 `logs` 文件夹下:
- 当前日志文件: `app.log`
- 历史日志文件: `app-2023-05-05T12-45-30-000Z.log`

文件日志会自动轮转，当日志文件大小超过设定值时，会创建新的日志文件并保留最近的N个文件。

## 代码中使用

在代码中可以按需使用不同级别的日志：

```javascript
const logger = require('./utils/logger');

logger.error('这是错误信息');
logger.warn('这是警告信息');
logger.info('这是一般信息');
logger.debug('这是调试信息');
logger.trace('这是跟踪信息');
logger.http('这是HTTP请求日志');
```
