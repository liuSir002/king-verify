// 卡密管理器
const KeyManager = {
    keys: [],
    
    // 初始化数据
    async init() {
        try {
            const response = await fetch('data/cards.json');
            const data = await response.json();
            this.keys = data.cards;
            this.updateStats();
        } catch (error) {
            console.error('Error loading data:', error);
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
            
            const response = await fetch('data/cards.json', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data, null, 4)
            });
            
            if (!response.ok) {
                throw new Error('Failed to save data');
            }
            
            this.updateStats();
        } catch (error) {
            console.error('Error saving data:', error);
            alert('保存数据失败，请重试');
        }
    },
    
    // 生成卡密
    async generateKeys(type, count, price) {
        for (let i = 0; i < count; i++) {
            const key = this.generateRandomKey();
            this.keys.push({
                key: key,
                type: type,
                price: price,
                status: 'active',
                createTime: new Date().toISOString(),
                useTime: null,
                deviceId: null
            });
        }
        await this.saveData();
        return this.keys;
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
    
    // 删除卡密
    async deleteKey(key) {
        const index = this.keys.findIndex(k => k.key === key);
        if (index > -1) {
            this.keys.splice(index, 1);
            await this.saveData();
            this.updateKeyList();
        }
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
                    <button class="btn btn-sm btn-danger" onclick="KeyManager.deleteKey('${key.key}')">删除</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },
    
    // 格式化日期
    formatDate(dateStr) {
        const date = new Date(dateStr);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
};

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