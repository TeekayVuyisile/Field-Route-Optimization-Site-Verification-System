import { useState, useRef } from 'react';
import { Container, Row, Col, Card, Form, Button, Table } from 'react-bootstrap';
import { motion } from 'framer-motion';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { FaUpload, FaExclamationTriangle, FaExchangeAlt, FaTrash, FaKeyboard, FaPlus, FaCheck } from 'react-icons/fa';
import { validateCoordinates, parseCoordinate, hasReadableCoordinates as isReadable } from '../utils/validation';
import { createLocalId } from '../features/sites/siteIds';
import useTripStore from '../store/useTripStore';
import ManualSiteModal from '../components/ManualSiteModal';

const STEPS = ['Title', 'Method', 'Source', 'Preview'];

// Parsed value when readable; otherwise the original cell text, so the user
// can see what needs fixing instead of "NaN"
const formatCoordinateCell = (value, raw) =>
    Number.isFinite(value) ? value : <span className="text-danger">{String(raw ?? '') || '(empty)'}</span>;

const StepHeader = ({ step }) => (
    <div className="create-trip-stepper mb-4">
        {STEPS.map((label, index) => {
            const num = index + 1;
            const state = num < step ? 'done' : num === step ? 'active' : 'pending';
            return (
                <div key={label} className={`stepper-node is-${state}`}>
                    <span className="stepper-dot">{state === 'done' ? <FaCheck size={11} /> : num}</span>
                    <span className="stepper-label">{label}</span>
                </div>
            );
        })}
    </div>
);

