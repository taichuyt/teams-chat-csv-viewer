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
    const ariaStatus = document.getElementById('ariaStatus');

    // State
    let parsedMessages = [];
    let currentSelf = '';
    let currentFileName = '';
    let currentTheme = 'light';

    // Theme definitions
    const THEMES = ['light', 'dark', 'high-contrast'];
    const THEME_ICONS = {
        light: '☀️',
        dark: '🌙',
        'high-contrast': '🔳'
    };

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
     * Populate a container with text nodes and clickable links.
     * URLs are parsed; link text is the decoded filename portion.
     */
    function appendContentWithLinks(container, text) {
        // Match URLs, but stop at closing brackets commonly used as delimiters
        const urlRegex = /(https?:\/\/[^\s)\]}>]+)/g;
        let lastIndex = 0;
        let match;
        let found = false;

        while ((match = urlRegex.exec(text)) !== null) {
            found = true;
            const fullMatch = match[0];
            let url = fullMatch;

            // Strip trailing punctuation
            while (url.length > 0 && '.,;:!?'.includes(url[url.length - 1])) {
                url = url.slice(0, -1);
            }

            // Check for unbalanced parentheses and restore ')' if needed
            let parenCount = 0;
            for (let i = 0; i < url.length; i++) {
                if (url[i] === '(') parenCount++;
                else if (url[i] === ')') parenCount--;
            }

            let restoredChars = '';
            if (parenCount > 0) {
                let pos = match.index + fullMatch.length;
                while (parenCount > 0 && pos < text.length && text[pos] === ')') {
                    restoredChars += ')';
                    url += ')';
                    parenCount--;
                    pos++;
                }
            }

            if (match.index > lastIndex) {
                container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }

            let rawFileName = url.substring(url.lastIndexOf('/') + 1);
            if (!rawFileName) {
                const trimmed = url.replace(/\/+$/, '');
                rawFileName = trimmed.substring(trimmed.lastIndexOf('/') + 1) || trimmed;
            }
            let decodedFileName;
            try {
                decodedFileName = decodeURIComponent(rawFileName);
            } catch (_e) {
                decodedFileName = rawFileName;
            }
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'content-link';
            a.textContent = decodedFileName;
            container.appendChild(a);

            lastIndex = match.index + fullMatch.length + restoredChars.length;
        }

        if (!found) {
            container.textContent = text;
        } else if (lastIndex < text.length) {
            container.appendChild(document.createTextNode(text.slice(lastIndex)));
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

        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';

        const senderDiv = document.createElement('div');
        senderDiv.className = 'message-sender';
        senderDiv.textContent = from;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = dateTime;

        headerDiv.appendChild(senderDiv);
        headerDiv.appendChild(timeSpan);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        appendContentWithLinks(contentDiv, content);

        if (attachments.trim()) {
            const rawUrl = attachments.trim();
            const rawFileName = rawUrl.substring(rawUrl.lastIndexOf('/') + 1);
            let decodedFileName;
            try {
                decodedFileName = decodeURIComponent(rawFileName);
            } catch (_e) {
                decodedFileName = rawFileName;
            }

            const attachLink = document.createElement('a');
            attachLink.className = 'message-attachments';
            attachLink.href = rawUrl;
            attachLink.target = '_blank';
            attachLink.rel = 'noopener noreferrer';
            attachLink.title = rawUrl;
            attachLink.textContent = '📎 ' + decodedFileName;

            if (content.trim()) {
                contentDiv.appendChild(document.createElement('br'));
            }
            contentDiv.appendChild(attachLink);
        }

        msgDiv.appendChild(headerDiv);
        msgDiv.appendChild(contentDiv);

        return msgDiv;
    }

    /**
     * Render all messages into the chat container.
     * Optimizations for large datasets:
     *   - Diff-update when only self-selection changed (same message count)
     *   - DocumentFragment batching for fewer reflows
     *   - Chunked rendering via requestAnimationFrame for >500 messages
     * @param {boolean} forceFullRender - skip diff update and always do full render
     */
    function renderMessages(forceFullRender) {
        const existing = chatContainer.querySelectorAll('.message');

        // Fast path: if message count hasn't changed, only toggle own/other classes
        if (!forceFullRender && existing.length > 0 && existing.length === parsedMessages.length) {
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
            chatContainer.innerHTML = '<div class="empty-state"><p>CSVファイルを選択またはドラッグ＆ドロップしてください</p></div>';
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
     * Finish rendering: hide loading, announce status, and move focus for accessibility.
     */
    function finishRender() {
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        if (ariaStatus) {
            ariaStatus.textContent = 'チャットログを ' + parsedMessages.length + ' 件読み込みました。';
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
     * Process a CSV File object (used by both file input and drag-and-drop).
     */
    async function processFile(file) {
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
            // Sort by DateTime so oldest messages appear at the top (past → future, top → bottom)
            parsedMessages.sort(function (a, b) {
                return new Date(a.DateTime) - new Date(b.DateTime);
            });

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
            renderMessages(true);
        } catch (err) {
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            alert('CSVファイルの読み込みに失敗しました: ' + err.message);
            console.error(err);
        }
    }

    /**
     * Handle CSV file selection.
     */
    function handleFileSelect(event) {
        const file = event.target.files[0];
        processFile(file);
    }

    /**
     * Handle drag-and-drop events on the chat container.
     */
    function handleDragOver(event) {
        event.preventDefault();
        chatContainer.classList.add('drag-over');
    }

    function handleDragLeave(event) {
        chatContainer.classList.remove('drag-over');
    }

    function handleDrop(event) {
        event.preventDefault();
        chatContainer.classList.remove('drag-over');

        const file = event.dataTransfer.files[0];
        if (file && file.name.toLowerCase().endsWith('.csv')) {
            processFile(file);
            if (ariaStatus) {
                ariaStatus.textContent = 'CSVファイル ' + file.name + ' をドロップしました。';
            }
        } else {
            if (ariaStatus) {
                ariaStatus.textContent = 'CSVファイル以外はドロップできません。';
            }
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
    function applyTheme(theme) {
        if (!THEMES.includes(theme)) {
            console.warn('Invalid theme:', theme);
            theme = 'light';
        }
        currentTheme = theme;
        document.documentElement.setAttribute('data-theme', currentTheme);
        if (themeToggle) {
            themeToggle.textContent = THEME_ICONS[currentTheme];
        }
        try {
            localStorage.setItem('teamsChatTheme', currentTheme);
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
        if (THEMES.includes(saved)) {
            applyTheme(saved);
        } else if (window.matchMedia && window.matchMedia('(forced-colors: active)').matches) {
            applyTheme('high-contrast');
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            applyTheme('dark');
        } else {
            applyTheme('light');
        }
    }

    function handleThemeToggle() {
        const nextIndex = (THEMES.indexOf(currentTheme) + 1) % THEMES.length;
        applyTheme(THEMES[nextIndex]);
    }

    // Event listeners
    csvFileInput.addEventListener('change', handleFileSelect);
    selfSelect.addEventListener('change', handleSelfChange);
    themeToggle.addEventListener('click', handleThemeToggle);

    chatContainer.addEventListener('dragover', handleDragOver);
    chatContainer.addEventListener('dragleave', handleDragLeave);
    chatContainer.addEventListener('drop', handleDrop);

    initTheme();
})();
