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
    isAutomationMode: false, // 自动化模式状态
    
    // AT命令历史，存储在全局状态中
    atCommands: [],
    
    // 自动化执行相关属性
    automation: {
        commands: [], // 自动化命令序列
        isRunning: false,
        isPaused: false,
        currentStep: 0,
        loopCount: 0,
        totalLoops: 1,
        startTime: null,
        timer: null
    },
    
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
        
        // 初始化自动化功能
        this.initAutomation();
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
        
        // 添加自动化模式切换按钮事件监听
        document.getElementById('automationModeToggleBtn').addEventListener('click', () => this.toggleAutomationMode());
        
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

        // 添加添加AT命令标签按钮事件监听
        const addTabButton = document.getElementById('addAtCommandTab');
        if (addTabButton) {
            addTabButton.addEventListener('click', () => this.addNewAtCommandTab());
        }

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
        
        // 添加自动化相关的事件监听
        this.setupAutomationEventListeners();
    },

    /**
     * 添加新的AT命令标签页
     */
    addNewAtCommandTab: function() {
        // 向后端发送消息请求创建新的AT命令配置
        if (vscode) {
            vscode.postMessage({
                command: 'createNewAtConfig'
            });
        }
    },

    /**
     * 加载AT命令列表
     */
    loadAtCommands: function(configName = null) {
        // 从VSCode获取AT命令列表
        if (vscode) {
            vscode.postMessage({
                command: 'loadAtCommands',
                configName: configName
            });
        }
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
    
    // 切换自动化模式
    toggleAutomationMode: function() {
        this.isAutomationMode = !this.isAutomationMode;
        const mainContent = document.querySelector('.main-content');
        const automationButton = document.getElementById('automationModeToggleBtn');
        
        if (this.isAutomationMode) {
            mainContent.classList.add('automation-mode');
            automationButton.title = '关闭自动化模式';
            this.addLog('自动化模式已开启', 'info');
        } else {
            mainContent.classList.remove('automation-mode');
            automationButton.title = '开启自动化模式';
            this.addLog('自动化模式已关闭', 'info');
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

    /**
     * 初始化自动化执行功能
     */
    initAutomation: function() {
        // 从localStorage加载保存的自动化序列
        const savedAutomation = localStorage.getItem('automationSequence');
        if (savedAutomation) {
            try {
                this.automation.commands = JSON.parse(savedAutomation);
                this.renderAutomationTrack();
            } catch (e) {
                console.error('Failed to load automation sequence:', e);
                this.automation.commands = [];
            }
        }
    },

    /**
     * 设置自动化相关的事件监听器
     */
    setupAutomationEventListeners: function() {
        // 导入命令按钮
        document.getElementById('importCommandsBtn').addEventListener('click', () => {
            this.importSelectedCommands();
        });

        // 清空自动化序列按钮
        document.getElementById('clearAutomationBtn').addEventListener('click', () => {
            this.clearAutomationSequence();
        });

        // 开始执行按钮
        document.getElementById('startAutomationBtn').addEventListener('click', () => {
            this.startAutomation();
        });

        // 暂停执行按钮
        document.getElementById('pauseAutomationBtn').addEventListener('click', () => {
            this.pauseAutomation();
        });

        // 停止执行按钮
        document.getElementById('stopAutomationBtn').addEventListener('click', () => {
            this.stopAutomation();
        });

        // 设置拖拽功能
        this.setupDragAndDrop();
    },

    /**
     * 从AT命令列表导入选中的命令
     */
    importSelectedCommands: function() {
        const atCommandItems = document.querySelectorAll('#atCommandsList .at-command-item');
        const selectedCommands = [];
        
        atCommandItems.forEach(item => {
            const span = item.querySelector('span');
            const commandText = span ? span.textContent.trim() : '';
            if (commandText && commandText !== '&nbsp;') {
                selectedCommands.push({
                    id: 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    command: commandText,
                    delay: 1000,
                    timeout: 5000,
                    expectedResponse: null
                });
            }
        });

        if (selectedCommands.length === 0) {
            this.addLog('没有可导入的AT命令', 'warning');
            return;
        }

        // 添加到自动化序列
        this.automation.commands.push(...selectedCommands);
        this.renderAutomationTrack();
        this.saveAutomationSequence();
        this.addLog(`成功导入 ${selectedCommands.length} 个AT命令到自动化序列`, 'success');
    },

    /**
     * 清空自动化序列
     */
    clearAutomationSequence: function() {
        if (this.automation.commands.length > 0) {
            if (confirm('确定要清空自动化序列吗？')) {
                this.automation.commands = [];
                this.renderAutomationTrack();
                this.saveAutomationSequence();
                this.addLog('自动化序列已清空', 'info');
            }
        } else {
            this.addLog('自动化序列已经是空的', 'info');
        }
    },

    /**
     * 渲染自动化轨道
     */
    renderAutomationTrack: function() {
        const track = document.getElementById('automationTrack');
        track.innerHTML = '';

        if (this.automation.commands.length === 0) {
            track.innerHTML = '<div class="track-placeholder">拖拽AT命令到这里创建自动化序列</div>';
            return;
        }

        this.automation.commands.forEach((cmd, index) => {
            const commandElement = this.createAutomationCommandElement(cmd, index);
            track.appendChild(commandElement);
        });
    },

    /**
     * 创建自动化命令元素
     */
    createAutomationCommandElement: function(command, index) {
        const element = document.createElement('div');
        element.className = 'automation-command-item';
        element.draggable = true;
        element.dataset.commandId = command.id;
        element.dataset.index = index;

        element.innerHTML = `
            <div class="command-drag-handle" title="拖拽排序">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="9" cy="5" r="1"></circle>
                    <circle cx="9" cy="12" r="1"></circle>
                    <circle cx="9" cy="19" r="1"></circle>
                    <circle cx="15" cy="5" r="1"></circle>
                    <circle cx="15" cy="12" r="1"></circle>
                    <circle cx="15" cy="19" r="1"></circle>
                </svg>
            </div>
            <div class="command-content">${this.escapeHtml(command.command)}</div>
            <div class="command-settings">
                <label>
                    延迟:
                    <input type="number" class="setting-input delay-input" value="${command.delay}" min="0" max="60000" data-field="delay">
                    ms
                </label>
                <label>
                    超时:
                    <input type="number" class="setting-input timeout-input" value="${command.timeout}" min="100" max="30000" data-field="timeout">
                    ms
                </label>
                <button class="remove-command-btn" title="移除命令">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;

        // 添加事件监听器
        this.attachCommandElementEvents(element, command);
        
        return element;
    },

    /**
     * 为命令元素添加事件监听器
     */
    attachCommandElementEvents: function(element, command) {
        // 设置输入框事件
        const delayInput = element.querySelector('.delay-input');
        const timeoutInput = element.querySelector('.timeout-input');
        
        delayInput.addEventListener('change', (e) => {
            command.delay = parseInt(e.target.value) || 1000;
            this.saveAutomationSequence();
        });
        
        timeoutInput.addEventListener('change', (e) => {
            command.timeout = parseInt(e.target.value) || 5000;
            this.saveAutomationSequence();
        });

        // 移除按钮事件
        const removeBtn = element.querySelector('.remove-command-btn');
        removeBtn.addEventListener('click', () => {
            this.removeAutomationCommand(command.id);
        });
    },

    /**
     * 移除自动化命令
     */
    removeAutomationCommand: function(commandId) {
        const index = this.automation.commands.findIndex(cmd => cmd.id === commandId);
        if (index !== -1) {
            this.automation.commands.splice(index, 1);
            this.renderAutomationTrack();
            this.saveAutomationSequence();
            this.addLog('命令已从自动化序列中移除', 'info');
        }
    },

    /**
     * 设置拖拽功能
     */
    setupDragAndDrop: function() {
        const track = document.getElementById('automationTrack');
        
        track.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('automation-command-item')) {
                e.target.classList.add('dragging');
                e.dataTransfer.setData('text/plain', e.target.dataset.commandId);
            }
        });

        track.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('automation-command-item')) {
                e.target.classList.remove('dragging');
            }
        });

        track.addEventListener('dragover', (e) => {
            e.preventDefault();
            track.classList.add('drag-over');
        });

        track.addEventListener('dragleave', (e) => {
            if (!track.contains(e.relatedTarget)) {
                track.classList.remove('drag-over');
            }
        });

        track.addEventListener('drop', (e) => {
            e.preventDefault();
            track.classList.remove('drag-over');
            
            const commandId = e.dataTransfer.getData('text/plain');
            const targetElement = e.target.closest('.automation-command-item');
            
            if (commandId && targetElement) {
                this.reorderAutomationCommands(commandId, targetElement.dataset.commandId);
            }
        });
    },

    /**
     * 重新排序自动化命令
     */
    reorderAutomationCommands: function(sourceId, targetId) {
        const sourceIndex = this.automation.commands.findIndex(cmd => cmd.id === sourceId);
        const targetIndex = this.automation.commands.findIndex(cmd => cmd.id === targetId);
        
        if (sourceIndex !== -1 && targetIndex !== -1 && sourceIndex !== targetIndex) {
            const [movedCommand] = this.automation.commands.splice(sourceIndex, 1);
            this.automation.commands.splice(targetIndex, 0, movedCommand);
            this.renderAutomationTrack();
            this.saveAutomationSequence();
            this.addLog('命令顺序已调整', 'info');
        }
    },

    /**
     * 保存自动化序列到localStorage
     */
    saveAutomationSequence: function() {
        localStorage.setItem('automationSequence', JSON.stringify(this.automation.commands));
    },

    /**
     * 开始自动化执行
     */
    startAutomation: function() {
        if (this.automation.commands.length === 0) {
            this.addLog('请先添加要执行的AT命令', 'error');
            return;
        }

        if (!this.isOpen) {
            this.addLog('请先连接串口', 'error');
            return;
        }

        // 获取设置参数
        const loopCount = parseInt(document.getElementById('loopCountInput').value) || 1;
        const interval = parseInt(document.getElementById('commandIntervalInput').value) || 1000;

        // 初始化执行状态
        this.automation.isRunning = true;
        this.automation.isPaused = false;
        this.automation.currentStep = 0;
        this.automation.loopCount = 0;
        this.automation.totalLoops = loopCount;
        this.automation.startTime = Date.now();

        // 更新UI
        this.updateAutomationUI('running');

        // 开始执行
        this.executeNextCommand();
        
        this.addLog(`自动化执行开始，共${loopCount === -1 ? '无限' : loopCount}次循环`, 'success');
    },

    /**
     * 暂停自动化执行
     */
    pauseAutomation: function() {
        this.automation.isPaused = true;
        this.updateAutomationUI('paused');
        this.addLog('自动化执行已暂停', 'warning');
    },

    /**
     * 继续自动化执行
     */
    resumeAutomation: function() {
        this.automation.isPaused = false;
        this.updateAutomationUI('running');
        this.executeNextCommand();
        this.addLog('自动化执行继续', 'success');
    },

    /**
     * 停止自动化执行
     */
    stopAutomation: function() {
        this.automation.isRunning = false;
        this.automation.isPaused = false;
        if (this.automation.timer) {
            clearTimeout(this.automation.timer);
            this.automation.timer = null;
        }
        this.updateAutomationUI('stopped');
        this.addLog('自动化执行已停止', 'info');
    },

    /**
     * 执行下一个命令
     */
    executeNextCommand: function() {
        if (!this.automation.isRunning || this.automation.isPaused) {
            return;
        }

        // 检查是否完成所有循环
        if (this.automation.totalLoops !== -1 && 
            this.automation.loopCount >= this.automation.totalLoops) {
            this.stopAutomation();
            this.addLog('自动化执行完成', 'success');
            return;
        }

        // 检查是否完成当前循环
        if (this.automation.currentStep >= this.automation.commands.length) {
            this.automation.loopCount++;
            this.automation.currentStep = 0;
            
            if (this.automation.totalLoops !== -1) {
                this.addLog(`第${this.automation.loopCount}次循环完成`, 'info');
            }
            
            // 如果还有循环次数，继续执行
            if (this.automation.totalLoops === -1 || this.automation.loopCount < this.automation.totalLoops) {
                const interval = parseInt(document.getElementById('commandIntervalInput').value) || 1000;
                this.automation.timer = setTimeout(() => {
                    this.executeNextCommand();
                }, interval);
            } else {
                this.stopAutomation();
                this.addLog('自动化执行完成', 'success');
            }
            return;
        }

        // 执行当前命令
        const command = this.automation.commands[this.automation.currentStep];
        this.highlightCurrentCommand(this.automation.currentStep);
        this.updateProgress();
        
        this.addLog(`执行: ${command.command}`, 'info');
        
        // 发送命令
        if (vscode) {
            vscode.postMessage({
                command: 'sendData',
                data: command.command,
                isHex: false
            });
        }

        // 设置超时检查
        this.automation.timer = setTimeout(() => {
            this.addLog(`命令超时: ${command.command}`, 'error');
            this.automation.currentStep++;
            this.executeNextCommand();
        }, command.timeout);

        // 延迟执行下一个命令
        setTimeout(() => {
            if (this.automation.timer) {
                clearTimeout(this.automation.timer);
                this.automation.timer = null;
            }
            this.automation.currentStep++;
            this.executeNextCommand();
        }, command.delay);
    },

    /**
     * 高亮显示当前执行的命令
     */
    highlightCurrentCommand: function(stepIndex) {
        // 移除之前的高亮
        document.querySelectorAll('.automation-command-item').forEach(item => {
            item.style.border = '1px solid var(--border-color)';
            item.style.backgroundColor = 'var(--select-bg)';
        });

        // 高亮当前命令
        const currentItem = document.querySelector(`.automation-command-item[data-index="${stepIndex}"]`);
        if (currentItem) {
            currentItem.style.border = '2px solid var(--primary-color)';
            currentItem.style.backgroundColor = 'var(--at-command-item-hover)';
        }
    },

    /**
     * 更新执行进度
     */
    updateProgress: function() {
        const totalSteps = this.automation.commands.length * 
                          (this.automation.totalLoops === -1 ? 1 : this.automation.totalLoops);
        const currentStep = this.automation.loopCount * this.automation.commands.length + 
                           this.automation.currentStep;
        const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

        const progressBar = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');
        const currentStepElement = document.querySelector('.current-step');
        const elapsedTimeElement = document.querySelector('.elapsed-time');

        if (progressBar) progressBar.style.width = `${progress}%`;
        if (progressText) progressText.textContent = `${Math.round(progress)}%`;
        if (currentStepElement) {
            currentStepElement.textContent = `当前: 执行第${this.automation.currentStep + 1}个命令`;
        }
        if (elapsedTimeElement && this.automation.startTime) {
            const elapsed = Math.floor((Date.now() - this.automation.startTime) / 1000);
            elapsedTimeElement.textContent = `耗时: ${elapsed}s`;
        }
    },

    /**
     * 更新自动化UI状态
     */
    updateAutomationUI: function(state) {
        const startBtn = document.getElementById('startAutomationBtn');
        const pauseBtn = document.getElementById('pauseAutomationBtn');
        const stopBtn = document.getElementById('stopAutomationBtn');
        const statusPanel = document.getElementById('automationStatus');

        switch (state) {
            case 'running':
                startBtn.style.display = 'none';
                pauseBtn.style.display = 'inline-block';
                stopBtn.style.display = 'inline-block';
                statusPanel.style.display = 'block';
                break;
            case 'paused':
                startBtn.style.display = 'inline-block';
                startBtn.textContent = '继续';
                startBtn.onclick = () => this.resumeAutomation();
                pauseBtn.style.display = 'none';
                stopBtn.style.display = 'inline-block';
                break;
            case 'stopped':
                startBtn.style.display = 'inline-block';
                startBtn.textContent = '开始执行';
                startBtn.onclick = () => this.startAutomation();
                pauseBtn.style.display = 'none';
                stopBtn.style.display = 'none';
                statusPanel.style.display = 'none';
                // 清除高亮
                document.querySelectorAll('.automation-command-item').forEach(item => {
                    item.style.border = '1px solid var(--border-color)';
                    item.style.backgroundColor = 'var(--select-bg)';
                });
                break;
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