const CreateTrip = () => {
    const [fileData, setFileData] = useState([]);
    const [headers, setHeaders] = useState([]);
    const [mapping, setMapping] = useState({ name: '', lat: '', lng: '' });
    const [tripTitle, setTripTitle] = useState('');
    const [step, setStep] = useState(1); // 1: Title, 2: Choose Method, 3: Upload, 4: Map/Preview
    const [previewSites, setPreviewSites] = useState([]);
    const [showManualModal, setShowManualModal] = useState(false);

    const fileInputRef = useRef();
    const navigate = useNavigate();
    const { setSites, setCurrentTrip } = useTripStore();

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const extension = file.name.split('.').pop().toLowerCase();

        if (extension === 'csv') {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    setHeaders(Object.keys(results.data[0]));
                    setFileData(results.data);
                    setStep(4);
                },
                error: (err) => toast.error(`Error parsing CSV: ${err.message}`)
            });
        } else if (['xlsx', 'xls'].includes(extension)) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                if (data.length > 0) {
                    setHeaders(Object.keys(data[0]));
                    setFileData(data);
                    setStep(4);
                } else {
                    toast.error('File is empty');
                }
            };
            reader.readAsBinaryString(file);
        } else {
            toast.error('Unsupported file format. Please upload CSV or Excel.');
        }
    };

    const handleAddManualSite = (newSite) => {
        setPreviewSites([...previewSites, newSite]);
    };

    const handleMapColumns = () => {
        if (!mapping.name || !mapping.lat || !mapping.lng) {
            return toast.warning('Please map all required columns');
        }

        const mapped = fileData.map((row, index) => {
            const lat = parseCoordinate(row[mapping.lat]);
            const lng = parseCoordinate(row[mapping.lng]);
            const validation = validateCoordinates(lat, lng);

            return {
                id: createLocalId(),
                name: row[mapping.name] || `Site ${index + 1}`,
                latitude: lat,
                longitude: lng,
                // Original cell text, shown when it couldn't be read
                rawLatitude: row[mapping.lat],
                rawLongitude: row[mapping.lng],
                isValid: validation.isValid,
                error: validation.error,
                isInverted: validation.isInverted,
                is_checked: false,
                notes: ''
            };
        });

        setPreviewSites(mapped);
    };

    const handleSwap = (id) => {
        setPreviewSites(prev => prev.map(site => {
            if (site.id === id) {
                const newLat = site.longitude;
                const newLng = site.latitude;
                const validation = validateCoordinates(newLat, newLng);
                return {
                    ...site,
                    latitude: newLat,
                    longitude: newLng,
                    isValid: validation.isValid,
                    error: validation.error,
                    isInverted: validation.isInverted
                };
            }
            return site;
        }));
    };

    const handleDelete = (id) => {
        setPreviewSites(prev => prev.filter(site => site.id !== id));
    };

    const handleFinalize = () => {
        // Unreadable coordinates can't be saved or routed; only out-of-region
        // ones may be kept on purpose
        const unreadableCount = previewSites.filter(s => !isReadable(s)).length;
        if (unreadableCount > 0) {
            toast.error(`${unreadableCount} site(s) have coordinates that couldn't be read. Fix or delete them first.`);
            return;
        }

        const invalidCount = previewSites.filter(s => !s.isValid).length;
        if (invalidCount > 0) {
            if (!window.confirm(`${invalidCount} sites have errors. Continue anyway?`)) return;
        }

        setCurrentTrip({ title: tripTitle, created_at: new Date() });
        setSites(previewSites);
        toast.success('Trip created successfully!');
        navigate('/trip-details');
    };

    return (
        <Container className="page-shell" style={{ maxWidth: '920px' }}>
            <h1 className="fw-bold mb-1" style={{ color: 'var(--ink)' }}>Create New Trip</h1>
            <p className="text-muted mb-4">Set up a new site verification run in a few steps.</p>

            <StepHeader step={step} />

            {step === 1 && (
                <Card className="border-0" style={{ boxShadow: 'var(--shadow-sm)' }}>
                    <Card.Body className="p-4">
                        <Form.Group className="mb-3">
                            <Form.Label>Trip Title</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="e.g. Cape Town Inspection Jan 2026"
                                value={tripTitle}
                                onChange={(e) => setTripTitle(e.target.value)}
                            />
                        </Form.Group>
                        <Button
                            disabled={!tripTitle}
                            onClick={() => setStep(2)}
                        >
                            Next: Select Entry Method
                        </Button>
                    </Card.Body>
                </Card>
            )}

            {step === 2 && (
                <Row className="g-3">
                    <Col md={6}>
                        <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
                            <Card
                                className="h-100 text-center p-4 choice-card"
                                onClick={() => setStep(3)}
                                role="button"
                            >
                                <Card.Body>
                                    <span className="icon-chip is-lg mx-auto mb-3"><FaUpload /></span>
                                    <h5 className="fw-bold" style={{ color: 'var(--ink)' }}>Upload File</h5>
                                    <p className="text-muted small">Import sites from a CSV or Excel spreadsheet.</p>
                                    <Button variant="outline-primary" size="sm">Choose File</Button>
                                </Card.Body>
                            </Card>
                        </motion.div>
                    </Col>
                    <Col md={6}>
                        <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
                            <Card
                                className="h-100 text-center p-4 choice-card"
                                onClick={() => { setStep(4); setPreviewSites([]); }}
                                role="button"
                            >
                                <Card.Body>
                                    <span className="icon-chip is-lg mx-auto mb-3"><FaKeyboard /></span>
                                    <h5 className="fw-bold" style={{ color: 'var(--ink)' }}>Manual Entry</h5>
                                    <p className="text-muted small">Type in site names and coordinates one by one.</p>
                                    <Button variant="outline-secondary" size="sm">Start Typing</Button>
                                </Card.Body>
                            </Card>
                        </motion.div>
                    </Col>
                    <Col xs={12} className="text-center mt-2">
                        <Button variant="link" onClick={() => setStep(1)}>Back</Button>
                    </Col>
                </Row>
            )}

            {step === 3 && (
                <Card className="text-center p-5 border-dashed">
                    <Card.Body>
                        <span className="icon-chip is-lg mx-auto mb-3"><FaUpload /></span>
                        <h5 className="fw-bold" style={{ color: 'var(--ink)' }}>Upload Coordinates</h5>
                        <p className="text-muted">Upload a CSV or Excel file.</p>
                        <input
                            type="file"
                            hidden
                            ref={fileInputRef}
                            accept=".csv, .xlsx, .xls"
                            onChange={handleFileUpload}
                        />
                        <Button onClick={() => fileInputRef.current.click()}>
                            Select File
                        </Button>
                        <div className="mt-3">
                            <Button variant="link" onClick={() => setStep(2)}>Back</Button>
                        </div>
                    </Card.Body>
                </Card>
            )}

            {step === 4 && (
                <>
                    {fileData.length > 0 && (
                        <Card className="mb-4 border-0" style={{ boxShadow: 'var(--shadow-sm)' }}>
                            <Card.Header className="bg-transparent fw-bold" style={{ color: 'var(--ink)' }}>Column Mapping</Card.Header>
                            <Card.Body>
                                <Row>
                                    <Col md={4}>
                                        <Form.Group className="mb-3">
                                            <Form.Label>Site Name Column</Form.Label>
                                            <Form.Select
                                                value={mapping.name}
                                                onChange={(e) => setMapping({...mapping, name: e.target.value})}
                                            >
                                                <option value="">Select Column...</option>
                                                {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                            </Form.Select>
                                        </Form.Group>
                                    </Col>
                                    <Col md={4}>
                                        <Form.Group className="mb-3">
                                            <Form.Label>Latitude Column</Form.Label>
                                            <Form.Select
                                                value={mapping.lat}
                                                onChange={(e) => setMapping({...mapping, lat: e.target.value})}
                                            >
                                                <option value="">Select Column...</option>
                                                {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                            </Form.Select>
                                        </Form.Group>
                                    </Col>
                                    <Col md={4}>
                                        <Form.Group className="mb-3">
                                            <Form.Label>Longitude Column</Form.Label>
                                            <Form.Select
                                                value={mapping.lng}
                                                onChange={(e) => setMapping({...mapping, lng: e.target.value})}
                                            >
                                                <option value="">Select Column...</option>
                                                {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                            </Form.Select>
                                        </Form.Group>
                                    </Col>
                                </Row>
                                <Button onClick={handleMapColumns}>Preview Sites</Button>
                            </Card.Body>
                        </Card>
                    )}

                    <Card className="border-0" style={{ boxShadow: 'var(--shadow-sm)' }}>
                        <Card.Header className="bg-transparent d-flex justify-content-between align-items-center flex-wrap gap-2">
                            <span className="fw-bold" style={{ color: 'var(--ink)' }}>Preview &amp; Validation ({previewSites.length} sites)</span>
                            <div>
                                <Button variant="outline-primary" size="sm" className="me-2" onClick={() => setShowManualModal(true)}>
                                    <FaPlus className="me-1" /> Add Row
                                </Button>
                                <Button size="sm" onClick={handleFinalize} disabled={previewSites.length === 0}>Create Trip</Button>
                            </div>
                        </Card.Header>
                        <Card.Body>
                            {previewSites.length > 0 ? (
                                <Table responsive hover className="align-middle">
                                    <thead>
                                        <tr>
                                            <th>Site Name</th>
                                            <th>Latitude</th>
                                            <th>Longitude</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewSites.map((site) => (
                                            <tr key={site.id}>
                                                <td>{site.name}</td>
                                                <td>{formatCoordinateCell(site.latitude, site.rawLatitude)}</td>
                                                <td>{formatCoordinateCell(site.longitude, site.rawLongitude)}</td>
                                                <td>
                                                    {site.isValid ? (
                                                        <span className="status-badge is-success">Ready</span>
                                                    ) : (
                                                        <span className="status-badge is-warning">
                                                            <FaExclamationTriangle size={11} />
                                                            {site.error}
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    <Button
                                                        variant="outline-secondary"
                                                        size="sm"
                                                        className="me-2"
                                                        onClick={() => handleSwap(site.id)}
                                                        title="Swap Coordinates"
                                                    >
                                                        <FaExchangeAlt />
                                                    </Button>
                                                    <Button
                                                        variant="outline-danger"
                                                        size="sm"
                                                        onClick={() => handleDelete(site.id)}
                                                    >
                                                        <FaTrash />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            ) : (
                                <div className="text-center py-4 text-muted">
                                    No sites added yet. {fileData.length === 0 ? "Click 'Add Row' to start." : "Complete the column mapping above."}
                                </div>
                            )}
                        </Card.Body>
                    </Card>
                </>
            )}

            <ManualSiteModal
                show={showManualModal}
                onHide={() => setShowManualModal(false)}
                onAdd={handleAddManualSite}
            />
        </Container>
    );
};

export default CreateTrip;
