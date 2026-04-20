'use client';

import React, { FC, KeyboardEvent, useCallback, useState } from 'react';

export interface CardSelectOption {
  id: string;
  label: string;
  description?: string;
}

export interface CardSelectProps {
  options: CardSelectOption[];
  onSelect: (id: string) => void;
  /** Pre-selected option id (controlled). If omitted, component manages its own state. */
  selectedId?: string;
  /** Optional heading rendered above the cards. */
  title?: string;
  /** Disable all cards (e.g., while a selection is being processed). */
  disabled?: boolean;
}

export const CardSelect: FC<CardSelectProps> = ({
  options,
  onSelect,
  selectedId: controlledId,
  title,
  disabled = false,
}) => {
  const [internalId, setInternalId] = useState<string | null>(null);
  const isControlled = controlledId !== undefined;
  const activeId = isControlled ? controlledId : internalId;

  const handleSelect = useCallback(
    (id: string) => {
      if (disabled) return;
      if (!isControlled) setInternalId(id);
      onSelect(id);
    },
    [disabled, isControlled, onSelect]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelect(id);
      }
    },
    [handleSelect]
  );

  return (
    <div className="flex flex-col gap-[10px] w-full">
      {title && (
        <p className="text-[13px] font-[500] text-newTextColor">{title}</p>
      )}
      <div className="flex flex-col gap-[8px]">
        {options.map((opt) => {
          const isSelected = activeId === opt.id;
          return (
            <button
              key={opt.id}
              role="option"
              aria-selected={isSelected}
              disabled={disabled}
              onClick={() => handleSelect(opt.id)}
              onKeyDown={(e) => handleKeyDown(e, opt.id)}
              className={[
                'group w-full text-left px-[14px] py-[12px] rounded-[10px] border transition-all',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-textItemFocused',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                isSelected
                  ? 'border-textItemFocused bg-boxFocused'
                  : 'border-newBgLineColor bg-newBgColorInner hover:border-textItemBlur hover:bg-newBgLineColor',
              ].join(' ')}
            >
              <span
                className={`block text-[14px] font-[500] leading-[1.4] ${
                  isSelected ? 'text-textItemFocused' : 'text-newTextColor group-hover:text-textItemFocused'
                }`}
              >
                {opt.label}
              </span>
              {opt.description && (
                <span
                  className={`block text-[12px] leading-[1.5] mt-[3px] ${
                    isSelected ? 'text-textItemFocused opacity-80' : 'text-textItemBlur'
                  }`}
                >
                  {opt.description}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
