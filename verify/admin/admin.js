// GitHub API配置
const GitHubConfig = {
    owner: 'liuSir002',
    repo: 'king-verify',
    branch: 'master',
    get token() {
        return localStorage.getItem('github_token') || '';
    },
    set token(value) {
        localStorage.setItem('github_token', value);
    },
    dataPath: 'verify/admin/data/cards.json'
};

// GitHub API工具类
const GitHubAPI = {
    // 获取文件内容
    async getFileContent() {
        try {
            const response = await fetch(`https://api.github.com/repos/${GitHubConfig.owner}/${GitHubConfig.repo}/contents/${GitHubConfig.dataPath}`, {
                headers: {
                    'Authorization': `token ${GitHubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (!response.ok) throw new Error('Failed to fetch file');
            
            const data = await response.json();
            return {
                content: JSON.parse(atob(data.content)),
                sha: data.sha
            };
        } catch (error) {
            console.error('Error fetching file:', error);
            return null;
        }
    },
    
    // 更新文件内容
    async updateFile(content, sha) {
        try {
            const response = await fetch(`https://api.github.com/repos/${GitHubConfig.owner}/${GitHubConfig.repo}/contents/${GitHubConfig.dataPath}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${GitHubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: '更新卡密数据',
                    content: btoa(JSON.stringify(content, null, 2)),
                    sha: sha,
                    branch: GitHubConfig.branch
                })
            });
            
            if (!response.ok) throw new Error('Failed to update file');
            
            return await response.json();
        } catch (error) {
            console.error('Error updating file:', error);
            throw error;
        }
    }
};

