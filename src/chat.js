import showMessage from "./message.js";

class ChatPanel {
    constructor(config) {
        this.apiUrl = config.chatApiUrl;
        this.visible = false;
        this.streaming = false;
        this.messages = this._loadHistory();
        this._createDOM();
        this._bindEvents();
    }

    _createDOM() {
        const panel = document.createElement("div");
        panel.id = "waifu-chat";
        panel.innerHTML = `
            <div id="waifu-chat-header">
                <span>AI 助手</span>
                <span id="waifu-chat-close">&times;</span>
            </div>
            <div id="waifu-chat-messages"></div>
            <div id="waifu-chat-input-area">
                <input id="waifu-chat-input" type="text" placeholder="说点什么吧..." autocomplete="off" />
                <button id="waifu-chat-send">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16" height="16"><path fill="currentColor" d="M498.1 5.6c10.1 7 15.4 19.1 13.5 31.2l-64 416c-1.5 9.7-7.4 18.2-16 23-8.5 4.8-19 5.1-27.8.7l-134-62.4L213.7 441c-6.1 6-14.5 9-22.8 8.2-8.4-.8-16-5.3-20.8-12.3L96 320 14.3 277.6c-9.4-4.4-15.5-13.5-16.1-23.8-.7-10.3 4.3-20.1 13.1-25.5L480 5.6c8.3-5.2 18.8-5.7 27.6-.8l-9.5 .8z"/></svg>
                </button>
            </div>`;
        // 插入到 #waifu 内部
        const waifu = document.getElementById("waifu");
        waifu.appendChild(panel);

        this.panel = panel;
        this.messagesEl = panel.querySelector("#waifu-chat-messages");
        this.inputEl = panel.querySelector("#waifu-chat-input");
        this.sendBtn = panel.querySelector("#waifu-chat-send");
        this.closeBtn = panel.querySelector("#waifu-chat-close");

        // 渲染历史消息
        this.messages.forEach(msg => this._appendBubble(msg.role, msg.content));
    }

    _bindEvents() {
        this.sendBtn.addEventListener("click", () => this._send());
        this.inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this._send();
            }
        });
        this.closeBtn.addEventListener("click", () => this.hide());
    }

    toggle() {
        if (this.visible) this.hide();
        else this.show();
    }

    show() {
        this.visible = true;
        this.panel.classList.add("waifu-chat-active");
        // 暂停看板娘自动消息
        window._waifuChatOpen = true;
        this.inputEl.focus();
        this._scrollToBottom();
    }

    hide() {
        this.visible = false;
        this.panel.classList.remove("waifu-chat-active");
        window._waifuChatOpen = false;
    }

    async _send() {
        const text = this.inputEl.value.trim();
        if (!text || this.streaming) return;

        // 添加用户消息
        this.messages.push({ role: "user", content: text });
        this._appendBubble("user", text);
        this.inputEl.value = "";
        this._scrollToBottom();

        // 显示看板娘消息
        showMessage("让我想想...", 3000, 9);

        // 创建 AI 气泡（流式填充）
        const aiBubble = this._appendBubble("assistant", "");
        this.streaming = true;
        this.sendBtn.disabled = true;

        try {
            const resp = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: this.messages }),
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${resp.status}`);
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let aiContent = "";
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop(); // 保留未完成的行

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("data: ")) continue;
                    const data = trimmed.slice(6);
                    if (data === "[DONE]") break;

                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta?.content;
                        if (delta) {
                            aiContent += delta;
                            aiBubble.textContent = aiContent;
                            this._scrollToBottom();
                        }
                    } catch (e) {
                        // 忽略解析错误
                    }
                }
            }

            if (aiContent) {
                this.messages.push({ role: "assistant", content: aiContent });
                this._saveHistory();
                // 同步显示到看板娘气泡
                const shortReply = aiContent.length > 50 ? aiContent.slice(0, 50) + "..." : aiContent;
                showMessage(shortReply, 5000, 9);
            }
        } catch (e) {
            aiBubble.textContent = "抱歉，出了点问题 >_< 请稍后再试";
            aiBubble.classList.add("waifu-chat-error");
            showMessage("网络好像不太好呢...", 3000, 9);
        } finally {
            this.streaming = false;
            this.sendBtn.disabled = false;
        }
    }

    _appendBubble(role, content) {
        const bubble = document.createElement("div");
        bubble.className = `waifu-chat-bubble waifu-chat-${role}`;
        bubble.textContent = content;
        this.messagesEl.appendChild(bubble);
        return bubble;
    }

    _scrollToBottom() {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    _saveHistory() {
        // 只保留最近 20 条消息
        const recent = this.messages.slice(-20);
        try {
            sessionStorage.setItem("waifu-chat-history", JSON.stringify(recent));
        } catch (e) {
            // sessionStorage 满了就清空
        }
    }

    _loadHistory() {
        try {
            const data = sessionStorage.getItem("waifu-chat-history");
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }
}

export default ChatPanel;
