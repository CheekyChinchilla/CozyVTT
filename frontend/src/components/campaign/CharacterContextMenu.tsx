/**
 * Character Context Menu
 */

import React, { useEffect, useRef, useState } from 'react';


interface ContextMenuItem {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  visible: boolean;
  className?: string;
}

interface CharacterContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function CharacterContextMenu({
  x,
  y,
  items,
  onClose,
}: CharacterContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Start invisible; adjusted position set after measuring
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // On mount: measure menu and flip if it would overflow viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const adjustedX = x + rect.width > vw ? Math.max(0, x - rect.width) : x;
    const adjustedY = y + rect.height > vh ? Math.max(0, y - rect.height) : y;
    setPos({ x: adjustedX, y: adjustedY });
  }, []);  

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Filter visible items
  const visibleItems = items.filter((item) => item.visible);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-soft-cream border-2 border-moss-green/30 rounded-lg shadow-2xl py-2 min-w-[200px]"
      style={{
        left: pos ? pos.x : x,
        top: pos ? pos.y : y,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {visibleItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={index}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-moss-green/10 transition-colors ${
              item.className || 'text-stone-gray'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
