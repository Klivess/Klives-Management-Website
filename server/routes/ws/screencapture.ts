import WebSocket from 'ws';

const backendConnections = new Map<string, WebSocket>();

export default defineWebSocketHandler({
    open(peer) {
        try {
            const reqUrl = (peer as any).request?.url || (peer as any).url || '';
            const queryString = reqUrl.includes('?') ? reqUrl.split('?')[1] : '';
            const params = new URLSearchParams(queryString);
            const agentId = params.get('agentId') || '';
            const auth = params.get('authorization') || '';

            if (!agentId || !auth) {
                console.error('[SC Proxy] Missing agentId or authorization');
                peer.close(1008, 'Missing agentId or authorization');
                return;
            }

            const backendUrl = `wss://klive.dev/klivelink/agent/screencapture/stream?agentId=${encodeURIComponent(agentId)}`;

            const backend = new WebSocket(backendUrl, {
                headers: { 'Authorization': auth }
            });

            backend.on('open', () => {
                console.log('[SC Proxy] Backend connected for agent:', agentId);
            });

            backend.on('message', (data: WebSocket.RawData) => {
                try {
                    peer.send(typeof data === 'string' ? data : data.toString());
                } catch (e) {
                    // peer might already be closed
                }
            });

            backend.on('error', (err: Error) => {
                console.error('[SC Proxy] Backend error:', err.message);
            });

            backend.on('close', (code: number, reason: Buffer) => {
                console.log('[SC Proxy] Backend closed:', code, reason?.toString());
                try { peer.close(code, reason?.toString()); } catch (e) { }
                backendConnections.delete(peer.id || '');
            });

            backendConnections.set(peer.id || '', backend);
        } catch (err: any) {
            console.error('[SC Proxy] Open error:', err?.message);
            peer.close(1011, 'Proxy error');
        }
    },

    message(peer, message) {
        const backend = backendConnections.get(peer.id || '');
        if (backend && backend.readyState === WebSocket.OPEN) {
            backend.send(message.text());
        }
    },

    close(peer) {
        const backend = backendConnections.get(peer.id || '');
        if (backend) {
            if (backend.readyState === WebSocket.OPEN || backend.readyState === WebSocket.CONNECTING) {
                backend.close();
            }
            backendConnections.delete(peer.id || '');
        }
    }
});
