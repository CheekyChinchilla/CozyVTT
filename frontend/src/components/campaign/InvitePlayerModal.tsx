/**
 * Invite Player Modal
 *
 * Finds the person to invite by searching for their display name. The server
 * answers at most INVITE_SEARCH_MAX_RESULTS matches: INVITE_SEARCH_MIN_LENGTH
 * or more characters find names that contain them, and fewer find only names
 * that are exactly them, so running a campaign is not a way to list everyone
 * on the instance and a one-letter name can still be found. Renders through
 * the shared Modal's portal, so the sidebar does not clip it.
 */

import { useState, useEffect } from 'react';
import { Mail, Loader2, User as UserIcon } from 'lucide-react';
import { api } from '@/services/api';
import { useServerConfigQuery } from '@/hooks/queries';
import { useToast } from '@/contexts/ToastContext';
import type { InvitableUser } from '@/types';
import { Button, Modal, Field, Input } from '@/components/ui';
import { apiErrorMessage } from '@/utils/errors';
import { INVITE_SEARCH_MIN_LENGTH, INVITE_SEARCH_MAX_RESULTS } from '@/constants/inviteSearchLimits';

/** How long typing has to pause before a search goes out. */
const SEARCH_DELAY_MS = 300;

interface InvitePlayerModalProps {
  campaignId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function InvitePlayerModal({
  campaignId,
  onClose,
  onSuccess,
}: InvitePlayerModalProps) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<InvitableUser[]>([]);
  const [hasMore, setHasMore] = useState(false);
  /** The search the listed matches answer, once one has come back. */
  const [answered, setAnswered] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // Opt-in, and deliberately not remembered between invitations: emailing
  // someone is a decision worth making each time rather than a setting that
  // quietly stays on.
  const [sendEmail, setSendEmail] = useState(false);

  const { showToast } = useToast();
  const { data: serverConfig } = useServerConfigQuery();
  const emailAvailable = serverConfig?.smtp?.configured ?? false;

  const term = search.trim();

  useEffect(() => {
    if (term.length === 0) {
      setUsers([]);
      setHasMore(false);
      setAnswered(null);
      setSearching(false);
      return;
    }
    let current = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await api.listInvitableUsers(campaignId, term);
        if (!current) return;
        setUsers(response.users);
        setHasMore(response.hasMore);
        setAnswered(term);
        setError('');
      } catch (err) {
        if (!current) return;
        setError(apiErrorMessage(err) || 'Failed to search for people to invite');
      } finally {
        if (current) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [campaignId, term]);

  // A pick that a new search no longer lists is no longer a pick.
  useEffect(() => {
    if (selectedUserId && !users.some((user) => user.id === selectedUserId)) setSelectedUserId('');
  }, [users, selectedUserId]);

  const handleInvite = async () => {
    if (!selectedUserId) {
      setError('Pick the person to invite');
      return;
    }
    try {
      setSending(true);
      setError('');
      const { emailSent } = await api.inviteUserToCampaign(
        campaignId,
        selectedUserId,
        sendEmail && emailAvailable
      );
      // Say what actually happened. Asking for an email and not getting one is
      // worth knowing about, and the server is the only thing that can tell us.
      showToast(
        emailSent ? 'Invitation sent, and emailed to them.' : 'Invitation sent.',
        'success'
      );
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error sending invitation:', err);
      setError(apiErrorMessage(err) || 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  const showNoMatches = !searching && answered === term && users.length === 0;
  const wholeNameOnly = term.length < INVITE_SEARCH_MIN_LENGTH;

  return (
    <Modal
      open
      onClose={onClose}
      title="Invite Player"
      icon={Mail}
      size="sm"
      closeDisabled={sending}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={sending} variant="secondary">
            Cancel
          </Button>
          <Button
            onClick={handleInvite}
            disabled={!selectedUserId}
            loading={sending}
            icon={Mail}
          >
            {sending ? 'Sending...' : 'Send Invitation'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Error */}
        {error && (
          <div role="alert" className="p-3 rounded-lg bg-danger/10 border border-danger/30">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <Field
          label="Search by display name"
          hint="Type at least 2 letters of their display name, or the whole name if it is one letter long."
        >
          {(field) => (
            <Input
              {...field}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={50}
              autoComplete="off"
              autoFocus
              disabled={sending}
            />
          )}
        </Field>

        {searching && (
          <div className="flex items-center justify-center py-4" aria-live="polite">
            <Loader2 className="w-6 h-6 text-brand-ink animate-spin" aria-label="Searching" />
          </div>
        )}

        {!searching && users.length > 0 && (
          <div role="radiogroup" aria-label="People who match" className="space-y-1 max-h-64 overflow-y-auto">
            {users.map((user) => (
              <label
                key={user.id}
                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border ${
                  selectedUserId === user.id
                    ? 'border-brand-ink/50 bg-moss-green/10'
                    : 'border-transparent hover:bg-moss-green/5'
                }`}
              >
                <input
                  type="radio"
                  name="invitee"
                  value={user.id}
                  aria-label={user.displayName}
                  checked={selectedUserId === user.id}
                  onChange={() => { setSelectedUserId(user.id); setError(''); }}
                  disabled={sending}
                  className="w-4 h-4 text-brand-ink focus:ring-moss-green/50"
                />
                {/* The picture is how two people with the same name are told apart. */}
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-moss-green/20 flex items-center justify-center" aria-hidden="true">
                    <UserIcon className="w-4 h-4 text-brand-ink/60" />
                  </span>
                )}
                <span className="text-sm text-ink break-all">{user.displayName}</span>
              </label>
            ))}
          </div>
        )}

        {!searching && hasMore && (
          <p className="text-xs text-warm-gray">
            Showing the first {INVITE_SEARCH_MAX_RESULTS} matches. Type more of the name to narrow it down.
          </p>
        )}

        {showNoMatches && wholeNameOnly && (
          <p className="text-sm text-ink-muted text-center py-2">
            No one called “{term}” can be invited. Type {INVITE_SEARCH_MIN_LENGTH} or more letters to search for part of a name.
          </p>
        )}

        {showNoMatches && !wholeNameOnly && (
          <p className="text-sm text-ink-muted text-center py-2">
            No one by that name can be invited. They need an account on this server, and cannot
            already be in this campaign or have an invitation waiting.
          </p>
        )}

        {/* Email is opt-in. The invitation shows up on the player's dashboard
            regardless, so most of the time telling them yourself is enough.
            Note the label cannot name their email address — the invitable-users
            endpoint withholds addresses so a DM cannot harvest them. */}
        <label
          className={`flex items-start gap-3 ${
            emailAvailable ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
          }`}
        >
          <div className="mt-0.5">
            <input
              type="checkbox"
              checked={sendEmail && emailAvailable}
              onChange={(e) => setSendEmail(e.target.checked)}
              disabled={sending || !emailAvailable}
              className="w-4 h-4 rounded-sm border-moss-green/30 text-brand-ink focus:ring-moss-green/50"
            />
          </div>
          <div>
            <span className="text-sm text-ink">Also email them an invitation</span>
            <p className="text-xs text-warm-gray mt-0.5">
              {emailAvailable
                ? "They'll see the invitation on their dashboard either way."
                : 'Email is not set up on this server, so only the dashboard invitation will appear.'}
            </p>
          </div>
        </label>
      </div>
    </Modal>
  );
}
