// ============================================
// AboutDialog: About CozyVTT
// ============================================
//
// CozyVTT's licence and where its source code is, and the credits the
// licences of the game rules ask for wherever those rules are used. It does
// not show the version: the sign-in page is public, and an exact version tells
// anyone which instances have not taken a fix. The credits are constants/gameContentNotices.ts, word for word.
// AboutButton opens it; the dashboard, the profile page, the sign-in page and
// a campaign's Campaign Info each have one, so the credits can be reached
// signed in or not, and where the sheets are used.

import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import NoticeText from '@/components/common/NoticeText';
import { COZYVTT_ORC_STATEMENTS, GAME_CONTENT_NOTICES, INDEPENDENT_PRODUCT } from '@/constants/gameContentNotices';
import { cn } from '@/utils/cn';

/** The licence's text, which the window links. */
const LICENCE_URL = 'https://www.gnu.org/licenses/agpl-3.0.html';

/** The project's repository, the one the README clones (a backend test compares them). */
export const SOURCE_CODE_URL = 'https://github.com/CheekyChinchilla/CozyVTT';

const LINK_CLASS =
  'underline underline-offset-2 text-brand-ink hover:text-brand-ink/80 focus:outline-hidden focus:ring-2 focus:ring-brand rounded-xs';

/** A part of the window, named by its heading. */
function Part({ title, children }: { title: string; children: React.ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-base font-semibold text-brand-ink font-heading">
        {title}
      </h3>
      {children}
    </section>
  );
}

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AboutDialog({ open, onClose }: AboutDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="About CozyVTT"
      icon={Info}
      size="lg"
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-6 text-sm text-ink-secondary">
        <div className="space-y-2">
          {/* The notices the licence asks a program to show: that it may be passed on under the licence, with no warranty, and where the licence is. */}
          <p>
            CozyVTT is free software: you can redistribute it and modify it under the terms of the{' '}
            <a href={LICENCE_URL} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
              GNU Affero General Public License v3.0
            </a>
            , as published by the Free Software Foundation.
          </p>
          <p>
            CozyVTT is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
            implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public
            License for more details.
          </p>
          <p>
            <a href={SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
              Source code
            </a>
          </p>
        </div>

        <div className="space-y-4 border-t border-brand/15 pt-4">
          <p>
            The open game rules CozyVTT&apos;s sheets draw on are not under its licence. Each is credited here as its
            own licence asks.
          </p>
          <NoticeText text={INDEPENDENT_PRODUCT} />
          {GAME_CONTENT_NOTICES.map(({ system, lines }) => (
            <Part key={system} title={system}>
              {lines.map((line) => (
                <NoticeText key={line} text={line} className="text-xs" />
              ))}
            </Part>
          ))}
          <Part title="CozyVTT's own material">
            {COZYVTT_ORC_STATEMENTS.map((line) => (
              <NoticeText key={line} text={line} className="text-xs" />
            ))}
          </Part>
          <p className="text-xs">
            The full notices are in{' '}
            <a
              href={`${SOURCE_CODE_URL}/blob/main/GAME_CONTENT_NOTICES.md`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(LINK_CLASS, 'wrap-anywhere')}
            >
              GAME_CONTENT_NOTICES.md
            </a>{' '}
            in the source code.
          </p>
        </div>
      </div>
    </Modal>
  );
}

/** The quiet button that opens About CozyVTT, for the foot of a page. */
export function AboutButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'touch-target inline-flex items-center justify-center gap-1.5 rounded-cozy px-2 py-1 text-sm text-warm-gray',
          'hover:text-brand-ink hover:underline underline-offset-2 transition-colors',
          'focus:outline-hidden focus:ring-2 focus:ring-brand',
          className
        )}
      >
        <Info className="w-4 h-4" aria-hidden="true" />
        About CozyVTT
      </button>
      <AboutDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
