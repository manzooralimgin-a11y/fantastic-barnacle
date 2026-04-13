import { create } from "zustand";

type PmsSelectionState = {
  selectedReservationId: string | null;
  selectedRoomId: string | null;
  setSelectedReservationId: (reservationId: string | null) => void;
  setSelectedRoomId: (roomId: string | null) => void;
  clearSelection: () => void;
};

export const usePmsSelectionStore = create<PmsSelectionState>((set) => ({
  selectedReservationId: null,
  selectedRoomId: null,
  setSelectedReservationId: (selectedReservationId) => set({ selectedReservationId }),
  setSelectedRoomId: (selectedRoomId) => set({ selectedRoomId }),
  clearSelection: () => set({ selectedReservationId: null, selectedRoomId: null }),
}));

