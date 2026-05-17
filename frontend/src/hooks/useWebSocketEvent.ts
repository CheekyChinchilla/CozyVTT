// ============================================
// useWebSocketEvent Hook
// Custom hook for subscribing to WebSocket events
// Automatically handles cleanup on unmount
// ============================================

import { useEffect, useRef } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';

// ============================================
// Hook Definition
// ============================================

/**
 * Subscribe to a WebSocket event with automatic cleanup
 *
 * @param eventName - The name of the event to listen for (e.g., 'chat.message', 'token.moved')
 * @param callback - Callback function to handle the event
 * @param deps - Optional dependency array (similar to useEffect)
 *
 * @example
 * ```tsx
 * useWebSocketEvent('chat.message', (data: ChatMessageBroadcast) => {
 *   console.log('New message:', data);
 *   setMessages(prev => [...prev, data]);
 * });
 * ```
 */
export function useWebSocketEvent<T = any>(
  eventName: string,
  callback: (data: T) => void,
  deps: any[] = []
) {
  const { socket, status } = useWebSocket();
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Subscribe to event
  useEffect(() => {
    if (status !== 'connected') {
      // Don't subscribe if not connected
      return;
    }

    // Create wrapper that calls the current callback
    const eventHandler = (data: T) => {
      callbackRef.current(data);
    };

    // Subscribe to event
    console.log(`[useWebSocketEvent] Subscribing to: ${eventName}`);
    socket.on(eventName, eventHandler);

    // Cleanup on unmount or when dependencies change
    return () => {
      console.log(`[useWebSocketEvent] Unsubscribing from: ${eventName}`);
      socket.off(eventName, eventHandler);
    };
  }, [eventName, socket, status, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ============================================
// Multiple Events Hook
// ============================================

/**
 * Subscribe to multiple WebSocket events at once
 *
 * @param events - Object mapping event names to callback functions
 *
 * @example
 * ```tsx
 * useWebSocketEvents({
 *   'chat.message': (data) => handleChatMessage(data),
 *   'dice.rolled': (data) => handleDiceRoll(data),
 *   'token.moved': (data) => handleTokenMove(data),
 * });
 * ```
 */
export function useWebSocketEvents(
  events: Record<string, (data: any) => void>
) {
  const { socket, status } = useWebSocket();
  const eventsRef = useRef(events);

  // Keep events ref up to date
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  // Subscribe to all events
  useEffect(() => {
    if (status !== 'connected') {
      return;
    }

    const handlers: Record<string, (data: any) => void> = {};

    // Create handlers for each event
    Object.keys(events).forEach((eventName) => {
      const eventHandler = (data: any) => {
        eventsRef.current[eventName]?.(data);
      };
      handlers[eventName] = eventHandler;

      console.log(`[useWebSocketEvents] Subscribing to: ${eventName}`);
      socket.on(eventName, eventHandler);
    });

    // Cleanup all subscriptions
    return () => {
      Object.keys(handlers).forEach((eventName) => {
        console.log(`[useWebSocketEvents] Unsubscribing from: ${eventName}`);
        socket.off(eventName, handlers[eventName]);
      });
    };
  }, [socket, status, Object.keys(events).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
}
