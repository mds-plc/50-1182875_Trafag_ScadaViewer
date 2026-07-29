/**
 * @file useOrderWatcher.ts
 * @description WebSocket hook pro live CSV záznamy z /ws/orders.
 *   Záznamy jsou řazeny nejnovější nahoře (prepend).
 *   Maximálně MAX_RECORDS v paměti — starší se oříznou.
 */
import { useState, useEffect, useRef } from 'react';
const MAX_RECORDS = 500;
export function useOrderWatcher() {
    const [records, setRecords] = useState([]);
    const wsRef = useRef(null);
    const destroyed = useRef(false);
    useEffect(() => {
        destroyed.current = false;
        function connect(attempt) {
            if (destroyed.current)
                return;
            const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
            const ws = new WebSocket(`${proto}://${window.location.host}/ws/orders`);
            wsRef.current = ws;
            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.type === 'record') {
                        setRecords(prev => [msg.data, ...prev].slice(0, MAX_RECORDS));
                    }
                }
                catch {
                    // neplatný JSON — ignorovat
                }
            };
            ws.onclose = () => {
                if (destroyed.current)
                    return;
                const delay = Math.min(1000 * 2 ** attempt, 30000);
                setTimeout(() => connect(attempt + 1), delay);
            };
        }
        connect(0);
        return () => {
            destroyed.current = true;
            wsRef.current?.close();
        };
    }, []);
    function clearRecords() {
        setRecords([]);
    }
    return { records, clearRecords };
}
