import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'react-toastify';
import { LuUserPlus, LuUserMinus, LuMail, LuX } from 'react-icons/lu';
import { useAuth } from '../context/useAuth';
import { useTeam } from '../context/useTeam';
import {
    fetchTeamMembers, fetchPendingInvitations, inviteMember,
    revokeInvitation, changeMemberRole, removeMember
} from '../features/team/teamRepository';
import Button from '../components/ui/Button';
import { Field, Input, Select } from '../components/ui/Field';
import { Alert, Badge, Card, PageHeader, Skeleton } from '../components/ui/primitives';
import { ConfirmDialog } from '../components/ui/Dialog';
import CheckinRadiusCard from '../components/team/CheckinRadiusCard';

const ROLE_LABELS = { manager: 'Manager', agent: 'Field agent' };

const Team = () => {
    const { user } = useAuth();
    const { membership, isManager, loading: teamLoading, refresh: refreshTeam } = useTeam();
    const [members, setMembers] = useState([]);
    const [invitations, setInvitations] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('agent');
    const [isInviting, setIsInviting] = useState(false);
    // { kind: 'remove' | 'revoke', target } while a confirm dialog is open
    const [pending, setPending] = useState(null);
    const [confirming, setConfirming] = useState(false);

    const orgId = membership?.orgId;

    useEffect(() => {
        if (!orgId) return;
        let cancelled = false;
        (async () => {
            try {
                const [memberRows, invitationRows] = await Promise.all([
                    fetchTeamMembers(),
                    // Only managers can read invitations; RLS returns none for agents
                    isManager ? fetchPendingInvitations() : Promise.resolve([])
                ]);
                if (cancelled) return;
                setMembers(memberRows);
                setInvitations(invitationRows);
            } catch (error) {
                if (!cancelled) toast.error(`Couldn't load your team: ${error.message}`);
            } finally {
                if (!cancelled) setLoaded(true);
            }
        })();
        return () => { cancelled = true; };
    }, [orgId, isManager]);

    const handleInvite = async (e) => {
        e.preventDefault();
        try {
            setIsInviting(true);
            const invitation = await inviteMember({ orgId, email: inviteEmail, role: inviteRole, invitedBy: user.id });
            setInvitations((prev) => [...prev, invitation]);
            setInviteEmail('');
            toast.success(`Invitation added for ${invitation.email}`);
        } catch (error) {
            toast.error(error.message);
        } finally {
            setIsInviting(false);
        }
    };

    const handleRoleChange = async (member, role) => {
        try {
            await changeMemberRole(member.user_id, role);
            setMembers((prev) => prev.map((m) => (m.user_id === member.user_id ? { ...m, role } : m)));
            toast.success(`${member.email} is now a ${ROLE_LABELS[role].toLowerCase()}`);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleConfirm = async () => {
        try {
            setConfirming(true);
            if (pending.kind === 'remove') {
                await removeMember(pending.target.user_id);
                setMembers((prev) => prev.filter((m) => m.user_id !== pending.target.user_id));
            } else {
                await revokeInvitation(pending.target.id);
                setInvitations((prev) => prev.filter((i) => i.id !== pending.target.id));
            }
            setPending(null);
        } catch (error) {
            toast.error(error.message);
        } finally {
            setConfirming(false);
        }
    };

    if (teamLoading || (orgId && !loaded)) {
        return (
            <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6 sm:py-10" aria-busy="true" aria-label="Loading team">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-64 rounded-2xl" />
            </div>
        );
    }

    if (!membership) {
        return (
            <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
                <Alert tone="danger" title="Team unavailable">
                    We couldn't load your team. Try signing out and back in.
                </Alert>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
            <PageHeader
                title={membership.orgName}
                description={`You're a ${ROLE_LABELS[membership.role].toLowerCase()} on this team.`}
            />

            <div className={isManager ? 'grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''}>
                <Card as="section" aria-labelledby="members-heading">
                    <h2 id="members-heading" className="border-b border-border px-5 py-4 font-bold">
                        Members <span className="font-semibold text-faint">({members.length})</span>
                    </h2>
                    <ul className="divide-y divide-border">
                        {members.map((member) => {
                            const isMe = member.user_id === user.id;
                            return (
                                <li key={member.user_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 font-bold text-muted" aria-hidden>
                                        {member.email[0]?.toUpperCase()}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="flex items-center gap-2 truncate font-semibold">
                                            <span className="truncate">{member.email}</span>
                                            {isMe && <Badge>You</Badge>}
                                        </p>
                                        <p className="text-sm text-faint">Joined {dayjs(member.created_at).format('D MMM YYYY')}</p>
                                    </div>
                                    {isManager && !isMe ? (
                                        <div className="flex w-full items-center gap-2 sm:w-auto">
                                            <Select
                                                className="sm:w-40"
                                                value={member.role}
                                                aria-label={`Role for ${member.email}`}
                                                onChange={(e) => handleRoleChange(member, e.target.value)}
                                            >
                                                <option value="agent">{ROLE_LABELS.agent}</option>
                                                <option value="manager">{ROLE_LABELS.manager}</option>
                                            </Select>
                                            <Button
                                                variant="danger-ghost"
                                                size="icon"
                                                aria-label={`Remove ${member.email}`}
                                                onClick={() => setPending({ kind: 'remove', target: member })}
                                            >
                                                <LuUserMinus className="size-5" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <Badge tone={member.role === 'manager' ? 'accent' : 'neutral'}>{ROLE_LABELS[member.role]}</Badge>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </Card>

                {isManager && (
                    <div className="space-y-6">
                    <Card as="section" aria-labelledby="invite-heading" className="p-5">
                        <h2 id="invite-heading" className="font-bold">Invite a teammate</h2>
                        <p className="mt-1 text-sm text-muted">
                            They join automatically when they sign up and confirm this email. Someone who already has an
                            account can accept from their dashboard.
                        </p>
                        <form onSubmit={handleInvite} className="mt-4 space-y-4">
                            <Field label="Email">
                                {(field) => (
                                    <Input
                                        {...field}
                                        type="email"
                                        required
                                        autoComplete="off"
                                        placeholder="agent@company.co.za"
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                    />
                                )}
                            </Field>
                            <Field label="Role">
                                {(field) => (
                                    <Select {...field} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                                        <option value="agent">{ROLE_LABELS.agent}: works assigned trips</option>
                                        <option value="manager">{ROLE_LABELS.manager}: sees and assigns all trips</option>
                                    </Select>
                                )}
                            </Field>
                            <Button type="submit" className="w-full" loading={isInviting}>
                                {!isInviting && <LuUserPlus className="size-4" aria-hidden />} Add invitation
                            </Button>
                        </form>

                        {invitations.length > 0 && (
                            <div className="mt-6">
                                <h3 className="text-sm font-bold text-muted">Pending ({invitations.length})</h3>
                                <ul className="mt-2 divide-y divide-border">
                                    {invitations.map((invitation) => (
                                        <li key={invitation.id} className="flex items-center gap-3 py-2">
                                            <LuMail className="size-4 shrink-0 text-faint" aria-hidden />
                                            <span className="min-w-0 flex-1 truncate text-sm">
                                                {invitation.email}
                                                <span className="text-faint"> · {ROLE_LABELS[invitation.role]}</span>
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label={`Cancel invitation for ${invitation.email}`}
                                                onClick={() => setPending({ kind: 'revoke', target: invitation })}
                                            >
                                                <LuX className="size-5" />
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </Card>
                    <CheckinRadiusCard
                        key={membership.checkinRadiusM}
                        orgId={orgId}
                        radius={membership.checkinRadiusM}
                        onSaved={refreshTeam}
                    />
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={Boolean(pending)}
                onOpenChange={(open) => { if (!open) setPending(null); }}
                title={pending?.kind === 'remove' ? 'Remove from team?' : 'Cancel invitation?'}
                description={pending?.kind === 'remove'
                    ? `${pending.target.email} loses access to the team's trips. Trips they created stay with the team.`
                    : pending ? `${pending.target.email} won't join the team when they sign up.` : ''}
                confirmLabel={pending?.kind === 'remove' ? 'Remove' : 'Cancel invitation'}
                loading={confirming}
                onConfirm={handleConfirm}
            />
        </div>
    );
};

export default Team;
