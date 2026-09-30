"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ServerEvents } from "@/server/realtime/emit";

// One shared connection per browser tab. The session cookie is sent automatically,
// so the server knows who is connected (or treats them as an anonymous viewer).
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) socket = io({ path: "/socket.io", withCredentials: true });
  return socket;
}

/** Subscribes to a server event for the lifetime of the component. */
export function useSocketEvent<E extends keyof ServerEvents>(event: E, handler: (payload: ServerEvents[E]) => void) {
  useEffect(() => {
    const s = getSocket();
    const fn = (payload: ServerEvents[E]) => handler(payload);
    s.on(event as string, fn);
    return () => {
      s.off(event as string, fn);
    };
  }, [event, handler]);
}

export function useSocketConnected() {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const s = getSocket();
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    s.on("connect", on);
    s.on("disconnect", off);
    if (s.connected) on();
    return () => {
      s.off("connect", on);
      s.off("disconnect", off);
    };
  }, []);
  return connected;
}
