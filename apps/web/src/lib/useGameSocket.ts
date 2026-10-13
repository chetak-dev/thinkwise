'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CLOSE_KICKED, type ClientMessage, type ServerMessage } from '@thinkwise/shared';

export type SocketStatus = 'connecting' | 'open' | 'reconnecting';
export type Send = (msg: ClientMessage) => void;

function socketUrl() {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  // Dev default: same host as the page, so phones on the LAN reach the server too.
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.hostname}:4000/ws`;
}

export function useGameSocket(handlers: {
  onOpen: (send: Send) => void;
  onMessage: (msg: ServerMessage, send: Send) => void;
}) {
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);

  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });

  const send = useCallback<Send>((msg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const ws = new WebSocket(socketUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        if (stopped) return;
        attempt = 0;
        setStatus('open');
        handlersRef.current.onOpen(send);
      };
      ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        handlersRef.current.onMessage(msg, send);
      };
      ws.onclose = (event) => {
        if (stopped || event.code === CLOSE_KICKED) return;
        setStatus('reconnecting');
        const delay = Math.min(10_000, 500 * 2 ** attempt++) + Math.random() * 400;
        timer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [send]);

  return { status, send };
}
