(function () {
    'use strict';

    // DOM Elements
    const csvFileInput = document.getElementById('csvFile');
    const selfSelect = document.getElementById('selfSelect');
    const selfSelectorGroup = document.getElementById('selfSelectorGroup');
    const chatHeader = document.getElementById('chatHeader');
    const chatTitle = document.getElementById('chatTitle');
    const chatContainer = document.getElementById('chatContainer');
    const themeToggle = document.getElementById('themeToggle');
    const loadingIndicator = document.getElementById('loadingIndicator');

    // State
    let parsedMessages = [];
    let currentSelf = '';
    let currentFileName = '';
    let isDark = false;

    /**
     * Parse CSV text (RFC 4180 compliant)
     * Handles quoted fields with embedded commas and newlines.
     */
    function parseCSV(text) {
        const lines = [];
        let currentLine = [];
        const fieldChars = [];
        let inQuotes = false;
        let i = 0;

        function flushField() {
            currentLine.push(fieldChars.join(''));
            fieldChars.length = 0;
        }

        while (i < text.length) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (inQuotes) {
                if (char === '"') {
                    if (nextChar === '"') {
                        fieldChars.push('"');
                        i += 2;
                        continue;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    fieldChars.push(char);
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    flushField();
                } else if (char === '\r' && nextChar === '\n') {
                    flushField();
                    lines.push(currentLine);
                    currentLine = [];
                    i++; // skip \n
                } else if (char === '\n' || char === '\r') {
                    flushField();
                    lines.push(currentLine);
                    currentLine = [];
                } else {
                    fieldChars.push(char);
                }
            }
            i++;
        }

        // Flush remaining field
        flushField();
        if (currentLine.length > 1 || (currentLine.length === 1 && currentLine[0] !== '')) {
            lines.push(currentLine);
        }

        if (lines.length === 0) return [];

        const headers = lines[0];
        const result = [];

        for (let j = 1; j < lines.length; j++) {
            const row = lines[j];
            const obj = {};
            for (let k = 0; k < headers.length; k++) {
                const key = headers[k].trim().replace(/^"|"$/g, '');
                const value = row[k] !== undefined ? row[k] : '';
                obj[key] = value;
            }
            result.push(obj);
        }

        return result;
    }

    /**
     * Extract unique sender names from messages.
     */
    function extractSenders(messages) {
        const senders = new Set();
        for (const msg of messages) {
            if (msg.From) {
                senders.add(msg.From);
            }
        }
        return Array.from(senders);
    }

    /**
     * Update the "self" selector dropdown with sender names.
     */
    function updateSelfSelector(senders) {
        selfSelect.innerHTML = '<option value="">-- 選択 --</option>';
        for (const sender of senders) {
            const option = document.createElement('option');
            option.value = sender;
            option.textContent = sender;
            selfSelect.appendChild(option);
        }
    }

    /**
     * Render a single message element.
     * @param {Object} message
     * @param {Object|null} prevMessage - previous message for consecutive detection
     */
    function createMessageElement(message, prevMessage) {
        const from = message.From || 'Unknown';
        const content = message.Content || '';
        const dateTime = message.DateTime || '';
        const attachments = message.Attachments || '';
        const isOwn = from === currentSelf;
        const isConsecutive = prevMessage && prevMessage.From === from;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'message ' + (isOwn ? 'own' : 'other');
        if (isConsecutive) {
            msgDiv.setAttribute('data-consecutive', 'true');
        }

        const senderDiv = document.createElement('div');
        senderDiv.className = 'message-sender';
        senderDiv.textContent = from;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'message-meta';

        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = dateTime;
        metaDiv.appendChild(timeSpan);

        if (attachments.trim()) {
            const attachSpan = document.createElement('span');
            attachSpan.className = 'message-attachments';
            attachSpan.textContent = '📎 ' + attachments;
            metaDiv.appendChild(attachSpan);
        }

        msgDiv.appendChild(senderDiv);
        msgDiv.appendChild(contentDiv);
        msgDiv.appendChild(metaDiv);

        return msgDiv;
    }

    /**
     * Render all messages into the chat container.
     * Optimizations for large datasets:
     *   - Diff-update when only self-selection changed (same message count)
     *   - DocumentFragment batching for fewer reflows
     *   - Chunked rendering via requestAnimationFrame for >500 messages
     */
    function renderMessages() {
        const existing = chatContainer.querySelectorAll('.message');

        // Fast path: if message count hasn't changed, only toggle own/other classes
        if (existing.length > 0 && existing.length === parsedMessages.length) {
            let changed = false;
            existing.forEach((el, i) => {
                const shouldOwn = parsedMessages[i].From === currentSelf;
                const isOwn = el.classList.contains('own');
                if (shouldOwn !== isOwn) {
                    el.classList.toggle('own', shouldOwn);
                    el.classList.toggle('other', !shouldOwn);
                    changed = true;
                }
            });
            if (changed) return;
        }

        // Full render
        chatContainer.innerHTML = '';

        if (parsedMessages.length === 0) {
            chatContainer.innerHTML = '<div class="empty-state"><p>CSVファイルを選択してください</p></div>';
            return;
        }

        // Mark body as loaded to suppress entry animations on subsequent renders
        document.body.classList.add('loaded');

        // Small file: render all at once with DocumentFragment for fewer reflows
        if (parsedMessages.length <= 500) {
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < parsedMessages.length; i++) {
                const prev = i > 0 ? parsedMessages[i - 1] : null;
                fragment.appendChild(createMessageElement(parsedMessages[i], prev));
            }
            chatContainer.appendChild(fragment);
            finishRender();
            return;
        }

        // Large file: chunked rendering to keep UI responsive
        const CHUNK_SIZE = 200;
        let index = 0;

        function renderChunk() {
            const fragment = document.createDocumentFragment();
            const end = Math.min(index + CHUNK_SIZE, parsedMessages.length);
            for (; index < end; index++) {
                const prev = index > 0 ? parsedMessages[index - 1] : null;
                fragment.appendChild(createMessageElement(parsedMessages[index], prev));
            }
            chatContainer.appendChild(fragment);

            if (index < parsedMessages.length) {
                requestAnimationFrame(renderChunk);
            } else {
                finishRender();
            }
        }

        renderChunk();
    }

    /**
     * Finish rendering: hide loading and move focus for accessibility.
     */
    function finishRender() {
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        chatContainer.setAttribute('tabindex', '-1');
        chatContainer.focus({ preventScroll: true });
    }

    /**
     * Read a File object as text.
     */
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    /**
     * Handle CSV file selection.
     */
    async function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        currentFileName = file.name.replace(/\.csv$/i, '');

        // Show loading indicator
        if (loadingIndicator) {
            loadingIndicator.style.display = 'flex';
        }

        try {
            let text = await readFileAsText(file);
            // Strip UTF-8 BOM if present
            if (text.charCodeAt(0) === 0xFEFF) {
                text = text.slice(1);
            }
            parsedMessages = parseCSV(text);
            // Reverse so oldest messages appear at the top (past → future, top → bottom)
            parsedMessages.reverse();

            // Update header
            chatTitle.textContent = currentFileName;
            chatHeader.style.display = 'block';

            // Update self selector
            const senders = extractSenders(parsedMessages);
            updateSelfSelector(senders);
            selfSelectorGroup.style.display = senders.length > 0 ? 'flex' : 'none';

            // Reset self selection
            currentSelf = '';
            selfSelect.value = '';

            // Render (loading will be hidden inside finishRender)
            renderMessages();
        } catch (err) {
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            alert('CSVファイルの読み込みに失敗しました: ' + err.message);
            console.error(err);
        }
    }

    /**
     * Handle self-selection change.
     */
    function handleSelfChange(event) {
        currentSelf = event.target.value;
        renderMessages();
    }

    /**
     * Theme toggle logic.
     */
    function applyTheme(dark) {
        isDark = dark;
        if (isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggle.textContent = '🌙';
        } else {
            document.documentElement.removeAttribute('data-theme');
            themeToggle.textContent = '☀️';
        }
        try {
            localStorage.setItem('teamsChatTheme', isDark ? 'dark' : 'light');
        } catch (_e) {
            // ignore (e.g. private mode where localStorage is disabled)
        }
    }

    function initTheme() {
        let saved;
        try {
            saved = localStorage.getItem('teamsChatTheme');
        } catch (_e) {
            saved = null;
        }
        if (saved === 'dark') {
            applyTheme(true);
        } else if (saved === 'light') {
            applyTheme(false);
        } else {
            // Default to system preference
            applyTheme(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        }
    }

    function handleThemeToggle() {
        applyTheme(!isDark);
    }

    // Event listeners
    csvFileInput.addEventListener('change', handleFileSelect);
    selfSelect.addEventListener('change', handleSelfChange);
    themeToggle.addEventListener('click', handleThemeToggle);

    initTheme();
})();
