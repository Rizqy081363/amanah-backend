export class PoliklinikEntity {
  id: string;
  namaPoli: string;
  kodePoli: string;
  deskripsi?: string | null;
  isActive: boolean;
  createdAt: Date;
}

export class LayananPoliEntity {
  id: string;
  poliklinikId: string;
  namaLayanan: string;
  deskripsi?: string | null;
  medicalFlow: 'pregnancy' | 'immunization' | 'general';
  isActive: boolean;
  createdAt: Date;
}
