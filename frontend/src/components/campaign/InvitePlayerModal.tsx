/**
 * Invite Player Modal
 * Fixed: uses /invitable-users endpoint (no admin required); renders via portal to avoid sidebar clipping
 */

import { useState, useEffect } from 'react';
import { Mail, Loader2, Users } from 'lucide-react';
import { api } from '@/services/api';
import type { User } from '@/types';
import { Button, Modal, Field, Select } from '@/components/ui';

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
            disabled={!selectedUserId || loading}
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

        {/* User list */}
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-7 h-7 text-brand animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <Users className="w-8 h-8 text-ink-muted/40" />
            <p className="text-sm text-ink-muted">No users available to invite.</p>
            <p className="text-xs text-ink-muted/70">All registered users are already members or have pending invitations.</p>
          </div>
        ) : (
          <Field label="Select User">
            {(field) => (
              <Select
                {...field}
                value={selectedUserId}
                onChange={(e) => { setSelectedUserId(e.target.value); setError(''); }}
              >
                <option value="">Choose a user...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>
    </Modal>
  );
}
