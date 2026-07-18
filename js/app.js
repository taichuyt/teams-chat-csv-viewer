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
        let currentField = '';
        let inQuotes = false;
        let i = 0;

        while (i < text.length) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (inQuotes) {
                if (char === '"') {
                    if (nextChar === '"') {
                        currentField += '"';
                        i += 2;
                        continue;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    currentField += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    currentLine.push(currentField);
                    currentField = '';
                } else if (char === '\r' && nextChar === '\n') {
                    currentLine.push(currentField);
                    lines.push(currentLine);
                    currentLine = [];
                    currentField = '';
                    i++; // skip \n
                } else if (char === '\n' || char === '\r') {
                    currentLine.push(currentField);
                    lines.push(currentLine);
                    currentLine = [];
                    currentField = '';
                } else {
                    currentField += char;
                }
            }
            i++;
        }

        // Push remaining
        currentLine.push(currentField);
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
     */
    function createMessageElement(message) {
        const from = message.From || 'Unknown';
        const content = message.Content || '';
        const dateTime = message.DateTime || '';
        const attachments = message.Attachments || '';
        const isOwn = from === currentSelf;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'message ' + (isOwn ? 'own' : 'other');

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

        // Small file: render all at once with DocumentFragment for fewer reflows
        if (parsedMessages.length <= 500) {
            const fragment = document.createDocumentFragment();
            for (const message of parsedMessages) {
                fragment.appendChild(createMessageElement(message));
            }
            chatContainer.appendChild(fragment);
            return;
        }

        // Large file: chunked rendering to keep UI responsive
        const CHUNK_SIZE = 200;
        let index = 0;

        function renderChunk() {
            const fragment = document.createDocumentFragment();
            const end = Math.min(index + CHUNK_SIZE, parsedMessages.length);
            for (; index < end; index++) {
                fragment.appendChild(createMessageElement(parsedMessages[index]));
            }
            chatContainer.appendChild(fragment);

            if (index < parsedMessages.length) {
                requestAnimationFrame(renderChunk);
            }
        }

        renderChunk();
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

            // Render
            renderMessages();
        } catch (err) {
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
