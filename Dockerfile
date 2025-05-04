FROM alpine:latest

# 安装必要的工具以支持git克隆
RUN apk add --no-cache git

# 设置工作目录
WORKDIR /app

# 克隆指定的GitHub仓库
RUN git clone https://github.com/youyouye/cursor-to-openai-nexus.git

# 复制可执行文件到工作目录
RUN cp cursor-to-openai-nexus/src/proxy/cursor_proxy_server_linux_amd64 /app/cursor_proxy_server

# 清理不需要的仓库文件以减小镜像大小
RUN rm -rf cursor-to-openai-nexus

# 确保可执行文件有执行权限
RUN chmod +x /app/cursor_proxy_server

# 暴露默认端口（可以根据需要修改）
EXPOSE 8080

# 运行可执行文件
CMD ["/app/cursor_proxy_server"]
