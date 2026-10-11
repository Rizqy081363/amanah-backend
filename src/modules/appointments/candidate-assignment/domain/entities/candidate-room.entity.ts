export interface RoomOccupantDetails {
  practitionerId?: string;
  doctorName?: string;
  bookingCode?: string;
  startTime?: string;
}

export interface RoomCandidateItem {
  id: string;
  name: string;
  code: string;
  location: string | null;
  isAvailable: boolean;
  isPreferred?: boolean;
  occupantDetails?: RoomOccupantDetails | null;
}
