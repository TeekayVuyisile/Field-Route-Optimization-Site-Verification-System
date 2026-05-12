import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Container, Row, Col, Card, Table, Badge, Button, Spinner, Form } from 'react-bootstrap';
import { supabase } from '../lib/supabase';
import { 
    flexRender, 
    getCoreRowModel, 
    useReactTable, 
    getSortedRowModel,
    getFilteredRowModel
} from '@tanstack/react-table';
import { FaArrowLeft, FaDownload, FaCheckCircle, FaTimesCircle, FaMapMarkedAlt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import useTripStore from '../store/useTripStore';

const TripReview = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { setCurrentTrip, setSites } = useTripStore();
    const [trip, setTrip] = useState(null);
    const [sites, setSitesLocal] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sorting, setSorting] = useState([]);
    const [globalFilter, setGlobalFilter] = useState('');

    useEffect(() => {
        const fetchTripData = async () => {
            try {
                setLoading(true);
                const { data: tripData, error: tripError } = await supabase
                    .from('trips')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (tripError) throw tripError;
                setTrip(tripData);

                const { data: sitesData, error: sitesError } = await supabase
                    .from('sites')
                    .order('order_index', { ascending: true })
                    .select('*')
                    .eq('trip_id', id);

                if (sitesError) throw sitesError;
                setSitesLocal(sitesData);
            } catch (error) {
                console.error('Error fetching trip data:', error.message);
                toast.error('Failed to load trip data');
                navigate('/');
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchTripData();
    }, [id, navigate]);

    const handleResumeMap = () => {
        const mappedSites = sites.map(s => ({
            ...s,
            isValid: true
        }));

        setCurrentTrip(trip);
        setSites(mappedSites);
        navigate('/map');
    };

    const columns = useMemo(() => [
        {
            accessorKey: 'name',
            header: 'Site Name',
        },
        {
            accessorKey: 'is_checked',
            header: 'Status',
            cell: ({ getValue }) => (
                getValue() ? 
                <Badge bg="success"><FaCheckCircle className="me-1" /> Verified</Badge> : 
                <Badge bg="secondary"><FaTimesCircle className="me-1" /> Pending</Badge>
            )
        },
        {
            accessorKey: 'notes',
            header: 'Field Notes',
            cell: ({ getValue }) => (
                <div style={{ maxWidth: '300px', whiteSpace: 'normal', fontSize: '0.9rem' }}>
                    {getValue() || <span className="text-muted fst-italic">No notes recorded</span>}
                </div>
            )
        },
        {
            accessorKey: 'latitude',
            header: 'Latitude',
            cell: info => info.getValue().toFixed(6)
        },
        {
            accessorKey: 'longitude',
            header: 'Longitude',
            cell: info => info.getValue().toFixed(6)
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

    const exportToCSV = () => {
        if (!sites.length) return;
        const headers = ['Site Name', 'Status', 'Notes', 'Latitude', 'Longitude'];
        const rows = sites.map(s => [
            s.name,
            s.is_checked ? 'Verified' : 'Pending',
            s.notes || '',
            s.latitude,
            s.longitude
        ]);
        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `Trip_Report_${trip?.title || 'Export'}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) {
        return (
            <Container className="text-center mt-5">
                <Spinner animation="border" variant="primary" />
                <p className="mt-2">Loading trip data...</p>
            </Container>
        );
    }

    const completionRate = sites.length > 0 
        ? Math.round((sites.filter(s => s.is_checked).length / sites.length) * 100) 
        : 0;

    return (
        <Container className="mb-5">
            <div className="d-flex align-items-center mb-4 pt-3">
                <Button variant="link" as={Link} to="/" className="text-decoration-none p-0 me-3">
                    <FaArrowLeft /> Back to Dashboard
                </Button>
            </div>

            <Row className="mb-4 align-items-center">
                <Col md={8}>
                    <h1 className="mb-1 fw-bold">{trip?.title}</h1>
                    <p className="text-muted">
                        Created on {new Date(trip?.created_at).toLocaleDateString()} • {sites.length} Total Sites
                    </p>
                </Col>
                <Col md={4} className="text-md-end">
                    <Button variant="outline-primary" className="me-2 rounded-pill" onClick={exportToCSV}>
                        <FaDownload className="me-2" /> Export Report
                    </Button>
                    <Button variant="primary" className="rounded-pill" onClick={handleResumeMap}>
                        <FaMapMarkedAlt className="me-2" /> Resume Map
                    </Button>
                </Col>
            </Row>

            <Row className="mb-4 g-3">
                <Col md={4}>
                    <Card className="text-center shadow-sm h-100 border-0">
                        <Card.Body>
                            <Card.Title className="text-muted small text-uppercase fw-bold">Completion</Card.Title>
                            <h2 className="mb-0 fw-bold">{completionRate}%</h2>
                            <div className="progress mt-2" style={{ height: '8px' }}>
                                <div 
                                    className={`progress-bar ${completionRate === 100 ? 'bg-success' : 'bg-primary'}`} 
                                    role="progressbar" 
                                    style={{ width: `${completionRate}%` }}
                                ></div>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={4}>
                    <Card className="text-center shadow-sm h-100 border-0">
                        <Card.Body>
                            <Card.Title className="text-muted small text-uppercase fw-bold">Verified</Card.Title>
                            <h2 className="mb-0 text-success fw-bold">{sites.filter(s => s.is_checked).length}</h2>
                            <p className="small text-muted mb-0">sites checked</p>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={4}>
                    <Card className="text-center shadow-sm h-100 border-0">
                        <Card.Body>
                            <Card.Title className="text-muted small text-uppercase fw-bold">Pending</Card.Title>
                            <h2 className="mb-0 text-warning fw-bold">{sites.filter(s => !s.is_checked).length}</h2>
                            <p className="small text-muted mb-0">sites remaining</p>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Card className="shadow-sm border-0 overflow-hidden" style={{ borderRadius: '15px' }}>
                <Card.Header className="bg-white border-0 pt-4 px-4 d-flex justify-content-between align-items-center">
                    <h4 className="mb-0 fw-bold">Verification Log</h4>
                    <Form.Group style={{ width: '250px' }}>
                        <Form.Control 
                            type="text"
                            placeholder="Search sites or notes..."
                            value={globalFilter ?? ''}
                            onChange={e => setGlobalFilter(e.target.value)}
                            className="bg-light border-0 rounded-pill px-3"
                        />
                    </Form.Group>
                </Card.Header>
                <Card.Body className="p-0">
                    <Table responsive hover className="align-middle mb-0">
                        <thead className="bg-light">
                            {table.getHeaderGroups().map(headerGroup => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map(header => (
                                        <th key={header.id} className="border-0 px-4 py-3 text-muted text-uppercase small" onClick={header.column.getToggleSortingHandler()} style={{ cursor: 'pointer' }}>
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                            {{
                                                asc: ' ↑',
                                                desc: ' ↓',
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
                                        <td key={cell.id} className="px-4 py-3 border-light">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Card.Body>
            </Card>
        </Container>
    );
};

export default TripReview;
