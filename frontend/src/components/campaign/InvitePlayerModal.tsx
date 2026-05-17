/**
 * Invite Player Modal
 * Fixed: uses /invitable-users endpoint (no admin required); renders via portal to avoid sidebar clipping
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { X, Mail, Loader2, Users } from 'lucide-react';
import { api } from '@/services/api';
import type { User } from '@/types';

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
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useFocusTrap(true, onClose);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const response = await api.listInvitableUsers(campaignId);
        setUsers(response.users || []);
      } catch (err: any) {
        console.error('Error fetching invitable users:', err);
        setError('Failed to load users');
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [campaignId]);

  const handleInvite = async () => {
    if (!selectedUserId) {
      setError('Please select a user to invite');
      return;
    }
    try {
      setSending(true);
      setError('');
      await api.inviteUserToCampaign(campaignId, selectedUserId);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error sending invitation:', err);
      setError(err.response?.data?.message || 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-hidden="true"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-player-title"
        className="bg-soft-cream border border-moss-green/30 rounded-xl shadow-2xl w-full max-w-md flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-moss-green/15">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-moss-green/10">
              <Mail className="w-5 h-5 text-moss-green" />
            </div>
            <div>
              <h2 id="invite-player-title" className="text-lg font-bold text-moss-green">Invite Player</h2>
              <p className="text-xs text-warm-gray">Send a campaign invitation to a user</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 rounded-lg hover:bg-stone-gray/10 transition-colors"
          >
            <X className="w-4 h-4 text-stone-gray" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Error */}
          {error && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* User list */}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-7 h-7 text-moss-green animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <Users className="w-8 h-8 text-stone-gray/40" />
              <p className="text-sm text-warm-gray">No users available to invite.</p>
              <p className="text-xs text-warm-gray/70">All registered users are already members or have pending invitations.</p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-stone-gray mb-1.5">
                Select User
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => { setSelectedUserId(e.target.value); setError(''); }}
                className="input-cozy w-full"
              >
                <option value="">Choose a user...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 pb-5">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleInvite}
            disabled={sending || !selectedUserId || loading}
            className="btn-primary flex items-center gap-2"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="w-4 h-4" />
                Send Invitation
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
