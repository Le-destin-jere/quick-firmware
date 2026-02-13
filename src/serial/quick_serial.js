const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

class QuickSerial {
    constructor() {
        this.port = null;
        this.parser = null;
        this.isOpen = false;
        this.availablePorts = [];
        this.onReceiveCallback = null;
    }
    /**
     * 获取可用串口列表
     */
    async listPorts() {
        try {
            console.log('Attempting to list serial ports...');
            this.availablePorts = await SerialPort.list();
            console.log('Available ports received:', this.availablePorts);
            return this.availablePorts;
        } catch (err) {
            console.error('Error listing serial ports:', err);
            console.error('Error details:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
            return [];
        }
    }

    /**
     * 打开串口连接
     * @param {string} path - 串口路径
     * @param {number} baudRate - 波特率
     */
    async open(path, baudRate = 115200) {
        if (this.isOpen && this.port) {
            await this.close();
        }

        try {
            this.port = new SerialPort({ path, baudRate, autoOpen: false });

            // 创建解析器，按行分割数据
            this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

            // 监听数据接收
            this.parser.on('data', (data) => {
                if (this.onReceiveCallback) {
                    this.onReceiveCallback(data.toString());
                }
            });

            // 监听错误
            this.port.on('error', (err) => {
                console.error('Serial port error:', err);
                this.isOpen = false;
            });

            // 打开串口
            await new Promise((resolve, reject) => {
                this.port.open((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.isOpen = true;
                        resolve();
                    }
                });
            });

            console.log(`Serial port opened: ${path} at ${baudRate} baud`);
            return true;
        } catch (err) {
            console.error('Error opening serial port:', err);
            this.isOpen = false;
            return false;
        }
    }

    /**
     * 关闭串口连接
     */
    async close() {
        if (!this.port) {
            return;
        }

        try {
            // 移除所有监听器
            if (this.parser) {
                this.parser.removeAllListeners('data');
            }
            
            if (this.port) {
                this.port.removeAllListeners('error');
                
                if (this.port.isOpen) {
                    await new Promise((resolve) => {
                        this.port.close(() => resolve());
                    });
                }
                
                this.port = null;
            }
            
            this.parser = null;
            this.isOpen = false;
            console.log('Serial port closed');
        } catch (err) {
            console.error('Error closing serial port:', err);
        }
    }

    /**
     * 发送数据到串口
     * @param {string} data - 要发送的数据
     * @param {boolean} isHex - 是否为十六进制数据
     */
    async write(data, isHex = false, isCRLF = true) {
        if (!this.port || !this.isOpen) {
            throw new Error('Serial port is not open');
        }

        try {
            if (isHex) {
                // 将十六进制字符串转换为Buffer
                const buffer = Buffer.from(data.replace(/\s/g, ''), 'hex');
                await new Promise((resolve, reject) => {
                    this.port.write(buffer, (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
            } else {
                await new Promise((resolve, reject) => {
                    if (isCRLF) {
                        this.port.write(data + '\r\n', (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    } else {
                        this.port.write(data, (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    }
                });
            }
        } catch (err) {
            console.error('Error writing to serial port:', err);
            throw err;
        }
    }

    /**
     * 设置数据接收回调
     * @param {Function} callback - 接收数据的回调函数
     */
    setOnReceive(callback) {
        this.onReceiveCallback = callback;
    }

    /**
     * 检查串口是否打开
     */
    getIsOpen() {
        return this.isOpen;
    }

    /**
     * 获取当前串口路径
     */
    getPath() {
        return this.port ? this.port.path : null;
    }
    
    /**
     * 设置DTR信号状态
     * @param {boolean} state - DTR状态(true为高电平，false为低电平)
     */
    async setDTR(state) {
        if (!this.port || !this.isOpen) {
            throw new Error('Serial port is not open');
        }

        try {
            await new Promise((resolve, reject) => {
                this.port.set({ dtr: state }, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log(`DTR set to: ${state}`);
                        resolve();
                    }
                });
            });
        } catch (err) {
            console.error('Error setting DTR:', err);
            throw err;
        }
    }

    /**
     * 设置RTS信号状态
     * @param {boolean} state - RTS状态(true为高电平，false为低电平)
     */
    async setRTS(state) {
        if (!this.port || !this.isOpen) {
            throw new Error('Serial port is not open');
        }

        try {
            await new Promise((resolve, reject) => {
                this.port.set({ rts: state }, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log(`RTS set to: ${state}`);
                        resolve();
                    }
                });
            });
        } catch (err) {
            console.error('Error setting RTS:', err);
            throw err;
        }
    }
}

module.exports = { QuickSerial };