// 卡密管理器
const KeyManager = {
    keys: [],
    currentSha: null,
    
    // 初始化数据
    async init() {
        try {
            if (!GitHubConfig.token) {
                showTokenDialog();
                return;
            }
            const result = await GitHubAPI.getFileContent();
            if (result) {
                this.keys = result.content.cards || [];
                this.currentSha = result.sha;
            } else {
                this.keys = [];
            }
            this.updateStats();
        } catch (error) {
            console.error('Error loading data:', error);
            if (error.message.includes('401')) {
                showTokenDialog();
            }
            this.keys = [];
        }
    },
    
    // 保存数据
    async saveData() {
        try {
            const data = {
                cards: this.keys,
                stats: {
                    unused: this.keys.filter(k => k.status === 'active').length,
                    used: this.keys.filter(k => k.status === 'used').length,
                    active: 0,
                    blocked: 0
                },
                last_updated: new Date().toISOString()
            };
            
            const result = await GitHubAPI.updateFile(data, this.currentSha);
            if (result) {
                this.currentSha = result.content.sha;
            }
            this.updateStats();
        } catch (error) {
            console.error('Error saving data:', error);
            alert('保存数据失败，请重试');
        }
    },
    
    // 创建卡密（Create）
    async createKey(type, price) {
        const key = {
            key: this.generateRandomKey(),
            type: type,
            price: price,
            status: 'active',
            createTime: new Date().toISOString(),
            useTime: null,
            deviceId: null,
            remarks: ''  // 添加备注字段
        };
        this.keys.push(key);
        await this.saveData();
        return key;
    },
    
    // 批量生成卡密
    async generateKeys(type, count, price) {
        const newKeys = [];
        for (let i = 0; i < count; i++) {
            const key = await this.createKey(type, price);
            newKeys.push(key);
        }
        return newKeys;
    },
    
    // 查询卡密（Read）
    findKey(keyString) {
        return this.keys.find(k => k.key === keyString);
    },
    
    // 按条件查询卡密
    searchKeys(conditions = {}) {
        return this.keys.filter(key => {
            let match = true;
            for (let [field, value] of Object.entries(conditions)) {
                if (field === 'priceRange') {
                    match = match && key.price >= value[0] && key.price <= value[1];
                } else if (field === 'dateRange') {
                    const keyDate = new Date(key.createTime);
                    match = match && keyDate >= value[0] && keyDate <= value[1];
                } else {
                    match = match && key[field] === value;
                }
            }
            return match;
        });
    },
    
    // 更新卡密（Update）
    async updateKey(keyString, updates) {
        const key = this.findKey(keyString);
        if (!key) {
            throw new Error('卡密不存在');
        }
        
        // 允许更新的字段
        const allowedUpdates = ['status', 'price', 'remarks', 'deviceId', 'useTime'];
        for (let [field, value] of Object.entries(updates)) {
            if (allowedUpdates.includes(field)) {
                key[field] = value;
            }
        }
        
        await this.saveData();
        return key;
    },
    
    // 删除卡密（Delete）
    async deleteKey(keyString) {
        const index = this.keys.findIndex(k => k.key === keyString);
        if (index === -1) {
            throw new Error('卡密不存在');
        }
        
        const deletedKey = this.keys.splice(index, 1)[0];
        await this.saveData();
        this.updateKeyList();
        return deletedKey;
    },
    
    // 批量删除卡密
    async batchDeleteKeys(condition) {
        const keysToDelete = this.searchKeys(condition);
        for (let key of keysToDelete) {
            await this.deleteKey(key.key);
        }
        return keysToDelete.length;
    },
    
    // 更新统计信息
    updateStats() {
        const stats = {
            unused: 0,
            used: 0,
            active: 0,
            blocked: 0
        };
        
        this.keys.forEach(key => {
            if (key.status === 'active') stats.unused++;
            if (key.status === 'used') stats.used++;
        });
        
        document.getElementById('unusedCount').textContent = stats.unused;
        document.getElementById('usedCount').textContent = stats.used;
        document.getElementById('activeDevices').textContent = stats.active;
        document.getElementById('blockedDevices').textContent = stats.blocked;
    },
    
    // 生成随机卡密
    generateRandomKey() {
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let key = '';
        for (let i = 0; i < 16; i++) {
            key += chars[Math.floor(Math.random() * chars.length)];
            if (i % 4 === 3 && i !== 15) key += '-';
        }
        return key;
    },
    
    // 更新卡密列表显示
    updateKeyList() {
        const tbody = document.getElementById('keyList');
        tbody.innerHTML = '';
        this.keys.forEach(key => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${key.key}</td>
                <td>${key.type}</td>
                <td>￥${key.price.toFixed(2)}</td>
                <td>${key.status === 'active' ? '<span class="status-active">未使用</span>' : '<span class="status-used">已使用</span>'}</td>
                <td>${this.formatDate(key.createTime)}</td>
                <td>${key.useTime ? this.formatDate(key.useTime) : '-'}</td>
                <td>${key.deviceId || '-'}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-info" onclick="KeyManager.showEditDialog('${key.key}')">编辑</button>
                        <button class="btn btn-sm btn-danger" onclick="KeyManager.deleteKey('${key.key}')">删除</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    
    // 显示编辑对话框
    showEditDialog(keyString) {
        const key = this.findKey(keyString);
        if (!key) return;
        
        // 创建模态框HTML
        const modalHtml = `
            <div class="modal fade" id="editKeyModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">编辑卡密</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="editKeyForm">
                                <div class="mb-3">
                                    <label class="form-label">卡密</label>
                                    <input type="text" class="form-control" value="${key.key}" readonly>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">价格</label>
                                    <input type="number" class="form-control" id="editPrice" value="${key.price}" step="0.01">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">状态</label>
                                    <select class="form-select" id="editStatus">
                                        <option value="active" ${key.status === 'active' ? 'selected' : ''}>未使用</option>
                                        <option value="used" ${key.status === 'used' ? 'selected' : ''}>已使用</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">备注</label>
                                    <textarea class="form-control" id="editRemarks">${key.remarks || ''}</textarea>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                            <button type="button" class="btn btn-primary" onclick="KeyManager.saveKeyEdit('${key.key}')">保存</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 添加到页面并显示
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(document.getElementById('editKeyModal'));
        modal.show();
        
        // 模态框关闭时删除元素
        document.getElementById('editKeyModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    },
    
    // 保存卡密编辑
    async saveKeyEdit(keyString) {
        const updates = {
            price: parseFloat(document.getElementById('editPrice').value),
            status: document.getElementById('editStatus').value,
            remarks: document.getElementById('editRemarks').value
        };
        
        try {
            await this.updateKey(keyString, updates);
            this.updateKeyList();
            bootstrap.Modal.getInstance(document.getElementById('editKeyModal')).hide();
            alert('更新成功');
        } catch (error) {
            alert('更新失败：' + error.message);
        }
    },
    
    // 格式化日期
    formatDate(dateStr) {
        const date = new Date(dateStr);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
};

// 添加token配置UI
function showTokenDialog() {
    const modalHtml = `
        <div class="modal fade" id="tokenModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">配置GitHub Token</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-warning">
                            Token仅会保存在本地浏览器中，请妥善保管。
                        </div>
                        <div class="mb-3">
                            <label class="form-label">GitHub Token</label>
                            <input type="password" class="form-control" id="tokenInput" value="${GitHubConfig.token}">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                        <button type="button" class="btn btn-primary" onclick="saveToken()">保存</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('tokenModal'));
    modal.show();
    
    document.getElementById('tokenModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

// 保存token
async function saveToken() {
    const token = document.getElementById('tokenInput').value.trim();
    if (!token) {
        alert('请输入GitHub Token');
        return;
    }
    
    GitHubConfig.token = token;
    bootstrap.Modal.getInstance(document.getElementById('tokenModal')).hide();
    
    // 测试token
    try {
        await GitHubAPI.getFileContent();
        alert('Token配置成功！');
        location.reload();
    } catch (error) {
        alert('Token无效，请检查后重试');
        GitHubConfig.token = '';
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 初始化卡密管理器
    await KeyManager.init();
    KeyManager.updateKeyList();
    
    // 生成卡密表单提交
    document.getElementById('generateForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const keyType = document.getElementById('keyType').value;
        const keyCount = parseInt(document.getElementById('keyCount').value);
        const keyPrice = parseFloat(document.getElementById('keyPrice').value);
        
        if (!keyPrice || keyPrice <= 0) {
            alert('请输入有效的卡密价格');
            return;
        }

        try {
            // 生成卡密
            await KeyManager.generateKeys(keyType, keyCount, keyPrice);
            KeyManager.updateKeyList();
            
            // 清空输入
            document.getElementById('keyCount').value = '1';
            document.getElementById('keyPrice').value = '';
            
            alert('卡密生成成功！');
        } catch (error) {
            console.error('Error generating keys:', error);
            alert('生成卡密失败，请重试');
        }
    });

    // 卡密筛选
    document.getElementById('keyFilter').addEventListener('change', (e) => {
        const filter = e.target.value;
        const rows = document.querySelectorAll('#keyList tr');
        
        rows.forEach(row => {
            const status = row.querySelector('td:nth-child(4)').textContent;
            if (filter === 'all' || 
                (filter === 'active' && status === '未使用') ||
                (filter === 'used' && status === '已使用')) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    });
}); 