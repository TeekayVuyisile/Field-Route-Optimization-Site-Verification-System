import { useState, useMemo } from 'react';
import { Container, Button, Table, Card, Row, Col, Form, Badge } from 'react-bootstrap';
import { 
    flexRender, 
    getCoreRowModel, 
    useReactTable, 
    getSortedRowModel,
    getFilteredRowModel
} from '@tanstack/react-table';
import useTripStore from '../store/useTripStore';
import { useNavigate } from 'react-router-dom';
import { FaTrash, FaExchangeAlt, FaMapMarkedAlt, FaPlus, FaSave } from 'react-icons/fa';
import ManualSiteModal from '../components/ManualSiteModal';
import { validateCoordinates } from '../utils/validation';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';

const TripDetails = () => {
    const { currentTrip, sites, setSites, updateSite, removeSite } = useTripStore();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [showManualModal, setShowManualModal] = useState(false);
    const [sorting, setSorting] = useState([]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [isSaving, setIsSaving] = useState(false);

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
                    <Badge bg="success">Valid</Badge> : 
                    <Badge bg="warning" text="dark">Warning</Badge>;
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

    const handleAddManualSite = (newSite) => {
        setSites([...sites, newSite]);
    };

    const handleSaveTrip = async () => {
        if (!currentTrip || sites.length === 0) return;
        
        try {
            setIsSaving(true);
            
            // 1. Create the trip in Supabase
            const { data: tripData, error: tripError } = await supabase
                .from('trips')
                .insert([{
                    title: currentTrip.title,
                    user_id: user.id
                }])
                .select()
                .single();

            if (tripError) throw tripError;

            // 2. Insert sites
            const sitesToInsert = sites.map((site, index) => ({
                trip_id: tripData.id,
                name: site.name,
                latitude: site.latitude,
                longitude: site.longitude,
                order_index: index,
                notes: site.notes || ''
            }));

            const { error: sitesError } = await supabase
                .from('sites')
                .insert(sitesToInsert);

            if (sitesError) throw sitesError;

            toast.success('Trip and sites saved to database!');
            navigate('/map');
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
        <Container className="mb-5">
            <Row className="mb-4 align-items-center">
                <Col>
                    <h1>{currentTrip.title}</h1>
                    <p className="text-muted">{sites.length} total sites</p>
                </Col>
                <Col xs="auto">
                    <Button variant="outline-primary" className="me-2" onClick={() => setShowManualModal(true)}>
                        <FaPlus className="me-2" />
                        Add Site
                    </Button>
                    <Button variant="success" onClick={handleSaveTrip} disabled={isSaving}>
                        <FaSave className="me-2" />
                        {isSaving ? 'Saving...' : 'Save & Start Map'}
                    </Button>
                </Col>
            </Row>

            <Card className="mb-4">
                <Card.Body>
                    <Form.Group className="mb-3">
                        <Form.Control 
                            type="text"
                            placeholder="Search sites..."
                            value={globalFilter ?? ''}
                            onChange={e => setGlobalFilter(e.target.value)}
                        />
                    </Form.Group>

                    <Table responsive hover>
                        <thead>
                            {table.getHeaderGroups().map(headerGroup => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map(header => (
                                        <th key={header.id} onClick={header.column.getToggleSortingHandler()} style={{ cursor: 'pointer' }}>
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                            {{
                                                asc: ' 🔼',
                                                desc: ' 🔽',
                                            }[header.column.getIsSorted()] ?? null}
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
