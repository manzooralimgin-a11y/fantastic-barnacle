import { create } from "zustand";
import type { Meeting } from "@/mock";
import { MOCK_MEETINGS } from "@/mock";

interface MeetingState {
  meetings: Meeting[];
  isRecording: boolean;
  currentRecordingTime: number;
  selectedMeeting: Meeting | null;
  isLoading: boolean;
  fetchMeetings: () => Promise<void>;
  startRecording: () => void;
  stopRecording: () => void;
  selectMeeting: (id: string) => void;
  clearSelection: () => void;
}

let recordingInterval: ReturnType<typeof setInterval> | null = null;

export const useMeetingStore = create<MeetingState>((set, get) => ({
  meetings: [],
  isRecording: false,
  currentRecordingTime: 0,
  selectedMeeting: null,
  isLoading: false,

  fetchMeetings: async () => {
    set({ isLoading: true });
    await new Promise((resolve) => setTimeout(resolve, 800));
    set({ meetings: MOCK_MEETINGS, isLoading: false });
  },

  startRecording: () => {
    if (get().isRecording) return;
    set({ isRecording: true, currentRecordingTime: 0 });
    recordingInterval = setInterval(() => {
      set((state) => ({ currentRecordingTime: state.currentRecordingTime + 1 }));
    }, 1000);
  },

  stopRecording: () => {
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }
    set({ isRecording: false, currentRecordingTime: 0 });
  },

  selectMeeting: (id) => {
    const meeting = get().meetings.find((m) => m.id === id) ?? null;
    set({ selectedMeeting: meeting });
  },

  clearSelection: () => {
    set({ selectedMeeting: null });
  },
}));
