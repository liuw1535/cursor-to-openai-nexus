#!/bin/bash

PORT=3010
COMMAND="nohup npm start > server.log 2>&1 &"
COMMAND2="nohup /root/cursor-to-openai-nexus/src/proxy/cursor_proxy_server_linux_amd64 > proxy.log 2>&1 &"

while true; do
    # 检查3010端口是否被占用
    if ! netstat -tuln | grep ":$PORT " > /dev/null; then
        echo "Port $PORT is not in use, restarting process..."
        # 执行启动命令
        eval $COMMAND
        echo "Process restarted at $(date)"
    else
        echo "Port $PORT is in use, process is running"
    fi

    if ! netstat -tuln | grep ":8080 " > /dev/null; then
        echo "Port 8080 is not in use, restarting process..."
        # 执行启动命令
        eval $COMMAND2
        echo "Process restarted at $(date)"
    else
        echo "Port 8080 is in use, process is running"
    fi
    # 每10秒检查一次
    sleep 2
done
