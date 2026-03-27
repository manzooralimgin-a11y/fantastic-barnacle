import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Calendar,
    Users,
    ChevronRight,
    ChevronLeft,
    Check,
    CreditCard,
    Home,
    Clock,
    UtensilsCrossed,
    X,
} from 'lucide-react';

import {
    apiRequest,
    buildAvailabilityPath,
    buildRestaurantReservationPayload,
    createIdempotencyKey,
    splitDateTimeInput,
} from '../lib/restaurantClient';

function buildDefaultDateTime() {
    const base = new Date();
    base.setDate(base.getDate() + 1);
    base.setHours(19, 0, 0, 0);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}T${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`;
}

function formatDateTimeLabel(value) {
    if (!value) {
        return 'Not selected';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString('de-DE', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

const StepWrapper = ({ children, title, onBack, onNext, nextLabel = "Continue", nextDisabled = false }) => (
    <motion.div
        initial={{ x: 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -20, opacity: 0 }}
        className="flex flex-col h-full w-full max-w-2xl mx-auto px-fluid-8"
    >
        <div className="flex items-center justify-between mb-8 pt-8">
            <div className="flex items-center gap-4">
                {onBack && (
                    <button onClick={onBack} className="p-2 -ml-2 text-white/40 hover:text-white transition-colors">
                        <ChevronLeft size={24} />
                    </button>
                )}
                <h1 className="text-2xl font-serif font-bold text-white tracking-tight">{title}</h1>
            </div>
        </div>
        <div className="flex-1">
            {children}
        </div>
        <div className="py-8 mt-auto">
            <button
                onClick={onNext}
                disabled={nextDisabled}
                className="w-full bg-gold hover:bg-gold-hover text-navy-900 font-bold py-4 rounded-2xl transition-all shadow-xl shadow-gold/10 flex items-center justify-center gap-2 disabled:bg-white/10 disabled:text-white/20 disabled:shadow-none"
            >
                <span>{nextLabel}</span>
                <ChevronRight size={18} />
            </button>
        </div>
    </motion.div>
);

export default function BookingFlow({
    config,
    defaultGuestName = '',
    onGuestNameChange,
    onReservationCreated,
    onClose,
}) {
    const [step, setStep] = useState(1);
    const totalSteps = 4;
    const [availabilityLoading, setAvailabilityLoading] = useState(false);
    const [availabilityMessage, setAvailabilityMessage] = useState('');
    const [availabilitySlots, setAvailabilitySlots] = useState([]);
    const [submitState, setSubmitState] = useState({ status: 'idle', message: '', reservationId: null });

    const [bookingData, setBookingData] = useState({
        date: buildDefaultDateTime(),
        guests: '2',
        area: 'lounge',
        name: defaultGuestName,
        email: '',
        phone: '',
    });

    useEffect(() => {
        if (defaultGuestName && !bookingData.name) {
            setBookingData((current) => ({ ...current, name: defaultGuestName }));
        }
    }, [defaultGuestName, bookingData.name]);

    const selectionSummary = splitDateTimeInput(bookingData.date);

    useEffect(() => {
        if (!config.restaurantId || !selectionSummary.reservationDate || !bookingData.guests) {
            setAvailabilitySlots([]);
            return;
        }

        let cancelled = false;

        async function loadAvailability() {
            setAvailabilityLoading(true);
            try {
                const path = buildAvailabilityPath({
                    restaurantId: config.restaurantId,
                    reservationDate: selectionSummary.reservationDate,
                    partySize: bookingData.guests,
                });
                const data = await apiRequest(config, path);
                if (cancelled) {
                    return;
                }
                setAvailabilitySlots(data.slots || []);
                setAvailabilityMessage('Live restaurant availability loaded.');
            } catch (error) {
                if (cancelled) {
                    return;
                }
                setAvailabilitySlots([]);
                setAvailabilityMessage(error.message);
            } finally {
                if (!cancelled) {
                    setAvailabilityLoading(false);
                }
            }
        }

        void loadAvailability();

        return () => {
            cancelled = true;
        };
    }, [bookingData.guests, config.apiBaseUrl, config.restaurantId, selectionSummary.reservationDate]);

    const nextStep = () => setStep((current) => Math.min(current + 1, totalSteps));
    const prevStep = () => setStep((current) => Math.max(current - 1, 1));

    function updateField(field, value) {
        setBookingData((current) => ({ ...current, [field]: value }));
        if (field === 'name') {
            onGuestNameChange?.(value);
        }
    }

    function validateCurrentStep() {
        if (step === 1) {
            if (!bookingData.date) {
                setSubmitState({ status: 'error', message: 'Please choose a date and time.', reservationId: null });
                return false;
            }
            if (Number(bookingData.guests) <= 0) {
                setSubmitState({ status: 'error', message: 'Party size must be greater than zero.', reservationId: null });
                return false;
            }
        }
        if (step === 2 && !bookingData.area) {
            setSubmitState({ status: 'error', message: 'Please select an area.', reservationId: null });
            return false;
        }
        if (step === 3 && !bookingData.name.trim()) {
            setSubmitState({ status: 'error', message: 'Guest name is required.', reservationId: null });
            return false;
        }
        setSubmitState((current) => ({ ...current, status: current.status === 'success' ? current.status : 'idle', message: current.status === 'success' ? current.message : '' }));
        return true;
    }

    async function submitReservation() {
        if (!validateCurrentStep()) {
            return;
        }

        try {
            setSubmitState({ status: 'submitting', message: '', reservationId: null });
            const preferredArea = bookingData.area === 'bar' ? 'Bar Counter' : 'Lounge Area';
            const payload = buildRestaurantReservationPayload(
                {
                    restaurantId: config.restaurantId,
                    guestName: bookingData.name,
                    email: bookingData.email,
                    phone: bookingData.phone,
                    partySize: bookingData.guests,
                    reservationDate: selectionSummary.reservationDate,
                    startTime: selectionSummary.startTime,
                    specialRequests: `Preferred area: ${preferredArea}`,
                },
                config,
            );
            const data = await apiRequest(config, '/reservations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': createIdempotencyKey(),
                },
                body: JSON.stringify(payload),
            });
            setSubmitState({
                status: 'success',
                message: `Reservation #${data.id} confirmed for ${data.guest_name}. It is now visible in gastronomy management.`,
                reservationId: data.id,
            });
            onReservationCreated?.(data);
        } catch (error) {
            if (error.status === 409) {
                setSubmitState({ status: 'error', message: 'Not available for the selected time. Please choose another slot.', reservationId: null });
                return;
            }
            if (error.status === 400) {
                setSubmitState({ status: 'error', message: 'Invalid input. Please check the reservation details.', reservationId: null });
                return;
            }
            setSubmitState({ status: 'error', message: error.message || 'Something went wrong.', reservationId: null });
        }
    }

    const nextLabel = step === 4 ? (submitState.status === 'submitting' ? 'Submitting…' : 'Confirm Booking') : 'Continue';
    const nextHandler = step === 4
        ? () => {
            void submitReservation();
        }
        : () => {
            if (validateCurrentStep()) {
                nextStep();
            }
        };

    return (
        <div className="fixed inset-0 bg-navy-900 z-[50] flex flex-col pt-[env(safe-area-inset-top)] overflow-y-auto">
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-burgundy/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 left-0 w-[50%] h-[50%] bg-gold/5 rounded-full blur-[120px]" />
            </div>

            <div className="px-6 pt-4 shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-white/10 bg-white/5 p-3 text-white/60"
                    >
                        <X size={16} />
                    </button>
                    <div className="text-[10px] text-white/30 uppercase tracking-[0.3em]">
                        Canonical backend reservation flow
                    </div>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-gold"
                        animate={{ width: `${(step / totalSteps) * 100}%` }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                </div>
                <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-gold font-bold uppercase tracking-widest">Step {step} of {totalSteps}</span>
                    <span className="text-[10px] text-white/40 font-medium uppercase tracking-widest">
                        {step === 1 && "Search"}
                        {step === 2 && "Selection"}
                        {step === 3 && "Guest Details"}
                        {step === 4 && "Confirmation"}
                    </span>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {step === 1 && (
                    <StepWrapper key="step1" title="Select Date & Guests" onNext={nextHandler}>
                        <div className="space-y-6">
                            <div className="bg-white/5 border border-white/10 p-6 rounded-3xl space-y-6">
                                <div className="flex items-center gap-4 text-white/60 mb-2">
                                    <Calendar size={18} className="text-gold" />
                                    <span className="text-sm font-medium">When would you like to join us?</span>
                                </div>
                                <input
                                    id="reservation-datetime"
                                    type="datetime-local"
                                    value={bookingData.date}
                                    className="w-full bg-transparent text-2xl font-serif text-white focus:outline-none"
                                    style={{ colorScheme: 'dark' }}
                                    onChange={(e) => updateField('date', e.target.value)}
                                />
                                <p className="text-xs text-white/30">{formatDateTimeLabel(bookingData.date)}</p>
                            </div>

                            <div className="bg-white/5 border border-white/10 p-6 rounded-3xl space-y-4">
                                <div className="flex items-center gap-4 text-white/60 mb-2">
                                    <Users size={18} className="text-gold" />
                                    <span className="text-sm font-medium">How many people?</span>
                                </div>
                                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                    {[1, 2, 3, 4, 5, 6, 8].map(num => (
                                        <button
                                            key={num}
                                            type="button"
                                            onClick={() => updateField('guests', num.toString())}
                                            className={`shrink-0 w-12 h-12 rounded-xl border flex items-center justify-center font-bold transition-all
                        ${bookingData.guests === num.toString()
                                                    ? 'bg-gold border-gold text-navy-900'
                                                    : 'border-white/10 text-white/40 bg-white/5'}`}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-white/5 border border-white/10 p-6 rounded-3xl space-y-4">
                                <div className="flex items-center gap-4 text-white/60 mb-2">
                                    <Clock size={18} className="text-gold" />
                                    <span className="text-sm font-medium">Live availability</span>
                                </div>
                                <p className="text-sm text-white/40">{availabilityMessage || 'Checking current restaurant capacity.'}</p>
                                <div className="flex flex-wrap gap-2">
                                    {availabilityLoading ? (
                                        <span className="text-xs text-white/30">Loading…</span>
                                    ) : availabilitySlots.length > 0 ? (
                                        availabilitySlots.map((slot) => (
                                            <button
                                                key={`${slot.start_time}-${slot.end_time}`}
                                                type="button"
                                                data-slot-time={slot.start_time}
                                                disabled={!slot.available}
                                                onClick={() => updateField('date', `${selectionSummary.reservationDate}T${slot.start_time.slice(0, 5)}`)}
                                                className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.2em] ${
                                                    slot.available
                                                        ? 'border-[#BF953F]/40 text-white'
                                                        : 'border-white/10 text-white/20'
                                                }`}
                                            >
                                                {slot.start_time.slice(0, 5)}
                                            </button>
                                        ))
                                    ) : (
                                        <span className="text-xs text-white/30">No slots loaded yet.</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </StepWrapper>
                )}

                {step === 2 && (
                    <StepWrapper key="step2" title="Choose your Zone" onBack={prevStep} onNext={nextHandler}>
                        <div className="space-y-4">
                            <p className="text-white/40 text-sm leading-relaxed mb-6">
                                Experience the perfect ambiance. Choose between our vibrant bar area or a calm lounge booth.
                            </p>
                            <div className="grid grid-cols-1 gap-4">
                                {[
                                    { id: 'lounge', name: 'Lounge Area', desc: 'Calm, private booths for intimate dining', icon: Home },
                                    { id: 'bar', name: 'Bar Counter', desc: 'Active, high-seat area with kitchen view', icon: UtensilsCrossed },
                                ].map(area => (
                                    <button
                                        key={area.id}
                                        type="button"
                                        onClick={() => updateField('area', area.id)}
                                        className={`flex items-start gap-4 p-6 rounded-3xl border text-left transition-all
                      ${bookingData.area === area.id
                                                ? 'border-gold bg-gold/5 ring-1 ring-gold/20'
                                                : 'border-white/10 bg-white/5 opacity-60'}`}
                                    >
                                        <div className={`p-3 rounded-2xl ${bookingData.area === area.id ? 'bg-gold text-navy-900' : 'bg-white/10 text-white/40'}`}>
                                            <area.icon size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold mb-1">{area.name}</h4>
                                            <p className="text-white/40 text-xs leading-relaxed">{area.desc}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </StepWrapper>
                )}

                {step === 3 && (
                    <StepWrapper key="step3" title="Your Details" onBack={prevStep} onNext={nextHandler}>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] text-white/20 uppercase tracking-widest font-black ml-1">Full Name</label>
                                    <input
                                        id="reservation-guest-name"
                                        type="text"
                                        value={bookingData.name}
                                        onChange={(event) => updateField('name', event.target.value)}
                                        placeholder="John Doe"
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white placeholder:text-white/10 outline-none focus:border-gold/50"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] text-white/20 uppercase tracking-widest font-black ml-1">Email Address</label>
                                    <input
                                        id="reservation-email"
                                        type="email"
                                        value={bookingData.email}
                                        onChange={(event) => updateField('email', event.target.value)}
                                        placeholder="john@example.com"
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white placeholder:text-white/10 outline-none focus:border-gold/50"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] text-white/20 uppercase tracking-widest font-black ml-1">Phone Number</label>
                                    <input
                                        id="reservation-phone"
                                        type="tel"
                                        value={bookingData.phone}
                                        onChange={(event) => updateField('phone', event.target.value)}
                                        placeholder="+49 ..."
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white placeholder:text-white/10 outline-none focus:border-gold/50"
                                    />
                                </div>
                            </div>
                        </div>
                    </StepWrapper>
                )}

                {step === 4 && (
                    <StepWrapper key="step4" title="Final Confirmation" onBack={prevStep} onNext={nextHandler} nextLabel={nextLabel} nextDisabled={submitState.status === 'submitting'}>
                        <div className="space-y-4">
                            {submitState.message ? (
                                <div
                                    id="reservation-message"
                                    className={`rounded-3xl border px-5 py-4 text-sm ${
                                        submitState.status === 'success'
                                            ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
                                            : submitState.status === 'error'
                                                ? 'border-rose-400/20 bg-rose-500/10 text-rose-100'
                                                : 'border-white/10 bg-white/5 text-white/70'
                                    }`}
                                >
                                    {submitState.message}
                                </div>
                            ) : (
                                <p id="reservation-message" className="hidden" />
                            )}

                            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 overflow-hidden relative">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <Check size={80} />
                                </div>
                                <h4 className="text-gold text-[10px] uppercase font-bold tracking-[0.3em] mb-6">Booking Summary</h4>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-end border-b border-white/5 pb-4">
                                        <div>
                                            <p className="text-white/20 text-[9px] uppercase tracking-widest mb-1">Date & Time</p>
                                            <p className="text-white text-lg font-serif">{formatDateTimeLabel(bookingData.date)}</p>
                                        </div>
                                        <Clock size={16} className="text-white/20 mb-1" />
                                    </div>

                                    <div className="flex justify-between items-end border-b border-white/5 pb-4">
                                        <div>
                                            <p className="text-white/20 text-[9px] uppercase tracking-widest mb-1">Party Size</p>
                                            <p className="text-white text-lg font-serif">{bookingData.guests} Guests</p>
                                        </div>
                                        <Users size={16} className="text-white/20 mb-1" />
                                    </div>

                                    <div className="flex justify-between items-end border-b border-white/5 pb-4">
                                        <div>
                                            <p className="text-white/20 text-[9px] uppercase tracking-widest mb-1">Preferred Area</p>
                                            <p className="text-white text-lg font-serif">{bookingData.area === 'bar' ? 'Bar Counter' : 'Lounge Area'}</p>
                                        </div>
                                        <UtensilsCrossed size={16} className="text-white/20 mb-1" />
                                    </div>

                                    <div className="pt-4 flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-gold/10 flex items-center justify-center text-gold">
                                            <CreditCard size={20} />
                                        </div>
                                        <div>
                                            <p className="text-white font-bold text-sm">Confirmation Flow</p>
                                            <p className="text-white/40 text-xs">Canonical reservation API via unified backend service</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </StepWrapper>
                )}
            </AnimatePresence>
        </div>
    );
}
