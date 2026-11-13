// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * OriginalValues Component
 *
 * The values a Horror d100 character held on the sheet used before version
 * 1.7.0, from the record its conversion wrote. Read-only: nothing here is
 * used by the sheet, and nothing here can be changed.
 *
 * The record is sent to everyone who can read the character, as the old
 * sheet's values were. Showing it is a choice of the page, which shows it to
 * the character's owner and the campaign's GM.
 */

import React from 'react';
import { Archive, Check } from 'lucide-react';
import { formatDate } from '@/utils/format';
import type { HorrorD100ConversionRecord } from '@/types/game-systems/horrorD100Sheet';
import { HORROR_D100_CHARACTERISTIC_ORDER } from '../sheetForm';

interface OriginalValuesProps {
  /** The record of the sheet's conversion. */
  record: HorrorD100ConversionRecord;
}

/** The day the record gives, or its own text where that is no date. */
function convertedOn(at: string): string {
  return Number.isNaN(new Date(at).getTime()) ? at : formatDate(at);
}

/** "8 of 12", either part left out where the record has none. */
function ofMaximum(pool: { maximum?: number; current?: number } | undefined): string | null {
  if (!pool || (pool.current === undefined && pool.maximum === undefined)) return null;
  if (pool.maximum === undefined) return String(pool.current);
  return pool.current === undefined ? `maximum ${pool.maximum}` : `${pool.current} of ${pool.maximum}`;
}

/**
 * OriginalValues - what the character held before its sheet was rebuilt
 */
export const OriginalValues: React.FC<OriginalValuesProps> = ({ record }) => {
  const characteristics = HORROR_D100_CHARACTERISTIC_ORDER.filter((key) => record.characteristics?.[key] !== undefined);
  const sanity = record.sanity;
  const figures: [string, string | number | null | undefined][] = [
    ['Hit points', ofMaximum(record.hitPoints)],
    ['Power points', ofMaximum(record.powerPoints)],
    ['Sanity', ofMaximum(sanity)],
    ['Starting Sanity', sanity?.starting],
    ['Luck', record.luck],
    ['Damage modifier', record.damageModifier],
    ['Strength and size step', record.build],
    ['MOV', record.move],
  ];
  const shown = figures.filter((figure): figure is [string, string | number] => figure[1] !== null && figure[1] !== undefined);
  const skills = Array.isArray(record.skills) ? record.skills : [];
  const kept = Array.isArray(record.kept) ? record.kept : [];

  return (
    <section aria-label="Original values" className="bg-ink/5 border border-ink/20 rounded-lg p-4 space-y-4">
      <div>
        <h3 className="text-lg font-bold text-ink flex items-center space-x-2">
          <Archive className="w-5 h-5 text-ink-secondary" />
          <span>Original values</span>
        </h3>
        <p className="text-sm text-ink-secondary mt-1">
          This sheet was rebuilt on {convertedOn(record.at)}. These are the values it held before, kept for reference. Nothing on the
          sheet uses them, and they cannot be changed.
        </p>
      </div>

      {characteristics.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-ink-secondary uppercase mb-2">Characteristics</h4>
          <dl className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-8 gap-2 text-center">
            {characteristics.map((key) => (
              <div key={key} className="bg-paper border border-ink/20 rounded-sm p-2">
                <dt className="text-xs font-semibold text-ink-secondary">{key}</dt>
                <dd className="text-lg font-bold text-ink">{record.characteristics[key]}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {shown.length > 0 && (
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {shown.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-ink-secondary uppercase">{label}</dt>
              <dd className="font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {skills.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-ink-secondary uppercase mb-2">Skills</h4>
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-sm">
            {skills.map((skill, index) => (
              <li key={index} className="flex items-center justify-between gap-2 border-b border-ink/10 py-0.5">
                <span className="min-w-0 truncate text-ink">{skill.name}</span>
                <span className="shrink-0 flex items-center gap-1 font-semibold text-ink">
                  {skill.experienceCheck && (
                    <span role="img" aria-label="Experience check ticked" title="Experience check ticked">
                      <Check className="w-3.5 h-3.5 text-ink-secondary" />
                    </span>
                  )}
                  {skill.value}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {kept.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-ink-secondary uppercase mb-1">Kept as written</h4>
          <p className="text-sm text-ink-secondary mb-2">The rebuilt sheet has no place for these, so they are kept here as they were.</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-ink">
            {kept.map((item, index) => (
              <li key={index} className="whitespace-pre-wrap break-words">{item}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default OriginalValues;
