// ============================================
// Change Email
//
// Embedded in ProfilePage > Profile Information, under the address.
// The server asks for the current password, refuses an address another
// account has, tells the old address when it can send email, and caps the
// attempts an hour; its refusals are shown as they come.
// ============================================

import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { profileService } from '@/services/profile.service';
import { apiErrorMessage } from '@/utils/errors';
import { isValidEmail, MAX_EMAIL_LENGTH } from '@/utils/validation';

interface ChangeEmailFormProps {
  userId: string;
  currentEmail: string;
  /** Whether this server sends email; undefined while that is not known. */
  sendsEmail: boolean | undefined;
  /** Called once the address has changed, to read the account again. */
  onChanged: () => Promise<void> | void;
}

/** What the form says about the notice to the old address. */
function noticeText(sendsEmail: boolean | undefined, currentEmail: string): string {
  if (sendsEmail === true) return `A notice that the address changed goes to ${currentEmail}.`;
  if (sendsEmail === false) return 'This server does not send email, so no notice goes to your current address.';
  return 'If this server sends email, a notice that the address changed goes to your current address.';
}

export default function ChangeEmailForm({ userId, currentEmail, sendsEmail, onChanged }: ChangeEmailFormProps) {
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailId = useId();
  const passwordId = useId();
  const noticeId = useId();

  useEffect(() => () => {
    if (successTimer.current) clearTimeout(successTimer.current);
  }, []);

  // Closing the form puts the focus back on the button that opened it.
  useEffect(() => {
    if (!open && returnFocus.current) {
      returnFocus.current = false;
      openButtonRef.current?.focus();
    }
  }, [open]);

  const close = () => {
    returnFocus.current = true;
    setOpen(false);
    setNewEmail('');
    setPassword('');
    setError('');
  };

  // A refusal leaves the focus on the address, where the fix usually is; the
  // submit button it was on is disabled while the request runs.
  const refuse = (message: string) => {
    setError(message);
    emailInputRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const address = newEmail.trim();
    if (!isValidEmail(address)) {
      refuse('Enter a valid email address');
      return;
    }
    if (address.toLowerCase() === currentEmail.toLowerCase()) {
      refuse('That is already your email address');
      return;
    }

    setSaving(true);
    try {
      const updated = await profileService.changeEmail(userId, address, password);
      await onChanged();
      close();
      setSuccess(`Email changed to ${updated.email}.`);
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(''), 6000);
    } catch (err) {
      refuse(apiErrorMessage(err) || 'Failed to change email');
    } finally {
      setSaving(false);
    }
  };

  const formElement = (
    <form onSubmit={handleSubmit} className="mt-2 space-y-3 max-w-sm" noValidate>
      {error && (
        <div role="alert" className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger-ink">{error}</div>
      )}
      <div>
        <label htmlFor={emailId} className="block text-xs font-medium text-stone-gray mb-1">New Email Address</label>
        <input
          ref={emailInputRef}
          id={emailId}
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          maxLength={MAX_EMAIL_LENGTH}
          className="input-cozy w-full"
          autoComplete="email"
          aria-describedby={noticeId}
          autoFocus
        />
      </div>
      <div>
        <label htmlFor={passwordId} className="block text-xs font-medium text-stone-gray mb-1">Current Password</label>
        <input
          id={passwordId}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-cozy w-full"
          autoComplete="current-password"
        />
      </div>
      <p id={noticeId} className="text-xs text-warm-gray">{noticeText(sendsEmail, currentEmail)}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving} disabled={!newEmail.trim() || !password} className="text-sm py-1.5 px-3">
          {saving ? 'Changing...' : 'Change Email'}
        </Button>
        <Button type="button" variant="secondary" onClick={close} disabled={saving} className="text-sm py-1.5 px-3">
          Cancel
        </Button>
      </div>
    </form>
  );

  return (
    <div className="mt-1 space-y-1">
      {/* Always on the page, so a screen reader announces the text when it
          is set, in the same moment the form closes. */}
      <p role="status" className={success ? 'text-xs text-success-ink flex items-center gap-1' : 'sr-only'}>
        {success && <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />}
        {success}
      </p>
      {open ? formElement : (
        <Button
          ref={openButtonRef}
          type="button"
          variant="secondary"
          className="text-sm py-1.5 px-3"
          onClick={() => { setSuccess(''); setOpen(true); }}
        >
          Change Email
        </Button>
      )}
    </div>
  );
}
