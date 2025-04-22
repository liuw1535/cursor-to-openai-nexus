// 模态框相关功能
document.addEventListener('DOMContentLoaded', function() {
    // 获取模态框元素
    const modal = document.getElementById('editModal');
    const closeBtn = document.getElementsByClassName('close')[0];
    
    // 关闭模态框
    closeBtn.onclick = function() {
        modal.style.display = 'none';
    }
    
    // 点击模态框外部关闭
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }
    
    // 页面加载时获取 API Key 列表和无效Cookie列表
    checkAuth();
    loadApiKeys();
    renderInvalidCookies();
    populateRefreshApiKeySelect();
    populateCookieApiKeySelect();
    
    // 初始化添加Cookie的标签容器
    renderAddCookieTags([]);
    
    // 绑定事件监听器
    bindEventListeners();

    // 处理日志按钮点击事件
    document.getElementById('logsBtn')?.addEventListener('click', function() {
        window.location.href = '/logs.html';
    });
});

// 绑定各种事件监听器
function bindEventListeners() {
    // 表单提交
    document.getElementById('addKeyForm').addEventListener('submit', handleAddKeyForm);
    document.getElementById('editCookieForm').addEventListener('submit', handleEditCookieForm);
    
    // 按钮点击
    // 注意：testApiBtn可能在页面上出现两次，需要检查元素是否存在
    const testApiButtons = document.querySelectorAll('#testApiBtn');
    testApiButtons.forEach(btn => {
        if(btn) btn.addEventListener('click', testApiConnection);
    });
    
    const clearCacheButtons = document.querySelectorAll('#clearCacheBtn');
    clearCacheButtons.forEach(btn => {
        if(btn) btn.addEventListener('click', clearCacheAndRefresh);
    });
    
    // 其他按钮
    if(document.getElementById('addNewCookieBtn')) document.getElementById('addNewCookieBtn').addEventListener('click', handleAddNewCookie);
    if(document.getElementById('addCookieBtn')) document.getElementById('addCookieBtn').addEventListener('click', handleAddCookie);
    if(document.getElementById('clearAllInvalidCookies')) document.getElementById('clearAllInvalidCookies').addEventListener('click', handleClearAllInvalidCookies);
    
    // 修复刷新Cookie和生成链接按钮的事件绑定
    const refreshCookieBtn = document.getElementById('refreshCookieBtn');
    if(refreshCookieBtn) {
        console.log('为refreshCookieBtn绑定事件');
        refreshCookieBtn.addEventListener('click', handleRefreshCookie);
    }
    
    const generateLinkBtn = document.getElementById('generateLinkBtn');
    if(generateLinkBtn) {
        console.log('为generateLinkBtn绑定事件');
        generateLinkBtn.addEventListener('click', handleGenerateLink);
    }
    
    if(document.getElementById('logoutBtn')) document.getElementById('logoutBtn').addEventListener('click', handleLogout);
}

