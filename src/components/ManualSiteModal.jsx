import { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { validateCoordinates, parseCoordinate } from '../utils/validation';
import { createLocalId } from '../features/sites/siteIds';

const readable = (value) =>
    !Number.isNaN(parseCoordinate(value)) || `Use decimal (-26.2041 or -26,2041) or DMS (26°12'15"S)`;

const ManualSiteModal = ({ show, onHide, onAdd, onSave, editData }) => {
    const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm();
    const [validationError, setValidationError] = useState(null);

    useEffect(() => {
        if (editData) {
            setValue('name', editData.name);
            setValue('latitude', editData.latitude);
            setValue('longitude', editData.longitude);
        } else {
            reset({ name: '', latitude: '', longitude: '' });
        }
    }, [editData, show, setValue, reset]);

    const onSubmit = (data) => {
        const validation = validateCoordinates(data.latitude, data.longitude);
        if (!validation.isValid && !validation.isInverted) {
            setValidationError(validation.error);
            return;
        }

        const siteData = {
            id: editData ? editData.id : createLocalId(),
            name: data.name,
            latitude: parseCoordinate(data.latitude),
            longitude: parseCoordinate(data.longitude),
            is_checked: editData ? editData.is_checked : false,
            notes: editData ? editData.notes : '',
            isValid: validation.isValid,
            error: validation.error,
            isInverted: validation.isInverted
        };

        if (editData && onSave) {
            onSave(siteData);
        } else if (onAdd) {
            onAdd(siteData);
        }
        
        reset();
        setValidationError(null);
        onHide();
    };

    return (
        <Modal show={show} onHide={onHide} centered>
            <Modal.Header closeButton className="border-0 pb-0">
                <Modal.Title className="fw-bold" style={{ color: 'var(--ink)' }}>
                    {editData ? 'Edit Site' : 'Add Site Manually'}
                </Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleSubmit(onSubmit)}>
                <Modal.Body className="pt-2">
                    {validationError && <div className="alert alert-danger py-2">{validationError}</div>}
                    <Form.Group className="mb-3" controlId="site-name">
                        <Form.Label>Site Name</Form.Label>
                        <Form.Control 
                            {...register("name", { required: "Site name is required" })}
                            isInvalid={!!errors.name}
                        />
                        <Form.Control.Feedback type="invalid">{errors.name?.message}</Form.Control.Feedback>
                    </Form.Group>
                    <Row>
                        <Col md={6}>
                            <Form.Group className="mb-3" controlId="site-latitude">
                                <Form.Label>Latitude</Form.Label>
                                {/* Text, not type="number": number inputs reject DMS and,
                                    on some SA-locale phones, decimal commas */}
                                <Form.Control
                                    type="text"
                                    autoComplete="off"
                                    placeholder={`-26.2041 or 26°12'15"S`}
                                    {...register("latitude", { required: "Latitude is required", validate: readable })}
                                    isInvalid={!!errors.latitude}
                                />
                                <Form.Control.Feedback type="invalid">{errors.latitude?.message}</Form.Control.Feedback>
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group className="mb-3" controlId="site-longitude">
                                <Form.Label>Longitude</Form.Label>
                                <Form.Control
                                    type="text"
                                    autoComplete="off"
                                    placeholder={`28.0473 or 28°02'50"E`}
                                    {...register("longitude", { required: "Longitude is required", validate: readable })}
                                    isInvalid={!!errors.longitude}
                                />
                                <Form.Control.Feedback type="invalid">{errors.longitude?.message}</Form.Control.Feedback>
                            </Form.Group>
                        </Col>
                    </Row>
                </Modal.Body>
                <Modal.Footer className="border-0 pt-0">
                    <Button variant="outline-secondary" onClick={onHide}>Cancel</Button>
                    <Button variant="primary" type="submit">
                        {editData ? 'Update Site' : 'Add Site'}
                    </Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
};

export default ManualSiteModal;
