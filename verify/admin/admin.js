// GitHub API配置
const CONFIG = {
    owner: 'liuSir002',
    repo: 'king-verify',
    token: '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'
};

// GitHub API类
class GitHubAPI {
    static headers = {
        'Authorization': `token ${CONFIG.token}`,
        'Accept': 'application/vnd.github.v3+json'
    };

    static async getFile(path) {
        const response = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`, {
            headers: this.headers
        });
        const data = await response.json();
        return JSON.parse(atob(data.content));
    }

    static async updateFile(path, content, message = 'Update file') {
        // 先获取文件的SHA
        const current = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`, {
            headers: this.headers
        });
        const currentData = await current.json();

        // 更新文件
        const response = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`, {
            method: 'PUT',
            headers: this.headers,
            body: JSON.stringify({
                message: message,
                content: btoa(JSON.stringify(content, null, 2)),
                sha: currentData.sha
            })
        });
        return response.json();
    }
}

// 卡密管理类
class KeyManager {
    static generateKey(length = 32) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    static async generateKeys(type, count) {
        const authConfig = await GitHubAPI.getFile('verify/data/auth_config.json');
        const now = new Date().getTime();

        for (let i = 0; i < count; i++) {
            const key = this.generateKey();
            authConfig.active_keys[key] = {
                type: type,
                create_time: now
            };
        }

        await GitHubAPI.updateFile('verify/data/auth_config.json', authConfig, `生成${count}个${type}卡密`);
        await this.refreshData();
    }

    static async blockDevice(deviceId) {
        const blockList = await GitHubAPI.getFile('verify/blacklist/blocked_devices.json');
        if (!blockList.blocked_devices.includes(deviceId)) {
            blockList.blocked_devices.push(deviceId);
            await GitHubAPI.updateFile('verify/blacklist/blocked_devices.json', blockList, `封禁设备 ${deviceId}`);
            await this.refreshData();
        }
    }

    static async unblockDevice(deviceId) {
        const blockList = await GitHubAPI.getFile('verify/blacklist/blocked_devices.json');
        const index = blockList.blocked_devices.indexOf(deviceId);
        if (index > -1) {
            blockList.blocked_devices.splice(index, 1);
            await GitHubAPI.updateFile('verify/blacklist/blocked_devices.json', blockList, `解封设备 ${deviceId}`);
            await this.refreshData();
        }
    }

    static async deleteKey(key) {
        const authConfig = await GitHubAPI.getFile('verify/data/auth_config.json');
        delete authConfig.active_keys[key];
        delete authConfig.used_keys[key];
        await GitHubAPI.updateFile('verify/data/auth_config.json', authConfig, `删除卡密 ${key}`);
        await this.refreshData();
    }

    static async refreshData() {
        try {
            // 获取所有需要的数据
            const authConfig = await GitHubAPI.getFile('verify/data/auth_config.json');
            const activeDevices = await GitHubAPI.getFile('verify/devices/active_devices.json');
            const blockList = await GitHubAPI.getFile('verify/blacklist/blocked_devices.json');

            // 更新统计信息
            document.getElementById('unusedCount').textContent = Object.keys(authConfig.active_keys).length;
            document.getElementById('usedCount').textContent = Object.keys(authConfig.used_keys).length;
            document.getElementById('activeDevices').textContent = Object.keys(activeDevices.devices).length;
            document.getElementById('blockedDevices').textContent = blockList.blocked_devices.length;

            // 更新卡密列表
            const keyList = document.getElementById('keyList');
            keyList.innerHTML = '';

            // 添加未使用的卡密
            for (const [key, info] of Object.entries(authConfig.active_keys)) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${key}</td>
                    <td>${authConfig.auth_types[info.type].name}</td>
                    <td class="status-active">未使用</td>
                    <td>${new Date(info.create_time).toLocaleString()}</td>
                    <td>-</td>
                    <td>-</td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="KeyManager.deleteKey('${key}')">删除</button>
                    </td>
                `;
                keyList.appendChild(row);
            }

            // 添加已使用的卡密
            for (const [key, info] of Object.entries(authConfig.used_keys)) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${key}</td>
                    <td>${info.type}</td>
                    <td class="status-used">已使用</td>
                    <td>-</td>
                    <td>${new Date(info.use_time).toLocaleString()}</td>
                    <td>${info.device_id}</td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="KeyManager.deleteKey('${key}')">删除</button>
                    </td>
                `;
                keyList.appendChild(row);
            }

            // 更新设备列表
            const deviceList = document.getElementById('deviceList');
            deviceList.innerHTML = '';

            for (const [deviceId, info] of Object.entries(activeDevices.devices)) {
                const isBlocked = blockList.blocked_devices.includes(deviceId);
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${deviceId}</td>
                    <td>${info.info.brand} ${info.info.model}</td>
                    <td>${new Date(info.first_verify).toLocaleString()}</td>
                    <td>${new Date(info.last_verify).toLocaleString()}</td>
                    <td>${info.verify_count}</td>
                    <td class="${isBlocked ? 'status-used' : 'status-active'}">${isBlocked ? '已封禁' : '正常'}</td>
                    <td>
                        ${isBlocked ? 
                            `<button class="btn btn-sm btn-success" onclick="KeyManager.unblockDevice('${deviceId}')">解封</button>` :
                            `<button class="btn btn-sm btn-danger" onclick="KeyManager.blockDevice('${deviceId}')">封禁</button>`
                        }
                    </td>
                `;
                deviceList.appendChild(row);
            }

        } catch (error) {
            console.error('刷新数据失败:', error);
            alert('刷新数据失败: ' + error.message);
        }
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 刷新数据
    KeyManager.refreshData();

    // 生成卡密表单提交
    document.getElementById('generateForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('keyType').value;
        const count = parseInt(document.getElementById('keyCount').value);
        
        try {
            await KeyManager.generateKeys(type, count);
            alert(`成功生成${count}个${type}卡密`);
        } catch (error) {
            console.error('生成卡密失败:', error);
            alert('生成卡密失败: ' + error.message);
        }
    });

    // 卡密筛选
    document.getElementById('keyFilter').addEventListener('change', (e) => {
        const filter = e.target.value;
        const rows = document.querySelectorAll('#keyList tr');
        
        rows.forEach(row => {
            const status = row.querySelector('td:nth-child(3)').textContent;
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