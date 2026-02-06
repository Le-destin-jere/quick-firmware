/**
 * Quick Serial Debug Tool for VSCode Extension
 * Implements serial communication functionality within a WebView
 * Communicates with backend for actual serial operations
 */

// 获取VS Code API实例，确保只获取一次
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

const SerialDebug = {
    isOpen: false,
    currentTheme: 'dark', // 默认主题
    
    // AT命令历史，存储在全局状态中
    atCommands: [],
    
    // 初始化串口调试界面
    init: function() {
 
        if (vscode) {
            vscode.postMessage({
                command: 'loadAtConfigList'
            });
        }

        this.loadAtCommands();

        this.setupEventListeners();
        
        this.requestPorts();
        
    },
    
    // 设置事件监听器
    setupEventListeners: function() {
        document.getElementById('connectBtn').addEventListener('click', () => this.toggleConnection());
        document.getElementById('sendBtn').addEventListener('click', () => this.sendData());
        document.getElementById('clearLogBtn').addEventListener('click', () => this.clearLog());
        document.getElementById('saveLogBtn').addEventListener('click', () => this.saveLog());
        
        // 当portSelector获得焦点时刷新端口列表，避免点击选项时触发刷新
        document.getElementById('portSelector').addEventListener('focus', () => this.requestPorts());
        
        // 添加主题切换按钮事件监听
        document.getElementById('themeToggleBtn').addEventListener('click', () => this.toggleTheme());
        
        // 添加面板模式切换按钮事件监听
        document.getElementById('panelModeToggleBtn').addEventListener('click', () => this.togglePanelMode());
        
        // 添加DTR和CTS事件监听
        document.getElementById('dtrCheckbox').addEventListener('change', (e) => {
            if (this.isOpen && vscode) {
                vscode.postMessage({
                    command: 'setDTR',
                    state: e.target.checked
                });
            }
        });
        
        document.getElementById('ctsCheckbox').addEventListener('change', (e) => {
            if (this.isOpen && vscode) {
                vscode.postMessage({
                    command: 'setRTS',
                    state: e.target.checked
                });
            }
        });
        
        // 添加鼠标滚轮事件监听器到标签容器
        const tabsContainer = document.getElementById('atConfigTabs');
        tabsContainer.addEventListener('wheel', (e) => {
            e.preventDefault(); // 阻止默认滚动行为
            // 根据滚轮移动方向水平滚动
            tabsContainer.scrollLeft += e.deltaY;
        });

        // Enter键发送数据
        document.getElementById('sendText').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendData();
            }
        });
        
        // AT命令历史点击发送
        document.getElementById('atCommandsList').addEventListener('click', (e) => {
            if (e.target.classList.contains('send-at-cmd-icon') || 
                (e.target.tagName === 'svg' || e.target.closest('.send-at-cmd-icon'))) {
                const button = e.target.closest('.send-at-cmd-icon');
                const command = button.dataset.command;
                document.getElementById('sendText').value = command;
                this.sendData();
            } else if (e.target.tagName === 'SPAN' && e.target.parentElement.classList.contains('at-command-item')) {
                // 点击AT命令文本进入编辑模式 - 现在也支持内容为空的情况
                this.editAtCommand(e.target);
            }
        });
        
        // 为AT命令输入框添加回车和失去焦点事件
        document.getElementById('atCommandsList').addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' && e.key === 'Enter') {
                this.saveAtCommand(e.target);
            }
        });
        
        // 使用focusout代替blur，因为blur事件不会冒泡
        document.getElementById('atCommandsList').addEventListener('focusout', (e) => {
            if (e.target.tagName === 'INPUT') {
                this.saveAtCommand(e.target);
            }
        });
    },
    
    // 请求可用串口列表
    requestPorts: function() {
        // 请求VSCode后端获取串口列表
        if (vscode) {
            vscode.postMessage({
                command: 'requestPorts'
            });
        }
    },
    
    // 更新串口列表
    updatePortList: function(ports) {
        const portSelector = document.getElementById('portSelector');
        portSelector.innerHTML = '';
        
        if (ports.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '无可用串口';
            portSelector.appendChild(option);
        } else {
            ports.forEach((port, index) => {
                const option = document.createElement('option');
                option.value = port.path;  // 使用实际路径作为值
                option.textContent = `${port.path}`;
                portSelector.appendChild(option);
            });
        }
    },
    
    // 切换串口连接状态
    toggleConnection: function() {
        if (!this.isOpen) {
            this.openSerialPort();
        } else {
            this.closeSerialPort();
        }
    },
    
    // 打开串口
    openSerialPort: function() {
        try {
            // 获取用户选择的串口和波特率
            const portPath = document.getElementById('portSelector').value;
            const baudRate = parseInt(document.getElementById('baudRateSelector').value);
            
            if (!portPath || portPath === '') {
                this.addLog('请选择一个串口', 'error');
                return;
            }
            
            // 通知VSCode后端打开串口
            if (vscode) {
                vscode.postMessage({
                    command: 'serialConnected',
                    portPath: portPath,
                    baudRate: baudRate
                });
            }
            
            // 获取DTR和RTS的初始状态并发送设置
            const dtrState = document.getElementById('dtrCheckbox').checked;
            const rtsState = document.getElementById('ctsCheckbox').checked;
            
            // 发送DTR状态设置
            if (vscode) {
                vscode.postMessage({
                    command: 'setDTR',
                    state: dtrState
                });
            }
            
            // 发送RTS状态设置
            if (vscode) {
                vscode.postMessage({
                    command: 'setRTS',
                    state: rtsState
                });
            }
            
        } catch (err) {
            console.error('Error opening serial port:', err);
            this.addLog(`连接串口失败: ${err.message}`, 'error');
        }
    },
    
    // 关闭串口
    closeSerialPort: function() {
        try {
            // 通知VSCode后端关闭串口
            if (vscode) {
                vscode.postMessage({
                    command: 'serialDisconnected'
                });
            }
            // 立即更新本地UI状态，避免界面卡在"断开连接"状态
            SerialDebug.isOpen = false;
            document.getElementById('connectBtn').textContent = '连接';
            document.getElementById('connectBtn').classList.remove('btn-disconnect');
            document.getElementById('connectBtn').classList.add('btn-connect');
            // 启用端口选择下拉框
            document.getElementById('portSelector').disabled = false;
            // 启用波特率选择下拉框
            document.getElementById('baudRateSelector').disabled = false;
        } catch (err) {
            console.error('Error closing serial port:', err);
            this.addLog(`断开串口失败: ${err.message}`, 'error');
        }
    },
    
    // 发送数据
    sendData: function() {
        const sendText = document.getElementById('sendText').value.trim();
        if (!sendText) {
            this.addLog('请输入要发送的数据', 'error');
            return;
        }
        
        if (!this.isOpen) {
            this.addLog('串口未连接', 'error');
            return;
        }
        
        try {
            // 获取发送模式（文本或十六进制）- 修改：从checkbox获取
            const isHexMode = document.getElementById('hexModeCheckbox').checked;
            // 通知VSCode后端发送数据
            if (vscode) {
                vscode.postMessage({
                    command: 'sendData',
                    data: sendText,
                    isHex: isHexMode
                });
            }
            // 记录发送的数据
            this.addSentData(sendText);
            
        } catch (err) {
            console.error('Error sending data:', err);
            this.addLog(`发送数据失败: ${err.message}`, 'error');
        }
    },
    
    // 添加发送的数据到日志
    addSentData: function(data) {
        const timestamp = new Date().toLocaleString();
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry sent';
        logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> <span class="direction">发送:</span> <span class="data">${this.escapeHtml(data)}</span>`;
        document.getElementById('serialLog').appendChild(logEntry);
        
        // 自动滚动到底部
        const logContainer = document.getElementById('serialLog');
        logContainer.scrollTop = logContainer.scrollHeight;
    },
    
    // 添加接收的数据到日志
    addReceivedData: function(data) {
        const timestamp = new Date().toLocaleString();
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry received';
        // 检查是否处于监控模式
        const isMonitorMode = document.querySelector('.main-content').classList.contains('monitor-mode');
        if (isMonitorMode) {
            logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> <span class="data">${this.escapeHtml(data)}</span>`;
        } else {
            logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> <span class="direction">接收:</span> <span class="data">${this.escapeHtml(data)}</span>`;
        }
        document.getElementById('serialLog').appendChild(logEntry);
        // 自动滚动到底部
        const logContainer = document.getElementById('serialLog');
        logContainer.scrollTop = logContainer.scrollHeight;
    },
    
    // 添加日志信息
    addLog: function(message, level = 'info') {
        const timestamp = new Date().toLocaleString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${level}`;
        logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> <span class="log-level ${level}">${message}</span>`;
        document.getElementById('serialLog').appendChild(logEntry);
        
        // 自动滚动到底部
        const logContainer = document.getElementById('serialLog');
        logContainer.scrollTop = logContainer.scrollHeight;
    },
    
    // 清空日志
    clearLog: function() {
        document.getElementById('serialLog').innerHTML = '';
        this.addLog('日志已清空', 'info');
    },
    
    // 保存日志
    saveLog: function() {
        const logContent = Array.from(document.getElementById('serialLog').children)
            .map(el => el.innerText)
            .join('\n');
            
        // 通知VSCode保存日志
        if (vscode) {
            vscode.postMessage({
                command: 'saveLog',
                content: logContent
            });
        }
    },
    
    // 转义HTML特殊字符
    escapeHtml: function(text) {
        const div = document.createElement('div');
        div.textContent = text;
        let escaped = div.innerHTML;
        // 特殊处理AT命令中可能包含的双引号，保留它们而不是转义
        escaped = escaped.replace(/&quot;/g, '"');
        return escaped;
    },
    
    // 加载AT命令配置列表
    loadAtConfigList: function() {
        // 从VSCode获取AT命令配置列表
        if (vscode) {
            vscode.postMessage({
                command: 'loadAtConfigList'
            });
        }
    },
    
    // 更新AT命令配置列表
    updateAtConfigList: function(configs) {
        const tabsContainer = document.getElementById('atConfigTabs');
        const existingTabs = tabsContainer.querySelectorAll('.at-config-tab');
        existingTabs.forEach(tab => tab.remove());
        // 添加配置项为标签页
        configs.forEach(config => {
            const tab = document.createElement('button');
            tab.className = 'at-config-tab';
            tab.textContent = config.displayName || config.name;
            tab.dataset.configName = config.name;
            // 添加点击事件
            tab.addEventListener('click', (e) => {
                const activeTabs = tabsContainer.querySelectorAll('.at-config-tab');
                activeTabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                // 发送消息到vscode
                if (vscode) {
                    vscode.postMessage({
                        command: 'loadAtCommands',
                        configName: config.name
                    });
                }
            });
            tabsContainer.appendChild(tab);
        });
        // 如果已有选中的配置，则更新标签选中状态
        setTimeout(() => {
            const firstTab = tabsContainer.querySelector('.at-config-tab');
            if (firstTab) {
                firstTab.click(); // 自动选择第一个标签
            }
        }, 0);
    },
    
    // 编辑AT命令
    editAtCommand: function(spanElement) {
        // 获取实际的命令值，如果显示的是&nbsp;则表示实际值为空
        let originalCommand = '';
        if (spanElement.innerHTML === '&nbsp;') {
            originalCommand = '';
        } else {
            originalCommand = spanElement.textContent;
        }
        
        const itemDiv = spanElement.parentElement;
        
        // 切换到编辑模式
        itemDiv.classList.add('editing');
        
        // 创建输入框并替换文本
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalCommand;
        input.dataset.original = originalCommand;
        
        // 替换span内容
        spanElement.parentNode.replaceChild(input, spanElement);
        
        // 聚焦到输入框
        input.focus();
    },
    
    // 保存AT命令
    saveAtCommand: function(inputElement) {
        const newValue = inputElement.value;
        const originalValue = inputElement.dataset.original;
        const itemDiv = inputElement.parentElement;
        
        // 如果值改变，则更新
        if (newValue !== originalValue) {
            // 创建新的span元素
            const span = document.createElement('span');
            span.textContent = newValue;
            if (newValue === '') {
                span.innerHTML = '&nbsp;';
            }
            
            // 替换输入框
            inputElement.parentNode.replaceChild(span, inputElement);
            
            // 移除编辑模式
            itemDiv.classList.remove('editing');
            
            // 获取当前命令的索引（序号）
            const commandItems = Array.from(document.querySelectorAll('.at-command-item'));
            const commandIndex = commandItems.indexOf(itemDiv);
            
            // 更新按钮的data-command属性
            const button = itemDiv.querySelector('.send-at-cmd-icon');
            if (button) {
                button.setAttribute('data-command', newValue);
            }
            
            // 通知后端更新命令，传递序号信息
            // 由于下拉框已移除，改为获取第一个可用配置或当前激活的标签
            const activeTab = document.querySelector('.at-config-tab.active');
            let currentConfig = '';
            if (activeTab) {
                currentConfig = activeTab.dataset.configName;
            } else {
                // 如果没有激活的标签，尝试获取第一个标签
                const firstTab = document.querySelector('.at-config-tab');
                if (firstTab) {
                    currentConfig = firstTab.dataset.configName;
                }
            }
            
            if (vscode) {
                vscode.postMessage({
                    command: 'updateAtCommand',
                    oldCommand: originalValue,
                    newCommand: newValue,
                    configName: currentConfig,
                    commandIndex: commandIndex  // 添加序号参数
                });
            }
        } else {
            // 如果没有改变，恢复为span
            const span = document.createElement('span');
            span.textContent = originalValue;
            if (originalValue === '') {
                span.innerHTML = '&nbsp;';
            }
            inputElement.parentNode.replaceChild(span, inputElement);
            itemDiv.classList.remove('editing');
        }
    },
    
    // 加载AT命令
    loadAtCommands: function() {
        // 从VSCode获取AT命令列表
        if (vscode) {
            vscode.postMessage({
                command: 'loadAtCommands'
            });
        }
    },
    
    // 显示AT命令
    displayAtCommands: function(commands) {
        const container = document.getElementById('atCommandsList');
        container.innerHTML = '';
        
        commands.forEach((cmd) => {
            const cmdElement = document.createElement('div');
            cmdElement.className = 'at-command-item';
            // 使用setAttribute方法设置data-command属性，避免引号冲突导致命令被截断
            const escapedCmd = this.escapeHtml(cmd);
            cmdElement.innerHTML = `
                <span>${escapedCmd === '' ? '&nbsp;' : escapedCmd}</span>
                <button class="send-at-cmd-icon" title="发送命令">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
            `;
            // 专门设置data-command属性，避免HTML模板中引号冲突
            const button = cmdElement.querySelector('.send-at-cmd-icon');
            button.setAttribute('data-command', cmd);
            container.appendChild(cmdElement);
        });
    },
    
    // 切换主题
    toggleTheme: function() {
        document.body.classList.toggle('light-theme');
        const themeButton = document.getElementById('themeToggleBtn');
        const isLightTheme = document.body.classList.contains('light-theme');
        
        if (isLightTheme) {
            themeButton.title = '切换到暗色主题';
        } else {
            themeButton.title = '切换到亮色主题';
        }
    },
    
    // 切换面板模式
    togglePanelMode: function() {
        const mainContent = document.querySelector('.main-content');
        const panelButton = document.getElementById('panelModeToggleBtn');
        const isMonitorMode = mainContent.classList.contains('monitor-mode');
        
        if (isMonitorMode) {
            mainContent.classList.remove('monitor-mode');
            this.clearLog();
            this.addLog('交互模式', 'info');
            
            // 退出监控模式时禁用编辑
            const logContainer = document.getElementById('serialLog');
            logContainer.contentEditable = false;
            logContainer.removeAttribute('tabindex');
            
            // 移除回车键处理事件
            logContainer.removeEventListener('keydown', this.handleMonitorInput.bind(this));
        } else {
            mainContent.classList.add('monitor-mode');
            this.clearLog();
            this.addLog('监控模式', 'info');
            
            // 在监控模式下聚焦到日志容器并使其可编辑
            const logContainer = document.getElementById('serialLog');
            logContainer.contentEditable = true;
            logContainer.setAttribute('tabindex', '0');
            logContainer.focus();
            
            // 添加回车键处理事件
            logContainer.addEventListener('keydown', this.handleMonitorInput.bind(this));
        }
    },
    
    // 处理监控模式下的输入
    handleMonitorInput: function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const logContainer = document.getElementById('serialLog');
            const inputText = logContainer.innerText.trim();
            
            // 清空输入
            logContainer.innerText = '';
            
            if (inputText) {
                // 发送数据
                document.getElementById('sendText').value = inputText;
                this.sendData();
            }
        }
    },

};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    SerialDebug.init();
});

// 监听来自VSCode的消息
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.command) {
        case 'updatePorts':
            SerialDebug.updatePortList(message.ports || []);
            break;
        case 'updateAtConfigList':
            SerialDebug.updateAtConfigList(message.configs || []);
            break;
        case 'displayAtCommands':
            SerialDebug.displayAtCommands(message.commands || []);
            break;
        case 'addLog':
            SerialDebug.addLog(message.content, message.level || 'info');
            break;
        case 'addReceivedData':
            SerialDebug.addReceivedData(message.data);
            break;
        case 'serialConnected':
            // 更新UI状态
            SerialDebug.isOpen = true;
            document.getElementById('connectBtn').textContent = '断开';
            document.getElementById('connectBtn').classList.remove('btn-connect');
            document.getElementById('connectBtn').classList.add('btn-disconnect');
            SerialDebug.addLog(`串口已连接，路径: ${message.portPath}, 波特率: ${message.baudRate}`, 'success');
            // 禁用端口选择下拉框
            document.getElementById('portSelector').disabled = true;
            // 禁用波特率选择下拉框
            document.getElementById('baudRateSelector').disabled = true;
            
            // 设置DTR和RTS的初始状态
            const dtrState = document.getElementById('dtrCheckbox').checked;
            const rtsState = document.getElementById('ctsCheckbox').checked;
            
            if (vscode) {
                vscode.postMessage({
                    command: 'setDTR',
                    state: dtrState
                });
            }
            
            if (vscode) {
                vscode.postMessage({
                    command: 'setRTS',
                    state: rtsState
                });
            }
            break;
        case 'serialDisconnected':
            // 更新UI状态
            SerialDebug.isOpen = false;
            document.getElementById('connectBtn').textContent = '连接';
            document.getElementById('connectBtn').classList.remove('btn-disconnect');
            document.getElementById('connectBtn').classList.add('btn-connect');
            SerialDebug.addLog('串口已断开', 'info');
            // 启用端口选择下拉框
            document.getElementById('portSelector').disabled = false;
            // 启用波特率选择下拉框
            document.getElementById('baudRateSelector').disabled = false;
            break;
    }
});