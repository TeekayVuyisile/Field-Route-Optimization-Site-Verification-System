import { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Table, Button, Form, Spinner } from 'react-bootstrap';
import { FaUserPlus, FaTrash, FaEnvelope } from 'react-icons/fa';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import { useAuth } from '../context/useAuth';
import { useTeam } from '../context/useTeam';
import {
    fetchTeamMembers, fetchPendingInvitations, inviteMember,
    revokeInvitation, changeMemberRole, removeMember
} from '../features/team/teamRepository';

const ROLE_LABELS = { manager: 'Manager', agent: 'Field agent' };

const Team = () => {
    const { user } = useAuth();
    const { membership, isManager, loading: teamLoading } = useTeam();
    const [members, setMembers] = useState([]);
    const [invitations, setInvitations] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('agent');
    const [isInviting, setIsInviting] = useState(false);

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

    const handleRevoke = async (invitation) => {
        if (!window.confirm(`Cancel the invitation for ${invitation.email}?`)) return;
        try {
            await revokeInvitation(invitation.id);
            setInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
        } catch (error) {
            toast.error(error.message);
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

    const handleRemove = async (member) => {
        if (!window.confirm(`Remove ${member.email} from the team? Their trips stay with the team.`)) return;
        try {
            await removeMember(member.user_id);
            setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
        } catch (error) {
            toast.error(error.message);
        }
    };

    if (teamLoading || (orgId && !loaded)) {
        return (
            <Container className="page-shell text-center">
                <Spinner animation="border" role="status" />
                <p className="text-muted mt-3">Loading your team...</p>
            </Container>
        );
    }

    if (!membership) {
        return (
            <Container className="page-shell text-center">
                <h3>Team unavailable</h3>
                <p className="text-muted">We couldn't load your team. Try signing out and back in.</p>
            </Container>
        );
    }

    return (
        <Container className="page-shell">
            <Row className="mb-4 align-items-center">
                <Col>
                    <h1 className="fw-bold" style={{ color: 'var(--ink)' }}>{membership.orgName}</h1>
                    <p className="text-muted mb-0">
                        You are a {ROLE_LABELS[membership.role].toLowerCase()} on this team.
                    </p>
                </Col>
            </Row>

            <Row className="g-4">
                <Col lg={isManager ? 7 : 12}>
                    <Card className="h-100" style={{ boxShadow: 'none' }}>
                        <Card.Body className="p-4">
                            <h5 className="fw-bold mb-3" style={{ color: 'var(--ink)' }}>Members ({members.length})</h5>
                            <Table responsive className="align-middle mb-0">
                                <thead>
                                    <tr>
                                        <th>Email</th>
                                        <th>Role</th>
                                        <th>Joined</th>
                                        {isManager && <th aria-label="Actions" />}
                                    </tr>
                                </thead>
                                <tbody>
                                    {members.map((member) => {
                                        const isMe = member.user_id === user.id;
                                        return (
                                            <tr key={member.user_id}>
                                                <td className="text-break">
                                                    {member.email}
                                                    {isMe && <span className="status-badge is-neutral ms-2">You</span>}
                                                </td>
                                                <td>
                                                    {isManager && !isMe ? (
                                                        <Form.Select
                                                            size="sm"
                                                            value={member.role}
                                                            aria-label={`Role for ${member.email}`}
                                                            onChange={(e) => handleRoleChange(member, e.target.value)}
                                                        >
                                                            <option value="agent">{ROLE_LABELS.agent}</option>
                                                            <option value="manager">{ROLE_LABELS.manager}</option>
                                                        </Form.Select>
                                                    ) : (
                                                        <span className={`status-badge ${member.role === 'manager' ? 'is-accent' : 'is-neutral'}`}>
                                                            {ROLE_LABELS[member.role]}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="text-muted small">{dayjs(member.created_at).format('DD MMM YYYY')}</td>
                                                {isManager && (
                                                    <td className="text-end">
                                                        {!isMe && (
                                                            <Button
                                                                variant="link"
                                                                className="text-danger p-0"
                                                                aria-label={`Remove ${member.email}`}
                                                                onClick={() => handleRemove(member)}
                                                            >
                                                                <FaTrash size={14} />
                                                            </Button>
                                                        )}
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </Table>
                        </Card.Body>
                    </Card>
                </Col>

                {isManager && (
                    <Col lg={5}>
                        <Card style={{ boxShadow: 'none' }}>
                            <Card.Body className="p-4">
                                <h5 className="fw-bold mb-1" style={{ color: 'var(--ink)' }}>Invite a teammate</h5>
                                <p className="text-muted small mb-3">
                                    They join automatically when they sign up and confirm this email address.
                                    Someone who already has an account can accept from their dashboard.
                                </p>
                                <Form onSubmit={handleInvite}>
                                    <Form.Group className="mb-3" controlId="invite-email">
                                        <Form.Label>Email</Form.Label>
                                        <Form.Control
                                            type="email"
                                            required
                                            autoComplete="off"
                                            placeholder="agent@company.co.za"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                        />
                                    </Form.Group>
                                    <Form.Group className="mb-3" controlId="invite-role">
                                        <Form.Label>Role</Form.Label>
                                        <Form.Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                                            <option value="agent">{ROLE_LABELS.agent}: works assigned trips</option>
                                            <option value="manager">{ROLE_LABELS.manager}: sees and assigns all trips</option>
                                        </Form.Select>
                                    </Form.Group>
                                    <Button type="submit" variant="primary" className="w-100" disabled={isInviting}>
                                        {isInviting ? <Spinner size="sm" /> : <FaUserPlus className="me-2" />}
                                        Add invitation
                                    </Button>
                                </Form>

                                {invitations.length > 0 && (
                                    <>
                                        <h6 className="fw-bold mt-4 mb-2" style={{ color: 'var(--ink)' }}>Pending</h6>
                                        <ul className="list-unstyled mb-0">
                                            {invitations.map((invitation) => (
                                                <li key={invitation.id} className="d-flex align-items-center justify-content-between py-2 border-top">
                                                    <span className="text-break small">
                                                        <FaEnvelope className="me-2 text-muted" />
                                                        {invitation.email}
                                                        <span className="text-muted"> · {ROLE_LABELS[invitation.role]}</span>
                                                    </span>
                                                    <Button
                                                        variant="link"
                                                        size="sm"
                                                        className="text-danger p-0 ms-2"
                                                        onClick={() => handleRevoke(invitation)}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </Card.Body>
                        </Card>
                    </Col>
                )}
            </Row>
        </Container>
    );
};

export default Team;
