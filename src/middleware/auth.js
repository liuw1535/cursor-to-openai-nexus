const admin = require('../models/admin');

// 验证管理员权限的中间件
function authMiddleware(req, res, next) {
    // 跳过登录相关的路由
    if (req.path.startsWith('/v1/admin/')) {
        return next();
    }

    // 对静态HTML页面的处理
    if (req.path === '/logs.html') {
        // 日志页面的访问不在中间件中做验证，而是在前端页面中进行验证
        return next();
    }

    // 修改为：只对管理相关的API进行认证
    if (req.path.startsWith('/v1/api-keys') || 
        req.path.startsWith('/v1/invalid-cookies') || 
        req.path.startsWith('/v1/refresh-cookies') ||
        req.path.startsWith('/v1/logs')) {
        // 获取Authorization头
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: '未提供认证token'
            });
        }

        // 提取token
        const token = authHeader.split(' ')[1];
        
        // 验证token
        const result = admin.verifyToken(token);
        if (!result.success) {
            return res.status(401).json({
                success: false,
                message: '无效的token'
            });
        }

        // 将用户信息添加到请求对象
        req.admin = {
            username: result.username
        };
    }

    next();
}

module.exports = authMiddleware; 