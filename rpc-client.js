/**
 * Ask Gemini: Direct Google RPC Client
 * Communicates with main-world debug-bridge to obtain WIZ session tokens,
 * issues direct batchexecute requests for 'hNvQHb', and deserializes complete
 * turn histories with timestamps, reasoning blocks, and citations.
 */
(function() {
    'use strict';

    var AG = window.AskGemini = window.AskGemini || {};
    window.AG = window.AG || AG;

    var RPC_ID = 'hNvQHb';

    /**
     * Obtains session tokens and dynamic headers from the main world bridge.
     */
    function getSessionTokens(timeoutMs) {
        timeoutMs = timeoutMs || 2000;
        return new Promise(function(resolve, reject) {
            var reqId = 'ag_rpc_' + Date.now() + '_' + Math.random().toString(36).slice(2);
            var timer = null;

            function onResponse(e) {
                if (e.detail && e.detail.id === reqId) {
                    clearTimeout(timer);
                    document.removeEventListener('AG_RPC_SESSION_TOKENS_RESPONSE', onResponse);
                    resolve(e.detail.sessionData || null);
                }
            }

            document.addEventListener('AG_RPC_SESSION_TOKENS_RESPONSE', onResponse);

            timer = setTimeout(function() {
                document.removeEventListener('AG_RPC_SESSION_TOKENS_RESPONSE', onResponse);
                resolve(null);
            }, timeoutMs);

            document.dispatchEvent(new CustomEvent('AG_RPC_GET_SESSION_TOKENS', {
                detail: { id: reqId }
            }));
        });
    }

    /**
     * Parses Google batchexecute anti-XSS response format.
     */
    function parseBatchexecuteText(rawText) {
        if (!rawText || typeof rawText !== 'string') {
            return { rawItems: [], continueCursor: null };
        }

        var lines = rawText.split('\n');
        var parsedArrays = [];

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            // Google batchexecute interleaves chunk byte lengths before JSON arrays
            if (line.startsWith('[') && line.endsWith(']')) {
                try {
                    parsedArrays.push(JSON.parse(line));
                } catch (e) {
                    // Ignore non-JSON lines
                }
            }
        }

        // Recursive search for the wrb.fr response matching RPC_ID
        function findRpcEntry(arr) {
            if (!Array.isArray(arr)) return null;
            if (arr[0] === 'wrb.fr' && arr[1] === RPC_ID && arr[2]) {
                return arr;
            }
            for (var j = 0; j < arr.length; j++) {
                var found = findRpcEntry(arr[j]);
                if (found) return found;
            }
            return null;
        }

        var rpcEntry = findRpcEntry(parsedArrays);
        if (!rpcEntry || !rpcEntry[2]) {
            return { rawItems: [], continueCursor: null };
        }

        try {
            var payload = JSON.parse(rpcEntry[2]);
            var items = Array.isArray(payload[0]) ? payload[0] : [];
            var cursor = payload[1] || null;
            return { rawItems: items, continueCursor: cursor };
        } catch (err) {
            return { rawItems: [], continueCursor: null };
        }
    }

    function deepGet(obj, path, fallback) {
        var curr = obj;
        for (var p = 0; p < path.length; p++) {
            if (curr == null || typeof curr !== 'object') return fallback;
            curr = curr[path[p]];
        }
        return curr === undefined ? fallback : curr;
    }

    /**
     * Unpacks a single batchexecute raw item into a structured conversational turn.
     */
    function parseTurnItem(item, index, convoId) {
        if (!Array.isArray(item)) return null;

        var rawUser = deepGet(item, [2, 0, 0]) || deepGet(item, [2, 0]) || '';
        var userText = Array.isArray(rawUser) ? rawUser.filter(Boolean).join('\n') : String(rawUser || '');

        var rawModel = deepGet(item, [3, 0, 0, 1]) || deepGet(item, [3, 0, 1]) || '';
        var modelText = Array.isArray(rawModel) ? rawModel.filter(Boolean).join('\n') : String(rawModel || '');

        var modelId = deepGet(item, [3, 21], 'gemini');

        var rawThinking = deepGet(item, [3, 0, 0, 37, 0, 0]) || deepGet(item, [3, 0, 37, 0, 0]) || '';
        var thinking = '';
        if (Array.isArray(rawThinking)) {
            thinking = rawThinking.filter(Boolean).join('\n');
        } else if (typeof rawThinking === 'string') {
            thinking = rawThinking;
        }

        var sec = deepGet(item, [4, 0]);
        var timestampMs = (typeof sec === 'number' && sec > 0) ? sec * 1000 : Date.now();

        var citations = [];
        var rawCitations = deepGet(item, [3, 0, 0, 2, 1]) || deepGet(item, [3, 0, 2, 1]);
        if (Array.isArray(rawCitations)) {
            for (var c = 0; c < rawCitations.length; c++) {
                var cit = rawCitations[c];
                var cData = deepGet(cit, [2, 0]);
                if (Array.isArray(cData)) {
                    citations.push({
                        url: cData[0] || '',
                        title: cData[1] || '',
                        domain: cData[2] || ''
                    });
                }
            }
        }

        return {
            turnIndex: index,
            turnId: convoId + '_turn_' + index,
            userPrompt: userText.trim(),
            modelReply: modelText.trim(),
            modelId: String(modelId || 'gemini'),
            thinking: thinking.trim(),
            citations: citations,
            timestamp: timestampMs
        };
    }

    /**
     * Extracts conversation ID from the current page URL.
     */
    function extractConvoId(url) {
        var path = url ? new URL(url, location.origin).pathname : location.pathname;
        var match = path.match(/(?:\/app\/|\/c\/|gemini\.google\.com\/)([a-zA-Z0-9_\-]+)/);
        if (match && match[1] && match[1] !== 'app') {
            return match[1];
        }
        return null;
    }

    /**
     * Fetches all conversation turns directly via Google batchexecute RPC.
     */
    function fetchConversationTurns(convoId, maxPages) {
        convoId = convoId || extractConvoId();
        if (!convoId) {
            return Promise.resolve({ success: false, reason: 'NO_CONVO_ID', turns: [] });
        }

        maxPages = maxPages || 5;

        return getSessionTokens().then(function(sessionData) {
            if (!sessionData || !sessionData.tokens || !sessionData.tokens.SNlM0e) {
                return { success: false, reason: 'NO_SESSION_TOKENS', turns: [] };
            }

            var tokens = sessionData.tokens;
            var extHeaders = sessionData.extHeaders || {};
            var reqId = sessionData.latestReqId || String(Math.floor(Math.random() * 900000) + 100000);

            var pathPrefix = '/_/BardChatUi';
            var rpcUrl = 'https://gemini.google.com' + pathPrefix + '/data/batchexecute'
                + '?rpcids=' + encodeURIComponent(RPC_ID)
                + '&source-path=' + encodeURIComponent(location.pathname)
                + '&bl=' + encodeURIComponent(tokens.cfb2h || '')
                + '&f.sid=' + encodeURIComponent(tokens.FdrFJe || '')
                + '&hl=en'
                + '&_reqid=' + encodeURIComponent(reqId)
                + '&rt=c';

            var allTurns = [];
            var cursor = null;
            var page = 0;

            function fetchPage() {
                if (page >= maxPages) {
                    return Promise.resolve(allTurns);
                }

                var rpcPayload = JSON.stringify([
                    'c_' + convoId,
                    100, // Batch limit of 100 turns
                    cursor,
                    1,
                    [0],
                    [4],
                    null,
                    1
                ]);

                var bodyParams = new URLSearchParams();
                bodyParams.append('f.req', JSON.stringify([[[RPC_ID, rpcPayload, null, 'generic']]]));
                bodyParams.append('at', tokens.SNlM0e);

                var headers = Object.assign({
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                }, extHeaders);

                return fetch(rpcUrl, {
                    method: 'POST',
                    credentials: 'include',
                    headers: headers,
                    body: bodyParams.toString()
                })
                .then(function(res) {
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    return res.text();
                })
                .then(function(rawText) {
                    var parsed = parseBatchexecuteText(rawText);
                    var items = parsed.rawItems || [];

                    for (var i = 0; i < items.length; i++) {
                        var turn = parseTurnItem(items[i], allTurns.length, convoId);
                        if (turn && (turn.userPrompt || turn.modelReply)) {
                            allTurns.push(turn);
                        }
                    }

                    if (items.length < 100 || !parsed.continueCursor) {
                        return allTurns;
                    }

                    cursor = parsed.continueCursor;
                    page++;
                    return fetchPage();
                });
            }

            return fetchPage().then(function(turns) {
                return {
                    success: true,
                    convoId: convoId,
                    turns: turns
                };
            }).catch(function(err) {
                return {
                    success: false,
                    reason: 'RPC_FETCH_ERROR',
                    error: err.message,
                    turns: allTurns
                };
            });
        });
    }

    AG.rpc = {
        getSessionTokens: getSessionTokens,
        parseBatchexecuteText: parseBatchexecuteText,
        parseTurnItem: parseTurnItem,
        extractConvoId: extractConvoId,
        fetchConversationTurns: fetchConversationTurns
    };

    // Listen for debug RPC test requests from main-world DevTools console
    if (typeof document !== 'undefined') {
        document.addEventListener('AG_DEBUG_RPC_REQUEST', function(e) {
            var reqId = e.detail && e.detail.reqId;
            var convoId = e.detail && e.detail.convoId;
            fetchConversationTurns(convoId).then(function(res) {
                document.dispatchEvent(new CustomEvent('AG_DEBUG_RPC_RESPONSE', {
                    detail: { reqId: reqId, result: res }
                }));
            }).catch(function(err) {
                document.dispatchEvent(new CustomEvent('AG_DEBUG_RPC_RESPONSE', {
                    detail: { reqId: reqId, result: { success: false, reason: 'RPC_ERROR', error: String(err) } }
                }));
            });
        });
    }

    AG.debug = AG.debug || {};
    AG.debug.testRpc = function(convoId) {
        console.log('[Ask Gemini RPC] Fetching conversation turns...');
        return fetchConversationTurns(convoId).then(function(res) {
            console.group('[Ask Gemini RPC Result]');
            console.log('Success:', res.success);
            console.log('Total Turns:', res.turns ? res.turns.length : 0);
            console.log(res);
            console.groupEnd();
            return res;
        });
    };
})();