// API Key 管理相关函数
// 加载现有 API Key
async function loadApiKeys() {
    try {
        console.log('开始加载API Keys...');
        const response = await fetch('/v1/api-keys', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }
        
        console.log('API响应状态:', response.status);
        const data = await response.json();
        console.log('获取到的数据:', data);
        
        const keyList = document.getElementById('keyList');
        keyList.innerHTML = '';
        
        if (data.success && data.apiKeys.length > 0) {
            data.apiKeys.forEach(key => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td data-title="API Key">${key.key}</td>
                    <td data-title="Cookie 数量">${key.cookieCount}</td>
                    <td data-title="操作">
                        <button class="edit-btn" onclick="editApiKey('${key.key}')">修改</button>
                        <button class="action-btn" onclick="deleteApiKey('${key.key}')">删除</button>
                    </td>
                `;
                keyList.appendChild(row);
            });
        } else {
            keyList.innerHTML = '<tr><td colspan="3" data-title="状态">暂无 API Key</td></tr>';
        }
    } catch (error) {
        console.error('加载 API Key 失败:', error);
        document.getElementById('keyListMessage').innerHTML = `
            <div class="error">加载 API Key 失败: ${error.message}</div>
        `;
    }
}

// 处理添加/更新 API Key 表单提交
async function handleAddKeyForm(e) {
    e.preventDefault();
    
    const apiKey = document.getElementById('apiKey').value.trim();
    const cookieValuesText = document.getElementById('cookieValues').value.trim();
    
    if (!apiKey) {
        document.getElementById('addKeyMessage').innerHTML = `
            <div class="error">API Key 不能为空</div>
        `;
        return;
    }
    
    // 将逗号分隔的 Cookie 值转换为数组
    const cookieValues = cookieValuesText ? 
        cookieValuesText.split(',').map(cookie => cookie.trim()).filter(cookie => cookie) : 
        [];
    
    try {
        const response = await fetch('/v1/api-keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                apiKey,
                cookieValues,
            }),
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('addKeyMessage').innerHTML = `
                <div class="info">API Key 添加/更新成功</div>
            `;
            // 等待3秒后再刷新页面
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        } else {
            document.getElementById('addKeyMessage').innerHTML = `
                <div class="error">API Key 添加/更新失败: ${data.error}</div>
            `;
        }
    } catch (error) {
        console.error('添加/更新 API Key 失败:', error);
        document.getElementById('addKeyMessage').innerHTML = `
            <div class="error">添加/更新 API Key 失败: ${error.message}</div>
        `;
    }
}

// 删除 API Key
async function deleteApiKey(apiKey) {
    if (!confirm(`确定要删除 API Key "${apiKey}" 吗？`)) {
        return;
    }
    
    try {
        const response = await fetch(`/v1/api-keys/${encodeURIComponent(apiKey)}`, {
            method: 'DELETE',
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('keyListMessage').innerHTML = `
                <div class="info">API Key 删除成功</div>
            `;
            loadApiKeys();
        } else {
            document.getElementById('keyListMessage').innerHTML = `
                <div class="error">API Key 删除失败: ${data.error}</div>
            `;
        }
    } catch (error) {
        console.error('删除 API Key 失败:', error);
        document.getElementById('keyListMessage').innerHTML = `
            <div class="error">删除 API Key 失败: ${error.message}</div>
        `;
    }
}

// 获取API Key的Cookie值
async function getCookiesForApiKey(apiKey) {
    try {
        const response = await fetch(`/v1/api-keys/${encodeURIComponent(apiKey)}/cookies`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.cookies;
    } catch (error) {
        console.error(`获取 ${apiKey} 的Cookie值失败:`, error);
        throw error;
    }
}

// 修改 API Key
async function editApiKey(apiKey) {
    try {
        document.getElementById('editModalMessage').innerHTML = '';
        document.getElementById('editApiKey').value = apiKey;
        
        // 获取当前Cookie值
        const cookies = await getCookiesForApiKey(apiKey);
        
        // 更新隐藏的textarea
        document.getElementById('editCookieValues').value = cookies.join(',');
        
        // 更新Cookie标签容器
        renderCookieTags(cookies);
        
        // 清空新Cookie输入框
        document.getElementById('newCookie').value = '';
        
        // 显示模态框
        document.getElementById('editModal').style.display = 'block';
    } catch (error) {
        alert(`获取 ${apiKey} 的Cookie值失败: ${error.message}`);
    }
}

// 获取API Keys的辅助函数
async function getApiKeys() {
    const response = await fetch('/v1/api-keys', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        }
    });
    
    if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.success ? data.apiKeys : [];
}

// 复制文本到剪贴板的通用函数
async function copyTextToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('复制到剪贴板失败:', err);
        
        // 如果navigator.clipboard不可用，使用备用方法
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            
            // 将元素设置为看不见
            textArea.style.position = 'fixed';
            textArea.style.top = '0';
            textArea.style.left = '0';
            textArea.style.width = '2em';
            textArea.style.height = '2em';
            textArea.style.padding = '0';
            textArea.style.border = 'none';
            textArea.style.outline = 'none';
            textArea.style.boxShadow = 'none';
            textArea.style.background = 'transparent';
            
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            return successful;
        } catch (fallbackErr) {
            console.error('备用复制方法失败:', fallbackErr);
            return false;
        }
    }
}

// 显示复制成功弹窗提示
function showCopyToast(success) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.padding = '8px 16px';
    toast.style.borderRadius = '4px';
    toast.style.zIndex = '9999';
    toast.style.fontSize = '14px';
    
    if (success) {
        toast.style.backgroundColor = '#28a745';
        toast.style.color = 'white';
        toast.textContent = '复制成功！';
    } else {
        toast.style.backgroundColor = '#dc3545';
        toast.style.color = 'white';
        toast.textContent = '复制失败，请手动复制';
    }
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 500);
    }, 2000);
}

// 处理复制Cookie按钮点击
async function handleCopyCookie(cookie) {
    const success = await copyTextToClipboard(cookie);
    showCopyToast(success);
}

// Cookie管理相关函数
// 渲染Cookie标签
function renderCookieTags(cookies) {
    const container = document.getElementById('cookieTagsContainer');
    container.innerHTML = '';
    
    if (cookies.length === 0) {
        container.innerHTML = '<div style="padding: 10px; color: #666;">暂无Cookie，请添加</div>';
        return;
    }
    
    cookies.forEach((cookie, index) => {
        // 创建标签
        const tag = document.createElement('span');
        tag.className = 'cookie-tag';
        
        // 对短文本添加特殊类
        if (cookie.length < 5) {
            tag.classList.add('short-cookie');
        }
        
        // 截断Cookie显示
        const displayText = cookie.length > 20 ? 
            cookie.substring(0, 8) + '...' + cookie.substring(cookie.length - 8) : 
            cookie;
        
        tag.title = cookie; // 完整Cookie作为工具提示
        
        // 增加对移动端友好的结构，添加复制按钮
        tag.innerHTML = `
            <span class="cookie-text-content">${displayText}</span>
            <div class="cookie-buttons">
                <button type="button" class="copy-btn" data-cookie="${cookie}" aria-label="复制">C</button>
                <button type="button" class="delete-cookie" data-index="${index}" aria-label="删除">×</button>
            </div>
        `;
        container.appendChild(tag);
    });
    
    // 添加删除按钮的事件监听
    document.querySelectorAll('.delete-cookie').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'));
            deleteCookieTag(index);
        });
    });
    
    // 添加复制按钮的事件监听
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const cookie = this.getAttribute('data-cookie');
            handleCopyCookie(cookie);
        });
    });
}

// 删除Cookie标签
function deleteCookieTag(index) {
    // 从隐藏的textarea中获取当前的cookies
    const cookieValuesElem = document.getElementById('editCookieValues');
    let cookies = cookieValuesElem.value.split(',').map(c => c.trim()).filter(c => c);
    
    // 删除指定索引的cookie
    cookies.splice(index, 1);
    
    // 更新隐藏的textarea
    cookieValuesElem.value = cookies.join(',');
    
    // 重新渲染标签
    renderCookieTags(cookies);
}

// 处理添加新Cookie
function handleAddCookie() {
    const newCookieInput = document.getElementById('newCookie');
    const newCookie = newCookieInput.value.trim();
    
    if (!newCookie) {
        return;
    }
    
    // 获取当前的cookies
    const cookieValuesElem = document.getElementById('editCookieValues');
    let cookies = cookieValuesElem.value ? 
        cookieValuesElem.value.split(',').map(c => c.trim()).filter(c => c) : 
        [];
    
    // 添加新cookie
    cookies.push(newCookie);
    
    // 更新隐藏的textarea
    cookieValuesElem.value = cookies.join(',');
    
    // 重新渲染标签
    renderCookieTags(cookies);
    
    // 清空输入框
    newCookieInput.value = '';
}

// 处理编辑表单提交
async function handleEditCookieForm(e) {
    e.preventDefault();
    
    const apiKey = document.getElementById('editApiKey').value.trim();
    const cookieValuesText = document.getElementById('editCookieValues').value.trim();
    
    if (!apiKey) {
        document.getElementById('editModalMessage').innerHTML = `
            <div class="error">API Key不能为空</div>
        `;
        return;
    }
    
    // 将逗号分隔的 Cookie 值转换为数组
    const cookieValues = cookieValuesText ? 
        cookieValuesText.split(',').map(cookie => cookie.trim()).filter(cookie => cookie) : 
        [];
    
    try {
        const response = await fetch('/v1/api-keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                apiKey,
                cookieValues,
            }),
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('editModalMessage').innerHTML = `
                <div class="info">Cookie 修改成功</div>
            `;
            setTimeout(() => {
                document.getElementById('editModal').style.display = 'none';
                loadApiKeys();
            }, 1500);
        } else {
            document.getElementById('editModalMessage').innerHTML = `
                <div class="error">Cookie 修改失败: ${data.error}</div>
            `;
        }
    } catch (error) {
        console.error('修改 Cookie 失败:', error);
        document.getElementById('editModalMessage').innerHTML = `
            <div class="error">修改 Cookie 失败: ${error.message}</div>
        `;
    }
}

// 渲染添加API Key表单中的Cookie标签
function renderAddCookieTags(cookies) {
    const container = document.getElementById('addCookieTagsContainer');
    container.innerHTML = '';
    
    if (cookies.length === 0) {
        container.innerHTML = '<div style="padding: 10px; color: #666;">暂无Cookie，请添加</div>';
        return;
    }
    
    cookies.forEach((cookie, index) => {
        const tag = document.createElement('span');
        tag.className = 'cookie-tag';
        
        // 对短文本添加特殊类
        if (cookie.length < 5) {
            tag.classList.add('short-cookie');
        }
        
        const displayText = cookie.length > 20 ? 
            cookie.substring(0, 8) + '...' + cookie.substring(cookie.length - 8) : 
            cookie;
        
        tag.title = cookie;
        
        // 增加对移动端友好的结构，添加复制按钮
        tag.innerHTML = `
            <span class="cookie-text-content">${displayText}</span>
            <div class="cookie-buttons">
                <button type="button" class="copy-btn" data-cookie="${cookie}" aria-label="复制">C</button>
                <button type="button" class="delete-add-cookie" data-index="${index}" aria-label="删除">×</button>
            </div>
        `;
        container.appendChild(tag);
    });
    
    document.querySelectorAll('.delete-add-cookie').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'));
            deleteAddCookieTag(index);
        });
    });
    
    // 添加复制按钮的事件监听
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const cookie = this.getAttribute('data-cookie');
            handleCopyCookie(cookie);
        });
    });
}

// 删除添加表单中的Cookie标签
function deleteAddCookieTag(index) {
    const cookieValuesElem = document.getElementById('cookieValues');
    let cookies = cookieValuesElem.value ? 
        cookieValuesElem.value.split(',').map(c => c.trim()).filter(c => c) : 
        [];
    
    cookies.splice(index, 1);
    cookieValuesElem.value = cookies.join(',');
    renderAddCookieTags(cookies);
}

// 处理添加新Cookie标签到添加表单
function handleAddNewCookie() {
    const newCookieInput = document.getElementById('addNewCookie');
    const newCookie = newCookieInput.value.trim();
    
    if (!newCookie) {
        return;
    }
    
    const cookieValuesElem = document.getElementById('cookieValues');
    let cookies = cookieValuesElem.value ? 
        cookieValuesElem.value.split(',').map(c => c.trim()).filter(c => c) : 
        [];
    
    cookies.push(newCookie);
    cookieValuesElem.value = cookies.join(',');
    renderAddCookieTags(cookies);
    newCookieInput.value = '';
}

// 无效Cookie管理相关函数
// 获取无效Cookie列表
async function getInvalidCookies() {
    try {
        const response = await fetch('/v1/invalid-cookies', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.invalidCookies;
    } catch (error) {
        console.error('获取无效Cookie失败:', error);
        throw error;
    }
}

// 清除特定无效Cookie
async function clearInvalidCookie(cookie) {
    try {
        const response = await fetch(`/v1/invalid-cookies/${encodeURIComponent(cookie)}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error(`清除无效Cookie失败:`, error);
        throw error;
    }
}

// 清除所有无效Cookie
async function clearAllInvalidCookies() {
    try {
        const response = await fetch('/v1/invalid-cookies', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('清除所有无效Cookie失败:', error);
        throw error;
    }
}

// 渲染无效Cookie列表
async function renderInvalidCookies() {
    const container = document.getElementById('invalidCookiesContainer');
    
    try {
        const invalidCookies = await getInvalidCookies();
        
        if (invalidCookies.length === 0) {
            container.innerHTML = '<div class="info">没有检测到无效Cookie</div>';
            return;
        }
        
        let html = '<div class="table-responsive"><table><thead><tr><th>无效Cookie</th><th>操作</th></tr></thead><tbody>';
        
        invalidCookies.forEach(cookie => {
            // 截断显示cookie，避免页面过长
            const displayCookie = cookie.length > 50 ? cookie.substring(0, 50) + '...' : cookie;
            
            html += `
                <tr>
                    <td class="cookie-text" data-title="无效Cookie" title="${cookie}">${displayCookie}</td>
                    <td data-title="操作">
                        <button class="action-btn clear-invalid-cookie" data-cookie="${cookie}">
                            清除
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += '</tbody></table></div>';
        container.innerHTML = html;
        
        // 添加清除按钮事件监听
        document.querySelectorAll('.clear-invalid-cookie').forEach(button => {
            button.addEventListener('click', async function() {
                const cookie = this.getAttribute('data-cookie');
                
                try {
                    await clearInvalidCookie(cookie);
                    showMessage('invalidCookiesContainer', '无效Cookie已清除', 'info');
                    renderInvalidCookies(); // 重新渲染列表
                } catch (error) {
                    showMessage('invalidCookiesContainer', `清除失败: ${error.message}`, 'error');
                }
            });
        });
        
    } catch (error) {
        container.innerHTML = `<div class="error">加载失败: ${error.message}</div>`;
    }
}

// 处理清除所有无效Cookie按钮事件
async function handleClearAllInvalidCookies() {
    try {
        await clearAllInvalidCookies();
        showMessage('invalidCookiesContainer', '所有无效Cookie已清除', 'info');
        renderInvalidCookies(); // 重新渲染列表
    } catch (error) {
        showMessage('invalidCookiesContainer', `清除失败: ${error.message}`, 'error');
    }
}

// API 测试相关函数
// 测试API连接
async function testApiConnection() {
    const resultDiv = document.getElementById('testApiResult');
    resultDiv.innerHTML = '<div class="info">正在测试API连接...</div>';
    
    try {
        const response = await fetch('/v1/api-keys', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        resultDiv.innerHTML = `<div class="info">API响应状态: ${response.status}</div>`;
        
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        resultDiv.innerHTML += `<div class="info">获取到的数据: ${JSON.stringify(data)}</div>`;
    } catch (error) {
        console.error('测试API失败:', error);
        resultDiv.innerHTML = `<div class="error">测试API失败: ${error.message}</div>`;
    }
}

// 清除缓存并刷新
function clearCacheAndRefresh() {
    // 清除缓存
    if ('caches' in window) {
        caches.keys().then(function(names) {
            for (let name of names) {
                caches.delete(name);
            }
        });
    }
    
    // 强制刷新页面（绕过缓存）
    window.location.reload(true);
}

// 显示消息的通用函数
function showMessage(containerId, message, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = `<div class="${type}">${message}</div>`;
}

// Cookie刷新相关函数
// 填充刷新API Key的下拉选择框
async function populateRefreshApiKeySelect() {
    try {
        const apiKeys = await getApiKeys();
        const select = document.getElementById('refreshApiKey');
        
        // 清空现有选项（保留"所有API Key"选项）
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // 添加API Key选项
        apiKeys.forEach(key => {
            const option = document.createElement('option');
            option.value = key.key;
            option.textContent = `${key.key} (${key.cookieCount} 个Cookie)`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('加载API Key选项失败:', error);
    }
}

// 处理刷新Cookie按钮事件
async function handleRefreshCookie() {
    console.log('刷新Cookie按钮被点击');
    const refreshBtn = document.getElementById('refreshCookieBtn');
    const apiKey = document.getElementById('refreshApiKey').value;
    const statusContainer = document.getElementById('refreshStatusContainer');
    const statusText = document.getElementById('refreshStatus');
    const progressBar = document.getElementById('refreshProgress');
    
    // 显示调试信息
    showMessage('refreshCookieMessage', '正在准备发送请求...', 'info');
    
    // 禁用按钮，显示状态容器
    refreshBtn.disabled = true;
    statusContainer.style.display = 'block';
    statusText.textContent = '正在发送刷新请求...';
    progressBar.value = 10;
    
    try {
        // 构建请求URL
        let url = '/v1/refresh-cookies';
        if (apiKey) {
            url += `?apiKey=${encodeURIComponent(apiKey)}`;
        }
        
        // 发送刷新请求
        statusText.textContent = '正在发送刷新请求...';
        progressBar.value = 20;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }
        
        // 显示长时间等待提示
        statusText.textContent = '刷新请求已发送，请耐心等待2-12分钟...';
        progressBar.value = 50;
        showMessage('refreshCookieMessage', '刷新请求已发送，由于需要访问Cursor官网获取新Cookie，整个过程可能需要2-12分钟，请耐心等待。您可以关闭此页面，稍后再来查看结果。', 'info');
        
        // 启动定时检查刷新状态
        let checkInterval = setInterval(async () => {
            try {
                const statusResponse = await fetch('/v1/refresh-status', {
                    method: 'GET',
                    headers: {
                        'Cache-Control': 'no-cache'
                    }
                });
                
                if (!statusResponse.ok) {
                    throw new Error(`HTTP错误: ${statusResponse.status} ${statusResponse.statusText}`);
                }
                
                const statusData = await statusResponse.json();
                const refreshData = statusData.data;
                
                // 更新状态信息
                statusText.textContent = refreshData.message || '正在刷新...';
                
                // 根据状态更新进度条和UI
                if (refreshData.status === 'completed') {
                    // 刷新完成
                    progressBar.value = 100;
                    statusText.textContent = `刷新完成: ${refreshData.message}`;
                    clearInterval(checkInterval);
                    
                    // 重新加载API Key列表
                    await loadApiKeys();
                    await populateRefreshApiKeySelect();
                    
                    // 显示成功消息
                    showMessage('refreshCookieMessage', `刷新完成: ${refreshData.message}`, 'success');
                    
                    // 启用按钮
                    refreshBtn.disabled = false;
                    
                    // 3秒后隐藏状态容器
                    setTimeout(() => {
                        statusContainer.style.display = 'none';
                    }, 3000);
                } else if (refreshData.status === 'failed') {
                    // 刷新失败
                    progressBar.value = 0;
                    statusText.textContent = `刷新失败: ${refreshData.message}`;
                    clearInterval(checkInterval);
                    
                    // 显示错误消息
                    showMessage('refreshCookieMessage', `刷新失败: ${refreshData.message}`, 'error');
                    
                    // 启用按钮
                    refreshBtn.disabled = false;
                } else if (refreshData.status === 'running') {
                    // 正在刷新
                    progressBar.value = 75;
                } else if (!refreshData.isRunning) {
                    // 未知状态但不在运行
                    clearInterval(checkInterval);
                    refreshBtn.disabled = false;
                }
            } catch (error) {
                console.error('检查刷新状态失败:', error);
            }
        }, 5000); // 每5秒检查一次
        
        // 设置超时检查，12分钟后如果还没完成就停止检查
        setTimeout(() => {
            if (checkInterval) {
                clearInterval(checkInterval);
                refreshBtn.disabled = false;
                statusContainer.style.display = 'none';
            }
        }, 720000);
    } catch (error) {
        console.error('刷新Cookie失败:', error);
        statusText.textContent = '刷新请求发送失败';
        progressBar.value = 0;
        showMessage('refreshCookieMessage', `刷新请求发送失败: ${error.message}`, 'error');
        refreshBtn.disabled = false;
    }
}

// 获取Cookie相关函数
// 为Cookie获取功能填充API Key下拉框
function populateCookieApiKeySelect() {
    populateRefreshApiKeySelect().then(() => {
        // 复制refreshApiKey的选项到targetApiKey
        const sourceSelect = document.getElementById('refreshApiKey');
        const targetSelect = document.getElementById('targetApiKey');
        
        // 保留第一个选项（"所有API Key"）
        while (targetSelect.options.length > 1) {
            targetSelect.remove(1);
        }
        
        // 复制选项
        for (let i = 1; i < sourceSelect.options.length; i++) {
            const option = document.createElement('option');
            option.value = sourceSelect.options[i].value;
            option.textContent = sourceSelect.options[i].textContent;
            targetSelect.appendChild(option);
        }
    });
}

// 处理生成登录链接
async function handleGenerateLink() {
    console.log('生成登录链接按钮被点击');
    const messageContainer = document.getElementById('getCookieMessage');
    const linkContainer = document.getElementById('loginLinkContainer');
    const loginLink = document.getElementById('loginLink');
    const pollStatusText = document.getElementById('pollStatusText');
    const pollProgress = document.getElementById('pollProgress');
    const targetApiKey = document.getElementById('targetApiKey').value;

    try {
        // 显示加载状态
        messageContainer.innerHTML = '<div class="info">正在生成登录链接...</div>';
        
        // 请求生成登录链接
        const response = await fetch('/v1/generate-cookie-link', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            body: JSON.stringify({ apiKey: targetApiKey })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || '生成链接失败');
        }
        
        // 显示链接
        loginLink.href = data.url;
        loginLink.textContent = data.url;
        linkContainer.style.display = 'block';
        
        // 更新状态
        pollStatusText.textContent = '等待用户登录...';
        pollProgress.value = 10;
        
        // 开始轮询获取cookie状态
        messageContainer.innerHTML = '<div class="info">链接已生成，请点击链接登录Cursor账号并授权</div>';
        
        // 开始轮询cookie状态
        pollForCookieStatus(data.uuid);
        
    } catch (error) {
        console.error('生成登录链接失败:', error);
        messageContainer.innerHTML = `<div class="error">生成链接失败: ${error.message}</div>`;
    }
}

// 轮询Cookie获取状态
function pollForCookieStatus(uuid) {
    const messageContainer = document.getElementById('getCookieMessage');
    const pollStatusText = document.getElementById('pollStatusText');
    const pollProgress = document.getElementById('pollProgress');
    const maxAttempts = 300; // 最多尝试300次，相当于5分钟（原来是120次，2分钟）
    let attempt = 0;
    
    // 更新状态显示
    pollStatusText.textContent = '等待用户登录...';
    
    const interval = setInterval(function() {
        attempt++;
        
        try {
            // 更新进度条（保持在10%-90%之间，表示等待中）
            pollProgress.value = 10 + Math.min(80, attempt / 3.75); // 调整进度条速度以适应5分钟
            
            // 请求检查状态
            fetch(`/v1/check-cookie-status?uuid=${encodeURIComponent(uuid)}`, {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            }).then(function(response) {
                if (!response.ok) {
                    pollStatusText.textContent = `请求失败: ${response.status}`;
                    return;
                }
                
                return response.json();
            }).then(function(data) {
                if (data.success) {
                    // Cookie获取成功
                    clearInterval(interval);
                    pollProgress.value = 100;
                    pollStatusText.textContent = '获取Cookie成功！';
                    messageContainer.innerHTML = `<div class="info">成功获取并添加Cookie！${data.message || ''}</div>`;
                    
                    // 刷新API Keys列表
                    loadApiKeys();
                    populateCookieApiKeySelect();
                    
                } else if (data.status === 'waiting') {
                    // 继续等待
                    pollStatusText.textContent = '等待用户登录...';
                } else if (data.status === 'failed') {
                    // 获取失败
                    clearInterval(interval);
                    pollStatusText.textContent = '获取失败';
                    pollProgress.value = 0;
                    messageContainer.innerHTML = `<div class="error">获取Cookie失败: ${data.message || '未知错误'}</div>`;
                }
            }).catch(function(error) {
                console.error('轮询Cookie状态失败:', error);
                pollStatusText.textContent = `轮询出错: ${error.message}`;
            });
            
        } catch (error) {
            console.error('轮询Cookie状态出错:', error);
            pollStatusText.textContent = `轮询出错: ${error.message}`;
        }
        
        // 达到最大尝试次数后停止
        if (attempt >= maxAttempts) {
            clearInterval(interval);
            pollStatusText.textContent = '超时，请重试';
            pollProgress.value = 0;
            messageContainer.innerHTML = '<div class="error">获取Cookie超时，请重新尝试</div>';
        }
        
    }, 1000); // 每秒轮询一次
}

// 授权相关函数
// 检查登录状态
function checkAuth() {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    // 验证token
    fetch('/v1/admin/verify', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            localStorage.removeItem('adminToken');
            window.location.href = '/login.html';
        } else {
            // 显示管理员用户名
            document.getElementById('adminUsername').textContent = `管理员：${data.username}`;
        }
    })
    .catch(error => {
        console.error('验证失败:', error);
        localStorage.removeItem('adminToken');
        window.location.href = '/login.html';
    });
}

// 处理退出登录
function handleLogout() {
    localStorage.removeItem('adminToken');
    window.location.href = '/login.html';
}

// 添加token到所有API请求
function addAuthHeader(headers = {}) {
    const token = localStorage.getItem('adminToken');
    return {
        ...headers,
        'Authorization': `Bearer ${token}`
    };
}

// 修改所有fetch请求，添加token
(function() {
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        // 只对管理页面的API请求添加token
        if (url.includes('/v1/api-keys') || 
            url.includes('/v1/invalid-cookies') || 
            url.includes('/v1/refresh-cookies') ||
            url.includes('/v1/generate-cookie-link') ||
            url.includes('/v1/check-cookie-status') ||
            url.includes('/v1/logs')) {
            options.headers = addAuthHeader(options.headers);
        }
        return originalFetch(url, options);
    };
})(); 