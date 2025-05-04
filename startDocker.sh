#!/bin/bash

# 定义端口范围
START_PORT=8081
END_PORT=8120

# 循环启动Docker容器
for ((port=$START_PORT; port<=$END_PORT; port++))
do
    docker run -d --restart unless-stopped -p $port:8080 cursor-proxy
    echo "Started container on port $port"
done
