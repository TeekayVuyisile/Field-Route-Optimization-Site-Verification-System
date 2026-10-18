import { useState, useMemo } from 'react';
import { Container, Button, Table, Card, Row, Col, Form } from 'react-bootstrap';
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
    getSortedRowModel,
    getFilteredRowModel
} from '@tanstack/react-table';
import useTripStore from '../store/useTripStore';
import { useNavigate } from 'react-router-dom';
import { FaTrash, FaExchangeAlt, FaPlus, FaSave, FaChevronUp, FaChevronDown } from 'react-icons/fa';
import ManualSiteModal from '../components/ManualSiteModal';
import { validateCoordinates } from '../utils/validation';
import { createTripWithSites } from '../features/trips/tripRepository';
import { toast } from 'react-toastify';

const TripDetails = () => {
    const { currentTrip, loadTrip, sites, setSites, updateSite, removeSite } = useTripStore();
    const navigate = useNavigate();
    const [showManualModal, setShowManualModal] = useState(false);
    const [sorting, setSorting] = useState([]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSwap = (index) => {
        const site = sites[index];
        const newLat = site.longitude;
        const newLng = site.latitude;
        const validation = validateCoordinates(newLat, newLng);
        updateSite(index, {
            latitude: newLat,
            longitude: newLng,
            isValid: validation.isValid,
            error: validation.error,
            isInverted: validation.isInverted
        });
    };

    const columns = useMemo(() => [
        {
            accessorKey: 'name',
            header: 'Site Name',
            cell: info => info.getValue(),
        },
        {
            accessorKey: 'latitude',
            header: 'Latitude',
        },
        {
            accessorKey: 'longitude',
            header: 'Longitude',
        },
        {
            accessorKey: 'isValid',
            header: 'Status',
            cell: ({ row }) => {
                const isValid = row.original.isValid;
                return isValid ?
                    <span className="status-badge is-success">Valid</span> :
                    <span className="status-badge is-warning">Warning</span>;
            }
        },
        {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => (
                <div className="d-flex">
                    <Button
                        variant="outline-secondary"
                        size="sm"
                        className="me-2"
                        onClick={() => handleSwap(row.index)}
                        title="Swap Coordinates"
                    >
                        <FaExchangeAlt />
                    </Button>
                    <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => removeSite(row.index)}
                    >
                        <FaTrash />
                    </Button>
                </div>
            )
        }
    ], [sites]);

    const table = useReactTable({
        data: sites,
        columns,
        state: {
            sorting,
            globalFilter,
        },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
    });

    const handleAddManualSite = (newSite) => {
        setSites([...sites, newSite]);
    };

    const handleSaveTrip = async () => {
        if (!currentTrip || sites.length === 0) return;

        // Already saved (e.g. user came back to this page): don't create a duplicate
        if (currentTrip.id) {
            navigate(`/map/${currentTrip.id}`);
            return;
        }

        try {
            setIsSaving(true);

            // Single transaction: either the trip and every site are saved, or nothing is
            const { trip, sites: savedSites } = await createTripWithSites(currentTrip.title, sites);

            // Swap the staged copy for the persisted one so the map syncs edits
            // against real database ids
            loadTrip(trip, savedSites);

            toast.success('Trip and sites saved to database!');
            navigate(`/map/${trip.id}`);
        } catch (error) {
            toast.error(`Error saving trip: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (!currentTrip) {
        return (
            <Container className="text-center mt-5">
                <h3>No active trip found</h3>
                <Button onClick={() => navigate('/create-trip')}>Create New Trip</Button>
            </Container>
        );
    }

    return (
        <Container className="page-shell">
            <Row className="mb-4 align-items-center">
                <Col>
                    <h1 className="fw-bold mb-1" style={{ color: 'var(--ink)' }}>{currentTrip.title}</h1>
                    <p className="text-muted mb-0">{sites.length} total sites</p>
                </Col>
                <Col xs="auto" className="d-flex gap-2">
                    <Button variant="outline-primary" onClick={() => setShowManualModal(true)}>
                        <FaPlus className="me-2" />
                        Add Site
                    </Button>
                    <Button variant="primary" onClick={handleSaveTrip} disabled={isSaving}>
                        <FaSave className="me-2" />
                        {isSaving ? 'Saving...' : 'Save & Start Map'}
                    </Button>
                </Col>
            </Row>

            <Card className="border-0" style={{ boxShadow: 'var(--shadow-sm)' }}>
                <Card.Body>
                    <Form.Group className="mb-3">
                        <Form.Control
                            type="text"
                            placeholder="Search sites..."
                            value={globalFilter ?? ''}
                            onChange={e => setGlobalFilter(e.target.value)}
                        />
                    </Form.Group>

                    <Table responsive hover className="trip-table align-middle">
                        <thead>
                            {table.getHeaderGroups().map(headerGroup => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map(header => (
                                        <th key={header.id} onClick={header.column.getToggleSortingHandler()}>
                                            <span className="d-inline-flex align-items-center gap-1">
                                                {flexRender(header.column.columnDef.header, header.getContext())}
                                                {{
                                                    asc: <FaChevronUp size={10} />,
                                                    desc: <FaChevronDown size={10} />,
                                                }[header.column.getIsSorted()] ?? null}
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows.map(row => (
                                <tr key={row.id}>
                                    {row.getVisibleCells().map(cell => (
                                        <td key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Card.Body>
            </Card>

            <ManualSiteModal
                show={showManualModal}
                onHide={() => setShowManualModal(false)}
                onAdd={handleAddManualSite}
            />
        </Container>
    );
};

export default TripDetails;
