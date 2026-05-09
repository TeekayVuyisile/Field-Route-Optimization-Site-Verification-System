import { useState } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { validateCoordinates } from '../utils/validation';

const ManualSiteModal = ({ show, onHide, onAdd }) => {
    const { register, handleSubmit, reset, formState: { errors } } = useForm();
    const [validationError, setValidationError] = useState(null);

    const onSubmit = (data) => {
        const validation = validateCoordinates(data.latitude, data.longitude);
        if (!validation.isValid && !validation.isInverted) {
            setValidationError(validation.error);
            return;
        }

        onAdd({
            id: crypto.randomUUID(),
            name: data.name,
            latitude: parseFloat(data.latitude),
            longitude: parseFloat(data.longitude),
            is_checked: false,
            notes: '',
            isValid: validation.isValid,
            error: validation.error,
            isInverted: validation.isInverted
        });
        
        reset();
        setValidationError(null);
        onHide();
    };

    return (
        <Modal show={show} onHide={onHide} centered>
            <Modal.Header closeButton>
                <Modal.Title>Add Site Manually</Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleSubmit(onSubmit)}>
                <Modal.Body>
                    {validationError && <div className="alert alert-danger">{validationError}</div>}
                    <Form.Group className="mb-3">
                        <Form.Label>Site Name</Form.Label>
                        <Form.Control 
                            {...register("name", { required: "Site name is required" })}
                            isInvalid={!!errors.name}
                        />
                        <Form.Control.Feedback type="invalid">{errors.name?.message}</Form.Control.Feedback>
                    </Form.Group>
                    <Row>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label>Latitude</Form.Label>
                                <Form.Control 
                                    type="number"
                                    step="any"
                                    {...register("latitude", { required: "Latitude is required" })}
                                    isInvalid={!!errors.latitude}
                                />
                                <Form.Control.Feedback type="invalid">{errors.latitude?.message}</Form.Control.Feedback>
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label>Longitude</Form.Label>
                                <Form.Control 
                                    type="number"
                                    step="any"
                                    {...register("longitude", { required: "Longitude is required" })}
                                    isInvalid={!!errors.longitude}
                                />
                                <Form.Control.Feedback type="invalid">{errors.longitude?.message}</Form.Control.Feedback>
                            </Form.Group>
                        </Col>
                    </Row>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={onHide}>Cancel</Button>
                    <Button variant="primary" type="submit">Add Site</Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
};

export default ManualSiteModal;
